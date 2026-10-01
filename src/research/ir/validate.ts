/**
 * ConvFusion v0.5.6 — IR Validator（规格 §8：三层验证的前两层 + §16 Repair）
 *
 * ```text
 * IR → Schema Validator（R0xx）→ Scientific Structural Validator（R1xx）
 *    → Transition Validator（R2xx，见 transition.ts）→ Executable IR
 * ```
 *
 * ## 边界（§19）
 *
 * 科研结构层判的是 **"它是否满足一个可执行、可验证的科研结构"**，
 * 不判"这个科研设计是不是科学上正确"。所以这里的每条规则都是
 * 确定性的（字段存在性 / 引用一致性 / 可测量性），不是科学评判。
 *
 * ## Repair（§16）
 *
 * 每条错误都带 `repair` —— 返回结构化的修复动作建议，而不是
 * "你的方案有问题，请重新设计"。Agent 拿到 errors 后按 repair 修，再提交。
 */

import {
  EVIDENCE_REQUIREMENT_TYPES,
  IR_SCHEMA_VERSION,
  type DecisionIR,
  type EvidenceRequirement,
  type Hypothesis,
  type IRValidationIssue,
  type IRValidationReport,
  type PlanStep,
  type ResearchIR,
} from './types.js'
import { DECISION_TYPES, decisionPolicy } from './policy.js'

/* ════════════════════════════════════════════════════════════════════════
 * 小工具
 * ════════════════════════════════════════════════════════════════════════ */

function issue(
  code: string,
  layer: IRValidationIssue['layer'],
  field: string,
  message: string,
  repair: string,
): IRValidationIssue {
  return { code, layer, field, message, repair }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x)).filter((x) => x.length > 0)
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 归一（parser 角色：原始 JSON → Typed IR；id 缺失由内核分配）
 * ════════════════════════════════════════════════════════════════════════ */

/** 归一假设列表；缺失 id 按序号分配（`H01`…）。 */
function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (!Array.isArray(raw)) return []
  return raw.map((h, i) => {
    const o = obj(h)
    return {
      id: str(o.id) || `H${String(i + 1).padStart(2, '0')}`,
      statement: str(o.statement),
      ...(str(o.observableOutcome) ? { observableOutcome: str(o.observableOutcome) } : {}),
      ...(str(o.status) ? { status: str(o.status) as Hypothesis['status'] } : {}),
    }
  })
}

/** 归一计划步；缺失 id 按序号分配（`step-N`）。 */
function normalizeSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s, i) => {
    const o = obj(s)
    return {
      id: str(o.id) || `step-${i + 1}`,
      action: str(o.action),
      ...(str(o.artifact) ? { artifact: str(o.artifact) } : {}),
      ...(str(o.status) ? { status: str(o.status) as PlanStep['status'] } : {}),
      ...(str(o.artifactPath) ? { artifactPath: str(o.artifactPath) } : {}),
    }
  })
}

/** 归一证据要求；缺失 id 按序号分配（`ER01`…）。 */
function normalizeRequirements(raw: unknown): EvidenceRequirement[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r, i) => {
    const o = obj(r)
    return {
      id: str(o.id) || `ER${String(i + 1).padStart(2, '0')}`,
      type: str(o.type),
      description: str(o.description),
      ...(str(o.step) ? { step: str(o.step) } : {}),
      ...(Array.isArray(o.satisfiedBy) ? { satisfiedBy: strList(o.satisfiedBy) } : {}),
    }
  })
}

/** 归一决策。 */
function normalizeDecision(raw: unknown): DecisionIR {
  const o = obj(raw)
  return {
    type: str(o.type),
    ...(str(o.objective) ? { objective: str(o.objective) } : {}),
    ...(Array.isArray(o.alternatives) ? { alternatives: strList(o.alternatives) } : {}),
    ...(Array.isArray(o.selected) ? { selected: strList(o.selected) } : {}),
    ...(Array.isArray(o.rationale) ? { rationale: strList(o.rationale) } : {}),
    ...(Array.isArray(o.baseline) ? { baseline: strList(o.baseline) } : {}),
    ...(Array.isArray(o.control) ? { control: strList(o.control) } : {}),
    ...(Array.isArray(o.metric) ? { metric: strList(o.metric) } : {}),
    ...(str(o.risk) ? { risk: str(o.risk) } : {}),
    ...(Array.isArray(o.hypotheses) ? { hypotheses: strList(o.hypotheses) } : {}),
  }
}

