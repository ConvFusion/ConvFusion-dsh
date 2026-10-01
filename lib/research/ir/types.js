/**
 * ConvFusion v0.5.6 — Research IR Kernel（核心类型）
 *
 * 对应规格：`dev-notes/v0.5.6-ResearchIR.md`（§3 最小核心对象 / §4 Typed / §9 State）。
 *
 * ## 这一层是什么
 *
 * > **科研决策和科研执行之间的机器可处理表示（canonical representation）。**
 *
 * 与其它研究资产的分工（规格 §1）：
 *
 * ```text
 * Research IR      = What we intend / decide to do   （本文件）
 * Research State   = What has actually happened      （research-state.md + ir/states/）
 * Evidence / Claim = What we currently know          （research/evidence · research/claims）
 * ```
 *
 * ## 两条硬约束
 *
 * 1. **Typed，不是自由文本**（§4）：`decision.type` 是闭集，语义字段确定，
 *    才谈得上 Schema 验证。自由文本只进 `objective` / `rationale` / `description`。
 * 2. **第一版不追求"科研正确性"**（§19）：只判"有没有问题/假设/决策/计划/证据要求"，
 *    不判"这个假设是否正确"。后者属于 LLM + Review Skill + 人类专家。
 */
/* ════════════════════════════════════════════════════════════════════════
 * Schema 版本
 * ════════════════════════════════════════════════════════════════════════ */
/** IR 结构版本。字段只增不改义；破坏性变化才升主版本。 */
export const IR_SCHEMA_VERSION = '1';
export const HYPOTHESIS_STATUSES = ['open', 'supported', 'refuted', 'revised'];
export const PLAN_STEP_STATUSES = ['pending', 'in-progress', 'completed'];
export const EVIDENCE_REQUIREMENT_TYPES = [
    'experimental-comparison',
    'ablation',
    'statistical-significance',
    'literature-support',
    'dataset-validation',
    'human-evaluation',
    'error-analysis',
    'reproduction',
    'cost-measurement',
    'qualitative-example',
];
//# sourceMappingURL=types.js.map