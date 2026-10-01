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
export const IR_SCHEMA_VERSION = '1'

/* ════════════════════════════════════════════════════════════════════════
 * 核心对象（§3：research / question / hypothesis / decision / plan /
 *            evidence_requirements / provenance）
 * ════════════════════════════════════════════════════════════════════════ */

/** 研究项目身份与基本描述（`research`）。 */
export interface ResearchIdentity {
  /** 项目短标识（kebab-case，用于跨文件引用）。 */
  key: string
  /** 研究题目（用户可读一句话）。 */
  title: string
  /** 一段以内的背景概述（可选）。 */
  summary?: string
}

/** 当前研究问题（`question`）。 */
export interface ResearchQuestion {
  /** 问题陈述 —— 缺失即 R001。 */
  statement: string
  /** 问题所处的上下文（已知什么、卡在哪）。 */
  context?: string
}

/** 假设状态（渐进，不是 true/false）。 */
export type HypothesisStatus = 'open' | 'supported' | 'refuted' | 'revised'

export const HYPOTHESIS_STATUSES: readonly HypothesisStatus[] = ['open', 'supported', 'refuted', 'revised']

/** 假设（`hypothesis`）。 */
export interface Hypothesis {
  /** 假设 id（`H01`…，IR 内唯一）。 */
  id: string
  /** 假设陈述。 */
  statement: string
  /**
   * 可观察结果 —— 什么观察能支持/推翻它（§8.2 R101）。
   * 策略要求时缺失即 R101："Hypothesis has no observable outcome"。
   */
  observableOutcome?: string
  /** 当前状态（默认 open）。 */
  status?: HypothesisStatus
}

/**
 * Typed 科研决策（`decision`，§4）。
 *
 * `type` 是闭集（见 {@link DecisionType}），语义字段确定语义：
 *
 * ```yaml
 * decision:
 *   type: experiment_revision
 *   objective: discriminate_hypotheses
 *   alternatives: [continue_current_experiment, add_control_condition, replace_baseline]
 *   selected: [add_control_condition]
 *   rationale: [current evidence cannot distinguish H1 and H2]
 * ```
 *
 * 通用字段所有类型都可带；`baseline` / `metric` 等由对应
 * {@link DecisionPolicy} 的 constraints 决定是否必需（§7）。
 */
export interface DecisionIR {
  /** 决策类型（闭集，非法即 R002）。 */
  type: string
  /** 这个决策要达成什么（目标，尽量用可判定的表述）。 */
  objective?: string
  /** 考虑过的备选项（决策必须有 alternatives —— R104）。 */
  alternatives?: string[]
  /** 选中的行动（必须是 alternatives 的子集 —— R106）。 */
  selected?: string[]
  /** 选择依据（每条一个理由）。 */
  rationale?: string[]
  /** 涉及的基线（compare/experiment 类决策必需 —— R102）。 */
  baseline?: string[]
  /** 对照条件。 */
  control?: string[]
  /** 度量指标（可测量性 —— R107）。 */
  metric?: string[]
  /** 与该决策关联的风险及处置。 */
  risk?: string
  /** 该决策指向的假设 id（如"区分 H01/H02"）。 */
  hypotheses?: string[]
}

/** 计划步状态（Plan 是 IR 的 execution projection —— §12）。 */
export type PlanStepStatus = 'pending' | 'in-progress' | 'completed'

export const PLAN_STEP_STATUSES: readonly PlanStepStatus[] = ['pending', 'in-progress', 'completed']

/** 一个执行步。 */
export interface PlanStep {
  /** 步 id（`step-1`…，IR 内唯一）。 */
  id: string
  /** 要做什么（动作）。 */
  action: string
  /** 完成后应产生的产物（相对路径或产物名；完成时必须有 artifact 记录 —— R203）。 */
  artifact?: string
  /** 状态（默认 pending）。 */
  status?: PlanStepStatus
  /** 完成后实际记录的产物路径。 */
  artifactPath?: string
}

/** Plan —— IR 的执行投影（用户看到 Markdown Plan，Harness 内部维护 Typed IR）。 */
export interface PlanIR {
  /** 计划概述。 */
  summary?: string
  /** 执行步。 */
  steps: PlanStep[]
}

/**
 * 证据要求的类型（§11：Evidence 与 IR 建立显式关系）。
 *
 * 这是"要求什么**类**证据"的类型枚举，与 Evidence 的来源枚举
 * （`EvidenceSource`）不同：一个 experimental-comparison 要求可以由多条
 * experiment 来源的 Evidence 满足。
 */
export type EvidenceRequirementType =
  | 'experimental-comparison'
  | 'ablation'
  | 'statistical-significance'
  | 'literature-support'
  | 'dataset-validation'
  | 'human-evaluation'
  | 'error-analysis'
  | 'reproduction'
  | 'cost-measurement'
  | 'qualitative-example'

export const EVIDENCE_REQUIREMENT_TYPES: readonly EvidenceRequirementType[] = [
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
]

/** 证据要求（`evidence_requirements`）。 */
export interface EvidenceRequirement {
  /** 要求 id（`ER01`…，IR 内唯一）。 */
  id: string
  /** 要求什么类型的证据。 */
  type: string
  /** 要求描述（怎样算满足）。 */
  description: string
  /** 由哪个计划步产生（`plan.steps[].id`；引用不到即 R105）。 */
  step?: string
  /** 已满足该要求的 Evidence id（`E001`…，transition 时写入）。 */
  satisfiedBy?: string[]
}