/**
 * 把原始 JSON 归一成 Typed IR（不报错 —— 语义检查交给 {@link validateIR}）。
 *
 * `id` / `revision` / `provenance` 由 store 分配；缺失时这里给中性缺省。
 */
export function normalizeIR(raw: unknown): ResearchIR {
  const o = obj(raw)
  const now = new Date().toISOString()
  const prov = obj(o.provenance)
  return {
    irVersion: str(o.irVersion) || IR_SCHEMA_VERSION,
    id: str(o.id),
    revision: typeof o.revision === 'number' && Number.isFinite(o.revision) ? o.revision : 1,
    research: {
      key: str(obj(o.research).key),
      title: str(obj(o.research).title),
      ...(str(obj(o.research).summary) ? { summary: str(obj(o.research).summary) } : {}),
    },
    question: {
      statement: str(obj(o.question).statement),
      ...(str(obj(o.question).context) ? { context: str(obj(o.question).context) } : {}),
    },
    hypotheses: normalizeHypotheses(o.hypotheses),
    decision: normalizeDecision(o.decision),
    plan: {
      ...(str(obj(o.plan).summary) ? { summary: str(obj(o.plan).summary) } : {}),
      steps: normalizeSteps(obj(o.plan).steps),
    },
    evidenceRequirements: normalizeRequirements(o.evidenceRequirements),
    provenance: {
      createdAt: str(prov.createdAt) || now,
      ...(str(prov.skill) ? { skill: str(prov.skill) } : {}),
      ...(str(prov.decisionId) ? { decisionId: str(prov.decisionId) } : {}),
      ...(str(prov.stateId) ? { stateId: str(prov.stateId) } : {}),
      ...(str(prov.source) ? { source: str(prov.source) as ResearchIR['provenance']['source'] } : {}),
      ...(str(prov.note) ? { note: str(prov.note) } : {}),
    },
  }
}

/** 原始 JSON → 归一 + 校验，一步到位（工具入口用）。 */
export function parseIR(raw: unknown): { ir: ResearchIR; report: IRValidationReport } {
  const ir = normalizeIR(raw)
  return { ir, report: validateIR(ir) }
}

/* ════════════════════════════════════════════════════════════════════════
 * Structural Validation（R0xx，§8.1）
 * ════════════════════════════════════════════════════════════════════════ */

