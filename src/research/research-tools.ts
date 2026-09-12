/**
 * ConvFusion 2.0 — 研究资产工具（Stage 4）
 *
 * ## 为什么需要这一层
 *
 * Stage 4 的资产（Evidence / Claim / Decision / Research State）必须由 **Agent 在科研
 * 过程中记录**。如果只让模型用原生 `write` 工具直接改 Markdown，会出两个问题：
 *
 * 1. **ID 与引用关系会漂移**：`E001` 的分配、`supports` 与 `evidence` 的双向引用、
 *    `supersedes` 关系，靠模型手写迟早不一致；
 * 2. **State 会被直接覆盖**：§20 明确要求 Agent **只能提出 proposal**，
 *    由用户 `Accept / Edit / Reject`。若模型直接写 `research-state.md`，这个控制点就没了。
 *
 * 因此本模块提供一组**窄接口**工具，让正确的事容易做、错误的事做不出来：
 *
 * | 工具 | 能做什么 | 关键限制 |
 * |---|---|---|
 * | `research_evidence` | 记录/验证/取代 Evidence | 取代走 `superseded`，**不能删已引用的证据** |
 * | `research_claim` | 建立 Claim 并关联证据 | 状态由证据汇总（不凭感觉标 verified） |
 * | `research_decision` | 记录研究决策 | **必须有 reason 或 evidence** |
 * | `research_state_read` | 读取当前研究状态 | 只读 |
 * | `research_state_propose` | **提出**状态更新 | **只提案，绝不自动应用**（§20 / §21） |
 * | `research_project` | 查询/更新研究主题 | 主题**必须**带理由与依据；初始输入永久保留，只动 frontmatter |
 *
 * ## 不允许出现的工具（重要的"没有"）
 *
 * - **没有** `research_state_apply`：应用必须由用户处置（§21）。
 *   用户在接受时通过 `/research` 或直接编辑文件完成。
 * - **没有**任何执行类工具：真实执行仍走 Harness 原生工具（§42 Native Harness）。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { losslessJson } from '../json.js'
import {
  OPENALEX_MAX_PER_PAGE,
  isLiteratureError,
  searchOpenAlex,
  type LiteratureQuery,
} from './literature.js'
import {
  createEvidence,
  evidenceClaim,
  isEvidenceWriteError,
  linkEvidenceToClaim,
  listEvidence,
  setEvidenceStatus,
  supersedeEvidence,
} from './evidence.js'
import { createClaim, createDecision, isIdWriteError, listClaims, listDecisions, reconcileClaimEvidence } from './claims.js'
import {
  isStateWriteError,
  listStateProposals,
  loadResearchState,
  proposeStateUpdate,
  suggestMaturity,
  openQuestions,
} from './research-state.js'
import { buildResearchIndex } from './research-state.js'
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STATUSES,
  STATE_DIMENSIONS,
  type EvidenceSource,
  type EvidenceStatus,
} from './research-data.js'
import { DEFAULT_PAPER_ID, PAPER_MATURITY_DIMENSIONS } from './paper-data.js'
import { createPaper, readPaper } from './paper.js'
import { detectAndRecordGaps, prioritizeGaps, recommendCapabilities, listPaperGaps } from './paper-gaps.js'
import { paperStatusSummary, proposeRevision, readPaperMaturity, suggestPaperMaturity, writePaperMaturity } from './paper-evolution.js'
import { listSystemSkills } from './skills.js'
import { OUTPUT_TYPES, type OutputType } from './output-data.js'
import {
  analyzeOutputImpact,
  checkOutputQuality,
  createOutput,
  listAllOutputs,
  buildOutputDependencyMap,
  outputImpactSummary,
  readOutput,
  traceOutputProvenance,
} from './output.js'
import { getOutputProfile, listOutputProfiles } from './output-profiles.js'
import { listTopicChanges, loadProjectFile, updateProjectTopic } from './project.js'

/** 工具名（`research_` 命名空间，与 Skill/Plan 资产一致）。 */
export const PROJECT_TOOL = 'research_project'
export const EVIDENCE_TOOL = 'research_evidence'
export const CLAIM_TOOL = 'research_claim'
export const DECISION_TOOL = 'research_decision'
export const STATE_READ_TOOL = 'research_state_read'
export const STATE_PROPOSE_TOOL = 'research_state_propose'
export const PAPER_TOOL = 'research_paper'
export const OUTPUT_TOOL = 'research_output'
export const LITERATURE_TOOL = 'research_literature_search'

/** 把错误对象转成工具返回值（不抛异常，让模型看到原因并纠正）。 */
function fail(error: string, extra: Record<string, unknown> = {}): Record<string, JsonValue> {
  return losslessJson({ ok: false, error, ...extra }) as unknown as Record<string, JsonValue>
}

/**
 * 构造研究资产工具集。
 *
 * @param resolveWorkspace 解析**本次工具调用所属会话**的研究根目录。
 *        必须按会话解析（参数 = 调用的 `exec.agent`）：研究数据写盘的位置取决于
 *        会话自己的工作区，而不是插件进程的全局"当前 cwd" —— 多会话并行时全局值
 *        可能已被其它会话覆盖，会把研究数据写进别人的工作区（2026-09 事故：一条
 *        state proposal 被写进插件开发仓库根目录的 `research/`）。
 * @param literatureDeps 文献检索依赖（API Key 解析）；缺省时不注册检索工具
 */
