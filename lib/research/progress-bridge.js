/**
 * ConvFusion 2.0 — 研究进展桥（每轮对话结束报告一次）
 *
 * ## 它做什么
 *
 * ```text
 * agent/pre-step（新一轮开始）→ 记下"本轮开始前"的快照
 * agent/turn-stopping（本轮结束）→ 采新快照 → 求差 → 存成回合报告（内存）
 *                                          ↓
 *                        顶部「研究进展」按钮的面板读走 → 渲染"最近一轮变化"
 * ```
 *
 * ## 为什么报告不再进会话日志（2026-09 用户拍板）
 *
 * 曾经把报告作为 `user/message`（`{kind:'plugin', plugin:'convfusion', form:'notice'}`）
 * 追加进会话。但 DSH 把**所有** plugin 来源的消息渲染成"上下文注入"折叠行
 * （`ContextMessageNodeView`，按 `kind: 'context'` 路由），form 取什么值都不改变观感；
 * 而能进入对话表面的事件类型只有 4 种（`system/message` / `user/message` /
 * `assistant/message` / `tool/result`），**无法自定义**事件类型来另开一种渲染。
 *
 * ## 展示面（2026-09 二次改版，别再走回头路）
 *
 * ```text
 * ❌ conversation.chat.turnTail（链式槽位）—— selector 只拿得到 {turn, seq, openFile}，
 *    没有会话身份，只能靠进程级全局变量猜"当前是不是研究会话"，于是命中**所有**会话
 * ✅ conversation.session.header.utilities（session 作用域的 list 槽位）——
 *    组件拿得到自己会话的 sessionId，判定按会话正确（见 client/progress-panel.tsx）
 * ```
 *
 * 因此本文件只剩两件事：**算准**（只来自磁盘真实资产）并按会话 id 记下回合报告，
 * 供 `progress/workspace` 端点取"最近一轮变化"。面板的 A/C 段不依赖回合报告
 * （每次点开都由 `progress.ts` 从磁盘重算），所以没有任何"必须跑完一轮才看得到"的限制。
 *
 * ## 两条产品约束
 *
 * 1. **不猜**：快照全部来自磁盘上的真实资产（`progress.ts`）；
 * 2. **不打断**：`turn-stopping` 只记录报告；自动推进另走 `followup` 闸门。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { buildTurnReport, captureProgress, diffProgress, } from './progress.js';
import { DEFAULT_AUTO_CONTINUE, shouldAutoContinue } from './advance.js';
import { isResearchWorkspace, researchWorkspaceOf } from './workspace.js';
import { resolveSessionWorkspace } from './session-workspace.js';
/** 插件在会话里标识自己的名字。 */
export const PROGRESS_PLUGIN = 'convfusion';
/** 取会话 id（`Agent.id` 就是 SessionId；`session.id` 作为兜底）。 */
function sessionIdOf(p) {
    const id = p.agent?.id ?? p.agent?.session?.id;
    return id == null ? undefined : String(id);
}
/* ── 回合报告存储（供界面 RPC 读取）───────────────────────────────────────
 *
 * ⚠️ 为什么不再往会话里追加消息：
 * DSH 把**所有** `plugin` 来源的会话消息渲染成"上下文注入"折叠行
 * （`ContextMessageNodeView`，按 `kind: 'context'` 路由），form 取什么值都改变不了；
 * 而进入对话表面的事件类型只有 4 种（`system/message` / `user/message` /
 * `assistant/message` / `tool/result`），无法自定义。所以展示落在客户端：
 * 顶部按钮（`conversation.session.header.utilities`）后面挂面板，宿主只提供数据。
 */
const latestReports = new Map();
/** 最多缓存多少个会话的最近报告（防止长驻进程无界增长）。 */
const LATEST_REPORTS_MAX = 64;
/** 记住某个会话最近一次的回合报告。 */
export function rememberTurnReport(sessionId, report) {
    if (!sessionId)
        return;
    latestReports.delete(sessionId);
    latestReports.set(sessionId, report);
    for (const key of [...latestReports.keys()]) {
        if (latestReports.size <= LATEST_REPORTS_MAX)
            break;
        latestReports.delete(key);
    }
}
/** 读某个会话最近一次的回合报告（没有则 undefined）。 */
export function latestTurnReport(sessionId) {
    return sessionId ? latestReports.get(sessionId) : undefined;
}
/**
 * 装上进展桥。
 *
 * @param ctx 插件上下文
 * @param resolveWorkspace 当前研究 workspace（每次求值）
 * @returns 卸载函数
 */
