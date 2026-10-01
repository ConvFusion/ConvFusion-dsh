/**
 * ConvFusion v0.5.6 — State Transition（规格 §8.3 第三层 + §9/§10/§11/§18）
 *
 * ```text
 * Research State_t + IR_t → Execution → Evidence_t → Research State_{t+1}
 * ```
 *
 * 本模块是这个循环的**确定性闸门**：
 *
 * 1. **Transition Validation（R2xx）** —— 拒绝非法推进：
 *    Claim 标 supported 却没有 Evidence（R201）、要求被不存在的证据"满足"（R202）、
 *    执行步完成却没有产物（R203）、引用悬空（R204）、基于过期修订推进（R205）。
 * 2. **Evidence ↔ IR 显式关系**（§11）—— `satisfies` 把 Evidence 挂到
 *    `evidence_requirements` 上，Review 于是可以**计算** coverage，而不只是问 LLM
 *    "这个实验是否充分"。
 * 3. **State Object + Trace 落盘**（§9/§18）—— 每次合法转移产生新 `S###`
 *    （带 `parentStateId`）并追加一行 Decision Trace。
 *
 * ⚠️ 边界：这里写的只是**内核状态版本与 trace**，不碰 `research-state.md`
 * （用户可读状态仍走 propose → Accept/Edit/Reject 人工闸门）。
 */

import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type {
  IRStateObject,
  IRTraceEntry,
  IRValidationIssue,
  IRValidationReport,
  ResearchIR,
} from './types.js'
import {
  appendTrace,
  isIRWriteError,
  latestState,
  nextStateId,
  readIR,
  saveIR,
  writeState,
} from './store.js'
import { listEvidence } from '../evidence.js'
import { readClaim } from '../claims.js'

/* ════════════════════════════════════════════════════════════════════════
 * 输入
 * ════════════════════════════════════════════════════════════════════════ */

/** 一次 State Transition 的输入。 */
export interface TransitionInput {
  /** 目标 IR。 */
  irId: string
  /** 期望的当前修订号（防基于过期修订推进 —— R205）。 */
  revision?: number
  /** 触发本次转移的 Decision id（`D001`）。 */
  decisionId?: string
  /** Evidence 满足 IR 的证据要求（§11 satisfies 关系）。 */
  satisfies?: Array<{ requirement: string; evidence: string }>
  /** 本次完成的执行步（含实际产物）。 */
  completed?: Array<{ step: string; artifact?: string }>
  /** 本次裁定的 Claim（id → 状态）。 */
  claims?: Array<{ claim: string; status: string }>
  /** 执行方（记入 provenance）。 */
  agent?: string
  /** 备注。 */
  note?: string
}

/* ════════════════════════════════════════════════════════════════════════
 * Transition Validation（R2xx）
 * ════════════════════════════════════════════════════════════════════════ */

function err(code: string, field: string, message: string, repair: string): IRValidationIssue {
  return { code, layer: 'transition', field, message, repair }
}

/**
 * 第三层验证：当前工作区状态 + IR + 提议的推进 → 是否合法。
 *
 * 只判"能不能这么推进"（引用完整、产物存在、证据真实在档），
 * 不判推进是否科学上明智（§19）。
 */
