/**
 * ConvFusion 2.0 — 基本科研过程（阶段模型）
 *
 * ## 为什么需要它，以及它**不是**什么
 *
 * v2 推倒了「8 个模块按序执行」的固定流水线，但**基本科研过程仍然存在**：
 * 不先弄清问题就查文献、不先有假设就设计实验，得到的东西不可解释。区别在于：
 *
 * ```text
 * v0.1.x 模块流水线          ：状态机决定下一步跑哪个模块（强制）
 * v2 阶段模型（本文件）      ：从**真实研究资产**推断"现在最缺哪一步"（提示性）
 * ```
 *
 * 因此这里产出的永远是**建议**：
 *
 *   - 只用于「能力选择」与「进展展示」，不驱动执行、不阻塞任何操作；
 *   - 阶段由 `project.md` / `research/` 里的**实际内容**推断，不是由对话内容猜测；
 *   - 用户可以完全忽略它继续自由对话 —— Agent 仍按自己的判断做事。
 *
 * ## 过程定义本身是一个 Skill（用户可定制）
 *
 * 阶段列表**不再硬编码**：它来自 `research-process` 这个能力（`skills/research-planning/
 * research-process.md`）里的一段机器可读围栏块。用户可以在【设置】-【ConvFusion】-【本地研究方法】
 * 里覆盖该能力的 `Research Method` 章节，**规定自己的研究进展过程** —— 不同学科的过程确实不同。
 *
 * 解析规则：取**第一个**含 `stage:` 行的块。因为用户定制在合成时排在原文**之前**，
 * 所以"取第一个"天然让用户的定义优先，不需要任何额外设置。
 *
 * 代码里保留一份 `DEFAULT_STAGES` 作为兜底：能力缺失或块被改坏时，过程评估仍然可用
 * （只是退回默认过程），绝不因为一段文本有问题就让整个进展展示失效。
 *
 * ## 判定规则（全部可核查）
 *
 * 每个阶段只看"有没有产出该阶段的**可验证研究资产**"，不看它是否"被标记完成"。
 * 判定信号取自**固定词表**（`STAGE_SIGNALS`）—— 用户可以改过程，但改不了判定逻辑，
 * 否则一个笔误就会让"当前阶段"永远判不出来。信号留空/写错 → 该阶段不参与判定。
 */
import { STAGE_SIGNALS, buildSignalContext, judgeSignal } from './stage-signals.js';
// 信号词表与判定逻辑抽到 `stage-signals.ts` 共享（阶段模型 + 技能前置依赖共用同一份）。
// 这里重新导出，保持 `PROC.STAGE_SIGNALS` 等既有引用不变。
export { STAGE_SIGNALS, buildSignalContext, judgeSignal } from './stage-signals.js';
/**
 * 基本科研过程的阶段顺序。
 *
 * ⚠️ 这是**过程**顺序，不是**执行**顺序：真实研究会在阶段间来回跳。
 * 它只回答"从资产上看，哪一步还没有落地的证据"。
 */
/** 默认过程（兜底）：与 `research-process` 能力里的默认块保持一致。 */
export const DEFAULT_STAGES = [
    { id: 'topics', label: '提出话题', category: 'research-understanding', signal: 'topic-proposed', produces: '研究话题（`research/topics.md`）' },
    { id: 'literature', label: '文献调研', category: 'literature', signal: 'literature-evidence', produces: '实际检索到的文献证据（`research/evidence/`）' },
    { id: 'innovation', label: '创新假设', category: 'innovation', signal: 'claims', produces: '已确定的研究问题与主题、可检验的假设与主张（`project.md` / `research/claims/`）' },
    { id: 'planning', label: '计划管理', category: 'research-planning', signal: 'method-plan', produces: '可执行的研究计划与方法设计（`research/plans/`）' },
    { id: 'resource', label: '资源评估', category: 'resource-estimation', signal: 'resource-estimate', produces: '资源需求、成本与可行性估计（`research/plans/`）' },
    { id: 'decision', label: '研究决策', category: 'research-decision', signal: 'decisions', produces: '已记录理由的研究决策（`research/decisions/`）' },
    { id: 'experiment', label: '实验验证', category: 'experiment', signal: 'experiments', produces: '实验产物与经确认的结果证据（`experiments/<name>/results/`）' },
    { id: 'writing', label: '论文写作', category: 'academic-writing', signal: 'manuscript', produces: '论文正文（`papers/<id>/paper.md`）' },
];
/** 过程定义能力的 id。 */
export const PROCESS_SKILL_ID = 'research-process';
/**
 * 从能力正文里解析阶段列表。
 *
 * 格式（每行一个阶段）：
 *
 * ```text
 * stage: <id> | <显示名> | <能力类别> | <判定信号> | <产出说明>
 * ```
 *
 * 取**第一个**连续块：用户定制在合成时排在原文之前，因此用户的定义天然优先。
 *
 * @returns 解析出的阶段；没有可解析的块时返回 `undefined`（调用方退回默认过程）
 */
export function parseStages(content) {
    if (!content)
        return undefined;
    const stages = [];
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        const m = /^stage:\s*(.+)$/i.exec(line);
        if (!m) {
            // 允许阶段之间有空行；一旦已经收集到阶段又遇到非阶段行，说明块结束
            if (stages.length > 0 && line !== '' && !line.startsWith('```'))
                break;
            continue;
        }
        const parts = m[1].split('|').map((x) => x.trim());
        const [id, label, category, signal, produces] = parts;
        if (!id || !label || !category)
            continue;
        const known = STAGE_SIGNALS.includes(signal ?? '');
        stages.push({
            id,
            label,
            category: category.split('/')[0] ?? category,
            ...(known ? { signal: signal } : {}),
            produces: produces || `${label} 阶段的产出`,
        });
    }
    return stages.length > 0 ? stages : undefined;
}
/**
 * 评估科研过程走到哪一步。
 *
 * @param workspace 研究 workspace
 * @param options.skillContent 取某个能力**生效正文**（含用户定制）的函数；
 *                             缺省时只用默认过程
 * @returns 各阶段状态与当前阶段
 */
export function assessResearchProcess(workspace, options = {}) {
    const stages = parseStages(options.skillContent?.(PROCESS_SKILL_ID)) ?? [...DEFAULT_STAGES];
    return assessWithStages(workspace, stages);
}
/** 用给定的阶段列表评估（与"阶段从哪来"解耦，便于测试）。 */
export function assessWithStages(workspace, stages) {
    const ctx = buildSignalContext(workspace);
    const statuses = stages.map((stage) => {
        const { satisfied, evidence: basis } = judgeSignal(ctx, stage.signal);
        return { stage, satisfied, evidence: basis };
    });
    const missing = statuses.filter((s) => !s.satisfied);
    return { stages: statuses, current: missing[0], missing };
}
//# sourceMappingURL=research-process.js.map