export function mountProgressBridge(ctx, resolveWorkspace, skillContent, policy = DEFAULT_AUTO_CONTINUE) {
    /** 本轮的起始快照（按轮号保存，避免多轮交叉时串味）。 */
    const baseline = new Map();
    /** 连续多少轮没有形成新资产（用于判定"停滞"）。 */
    let staleRounds = 0;
    /** 本次会话已连续自动推进的轮数（预算上限，防止无人值守跑飞）。 */
    let autoRounds = 0;
    /** 用户是否在自动推进期间插过话（插话即视为接管，停止自动推进）。 */
    let userIntervened = false;
    /**
     * 本轮事件所属会话的研究根目录：优先按**事件自己的会话**解析
     * （权威来源 = 会话自己的 `header.cwd`，见 `session-workspace.ts`）。
     *
     * 为什么不用全局 `resolveWorkspace()`：它依赖 `agent/pre-step` 同步的全局
     * `currentCwd`，多会话并行时可能已被其它会话覆盖 —— 进展快照就会从**别的项目**
     * 捕获（与 2026-09 研究数据错位事故同一根因）。拿不到会话身份时退化为全局解析。
     */
    const workspaceOfEvent = (p) => {
        const sid = sessionIdOf(p);
        const sessionWs = sid ? resolveSessionWorkspace(ctx, sid) : undefined;
        if (sessionWs)
            return researchWorkspaceOf(sessionWs);
        return resolveWorkspace();
    };
    ctx.on('agent/inbox/inserted', (payload) => {
        // 任何非本插件来源的输入都视为用户接管 → 立刻停止自动推进
        try {
            const p = payload;
            const src = p.message?.source;
            if (src?.kind === 'user')
                userIntervened = true;
        }
        catch {
            /* 观测失败不影响主流程 */
        }
    });
    const onPreStep = (payload, next) => {
        // ⚠️ `agent/pre-step` 是 waterfall：必须放行，否则会阻断 Agent 运行。
        try {
            const p = payload;
            const ws = workspaceOfEvent(p);
            // 非研究工作区不捕获快照
            if (!isResearchWorkspace(ws))
                return next();
            const turn = typeof p.turn === 'number' ? p.turn : -1;
            if (turn >= 0 && !baseline.has(turn)) {
                baseline.set(turn, captureProgress(ws, skillContent));
                // 只保留最近若干轮，避免长会话内存增长
                for (const key of [...baseline.keys()])
                    if (key < turn - 4)
                        baseline.delete(key);
            }
        }
        catch {
            /* 观测失败不影响主流程 */
        }
        return next();
    };
    const onTurnStopping = (payload) => {
        try {
            const p = payload;
            const turn = typeof p.turn === 'number' ? p.turn : -1;
            const ws = workspaceOfEvent(p);
            // 非研究工作区不显示进展提示
            if (!isResearchWorkspace(ws))
                return;
            const after = captureProgress(ws, skillContent);
            // 没有起始快照（例如会话是从本插件装配之前开始的）→ 用当前状态作基线，
            // 这样至少能显示"现在到哪了"，而不会出现假的 +N。
            const before = baseline.get(turn) ?? after;
            baseline.delete(turn);
            // 停滞计数：本轮相对"本轮起点"没有新增可验证资产就 +1，否则清零
            const grew = after.counts.evidence > before.counts.evidence ||
                after.counts.claims > before.counts.claims ||
                after.counts.decisions > before.counts.decisions ||
                after.counts.plans > before.counts.plans ||
                after.counts.outputs > before.counts.outputs ||
                after.counts.paperPresent !== before.counts.paperPresent;
            staleRounds = grew ? 0 : staleRounds + 1;
            if (grew)
                autoRounds = 0;
            const diff = diffProgress(before, after);
            // 报告按会话记下来，供顶部「研究进展」按钮的面板取"最近一轮变化"。
            // 刻意**不**追加会话消息：plugin 来源的消息必然被 DSH 显示成"上下文注入"。
            rememberTurnReport(sessionIdOf(p), buildTurnReport(diff, turn, after.advance));
            // ── 自主推进闸门 ────────────────────────────────────────────────
            // 方向明确且用户没插话、预算未尽 → 直接继续；否则停下等用户。
            // 判定依据全部来自磁盘资产（见 advance.ts），不是语义猜测。
            const gate = shouldAutoContinue(after.advance, policy, autoRounds);
            if (gate.go && !userIntervened) {
                autoRounds += 1;
                ctx.logger?.info(`[convfusion] 自动推进 ${autoRounds}/${policy.maxRounds}：${gate.reason}`);
                // 交给原生 Agent 再走一轮（与 /research 同一个通道；不接管执行）
                const agent = p.agent;
                agent?.followup?.(createUserMessage({
                    content: [
                        {
                            type: 'text',
                            text: `继续推进这项研究（第 ${autoRounds} 轮自动推进，最多 ${policy.maxRounds} 轮）。\n\n` +
                                `当前科研过程阶段：**${after.stage?.label ?? '（无）'}** —— ${after.advance.nextStep ?? after.advance.basis}\n\n` +
                                '按需要读工作区与能力库，自行判断该做什么；需要真正执行时先写 `plans/*.md`。' +
                                '若发现存在多个势均力敌、必须由人取舍的方向，**停下来告诉用户**，不要替用户决定。',
                        },
                    ],
                    source: { kind: 'plugin', plugin: PROGRESS_PLUGIN },
                }));
            }
            else if (!gate.go && after.advance.clarity !== 'clear') {
                ctx.logger?.info(`[convfusion] 停止自动推进，等待用户：${gate.reason}`);
            }
        }
        catch (e) {
            ctx.logger?.warn(`[convfusion] 研究进展展示失败：${e instanceof Error ? e.message : String(e)}`);
        }
    };
    ctx.on('agent/pre-step', onPreStep);
    ctx.on('agent/turn-stopping', onTurnStopping);
    return () => {
        baseline.clear();
        staleRounds = 0;
        autoRounds = 0;
    };
}
//# sourceMappingURL=progress-bridge.js.map