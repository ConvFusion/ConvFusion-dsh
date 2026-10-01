/**
 * ConvFusion v0.5.6 — Research Decision Policy（规格 §7）
 *
 * > Skill 给 LLM 方法，Policy 给 LLM 边界。
 *
 * ```text
 * Skill → LLM reasoning → Decision Policy → Research IR
 * ```
 *
 * 本模块是**边界**：每种决策类型需要哪些字段（required）、受哪些结构约束
 * （constraints → `validate.ts` 的 R1xx 规则）。它刻意不含任何"科研是否正确"
 * 的判断（§19）—— 只保证决策**可执行、可验证**。
 *
 * 后续 Stage 3 技能迁移时，Skill frontmatter 可以声明自己产生哪些
 * decision_types / required_ir，进而绑定到这里的 Policy；Policy 注册表
 * 本身就是为此预留的挂点。
 */
/**
 * 科研决策类型闭集。
 *
 * 覆盖长期科研决策的高频判断（方向 / 假设 / 实验 / 基线 / 方法 / 证据 / 主张 /
 * 风险 / 停止）。新增类型 = 新增 Policy 条目，而不是放开自由文本。
 */
export declare const DECISION_TYPES: readonly ["research_direction", "hypothesis_revision", "hypothesis_discrimination", "experiment_design", "experiment_revision", "baseline_selection", "method_selection", "compare_methods", "evidence_sufficiency", "claim_update", "risk_management", "stop_path"];
export type DecisionType = (typeof DECISION_TYPES)[number];
/**
 * 约束 id 一览（`validate.ts` 按 id 分派到确定性检查）：
 *
 * | id | 含义 | 错误码 |
 * |---|---|---|
 * | `alternatives_required` | 决策必须列出备选项 | R104 |
 * | `at_least_one_baseline` | 实验/比较类决策必须有 baseline | R102 |
 * | `measurable_outcome_required` | 结果必须可测量（metric 或带产物的执行步） | R107 |
 * | `evidence_requirement_required` | 必须声明证据要求 | R103 |
 * | `observable_outcome_required` | 每个假设必须有可观察结果 | R101 |
 * | `evidence_required_before_claim_update` | 更新主张前必须有证据要求 | R103 |
 */
export type DecisionConstraint = 'alternatives_required' | 'at_least_one_baseline' | 'measurable_outcome_required' | 'evidence_requirement_required' | 'observable_outcome_required' | 'evidence_required_before_claim_update';
/** 一种决策类型的 Policy。 */
export interface DecisionPolicy {
    type: DecisionType;
    /** 短标签（人类可读）。 */
    label: string;
    /** 这类决策在问什么。 */
    question: string;
    /** 必填字段（`DecisionIR` 的字段名；缺 → R003/R007/R008 等结构性错误）。 */
    required: ReadonlyArray<keyof import('./types.js').DecisionIR | 'alternatives' | 'rationale'>;
    /** 结构约束（→ R1xx）。 */
    constraints: readonly DecisionConstraint[];
}
/** Decision Policy 注册表（§7：Policy 给边界）。 */
export declare const DECISION_POLICIES: Readonly<Record<DecisionType, DecisionPolicy>>;
/** 取 Policy；未知类型返回 undefined（调用方报 R002）。 */
export declare function decisionPolicy(type: string): DecisionPolicy | undefined;
//# sourceMappingURL=policy.d.ts.map