function validateStructure(ir: ResearchIR): IRValidationIssue[] {
  const errors: IRValidationIssue[] = []
  const warnings: IRValidationIssue[] = []

  // R005 研究身份
  if (!ir.research.key || !ir.research.title) {
    errors.push(
      issue('R005', 'structural', 'research', 'Missing research identity (key / title).', 'specify_research_identity'),
    )
  }

  // R001 研究问题
  if (!ir.question.statement) {
    errors.push(issue('R001', 'structural', 'question.statement', 'Missing research question.', 'specify_question'))
  }

  // R010 假设陈述
  ir.hypotheses.forEach((h, i) => {
    if (!h.statement) {
      errors.push(
        issue('R010', 'structural', `hypotheses[${i}].statement`, `Hypothesis ${h.id} has no statement.`, 'specify_hypothesis'),
      )
    }
  })

  // R002 决策类型（闭集）
  if (!ir.decision.type) {
    errors.push(issue('R002', 'structural', 'decision.type', 'Missing decision type.', 'specify_decision_type'))
  } else if (!(DECISION_TYPES as readonly string[]).includes(ir.decision.type)) {
    errors.push(
      issue(
        'R002',
        'structural',
        'decision.type',
        `Invalid decision type "${ir.decision.type}" (closed set: ${DECISION_TYPES.join(', ')}).`,
        'use_known_decision_type',
      ),
    )
  }

  // Policy 必填字段
  const policy = decisionPolicy(ir.decision.type)
  if (policy) {
    for (const field of policy.required) {
      const v = ir.decision[field as keyof DecisionIR]
      const empty = Array.isArray(v) ? v.length === 0 : !str(v)
      if (empty) {
        const code = field === 'selected' ? 'R003' : field === 'objective' ? 'R007' : field === 'rationale' ? 'R008' : 'R003'
        errors.push(
          issue(
            code,
            'structural',
            `decision.${field}`,
            `Decision type "${policy.type}" requires \`${field}\`.`,
            `specify_decision_${field}`,
          ),
        )
      }
    }
  }

  // R006 计划（§3 plan 是核心对象；归一后 steps 恒为数组，"缺计划"= 没有任何执行步）
  if (!ir.plan.steps.length) {
    errors.push(issue('R006', 'structural', 'plan.steps', 'Plan has no steps — decision has no execution projection.', 'specify_plan_steps'))
  }

  // R004 证据要求 + R009 id 唯一
  const seenIds = new Map<string, string>()
  const trackId = (id: string, field: string) => {
    if (!id) return
    const prev = seenIds.get(id)
    if (prev) {
      errors.push(
        issue('R009', 'structural', field, `Duplicate id "${id}" (also at ${prev}).`, 'make_ids_unique'),
      )
    } else {
      seenIds.set(id, field)
    }
  }
  ir.hypotheses.forEach((h, i) => trackId(h.id, `hypotheses[${i}].id`))
  ir.plan.steps.forEach((s, i) => trackId(s.id, `plan.steps[${i}].id`))
  ir.evidenceRequirements.forEach((r, i) => {
    trackId(r.id, `evidenceRequirements[${i}].id`)
    if (!r.type || !EVIDENCE_REQUIREMENT_TYPES.includes(r.type as never) || !r.description) {
      errors.push(
        issue(
          'R004',
          'structural',
          `evidenceRequirements[${i}]`,
          `Invalid evidence requirement ${r.id}: type must be one of ${EVIDENCE_REQUIREMENT_TYPES.join(', ')} and description is required.`,
          'fix_evidence_requirement',
        ),
      )
    }
    if (!r.step) {
      warnings.push(
        issue(
          'R105',
          'scientific',
          `evidenceRequirements[${i}].step`,
          `Evidence requirement ${r.id} is not linked to a plan step — hard to check its coverage later.`,
          'link_requirement_to_plan_step',
        ),
      )
    }
  })

  // R011 决策引用的假设必须存在
  if (ir.decision.hypotheses?.length) {
    const known = new Set(ir.hypotheses.map((h) => h.id))
    for (const href of ir.decision.hypotheses) {
      if (!known.has(href)) {
        errors.push(
          issue('R011', 'structural', 'decision.hypotheses', `Decision references unknown hypothesis "${href}".`, 'fix_hypothesis_reference'),
        )
      }
    }
  }

  return [...errors, ...warnings]
}

/* ════════════════════════════════════════════════════════════════════════
 * Scientific Structural Validation（R1xx，§8.2）
 * ════════════════════════════════════════════════════════════════════════ */