export function validateTransition(workspace: string, input: TransitionInput): IRValidationReport {
  const errors: IRValidationIssue[] = []
  const ir = readIR(workspace, input.irId)
  if (!ir) {
    return {
      status: 'failed',
      errors: [err('R204', 'irId', `Unknown IR "${input.irId}".`, 'fix_ir_reference')],
      warnings: [],
    }
  }

  // R205 修订是否过期
  if (typeof input.revision === 'number' && input.revision !== ir.revision) {
    errors.push(
      err(
        'R205',
        'revision',
        `Stale IR revision: transition targets r${input.revision}, current is r${ir.revision}.`,
        'reload_current_revision',
      ),
    )
  }

  const knownEvidence = new Set(listEvidence(workspace).map((e) => e.id))
  const reqIds = new Set(ir.evidenceRequirements.map((r) => r.id))
  const stepIds = new Set(ir.plan.steps.map((s) => s.id))

  // satisfies：要求存在、证据真实在档
  for (const s of input.satisfies ?? []) {
    if (!reqIds.has(s.requirement)) {
      errors.push(
        err('R204', 'satisfies', `Unknown evidence requirement "${s.requirement}".`, 'fix_requirement_reference'),
      )
    }
    if (!knownEvidence.has(s.evidence)) {
      errors.push(
        err('R202', 'satisfies', `Evidence "${s.evidence}" does not exist — a requirement cannot be satisfied by unknown evidence.`, 'record_evidence_first'),
      )
    }
  }

  // completed：步骤存在；声明了预期产物的步骤必须有产物
  for (const c of input.completed ?? []) {
    const step = ir.plan.steps.find((s) => s.id === c.step)
    if (!step) {
      errors.push(err('R204', 'completed', `Unknown plan step "${c.step}".`, 'fix_step_reference'))
      continue
    }
    const artifact = (c.artifact ?? step.artifactPath ?? '').trim()
    if (step.artifact && !artifact) {
      errors.push(
        err('R203', `plan.steps.${step.id}`, `Completed action "${step.id}" has no recorded artifact (expected: ${step.artifact}).`, 'record_artifact_path'),
      )
      continue
    }
    if (artifact) {
      const abs = isAbsolute(artifact) ? artifact : join(workspace, artifact)
      if (!existsSync(abs)) {
        errors.push(
          err('R203', `plan.steps.${step.id}`, `Recorded artifact "${artifact}" does not exist on disk.`, 'fix_artifact_path'),
        )
      }
    }
  }

  // R201：Claim 标 supported/verified 必须有在档证据支持
  for (const c of input.claims ?? []) {
    const claim = readClaim(workspace, c.claim)
    if (!claim) {
      errors.push(err('R204', 'claims', `Unknown claim "${c.claim}".`, 'fix_claim_reference'))
      continue
    }
    if (c.status === 'supported' || c.status === 'verified') {
      const backing = listEvidence(workspace).filter(
        (e) => e.supports.includes(claim.id) && e.status !== 'superseded' && e.status !== 'rejected',
      )
      if (!backing.length) {
        errors.push(
          err('R201', `claims.${claim.id}`, `Claim ${claim.id} cannot be marked ${c.status}: no recorded evidence supports it.`, 'record_supporting_evidence'),
        )
      }
    }
  }

  return { status: errors.length ? 'failed' : 'valid', errors, warnings: [] }
}

/* ════════════════════════════════════════════════════════════════════════
 * 施加转移
 * ════════════════════════════════════════════════════════════════════════ */

export type TransitionResult =
  | { ok: true; state: IRStateObject; ir: ResearchIR; trace: IRTraceEntry }
  | { ok: false; errors: IRValidationIssue[] }

/**
 * 执行一次合法转移：IR 修订 +1（satisfies/完成状态写回 IR）、
 * 产生新 State Object（parent = 链头）、追加 Decision Trace。
 */
