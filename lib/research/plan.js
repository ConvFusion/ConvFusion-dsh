/**
 * ConvFusion 2.0 — Plan → Harness Handoff（Stage 1 接口，Stage 3 完整化）
 *
 * ## 它实现哪些条款
 *
 * - v2-Stage1 §18 / §25F：`Plan → Harness` 的原生交接通道（Plan-as-input）
 * - v2-Stage3 §12 / §13 / §32-G：**Ready Plan → Native Harness**
 * - v2-Stage3 §33：**禁止** `Plan → ConvFusion Agent → ConvFusion Tool Runtime`
 *
 * ## 为什么用 Harness 原生通道
 *
 * 已核实 Harness 处理"外部内容成为任务"的原生模式（`dsh-schedule` / `dsh-tool-jobs`
 * 用的就是这一条）：
 *
 * ```ts
 * agent.followup(createUserMessage({
 *   content: [{ type: 'text', text }],
 *   source: { kind: 'plugin', plugin: 'convfusion' },
 * }))
 * ```
 *
 * 好处正是 v2 要的：
 *   - Plan 成为**普通的用户 turn** → Harness 原生 Agent Loop 接管；
 *     原生事件、原生流式、原生工具/编码过程全部照旧（Stage 1 §13 / §27）；
 *   - 内容走**已知的 surface 事件通道**（`user/message`），不会像自造事件类型那样
 *     让会话日志不可恢复（外部插件无法在 `Session.append` 上设置 `ignorable`）；
 *   - ConvFusion **不接管执行**，只负责"把 Plan 作为任务上下文交出去"。
 *
 * ## 交接前置条件（§10 / §11）
 *
 * 只有 `ready` / `refined` 的 Plan 才允许交接 —— `draft` 还没人看过，
 * `executing` 已经在跑，`completed` / `archived` 不该再跑。
 * 唯一的例外是 frontmatter 显式声明 `review_policy: auto-execute`（§11 允许自动执行），
 * 此时 `draft` 也可直接交接。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { listPlanDocuments, planCompletionCriteria, planExpectedEvidence, planObjective, readPlan, } from './plans.js';
import { archivePlanVersion } from './plan-library.js';
/** 可交接的状态。 */
const HANDOFF_STATUSES = ['ready', 'refined'];
/**
 * 读取一个 Plan 并构造交接文本（**纯函数**，除读盘外无副作用）。
 *
 * @param workspace 研究 workspace
 * @param planId    计划 id（文件名去 `.md`）
 * @param options.force 跳过状态校验（供 `--force` 显式使用，审计留给调用方）
 */
export function loadPlanHandoff(workspace, planId, options = {}) {
    const plans = listPlanDocuments(workspace);
    if (plans.length === 0) {
        return { error: '这个 workspace 里还没有 Plan（`plans/*.md`）。' };
    }
    const wanted = planId?.trim();
    const doc = wanted ? readPlan(workspace, wanted) : plans.length === 1 ? plans[0] : undefined;
    if (!doc) {
        if (wanted) {
            return {
                error: `找不到 id 为 \`${wanted}\` 的 Plan。`,
                available: plans.map(summarize),
            };
        }
        return { error: '存在多个 Plan，请指定要执行哪一个。', available: plans.map(summarize) };
    }
    const autoExecute = doc.reviewPolicy === 'auto-execute';
    if (!options.force && !autoExecute && !HANDOFF_STATUSES.includes(doc.status)) {
        const hint = doc.status === 'draft'
            ? '先用 `/plan review ' + doc.id + '` 标记为 reviewed，再用 `/plan approve ' + doc.id + '` 允许执行。'
            : `当前状态是 \`${doc.status}\`，只有 ready / refined 的 Plan 可以交接执行。`;
        return { error: `Plan \`${doc.id}\` 还不能执行。${hint}`, available: plans.map(summarize) };
    }
    return {
        planId: doc.id,
        path: doc.relPath,
        status: doc.status,
        text: buildHandoffText(doc),
    };
}
function summarize(d) {
    return { id: d.id, name: d.name, status: d.status, relPath: d.relPath };
}
/**
 * 构造交接文本。
 *
 * 设计要点（Stage 1 §8 / Stage 3 §13）：
 *   - **不**把它包成"巨大的 system prompt" —— 它是一条普通任务消息；
 *   - 明确说明"这是已评审的计划"，并要求用**原生**能力执行；
 *   - 明确边界：ConvFusion 不接管执行，模型自己决定步骤、工具、验证方式；
 *   - 把 Expected Evidence / Completion Criteria 单独提示出来（§21），
 *     让模型知道"做到什么算完成"，而不是我们替它编排步骤。
 */
export function buildHandoffText(doc) {
    const evidence = planExpectedEvidence(doc);
    const criteria = planCompletionCriteria(doc);
    const objective = planObjective(doc);
    const lines = [
        `Execute the research plan \`${doc.relPath}\` (${doc.name}).`,
        '',
        'This plan has been reviewed and is the current task. Carry it out end to end using your',
        'own native capabilities — decide the steps, run the tools you need, write and debug code,',
        'and verify the result. Do not wait for a fixed pipeline: you own the execution order.',
        '',
        'If the plan turns out to be wrong or incomplete, say so and propose the correction instead',
        'of forcing it through. If it is blocked, report precisely what is missing.',
        '',
        '---',
        '',
        doc.body,
    ];
    // 把"完成判据"再明确一次（Plan 正文里通常已有，但这是模型最容易忽略的部分）
    if (criteria.trim() || evidence.trim()) {
        lines.push('', '---', '', 'Reminder — you are done only when:');
        if (objective.trim())
            lines.push('', `Objective: ${objective.split('\n')[0]}`);
        if (criteria.trim())
            lines.push('', 'Completion criteria:', '', criteria);
        if (evidence.trim())
            lines.push('', 'Evidence to produce:', '', evidence);
    }
    lines.push('', '---', '', 'When finished, summarise: what was done, what was produced (paths), what was verified,', 'and what remains uncertain.');
    return lines.join('\n');
}
/**
 * 构造 Plan 的 user 消息。
 *
 * source 取 Harness 认可的 `{ kind:'plugin', plugin:'convfusion' }` —— 内容因此
 * 走**已知的 surface 事件通道**（`user/message`），**绝不**自造会话事件类型。
 */
export function createPlanMessage(text) {
    return createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: 'convfusion' },
    });
}
/** 把一个 Plan 交接给**当前** Harness Agent。 */
export function handoffPlanToAgent(agent, text) {
    agent.followup(createPlanMessage(text));
}
/** 供插件入口复用：解析会话 workspace 后的 Plan 交接。 */
export function handoffPlan(workspace, agent, planId) {
    const handoff = loadPlanHandoff(workspace, planId);
    if ('error' in handoff)
        return handoff;
    // §19：交接是"进入执行"的必经点 —— 先把当前内容快照，再交给 Harness。
    // 之后 Agent 用原生工具接着改 `plans/*.md`，历史已经保住了。
    const doc = readPlan(workspace, handoff.planId);
    if (doc)
        archivePlanVersion(workspace, doc, 'handoff');
    handoffPlanToAgent(agent, handoff.text);
    return { ok: true, planId: handoff.planId };
}
//# sourceMappingURL=plan.js.map