/** IR 的出处（`provenance`，§3）：由什么 Skill、什么 Decision、什么 State 产生。 */
export interface IRProvenance {
  /** 创建时间（ISO 8601）。 */
  createdAt: string
  /** 产生它的 Skill（如 `experiment-design`）。 */
  skill?: string
  /** 关联的 Decision id（`D001`，`research/decisions/`）。 */
  decisionId?: string
  /** 产生它时的 State id（`S001`）。 */
  stateId?: string
  /** 来源形态：提案 / delta 结果 / 导入。 */
  source?: 'proposal' | 'delta' | 'transition' | 'import'
  /** 备注。 */
  note?: string
}

/** Research IR —— 整个内核的 canonical representation（§3 最小集）。 */
export interface ResearchIR {
  /** 结构版本（{@link IR_SCHEMA_VERSION}）。 */
  irVersion: string
  /** IR id（`IR001`）。 */
  id: string
  /** 修订号（1 起，每次合法 delta / transition +1）。 */
  revision: number
  /** 研究身份。 */
  research: ResearchIdentity
  /** 当前研究问题。 */
  question: ResearchQuestion
  /** 当前假设集。 */
  hypotheses: Hypothesis[]
  /** 当前科研决策。 */
  decision: DecisionIR
  /** 决策的执行投影。 */
  plan: PlanIR
  /** 证据要求。 */
  evidenceRequirements: EvidenceRequirement[]
  /** 出处。 */
  provenance: IRProvenance
}

/* ════════════════════════════════════════════════════════════════════════
 * 校验结果（§8 三层 + §16 Repair）
 * ════════════════════════════════════════════════════════════════════════ */

/** 校验层：structural（R0xx）/ scientific（R1xx）/ transition（R2xx）。 */
export type ValidationLayer = 'structural' | 'scientific' | 'transition'

/** 一条结构化校验错误（§16 Repair 机制的载体）。 */
export interface IRValidationIssue {
  /** 错误码（`R001`…）。 */
  code: string
  /** 所在层。 */
  layer: ValidationLayer
  /** 出错字段路径（如 `decision.selected`）。 */
  field: string
  /** 人类可读说明。 */
  message: string
  /** 修复动作建议（如 `add_baseline`）—— 比"请重新设计"确定性高得多。 */
  repair: string
}

/** 校验报告。 */
export interface IRValidationReport {
  status: 'valid' | 'failed'
  /** 阻断性错误（必须修复）。 */
  errors: IRValidationIssue[]
  /** 非阻断提醒（结构成立但值得补强）。 */
  warnings: IRValidationIssue[]
}

/* ════════════════════════════════════════════════════════════════════════
 * IR Delta（§17：增量变更，不整份重写）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一次增量操作（确定性语义，见 `delta.ts`）。
 *
 * 对象目标：`add` 增加**尚不存在**的字段；`update` 修改**已存在**的字段；
 * `remove` 删除字段。数组目标：`add.items` 追加元素；`update.items`
 * （带 `id` 的部分字段）合并元素；`remove` 按 id 删除元素。
 */
export interface IRDeltaOperation {
  add?: Record<string, unknown>
  update?: Record<string, unknown>
  remove?: string[]
  /** 数组目标的元素级操作。 */
  items?: unknown[]
}

/** 一个 IR Delta（记录"Agent 到底改变了什么"）。 */
export interface IRDelta {
  /** 变更类型（如 `update_experiment`，进入 trace）。 */
  change: string
  /** 目标路径：`question` / `decision` / `plan` / `hypotheses` / `evidence_requirements`
   *  或元素路径 `hypotheses.H01` / `evidence_requirements.ER01` / `plan.steps.step-1`。 */
  target: string
  /** 操作列表。 */
  operations: IRDeltaOperation[]
  /** 变更理由。 */
  reason?: string
}

/* ════════════════════════════════════════════════════════════════════════
 * State Object（§9：State 是真正的状态机）+ Decision Trace（§18）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * State Object —— 内核侧的客观状态版本（§9）。
 *
 * ⚠️ 它**不替代** `research-state.md`（用户可读状态、人工提案闸门）：
 * 这里只记录"实际发生了什么"，即 State Transition 的落点。
 */
export interface IRStateObject {
  /** 状态 id（`S001`）。 */
  stateId: string
  /** 父状态 id（provenance graph 的边）。 */
  parentStateId?: string
  /** 创建时间。 */
  createdAt: string
  /** 该状态对应的 IR。 */
  irId: string
  /** 该状态对应的 IR 修订号。 */
  irRevision: number
  /** 触发本次转移的 Decision id（可选）。 */
  decisionId?: string
  /** 本次完成的动作（plan step id 或描述）。 */
  completedActions: string[]
  /** 仍待执行的动作。 */
  pendingActions: string[]
  /** 本次产生的 Evidence id。 */
  evidence: string[]
  /** 本次满足的证据要求映射。 */
  requirementsSatisfied: Array<{ requirement: string; evidence: string }>
  /** 本次转移中裁定的 Claim（id → 状态）。 */
  claimsUpdated: Array<{ claim: string; status: string }>
  /** 出处备注。 */
  provenance: { agent?: string; note?: string }
}

/** 一行 Decision Trace（§18：D → IR → Execution → E → S 的运行轨迹）。 */
export interface IRTraceEntry {
  /** 时间。 */
  at: string
  /** 本次转移产生的状态。 */
  stateId: string
  /** 父状态。 */
  parentStateId?: string
  /** IR id 与修订。 */
  irId: string
  irRevision: number
  /** 关联决策。 */
  decisionId?: string
  /** 产生的证据。 */
  evidence: string[]
  /** 一句话摘要（进了 trace 的可读性）。 */
  summary: string
}