export function defineResearchTools(
  resolveWorkspace: (agent?: { id?: unknown } | null) => string,
  literatureDeps?: {
    apiKey: () => string
    mailto?: () => string | undefined
    fetchImpl?: import('./literature.js').FetchLike
    timeoutMs?: number
  },
): ToolDefinition[] {
  /* ── Evidence ───────────────────────────────────────────────────────── */
  const evidenceTool = defineTool({
    name: EVIDENCE_TOOL,
    description:
      'Record, validate or supersede a piece of research evidence.\n' +
      'Evidence is a *traceable research fact* (an experiment result, a literature finding, ' +
      'a computation, an observation) — not a copy of execution output.\n' +
      'Actions:\n' +
      '- `create`: record new evidence. Always reference the raw artifacts (files/logs/results) ' +
      'that back it, and say which claim it supports or contradicts.\n' +
      '- `status`: set validation status (unverified / supported / verified / rejected).\n' +
      '- `supersede`: mark an older evidence as replaced by a newer one. Evidence is never ' +
      'deleted when superseded — research history is kept.\n' +
      '- `link`: attach this evidence to a claim as `supports` or `contradicts`.\n' +
      '- `list`: list evidence already recorded.',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: create | status | supersede | link | list.',
        enum: ['create', 'status', 'supersede', 'link', 'list'],
      },
      name: { type: 'string', description: 'For `create`: a short human-readable name.' },
      source_kind: {
        type: 'string',
        description: 'For `create`: where the evidence comes from.',
        enum: [...EVIDENCE_SOURCES],
      },
      claim: { type: 'string', description: 'For `create`: the statement this evidence bears on.' },
      result: { type: 'string', description: 'For `create`: the concrete result (values, table).' },
      observation: { type: 'string', description: 'For `create`: what you read out of the result.' },
      raw_artifacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'For `create`: paths of the raw artifacts backing this evidence. Keep them.',
      },
      supports: {
        type: 'array',
        items: { type: 'string' },
        description: 'For `create`: claim ids this evidence supports (e.g. ["C001"]).',
      },
      contradicts: {
        type: 'array',
        items: { type: 'string' },
        description: 'For `create`: claim ids this evidence contradicts.',
      },
      plan: { type: 'string', description: 'For `create`: the plan this came from.' },
      paper: { type: 'string', description: 'For `create`: the paper this relates to.' },
      citation: { type: 'string', description: 'For `create` (literature): the exact citation.' },
      id: { type: 'string', description: 'For `status`/`supersede`/`link`: the evidence id (E001).' },
      status: {
        type: 'string',
        description: 'For `status`: the new validation status.',
        enum: [...EVIDENCE_STATUSES],
      },
      superseded_by: { type: 'string', description: 'For `supersede`: the newer evidence id.' },
      reason: { type: 'string', description: 'For `supersede`: why the older evidence no longer stands.' },
      claim_id: { type: 'string', description: 'For `link`: the claim id (C001).' },
      link_kind: {
        type: 'string',
        description: 'For `link`: supports or contradicts.',
        enum: ['supports', 'contradicts'],
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { ok?: boolean; error?: string; evidence?: { id: string; name: string; status: string }; count?: number }
        if (v.ok === false) return [{ type: 'text' as const, text: `Evidence not recorded: ${v.error ?? 'unknown error'}` }]
        if (v.count !== undefined) return [{ type: 'text' as const, text: `${v.count} evidence item(s) recorded.` }]
        return [{ type: 'text' as const, text: `Evidence ${v.evidence?.id ?? ''} (${v.evidence?.status ?? ''}) recorded.` }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? '')

      try {
        if (action === 'list') {
          const items = listEvidence(ws).map((e) => ({
            id: e.id,
            name: e.name,
            status: e.status,
            sourceKind: e.sourceKind,
            supports: e.supports,
            contradicts: e.contradicts,
            rawArtifacts: e.provenance.rawArtifacts,
          }))
          return losslessJson({ ok: true, count: items.length, evidence: items }) as unknown as Record<string, JsonValue>
        }

        if (action === 'create') {
          const created = createEvidence(ws, {
            name: String(a.name ?? ''),
            ...(a.source_kind ? { sourceKind: String(a.source_kind) as EvidenceSource } : {}),
            ...(a.claim ? { claim: String(a.claim) } : {}),
            ...(a.result ? { result: String(a.result) } : {}),
            ...(a.observation ? { observation: String(a.observation) } : {}),
            ...(Array.isArray(a.raw_artifacts) ? { rawArtifacts: a.raw_artifacts.map(String) } : {}),
            ...(Array.isArray(a.supports) ? { supports: a.supports.map(String) } : {}),
            ...(Array.isArray(a.contradicts) ? { contradicts: a.contradicts.map(String) } : {}),
            ...(a.plan ? { plan: String(a.plan) } : {}),
            ...(a.paper ? { paper: String(a.paper) } : {}),
            ...(a.citation ? { citation: String(a.citation) } : {}),
          })
          if (isEvidenceWriteError(created)) return fail(created.error)
          // 若声明了 supports/contradicts，顺手在 Evidence 侧固化（双向引用）
          for (const c of created.supports) linkEvidenceToClaim(ws, created.id, c, 'supports')
          for (const c of created.contradicts) linkEvidenceToClaim(ws, created.id, c, 'contradicts')
          const fresh = listEvidence(ws).find((e) => e.id === created.id) ?? created
          return losslessJson({
            ok: true,
            evidence: { id: fresh.id, name: fresh.name, status: fresh.status, supports: fresh.supports, contradicts: fresh.contradicts },
            note: 'Evidence recorded. It starts as `unverified` until someone validates it.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'status') {
          const updated = setEvidenceStatus(ws, String(a.id ?? ''), String(a.status ?? 'unverified') as EvidenceStatus)
          if (isEvidenceWriteError(updated)) return fail(updated.error)
          return losslessJson({ ok: true, evidence: { id: updated.id, status: updated.status } }) as unknown as Record<string, JsonValue>
        }

        if (action === 'supersede') {
          const res = supersedeEvidence(ws, String(a.id ?? ''), String(a.superseded_by ?? ''), a.reason ? String(a.reason) : undefined)
          if (isEvidenceWriteError(res)) return fail(res.error)
          return losslessJson({
            ok: true,
            superseded: res.old,
            supersededBy: res.next,
            note: 'The older evidence is kept and marked superseded — history is never erased.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'link') {
          const linked = linkEvidenceToClaim(
            ws,
            String(a.id ?? ''),
            String(a.claim_id ?? ''),
            (String(a.link_kind ?? 'supports') === 'contradicts' ? 'contradicts' : 'supports'),
          )
          if (isEvidenceWriteError(linked)) return fail(linked.error)
          return losslessJson({ ok: true, evidence: { id: linked.id, supports: linked.supports, contradicts: linked.contradicts } }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, { allowed: ['create', 'status', 'supersede', 'link', 'list'] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string; name?: string; id?: string }
      return { card: 'generic', title: `Evidence · ${a.action ?? ''} ${a.name ?? a.id ?? ''}`.trim(), kind: 'execute' }
    },
  })

  /* ── Claim ──────────────────────────────────────────────────────────── */
  const claimTool = defineTool({
    name: CLAIM_TOOL,
    description:
      'Record or update a research claim — a statement the paper will assert.\n' +
      'A claim is linked to the evidence that supports or contradicts it. Its status can be ' +
      'recomputed from that evidence (`reconcile`), so do not hand-set `verified` without evidence.\n' +
      'Actions: `create` | `reconcile` | `list`.',
    parameters: {
      action: { type: 'string', description: 'One of: create | reconcile | list.', enum: ['create', 'reconcile', 'list'] },
      statement: { type: 'string', description: 'For `create`: the claim, in one or two sentences.' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'For `create`: supporting evidence ids.' },
      required_evidence: {
        type: 'string',
        description: 'For `create`: what evidence would be needed to establish this claim.',
      },
      paper: { type: 'string', description: 'For `create`: the paper this claim belongs to.' },
      id: { type: 'string', description: 'For `reconcile`: the claim id (C001).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { ok?: boolean; error?: string; claim?: { id: string; status: string }; count?: number }
        if (v.ok === false) return [{ type: 'text' as const, text: `Claim not recorded: ${v.error ?? ''}` }]
        if (v.count !== undefined) return [{ type: 'text' as const, text: `${v.count} claim(s) recorded.` }]
        return [{ type: 'text' as const, text: `Claim ${v.claim?.id ?? ''} → ${v.claim?.status ?? ''}.` }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? '')
      try {
        if (action === 'list') {
          const items = listClaims(ws).map((c) => ({
            id: c.id,
            statement: c.statement,
            status: c.status,
            evidence: c.evidence,
            contradictions: c.contradictions,
          }))
          return losslessJson({ ok: true, count: items.length, claims: items }) as unknown as Record<string, JsonValue>
        }
        if (action === 'create') {
          const created = createClaim(ws, {
            statement: String(a.statement ?? ''),
            ...(Array.isArray(a.evidence) ? { evidence: a.evidence.map(String) } : {}),
            ...(a.required_evidence ? { requiredEvidence: String(a.required_evidence) } : {}),
            ...(a.paper ? { paper: String(a.paper) } : {}),
          })
          if (isIdWriteError(created)) return fail(created.error)
          return losslessJson({ ok: true, claim: { id: created.id, status: created.status } }) as unknown as Record<string, JsonValue>
        }
        if (action === 'reconcile') {
          const rec = reconcileClaimEvidence(ws, String(a.id ?? ''))
          if (isIdWriteError(rec)) return fail(rec.error)
          return losslessJson({
            ok: true,
            claim: { id: rec.id, status: rec.status, evidence: rec.evidence, contradictions: rec.contradictions },
            note: 'Status recomputed from evidence. Contradicting evidence keeps it `unverified`.',
          }) as unknown as Record<string, JsonValue>
        }
        return fail(`Unknown action "${action}".`, { allowed: ['create', 'reconcile', 'list'] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Research claim', kind: 'execute' }),
  })

  /* ── Decision ───────────────────────────────────────────────────────── */
  const decisionTool = defineTool({
    name: DECISION_TOOL,
    description:
      'Record a research decision (choose this dataset, reject that method, abandon a hypothesis).\n' +
      'Decisions must carry a reason or evidence — they should not live only in the chat log.\n' +
      'Actions: `create` | `list`.',
    parameters: {
      action: { type: 'string', description: 'One of: create | list.', enum: ['create', 'list'] },
      name: { type: 'string', description: 'For `create`: a short title for lists (derived from the decision if omitted).' },
      decision: { type: 'string', description: 'For `create`: what was decided.' },
      reason: { type: 'string', description: 'For `create`: why.' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'For `create`: evidence ids relied on.' },
      alternatives: { type: 'string', description: 'For `create`: what else was considered.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { ok?: boolean; error?: string; decision?: { id: string }; count?: number }
        if (v.ok === false) return [{ type: 'text' as const, text: `Decision not recorded: ${v.error ?? ''}` }]
        if (v.count !== undefined) return [{ type: 'text' as const, text: `${v.count} decision(s) recorded.` }]
        return [{ type: 'text' as const, text: `Decision ${v.decision?.id ?? ''} recorded.` }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? '')
      try {
        if (action === 'list') {
          const items = listDecisions(ws).map((d) => ({
            id: d.id,
            decision: d.decision,
            status: d.status,
            evidence: d.evidence,
          }))
          return losslessJson({ ok: true, count: items.length, decisions: items }) as unknown as Record<string, JsonValue>
        }
        if (action === 'create') {
          const created = createDecision(ws, {
            decision: String(a.decision ?? ''),
            ...(a.reason ? { reason: String(a.reason) } : {}),
            ...(Array.isArray(a.evidence) ? { evidence: a.evidence.map(String) } : {}),
            ...(a.alternatives ? { alternatives: String(a.alternatives) } : {}),
          })
          if (isIdWriteError(created)) return fail(created.error)
          return losslessJson({ ok: true, decision: { id: created.id, status: created.status } }) as unknown as Record<string, JsonValue>
        }
        return fail(`Unknown action "${action}".`, { allowed: ['create', 'list'] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Research decision', kind: 'execute' }),
  })

  /* ── Research State: read ───────────────────────────────────────────── */
  const stateReadTool = defineTool({
    name: STATE_READ_TOOL,
    description:
      'Read the current Research State: which dimensions are established, maturity, open questions, ' +
      'and where the evidence gaps are (claims without evidence, contested claims, evidence with no ' +
      'raw artifact reference). Use this before deciding what the research needs next.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          version?: string
          established?: string[]
          missing?: string[]
          openQuestions?: string[]
          gaps?: { unsupportedClaims: string[]; contestedClaims: string[]; evidenceWithoutRawArtifact: string[] }
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `Research state unavailable: ${v.error ?? ''}` }]
        const lines = [`Research State v${v.version ?? '?'}`]
        if (v.established?.length) lines.push(`Established: ${v.established.join(', ')}`)
        if (v.missing?.length) lines.push(`Not established: ${v.missing.join(', ')}`)
        if (v.openQuestions?.length) lines.push(`Open questions: ${v.openQuestions.join(' | ')}`)
        if (v.gaps) {
          if (v.gaps.unsupportedClaims.length) lines.push(`Claims without evidence: ${v.gaps.unsupportedClaims.join(', ')}`)
          if (v.gaps.contestedClaims.length) lines.push(`Contested claims: ${v.gaps.contestedClaims.join(', ')}`)
          if (v.gaps.evidenceWithoutRawArtifact.length)
            lines.push(`Evidence lacking raw artifact: ${v.gaps.evidenceWithoutRawArtifact.join(', ')}`)
        }
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      try {
        const state = loadResearchState(ws)
        const index = buildResearchIndex(ws)
        const established = Object.entries(state?.dimensions ?? {})
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
        const missing = (STATE_DIMENSIONS as readonly string[]).filter((d) => !established.includes(d))
        return losslessJson({
          ok: true,
          version: state?.version ?? '0',
          established,
          missing,
          maturity: state?.maturity ?? {},
          openQuestions: index.openQuestions,
          gaps: {
            unsupportedClaims: index.unsupportedClaims,
            contestedClaims: index.contestedClaims,
            evidenceWithoutRawArtifact: index.evidenceWithoutRawArtifact,
          },
          note: 'A missing dimension is normal — research is rarely complete in every dimension.',
        }) as unknown as Record<string, JsonValue>
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Research state', kind: 'search' }),
  })

  /* ── Research State: propose（**不能直接改**）───────────────────────── */
  const stateProposeTool = defineTool({
    name: STATE_PROPOSE_TOOL,
    description:
      'Propose an update to the Research State. This records a *proposal* only — the user reviews ' +
      'it and accepts, edits or rejects it. There is deliberately no tool that applies the state ' +
      'directly: the long-lived research state is user-controlled.\n' +
      'Use it when new evidence changes what the research understands (a hypothesis is now ' +
      'supported, a method is settled, an open question is resolved, a new risk appeared).\n' +
      'Actions: `propose` | `list`.',
    parameters: {
      action: { type: 'string', description: 'One of: propose | list.', enum: ['propose', 'list'] },
      changes: {
        type: 'object',
        additionalProperties: true,
        description:
          'For `propose`: dimension → new Markdown text. Valid dimensions: ' +
          STATE_DIMENSIONS.join(', ') +
          '. Use null as the value to remove a dimension.',
      },
      rationale: { type: 'string', description: 'For `propose`: why this change is warranted.' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'For `propose`: evidence ids this is based on.' },
      confidence: {
        type: 'string',
        description: 'For `propose`: qualitative confidence.',
        enum: ['Unknown', 'Weak', 'Emerging', 'Strong', 'Established'],
      },
      plan: { type: 'string', description: 'For `propose`: the plan that produced this.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { ok?: boolean; error?: string; proposal?: { id: string }; count?: number; pending?: Array<{ id: string }> }
        if (v.ok === false) return [{ type: 'text' as const, text: `Proposal not recorded: ${v.error ?? ''}` }]
        if (v.pending) {
          return [{ type: 'text' as const, text: `${v.pending.length} state update proposal(s) awaiting review.` }]
        }
        return [
          {
            type: 'text' as const,
            text:
              `Proposed state update ${v.proposal?.id ?? ''}. The research state is unchanged until the ` +
              'user accepts it.',
          },
        ]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'propose')
      try {
        if (action === 'list') {
          const pending = listStateProposals(ws)
          return losslessJson({ ok: true, count: pending.length, pending }) as unknown as Record<string, JsonValue>
        }
        if (action !== 'propose') {
          return fail(`Unknown action "${action}".`, { allowed: ['propose', 'list'] })
        }

        const rawChanges = (a.changes ?? {}) as Record<string, unknown>
        const changes: Record<string, string | null> = {}
        const rejected: string[] = []
        for (const [k, v] of Object.entries(rawChanges)) {
          const dim = (STATE_DIMENSIONS as readonly string[]).find((d) => d.toLowerCase() === k.toLowerCase())
          if (!dim) {
            rejected.push(k)
            continue
          }
          changes[dim] = v === null ? null : String(v)
        }
        if (Object.keys(changes).length === 0) {
          return fail('No valid dimension changes supplied.', { validDimensions: [...STATE_DIMENSIONS] })
        }

        const proposal = proposeStateUpdate(ws, {
          changes,
          rationale: String(a.rationale ?? ''),
          ...(Array.isArray(a.evidence) ? { evidence: a.evidence.map(String) } : {}),
          ...(a.confidence
            ? { confidence: String(a.confidence) as 'Unknown' | 'Weak' | 'Emerging' | 'Strong' | 'Established' }
            : {}),
          ...(a.plan ? { plan: String(a.plan) } : {}),
          actor: 'agent',
        })

        return losslessJson({
          ok: true,
          proposal: { id: proposal.id, changes: Object.keys(changes) },
          ...(rejected.length ? { ignoredDimensions: rejected } : {}),
          maturitySuggestions: suggestMaturity(ws).map((s) => ({ dimension: s.dimension, suggested: s.suggested, basis: s.basis })),
          note:
            'Recorded as a proposal. The user accepts, edits or rejects it — the research state is ' +
            'not modified by this call.',
        }) as unknown as Record<string, JsonValue>
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Propose research state update', kind: 'execute' }),
  })

  /* ── Research Project（主题演进）────────────────────────────────────── */
  const projectTool = defineTool({
    name: PROJECT_TOOL,
    description:
      'Work with the research project definition (project.md) — the project topic.\n' +
      'The topic is NOT frozen at creation: as the research converges (an ambiguity is ruled, ' +
      'the mechanism is settled, the scope is narrowed), the finally-adopted statement of what ' +
      'is actually being researched becomes the project topic, and every display (research ' +
      'context, /research output) follows it.\n' +
      'Actions:\n' +
      '- `status`: show the current (adopted) topic, the originally-input topic, and the topic ' +
      'evolution history.\n' +
      '- `set_topic`: update the project topic to the finally-adopted one. The originally-input ' +
      'topic is preserved as the initial topic, and the change is logged ' +
      '(from → to, reason, evidence) — never silently, never without a reason.\n' +
      'Call `set_topic` only when the research has genuinely converged on a different, sharper ' +
      'statement of the topic (e.g. after problem refinement or a scoping decision is accepted) ' +
      '— not for cosmetic rewordings.',
    parameters: {
      action: { type: 'string', description: 'One of: status | set_topic.', enum: ['status', 'set_topic'] },
      topic: { type: 'string', description: 'For `set_topic`: the finally-adopted topic (one line).' },
      reason: {
        type: 'string',
        description:
          'For `set_topic`: why the topic evolved — which decision or finding settled it (e.g. ' +
          '"D001 裁定读法 B，目标从外参标定收窄为位姿误差校正").',
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For `set_topic`: decision/evidence ids the new topic rests on (e.g. ["D001", "D002"]).',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          topic?: string
          initialTopic?: string
          changed?: boolean
          previous?: string
          history?: Array<{ from: string; to: string; at: string; reason?: string }>
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `Project action failed: ${v.error ?? ''}` }]
        if (v.changed === true) {
          return [
            {
              type: 'text' as const,
              text:
                `Topic updated: ${v.previous} → ${v.topic}\n` +
                'The originally-input topic is preserved as the initial topic; the change is logged in `research/topic-history.json`.',
            },
          ]
        }
        if (v.changed === false && v.previous !== undefined) {
          return [{ type: 'text' as const, text: `Topic unchanged: ${v.topic ?? v.previous}` }]
        }
        const lines = [`Topic (adopted): ${v.topic ?? ''}`]
        if (v.initialTopic && v.initialTopic !== v.topic) lines.push(`Initial topic: ${v.initialTopic}`)
        lines.push(`Topic changes: ${v.history?.length ?? 0}`)
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'status')
      try {
        if (action === 'status') {
          const project = loadProjectFile(ws)
          if (!project) return fail('No research project in this workspace.')
          const history = listTopicChanges(ws)
          return losslessJson({
            ok: true,
            topic: project.topic,
            ...(project.initialTopic ? { initialTopic: project.initialTopic } : {}),
            ...(project.updatedAt ? { updatedAt: project.updatedAt } : {}),
            history,
          }) as unknown as Record<string, JsonValue>
        }
        if (action === 'set_topic') {
          const topic = String(a.topic ?? '').trim()
          if (!topic) return fail('Provide `topic` — the finally-adopted topic, one line.')
          const reason = String(a.reason ?? '').trim()
          if (!reason) {
            return fail('Provide `reason`: which decision or finding settled this topic. A topic change without a reason is not auditable.')
          }
          const res = updateProjectTopic(ws, {
            topic,
            reason,
            ...(Array.isArray(a.evidence) ? { evidence: a.evidence.map(String) } : {}),
            by: 'agent',
          })
          if (!res.changed && 'error' in res) return fail(res.error)
          if (!res.changed) {
            return losslessJson({ ok: true, changed: false, topic: res.current, previous: res.previous }) as unknown as Record<string, JsonValue>
          }
          return losslessJson({
            ok: true,
            changed: true,
            topic: res.current,
            previous: res.previous,
            initialTopic: res.initial,
          }) as unknown as Record<string, JsonValue>
        }
        return fail(`Unknown action "${action}".`, { allowed: ['status', 'set_topic'] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string }
      return { card: 'generic', title: `Research project · ${a.action ?? 'status'}`, kind: 'execute' }
    },
  })

  /* ── Research Output（Stage 5.1：专利 / 技术报告 / 演讲）────────────── */
  const outputTool = defineTool({
    name: OUTPUT_TOOL,
    description:
      'Work with research outputs other than the paper: patent drafts, technical reports, presentations.\n' +
      'An output is a *different expression of the same research*, not a workflow step — it declares which ' +
      'claims, evidence, paper or research state it draws on, and it never modifies the research state.\n' +
      'Actions:\n' +
      '- `status`: list outputs and pending reviews across types.\n' +
      '- `create`: create a draft for a type (patent | technical-report | slides | paper).\n' +
      '- `quality`: run the profile\'s rule-based checks on a draft (structure coverage + content rules).\n' +
      '- `provenance`: trace output → source → skill → plan → session → evidence.\n' +
      '- `impact`: given a changed claim/evidence id, list affected outputs and what to re-check.\n' +
      '- `profiles`: describe what each output type requires (audience, structure, constraints).',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: status | create | quality | provenance | impact | profiles.',
        enum: ['status', 'create', 'quality', 'provenance', 'impact', 'profiles'],
      },
      id: { type: 'string', description: 'For `quality`/`provenance`: the output id (e.g. patent-001).' },
      type: { type: 'string', description: 'For `create`: output type.', enum: [...OUTPUT_TYPES] },
      title: { type: 'string', description: 'For `create`: the output title.' },
      goal: { type: 'string', description: 'For `create`: what this transformation is meant to achieve.' },
      source_paper: { type: 'string', description: 'For `create`: the paper this output derives from.' },
      source_claims: { type: 'array', items: { type: 'string' }, description: 'For `create`: claim ids used.' },
      source_evidence: { type: 'array', items: { type: 'string' }, description: 'For `create`: evidence ids used.' },
      changed: { type: 'string', description: 'For `impact`: the changed claim/evidence id (e.g. C003).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as Record<string, unknown>
        if (v.ok === false) return [{ type: 'text' as const, text: `Output action failed: ${String(v.error ?? '')}` }]
        if (v.outputs) {
          const list = v.outputs as Array<{ id: string; type: string; status: string; version: string; title: string }>
          if (list.length === 0) return [{ type: 'text' as const, text: 'No research outputs yet (papers, patents, reports, slides).' }]
          return [
            {
              type: 'text' as const,
              text: ['Research outputs:', ...list.map((o) => `- \`${o.id}\` [${o.status}] v${o.version} (${o.type}) — ${o.title}`)].join('\n'),
            },
          ]
        }
        if (v.artifact) {
          const a = v.artifact as { id: string; type: string; relPath: string }
          return [{ type: 'text' as const, text: `Created ${a.type} \`${a.id}\` at \`${a.relPath}\` (draft).` }]
        }
        if (v.quality) {
          const q = v.quality as { passed: boolean; checks: Array<{ ok: boolean; description: string; advice: string }>; missingSections: string[] }
          const lines = [q.passed ? 'Quality checks passed.' : 'Quality checks failed:']
          for (const c of q.checks) if (!c.ok) lines.push(`- ✗ ${c.description} → ${c.advice}`)
          if (q.missingSections.length) lines.push(`- missing sections: ${q.missingSections.join(', ')}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.provenance) {
          const p = v.provenance as { hops: Array<{ kind: string; ref: string; relation: string }> }
          return [{ type: 'text' as const, text: ['Provenance:', ...p.hops.map((h) => `- ${h.kind}: ${h.ref} (${h.relation})`)].join('\n') }]
        }
        if (v.impacts) {
          const impacts = v.impacts as Array<{ changed: string; affected: Array<{ id: string; recommendation: string }> }>
          if (impacts.length === 0) return [{ type: 'text' as const, text: 'No outputs depend on that object.' }]
          const lines: string[] = []
          for (const i of impacts) {
            lines.push(`${i.changed} affects:`)
            for (const a of i.affected) lines.push(`- ${a.id}: ${a.recommendation}`)
          }
          lines.push('', 'These are recommendations only — nothing is rewritten automatically.')
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.profiles) {
          const ps = v.profiles as Array<{ type: string; audience: string; structure: string[] }>
          return [
            {
              type: 'text' as const,
              text: ps
                .map((p) => `${p.type} — for ${p.audience}\n  structure: ${p.structure.join(' / ')}`)
                .join('\n\n'),
            },
          ]
        }
        return [{ type: 'text' as const, text: JSON.stringify(v).slice(0, 500) }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'status')
      try {
        if (action === 'status') {
          const summary = outputImpactSummary(ws)
          return losslessJson({
            ok: true,
            outputs: listAllOutputs(ws).map((o) => ({
              id: o.id,
              type: o.type,
              status: o.status,
              version: o.version,
              title: o.title,
            })),
            summary,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'create') {
          const typeRaw = String(a.type ?? '')
          if (!(OUTPUT_TYPES as readonly string[]).includes(typeRaw)) {
            return fail(`Unknown output type "${typeRaw}".`, { allowed: [...OUTPUT_TYPES] })
          }
          const created = createOutput(ws, {
            type: typeRaw as OutputType,
            title: String(a.title ?? ''),
            ...(a.goal ? { goal: String(a.goal) } : {}),
            source: {
              ...(a.source_paper ? { paper: String(a.source_paper) } : {}),
              ...(Array.isArray(a.source_claims) ? { claims: a.source_claims.map(String) } : {}),
              ...(Array.isArray(a.source_evidence) ? { evidence: a.source_evidence.map(String) } : {}),
            },
          })
          if ('error' in created) return fail(created.error)
          return losslessJson({
            ok: true,
            artifact: { id: created.id, type: created.type, relPath: created.relPath },
            note: 'Draft created from the type profile. Fill it in, then review/approve it.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'quality') {
          const result = checkOutputQuality(ws, String(a.id ?? ''))
          if ('error' in result) return fail(result.error)
          return losslessJson({ ok: true, quality: result }) as unknown as Record<string, JsonValue>
        }

        if (action === 'provenance') {
          const prov = traceOutputProvenance(ws, String(a.id ?? ''))
          if (!prov) return fail(`No output with id \`${String(a.id ?? '')}\`.`)
          return losslessJson({ ok: true, provenance: prov }) as unknown as Record<string, JsonValue>
        }

        if (action === 'impact') {
          const changed = String(a.changed ?? '')
          if (!changed) return fail('Provide `changed` (a claim or evidence id, e.g. C003).')
          return losslessJson({
            ok: true,
            impacts: analyzeOutputImpact(ws, changed),
            dependencies: buildOutputDependencyMap(ws).length,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'profiles') {
          return losslessJson({ ok: true, profiles: listOutputProfiles() }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, {
          allowed: ['status', 'create', 'quality', 'provenance', 'impact', 'profiles'],
        })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string }
      return { card: 'generic', title: `Research output · ${a.action ?? 'status'}`, kind: 'execute' }
    },
  })

  /* ── Paper（Stage 5：实体 / 缺口 / 能力推荐 / 成熟度 / 修订提案）─────── */
  const paperTool = defineTool({
    name: PAPER_TOOL,
    description:
      'Work with the evolving paper entity (not just its manuscript).\n' +
      'Actions:\n' +
      '- `status`: what the paper currently is — version, sections, claim coverage, evidence usage, ' +
      'open gaps, pending revision proposals, maturity. Use this to answer "what is this paper\'s ' +
      'biggest problem right now?".\n' +
      '- `create`: create the paper (only `paper.md` is required; other files appear as needed).\n' +
      '- `gaps`: run the rule-based gap check and record what is missing. Gaps only *recommend* a ' +
      'capability — nothing is executed.\n' +
      '- `recommend`: turn open gaps into skill recommendations (never executes).\n' +
      '- `maturity`: read or (re)assess research maturity per dimension.\n' +
      '- `propose_revision`: record a revision PROPOSAL. The manuscript is not changed until the ' +
      'user accepts it — content the agent generates must not silently become a fact in the paper.',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: status | create | gaps | recommend | maturity | propose_revision.',
        enum: ['status', 'create', 'gaps', 'recommend', 'maturity', 'propose_revision'],
      },
      paper: { type: 'string', description: 'Paper id (default: paper-main).' },
      title: { type: 'string', description: 'For `create`: paper title.' },
      reason: { type: 'string', description: 'For `propose_revision`: why the paper should change.' },
      proposed_changes: {
        type: 'string',
        description: 'For `propose_revision`: the text to add or the change to make.',
      },
      affected_claims: { type: 'array', items: { type: 'string' }, description: 'For `propose_revision`: claim ids.' },
      affected_sections: {
        type: 'array',
        items: { type: 'string' },
        description: 'For `propose_revision`: section names.',
      },
      supporting_evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'For `propose_revision`: evidence ids backing the change.',
      },
      write: {
        type: 'boolean',
        description: 'For `maturity`: set true to apply the suggested maturity (default false = suggest only).',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as Record<string, unknown>
        if (v.ok === false) return [{ type: 'text' as const, text: `Paper action failed: ${String(v.error ?? '')}` }]
        if (v.summary) {
          const s = v.summary as Record<string, unknown>
          const lines = [`Paper ${String(s.paperId)} v${String(s.version)} [${String(s.status)}] — ${String(s.title)}`]
          const sec = s.sections as { total: number; substantive: number }
          lines.push(`Sections: ${sec.substantive}/${sec.total} substantive`)
          const cl = s.claims as { total: number; withoutEvidence: number }
          lines.push(`Claims: ${cl.total}${cl.withoutEvidence ? ` (${cl.withoutEvidence} without evidence)` : ''}`)
          const gp = s.gaps as { open: number; high: number }
          lines.push(`Open gaps: ${gp.open}${gp.high ? ` (${gp.high} high priority)` : ''}`)
          lines.push(`Pending revision proposals: ${String(s.openProposals)}`)
          const m = s.maturity as { established: string[]; missing: string[] }
          lines.push(`Maturity established: ${m.established.join(', ') || '(none yet)'}`)
          if (m.missing.length) lines.push(`Not assessed: ${m.missing.join(', ')}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.gaps) {
          const gaps = v.gaps as Array<{ id: string; priority: string; type: string; description: string; suggestedSkill?: string }>
          const lines = [`${gaps.length} open gap(s):`]
          for (const g of gaps.slice(0, 8)) {
            lines.push(`- [${g.priority}] ${g.id} ${g.type}: ${g.description}${g.suggestedSkill ? ` → try skill \`${g.suggestedSkill}\`` : ''}`)
          }
          lines.push('', 'Gaps only recommend capabilities; nothing is executed.')
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.recommendations) {
          const recs = v.recommendations as Array<{ gapId: string; skillId?: string; suggestedPlanPath?: string }>
          if (recs.length === 0) return [{ type: 'text' as const, text: 'No open gaps to recommend for.' }]
          const lines = recs.map(
            (r) => `- ${r.gapId} → skill \`${r.skillId ?? '(no matching skill)'}\`${r.suggestedPlanPath ? ` · plan: ${r.suggestedPlanPath}` : ''}`,
          )
          lines.push('', 'These are suggestions. Create a plan if you agree; nothing runs automatically.')
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.maturity) {
          const m = v.maturity as Record<string, { status: string }>
          const lines = [`Paper maturity${v.applied ? ' (written)' : ' (suggested only)'}:`]
          for (const d of PAPER_MATURITY_DIMENSIONS) lines.push(`- ${d}: ${m[d]?.status ?? 'Unknown'}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.proposal) {
          const p = v.proposal as { id: string }
          return [
            {
              type: 'text' as const,
              text: `Revision proposal ${p.id} recorded. The manuscript is unchanged — the user accepts, edits or rejects it.`,
            },
          ]
        }
        return [{ type: 'text' as const, text: JSON.stringify(v).slice(0, 500) }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const paperId = typeof a.paper === 'string' && a.paper.trim() ? a.paper.trim() : DEFAULT_PAPER_ID
      const action = String(a.action ?? 'status')

      try {
        if (action === 'status') {
          if (!readPaper(ws, paperId)) {
            return losslessJson({ ok: false, error: `No paper \`${paperId}\` in this workspace. Create one with action "create".` }) as unknown as Record<string, JsonValue>
          }
          const summary = paperStatusSummary(ws, paperId)
          return losslessJson({ ok: true, summary }) as unknown as Record<string, JsonValue>
        }

        if (action === 'create') {
          const created = createPaper(ws, {
            id: paperId,
            ...(a.title ? { title: String(a.title) } : {}),
          })
          if ('error' in created) return fail(created.error)
          return losslessJson({ ok: true, summary: paperStatusSummary(ws, paperId) }) as unknown as Record<string, JsonValue>
        }

        if (action === 'gaps') {
          if (!readPaper(ws, paperId)) return fail(`No paper \`${paperId}\`.`)
          const result = detectAndRecordGaps(ws, paperId)
          return losslessJson({
            ok: true,
            gaps: prioritizeGaps(result.gaps.filter((g) => !g.resolved)),
            added: result.added.length,
            note: 'Recorded in the paper\'s gaps.md. Gaps only recommend capabilities — nothing is executed.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'recommend') {
          const known = listSystemSkills().map((d) => d.id)
          const existing = listPaperGaps(ws, paperId)
          // 没有 Gap 时先跑一次检测，保证推荐有依据
          if (existing.filter((g) => !g.resolved).length === 0) detectAndRecordGaps(ws, paperId)
          const recommendations = recommendCapabilities(ws, paperId, known)
          return losslessJson({
            ok: true,
            recommendations,
            note: 'Suggestions only. Create a plan for one if you agree (plans/), then the user reviews it.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'maturity') {
          if (!readPaper(ws, paperId)) return fail(`No paper \`${paperId}\`.`)
          const suggested = suggestPaperMaturity(ws, paperId)
          const applied = a.write === true
          if (applied) writePaperMaturity(ws, paperId, suggested)
          return losslessJson({ ok: true, maturity: applied ? readPaperMaturity(ws, paperId) : suggested, applied }) as unknown as Record<string, JsonValue>
        }

        if (action === 'propose_revision') {
          const proposal = proposeRevision(ws, paperId, {
            reason: String(a.reason ?? ''),
            proposedChanges: String(a.proposed_changes ?? ''),
            ...(Array.isArray(a.affected_claims) ? { affectedClaims: a.affected_claims.map(String) } : {}),
            ...(Array.isArray(a.affected_sections) ? { affectedSections: a.affected_sections.map(String) } : {}),
            ...(Array.isArray(a.supporting_evidence) ? { supportingEvidence: a.supporting_evidence.map(String) } : {}),
            trigger: 'evidence-added',
            proposedBy: 'agent',
          })
          if ('error' in proposal) return fail(proposal.error)
          return losslessJson({
            ok: true,
            proposal: { id: proposal.id, status: proposal.status },
            note: 'Recorded as a proposal only. The manuscript is unchanged until the user accepts it.',
          }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, {
          allowed: ['status', 'create', 'gaps', 'recommend', 'maturity', 'propose_revision'],
        })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string }
      return { card: 'generic', title: `Paper · ${a.action ?? 'status'}`, kind: 'execute' }
    },
  })

  /**
   * 文献检索工具（v1 Discovery 的检索能力在 v2 的对应物）。
   *
   * 为什么必须是**工具**而不是靠通用网页检索：学术检索要的是可复现的检索式、
   * 结构化记录与检索时间 —— `literature-search` Skill 的 Evidence Requirements
   * 明确要求 queries / sources / retrieval dates，没有稳定来源就无法追溯。
   */
  const literatureTool = defineTool({
    name: LITERATURE_TOOL,
    description:
      'Search the academic literature via OpenAlex. Use this to build an actual retrieved corpus ' +
      'instead of recalling papers from memory.\n' +
      'Returns structured records (title / year / venue / authors / DOI / citation count / abstract ' +
      'snippet) plus a `provenance` block (query, source, retrieval time, de-identified request URL, ' +
      'total hits) — record that provenance when you log a literature finding as evidence, otherwise ' +
      'the finding is not traceable.\n' +
      'Notes: `total` is the number of matches, `returned` is how many came back — a coverage claim ' +
      'needs the query set, not one page of results. Increase `perPage` or narrow the query rather than ' +
      'paging blindly. If no API key is configured the request still works through OpenAlex\'s public ' +
      'pool but with lower rate limits.',
    parameters: {
      query: { type: 'string', description: 'The search expression (natural language or OpenAlex boolean syntax).' },
      perPage: {
        type: 'number',
        description: `How many records to return (1..${OPENALEX_MAX_PER_PAGE}, default 20).`,
      },
      yearFrom: { type: 'number', description: 'Earliest publication year (inclusive).' },
      yearTo: { type: 'number', description: 'Latest publication year (inclusive).' },
      sort: {
        type: 'string',
        enum: ['relevance', 'cited', 'recent'],
        description: 'Ordering: relevance (default) / cited (most cited first) / recent (newest first).',
      },
      openAccessOnly: { type: 'boolean', description: 'Only return works with a free full text.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          query?: string
          provenance?: { source?: string; retrievedAt?: string; total?: number; returned?: number; usedApiKey?: boolean }
          results?: Array<{ title?: string; year?: number; venue?: string; citedByCount?: number; doi?: string }>
          coverageNote?: string
        }
        if (v.ok === false) {
          return [{ type: 'text' as const, text: `Literature search failed: ${v.error ?? ''}` }]
        }
        const p = v.provenance ?? {}
        const lines = [
          `OpenAlex · "${v.query ?? ''}"`,
          `hits ${p.total ?? '?'} · returned ${p.returned ?? '?'} · key ${p.usedApiKey ? 'yes' : 'no'} · ${p.retrievedAt ?? ''}`,
        ]
        for (const [i, r] of (v.results ?? []).entries()) {
          const bits = [r.year ? String(r.year) : undefined, r.venue, r.citedByCount !== undefined ? `${r.citedByCount} cites` : undefined]
          lines.push(`${i + 1}. ${r.title ?? '(untitled)'} — ${bits.filter(Boolean).join(' · ')}`)
        }
        if (v.coverageNote) lines.push(v.coverageNote)
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      if (!literatureDeps) {
        return fail('文献检索未启用（插件装配时未注入检索依赖）。')
      }
      const a = args as {
        query?: string
        perPage?: number
        yearFrom?: number
        yearTo?: number
        sort?: LiteratureQuery['sort']
        openAccessOnly?: boolean
      }
      const query: LiteratureQuery = {
        query: typeof a.query === 'string' ? a.query : '',
        ...(typeof a.perPage === 'number' ? { perPage: a.perPage } : {}),
        ...(typeof a.yearFrom === 'number' ? { yearFrom: a.yearFrom } : {}),
        ...(typeof a.yearTo === 'number' ? { yearTo: a.yearTo } : {}),
        ...(a.sort === 'relevance' || a.sort === 'cited' || a.sort === 'recent' ? { sort: a.sort } : {}),
        ...(a.openAccessOnly === true ? { openAccessOnly: true } : {}),
      }

      const outcome = await searchOpenAlex(query, literatureDeps)
      if (isLiteratureError(outcome)) {
        // 失败**带原因**返回：不能把网络/鉴权失败表现成"没检索到"
        return fail(outcome.message, { kind: outcome.kind, status: outcome.status ?? null })
      }
      return {
        ok: true,
        query: outcome.query,
        provenance: {
          source: outcome.source,
          retrievedAt: outcome.retrievedAt,
          total: outcome.total,
          returned: outcome.returned,
          requestUrl: outcome.requestUrl,
          usedApiKey: outcome.usedApiKey,
        },
        results: outcome.results as unknown as JsonValue,
        coverageNote:
          outcome.total > outcome.returned
            ? `命中 ${outcome.total} 条，本次只返回 ${outcome.returned} 条 —— 覆盖度结论需要多组检索式，不能只看这一页。`
            : `命中 ${outcome.total} 条，已全部返回。`,
      } as unknown as Record<string, JsonValue>
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `文献检索 · ${String((args as { query?: string }).query ?? '').slice(0, 40)}`,
      kind: 'execute',
    }),
  })

  return [
    projectTool as ToolDefinition,
    evidenceTool as ToolDefinition,
    claimTool as ToolDefinition,
    decisionTool as ToolDefinition,
    stateReadTool as ToolDefinition,
    stateProposeTool as ToolDefinition,
    paperTool as ToolDefinition,
    outputTool as ToolDefinition,
    literatureTool as ToolDefinition,
  ]
}

/** 供测试/调试：Open Questions（不经过工具层）。 */
export { openQuestions }