function validateScientific(ir: ResearchIR): IRValidationIssue[] {
  const errors: IRValidationIssue[] = []
  const policy = decisionPolicy(ir.decision.type)
  const constraints = new Set(policy?.constraints ?? [])

  // R106（普适）：selected ⊆ alternatives
  if (ir.decision.alternatives?.length && ir.decision.selected?.length) {
    const alts = new Set(ir.decision.alternatives)
    for (const s of ir.decision.selected) {
      if (!alts.has(s)) {
        errors.push(
          issue('R106', 'scientific', 'decision.selected', `Selected action "${s}" is not among the listed alternatives.`, 'add_to_alternatives_or_reselect'),
        )
      }
    }
  }

  // R104：决策必须有 alternatives
  if (constraints.has('alternatives_required') && !ir.decision.alternatives?.length) {
    errors.push(
      issue('R104', 'scientific', 'decision.alternatives', 'Decision has no alternatives — a decision needs options to choose from.', 'list_alternatives'),
    )
  }

  // R102：实验/比较类必须有 baseline
  if (constraints.has('at_least_one_baseline') && !ir.decision.baseline?.length) {
    errors.push(
      issue('R102', 'scientific', 'decision.baseline', 'Experiment has no baseline — nothing to compare against.', 'add_baseline'),
    )
  }

  // R107：结果可测量（metric 或带产物的执行步）
  if (constraints.has('measurable_outcome_required')) {
    const hasMetric = Boolean(ir.decision.metric?.length)
    const hasArtifactStep = ir.plan.steps.some((s) => Boolean(s.artifact))
    if (!hasMetric && !hasArtifactStep) {
      errors.push(
        issue('R107', 'scientific', 'decision.metric', 'Outcome is not measurable: declare a metric or a plan step that produces an artifact.', 'declare_metric_or_artifact'),
      )
    }
  }

  // R103：主张/证据类决策必须声明证据要求
  if (
    (constraints.has('evidence_requirement_required') || constraints.has('evidence_required_before_claim_update')) &&
    !ir.evidenceRequirements.length
  ) {
    errors.push(
      issue('R103', 'scientific', 'evidenceRequirements', 'Claim has no evidence requirement — say what evidence would settle it.', 'specify_required_evidence'),
    )
  }

  // R101：假设必须有可观察结果
  if (constraints.has('observable_outcome_required')) {
    if (!ir.hypotheses.length) {
      errors.push(
        issue('R101', 'scientific', 'hypotheses', 'Hypothesis has no observable outcome: no hypothesis is declared at all.', 'declare_hypotheses_with_observable_outcome'),
      )
    }
    for (const h of ir.hypotheses) {
      if (!h.observableOutcome) {
        errors.push(
          issue('R101', 'scientific', `hypotheses.${h.id}.observableOutcome`, `Hypothesis ${h.id} has no observable outcome.`, 'specify_observable_outcome'),
        )
      }
    }
  }

  // R105：证据要求必须可满足（step 引用存在）
  const stepIds = new Set(ir.plan.steps.map((s) => s.id))
  ir.evidenceRequirements.forEach((r, i) => {
    if (r.step && !stepIds.has(r.step)) {
      errors.push(
        issue('R105', 'scientific', `evidenceRequirements[${i}].step`, `Evidence requirement ${r.id} cannot be satisfied: plan step "${r.step}" does not exist.`, 'fix_requirement_step_reference'),
      )
    }
  })

  return errors
}

/* ════════════════════════════════════════════════════════════════════════
 * 入口
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 三层验证的前两层：Structural（R0xx）+ Scientific（R1xx）。
 *
 * 第三层 Transition（R2xx）需要工作区上下文，见 `transition.ts`。
 */
export function validateIR(ir: ResearchIR): IRValidationReport {
  const all = [...validateStructure(ir), ...validateScientific(ir)]
  const errors = all.filter((i) => !isWarning(i))
  const warnings = all.filter((i) => isWarning(i))
  return {
    status: errors.length ? 'failed' : 'valid',
    errors,
    warnings,
  }
}

/**
 * 非阻断项判定。
 *
 * 当前唯一进入 warnings 的规则：证据要求未链接计划步（R105 提醒版）——
 * 结构仍可执行，只是后续算 coverage 时会缺信息。判据用
 * `repair === 'link_requirement_to_plan_step'`，避免同一错误码在两层间打架。
 */
function isWarning(i: IRValidationIssue): boolean {
  return i.repair === 'link_requirement_to_plan_step'
}

/** 把报告渲染成人类可读文本（Repair 循环里给模型看）。 */
export function formatReport(report: IRValidationReport): string {
  const lines: string[] = [`validation: ${report.status}`]
  for (const e of report.errors) lines.push(`  [${e.code}] ${e.field}: ${e.message} → repair: ${e.repair}`)
  for (const w of report.warnings) lines.push(`  warn [${w.code}] ${w.field}: ${w.message} → repair: ${w.repair}`)
  return lines.join('\n')
}
