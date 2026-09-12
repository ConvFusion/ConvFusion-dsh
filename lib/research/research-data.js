/**
 * ConvFusion 2.0 — Research State + Evidence 数据模型（Stage 4）
 *
 * ## 两个新核心对象（§1）
 *
 * ```text
 * Evidence       = 可被追溯、验证、引用的研究事实/结果/观察/材料
 * Research State = 当前研究在 Problem/Knowledge/Innovation/Method/Experiment/Evidence
 *                  等维度上的整体状态
 * ```
 *
 * **`Evidence ≠ Research State`**：前者是研究事实，后者是这些事实与判断构成的整体状态。
 *
 * ## 三条不可违反的边界
 *
 * 1. **不删除性覆盖**（§9 / §22 / §42 Historical Integrity）：Evidence 与 Research State
 *    的历史版本**不允许被无痕覆盖**。被新结果取代的 Evidence 标 `Superseded` 并保留
 *    `supersedes` / `supersededBy` 关系，**不是删掉**。
 * 2. **不是 Workflow State Machine**（§13）：Research State 的维度是**状态空间**，
 *    不是"跑到第几步"。因此类型里**没有** `currentStage` / `next` / `progress` 之类字段。
 * 3. **允许不完整**（§14）：科研不是线性完成。因此所有状态字段都必须能表达
 *    `Unknown / Incomplete / Uncertain / Conflicting`，而不是被迫填一个"完成值"。
 *
 * ## 与 Harness 的关系（§16 / §42 Native Harness）
 *
 * Research State **不是** Harness Session 的聊天总结。Session 是"一次 Agent 交互"，
 * Research State 是"研究项目当前的科研理解"。真实执行仍全部走 Harness 原生 Runtime，
 * 本模块不实现任何 Agent Runtime。
 */
/* ════════════════════════════════════════════════════════════════════════
 * ID 方案（§37）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 研究资产 ID 方案。
 *
 * ```text
 * E001 E002 …   Evidence
 * C001 C002 …   Claim
 * D001 D002 …   Decision
 * P001 P002 …   Plan（Stage 3 的 Plan 用能力命名，这里是**索引编号**）
 * ```
 *
 * 零填充 3 位、单字母前缀 —— 短、可读、在 Markdown 里可直接引用（§32 Evidence 与引用）。
 */
export const ID_PREFIX = {
    evidence: 'E',
    claim: 'C',
    decision: 'D',
    plan: 'P',
};
/** 生成一个带编号的 id，如 `E007`。 */
export function makeResearchId(kind, n) {
    return `${ID_PREFIX[kind]}${String(n).padStart(3, '0')}`;
}
/** 解析 id → `{ kind, n }`；非法返回 `undefined`。 */
export function parseResearchId(id) {
    const m = id.trim().match(/^([ECD P])(\d{1,4})$/i);
    if (!m)
        return undefined;
    const prefix = m[1].toUpperCase();
    const entry = Object.entries(ID_PREFIX).find(([, p]) => p === prefix);
    if (!entry)
        return undefined;
    return { kind: entry[0], n: Number(m[2]) };
}
export const EVIDENCE_SOURCES = [
    'literature',
    'experiment',
    'computation',
    'observation',
    'dataset',
    'implementation',
    'analysis',
    'user-judgment',
    'external',
];
export const EVIDENCE_STATUSES = [
    'unverified',
    'supported',
    'verified',
    'rejected',
    'superseded',
];
export const CLAIM_STATUSES = [
    'unverified',
    'supported',
    'verified',
    'rejected',
    'superseded',
];
/** 推荐的维度顺序（§17 的 Markdown 结构）。 */
export const STATE_DIMENSIONS = [
    'Problem',
    'Research Questions',
    'Current Knowledge',
    'Literature',
    'Innovation',
    'Hypotheses',
    'Method',
    'Experiments',
    'Claims',
    'Evidence',
    'Decisions',
    'Risks',
    'Open Questions',
];
export const MATURITY_LEVELS = ['Unknown', 'Weak', 'Emerging', 'Strong', 'Established'];
export const MATURITY_DIMENSIONS = [
    'Problem',
    'Knowledge',
    'Innovation',
    'Method',
    'Experiment',
    'Evidence',
];
/* ════════════════════════════════════════════════════════════════════════
 * 目录布局（§36）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 研究资产的目录布局。
 *
 * §36 强调：这是**建议性**研究资产组织方式，**不要**重新建立 Step/Substep/Workflow
 * 式的目录。因此这里只有"资产类型"一层，没有嵌套的阶段层级。
 */
export const RESEARCH_DIR = 'research';
/**
 * Research State 文件。
 *
 * ⚠️ 按 `v2-Workspace.md` §2 放在**工作区根目录**（`./research-state.md`），
 * 与 `project.md` 一起构成 Research Definition —— 它是研究的定义层，
 * 不属于 `research/` 那些结构化资产。
 */
export const RESEARCH_STATE_FILE = 'research-state.md';
/** 研究定义文件（`./project.md`）。 */
export const PROJECT_FILE = 'project.md';
export const EVIDENCE_DIR = `${RESEARCH_DIR}/evidence`;
export const CLAIMS_DIR = `${RESEARCH_DIR}/claims`;
export const DECISIONS_DIR = `${RESEARCH_DIR}/decisions`;
export const STATE_HISTORY_DIR = `${RESEARCH_DIR}/state-history`;
export const PROPOSALS_DIR = `${RESEARCH_DIR}/state-proposals`;
/** 索引（§18：Markdown 是人/Agent 表示，索引是系统检索表示）。 */
export const RESEARCH_INDEX_FILE = `${RESEARCH_DIR}/index.json`;
//# sourceMappingURL=research-data.js.map