export function applyTransition(workspace: string, input: TransitionInput): TransitionResult {
  const report = validateTransition(workspace, input)
  if (report.status === 'failed') return { ok: false, errors: report.errors }

  const ir = readIR(workspace, input.irId) as ResearchIR

  // 1) IR 更新：satisfies 写进 satisfiedBy、完成步写状态与产物
  const next: ResearchIR = JSON.parse(JSON.stringify(ir)) as ResearchIR
  for (const s of input.satisfies ?? []) {
    const req = next.evidenceRequirements.find((r) => r.id === s.requirement)
    if (!req) continue
    const set = new Set(req.satisfiedBy ?? [])
    set.add(s.evidence)
    req.satisfiedBy = [...set].sort()
  }
  for (const c of input.completed ?? []) {
    const step = next.plan.steps.find((st) => st.id === c.step)
    if (!step) continue
    step.status = 'completed'
    if (c.artifact) step.artifactPath = c.artifact
    else if (!step.artifactPath && step.artifact) step.artifactPath = step.artifact
  }
  next.revision = ir.revision + 1

  const saved = saveIR(workspace, next)
  if (isIRWriteError(saved)) return { ok: false, errors: [err('R204', 'ir', saved.error, 'retry_transition')] }

  // 2) State Object（§9）：parent 链 + 本次发生了什么
  const parent = latestState(workspace)
  const completedActions = (input.completed ?? []).map((c) => c.step)
  const pendingActions = next.plan.steps.filter((s) => s.status !== 'completed').map((s) => s.id)
  const evidence = [...new Set((input.satisfies ?? []).map((s) => s.evidence))].sort()
  const state: IRStateObject = {
    stateId: nextStateId(workspace),
    ...(parent ? { parentStateId: parent.stateId } : {}),
    createdAt: new Date().toISOString(),
    irId: saved.id,
    irRevision: saved.revision,
    ...(input.decisionId ? { decisionId: input.decisionId } : {}),
    completedActions,
    pendingActions,
    evidence,
    requirementsSatisfied: (input.satisfies ?? []).map((s) => ({ requirement: s.requirement, evidence: s.evidence })),
    claimsUpdated: (input.claims ?? []).map((c) => ({ claim: c.claim, status: c.status })),
    provenance: {
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  }
  const written = writeState(workspace, state)
  if (isIRWriteError(written)) return { ok: false, errors: [err('R204', 'state', written.error, 'retry_transition')] }

  // 3) Decision Trace（§18）
  const trace: IRTraceEntry = {
    at: state.createdAt,
    stateId: state.stateId,
    ...(state.parentStateId ? { parentStateId: state.parentStateId } : {}),
    irId: saved.id,
    irRevision: saved.revision,
    ...(input.decisionId ? { decisionId: input.decisionId } : {}),
    evidence,
    summary:
      `${state.stateId} ← ${state.parentStateId ?? '∅'} · ${saved.id} r${saved.revision}` +
      `${input.decisionId ? ` · ${input.decisionId}` : ''}` +
      ` · completed[${completedActions.join(',') || '—'}] · evidence[${evidence.join(',') || '—'}]`,
  }
  appendTrace(workspace, trace)

  return { ok: true, state: written, ir: saved, trace }
}

/* ════════════════════════════════════════════════════════════════════════
 * Evidence Coverage（§11：Required → Produced → Coverage）
 * ════════════════════════════════════════════════════════════════════════ */

/** 单个证据要求的覆盖情况。 */
export interface CoverageItem {
  requirement: string
  type: string
  /** 声称满足它的 Evidence id。 */
  claimed: string[]
  /** 其中真实在档的（其余为悬空引用）。 */
  inStore: string[]
  satisfied: boolean
}

export interface CoverageReport {
  ok: true
  irId: string
  revision: number
  required: number
  satisfied: number
  coverage: number
  items: CoverageItem[]
}

/**
 * 计算证据覆盖率：IR 的 evidence_requirements ↔ 工作区在档 Evidence。
 *
 * Review 从"请判断这个实验是否充分"变成可计算的 Required → Produced → Coverage。
 */
export function evidenceCoverage(workspace: string, irId: string): CoverageReport | { ok: false; error: string } {
  const ir = readIR(workspace, irId)
  if (!ir) return { ok: false, error: `找不到 IR \`${irId}\`。` }
  const known = new Set(listEvidence(workspace).map((e) => e.id))
  const items: CoverageItem[] = ir.evidenceRequirements.map((r) => {
    const claimed = r.satisfiedBy ?? []
    const inStore = claimed.filter((e) => known.has(e))
    return { requirement: r.id, type: r.type, claimed, inStore, satisfied: inStore.length > 0 }
  })
  const satisfied = items.filter((i) => i.satisfied).length
  return {
    ok: true,
    irId: ir.id,
    revision: ir.revision,
    required: items.length,
    satisfied,
    coverage: items.length ? Number((satisfied / items.length).toFixed(3)) : 0,
    items,
  }
}
