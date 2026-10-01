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
 * | `research_ir` | Typed Research IR：提案/校验/增量变更/状态推进 | 三层验证不过不落盘；**不写** `research-state.md`；历史不删除 |
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
  LITERATURE_FIELDS,
  OPENALEX_MAX_PER_PAGE,
  isLiteratureError,
  searchOpenAlex,
  type LiteratureDeps,
  type LiteratureQuery,
} from './literature.js'
import {
  downloadPaper,
  readManifest,
  resolveDownloadCandidates,
  type PaperDownloadDeps,
} from './paper-download.js'
import {
  ACTION_LOG_FILE,
  ACTION_STATE_FILE,
  LEVELS as AC_LEVELS,
  appendActionRecord as acAppendRecord,
  buildPrompt as acBuildPrompt,
  constructFromCandidates as acConstructFromCandidates,
  explainConstruction as acExplainConstruction,
  extractCandidates as acExtractCandidates,
  evaluateDesign as acEvaluateDesign,
  evaluateAnswer as acEvaluateAnswer,
  levelSummary as acLevelSummary,
  normaliseState as acNormaliseState,
  readActionRecords as acReadRecords,
  readActionState as acReadState,
  sampleState as acSampleState,
  summariseActionRecords as acSummariseRecords,
  toRecord as acToRecord,
  writeActionState as acWriteState,
  type Design as AcDesign,
  type ResearchState as AcState,
} from './action-construction/index.js'
import {
  INTERMEDIATE_TEX,
  LATEX_SUBDIR,
  MAIN_TEX,
  composeDocument,
  normalizeTemplate,
  type BibEntry,
  type ComposeInput,
} from './latex.js'
import {
  compileLatex,
  extractErrorContext,
  parseCompileErrors,
  repairLatex,
  scanUnsafeTokens,
  type CompileError,
} from './latex-compile.js'
import { parseSections, stripFrontmatter, findSection, parseFrontmatter } from './markdown.js'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
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
import { DEFAULT_PAPER_ID, PAPER_FILES, PAPER_MATURITY_DIMENSIONS, PAPER_TYPES } from './paper-data.js'
import { createPaper, getActivePaperId, listPapers, readPaper, resolvePaperParameter, setActivePaperId } from './paper.js'
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
import {
  COLUMN_WIDTH_PT,
  DIAGRAM_TYPES,
  EDGE_TYPES,
  FIGURES_SUBDIR,
  LAYOUT_ALGORITHMS,
  LAYOUT_DIRECTIONS,
  NODE_TYPES,
  STYLE_TOKENS,
  buildDiagram,
  diagramPaths,
  exportDiagramPdf,
  formatDiagnostics,
  inspectDiagram,
  listDiagramArtifacts,
  readDiagramIr,
  sanitizeDiagramName,
  saveLastGood,
  toCanonicalIr,
  writeDiagramIr,
  writeDiagramSvg,
} from './diagram/index.js'
import { listTopicChanges, loadProjectFile, updateProjectTopic } from './project.js'
import {
  DECISION_TYPES,
  EVIDENCE_REQUIREMENT_TYPES,
  IR_SCHEMA_VERSION,
  applyDelta,
  applyTransition,
  evidenceCoverage,
  formatReport,
  isIRWriteError,
  listIRRevisions,
  listIRs,
  listStates,
  normalizeIR,
  parseIR,
  readIR,
  readIRRevision,
  readTrace,
  saveIR,
  summarizeDelta,
  validateTransition,
  type IRDelta,
  type TransitionInput,
} from './ir/index.js'

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
export const PAPER_DOWNLOAD_TOOL = 'research_paper_download'
export const PAPER_LATEX_TOOL = 'research_paper_latex'
export const ACTION_CONSTRUCTION_TOOL = 'research_action_construction'
export const DIAGRAM_TOOL = 'research_diagram'
export const IR_TOOL = 'research_ir'

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
 * @param literatureDeps 文献检索依赖（API Key 解析等）；缺省时不注册检索工具。
 *        类型直接复用 {@link LiteratureDeps}，避免此处与 `literature.ts` 重复定义字段。
 * @param downloadDeps 论文全文下载依赖（fetch 实现）；缺省时不注册下载工具
 */
export function defineResearchTools(
  resolveWorkspace: (agent?: { id?: unknown } | null) => string,
  literatureDeps?: LiteratureDeps,
  downloadDeps?: PaperDownloadDeps,
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
      '- `create`: create the paper (only `paper.md` is required; other files appear as needed). ' +
      'If `paper` is omitted, the id is auto-generated from `research_track` and `paper_type` ' +
      '(e.g. paper-d2-method). The new paper is set as active by default.\n' +
      '- `list`: list all papers in the workspace with their track, type, status and active flag.\n' +
      '- `switch`: switch the active paper (the one subsequent paper operations default to). ' +
      'Accepts an id or alias.\n' +
      '- `gaps`: run the rule-based gap check and record what is missing. Gaps only *recommend* a ' +
      'capability — nothing is executed.\n' +
      '- `recommend`: turn open gaps into skill recommendations (never executes).\n' +
      '- `maturity`: read or (re)assess research maturity per dimension.\n' +
      '- `propose_revision`: record a revision PROPOSAL. The manuscript is not changed until the ' +
      'user accepts it — content the agent generates must not silently become a fact in the paper.',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: status | create | list | switch | gaps | recommend | maturity | propose_revision.',
        enum: ['status', 'create', 'list', 'switch', 'gaps', 'recommend', 'maturity', 'propose_revision'],
      },
      paper: {
        type: 'string',
        description: 'Paper id or alias (e.g. d1-benchmark, d2-method). Defaults to the current active paper. Use action "switch" to change active paper.',
      },
      title: { type: 'string', description: 'For `create`: paper title.' },
      research_track: {
        type: 'string',
        description: 'For `create`: research track label (e.g. d1, d2, d3). Used to auto-generate paper id.',
      },
      paper_type: {
        type: 'string',
        description: 'For `create`: paper type (benchmark | method | survey | demo | position | technical-report | system | other). Used to auto-generate paper id.',
        enum: ['benchmark', 'method', 'survey', 'demo', 'position', 'technical-report', 'system', 'other'],
      },
      target_venue: { type: 'string', description: 'For `create`: target venue.' },
      authors: { type: 'string', description: 'For `create`: authors.' },
      set_active: {
        type: 'boolean',
        description: 'For `create`: whether to set the new paper as the active paper (default true).',
      },
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
              text: `Revision proposal ${p.id} recorded (paper: ${String(v.paper ?? '')}). The manuscript is unchanged — the user accepts, edits or rejects it.`,
            },
          ]
        }
        if (v.papers) {
          const papers = v.papers as Array<{id: string; title?: string; status: string; version: string; track?: string; type?: string; active: boolean}>
          const lines = [`Papers in workspace (active: ${String(v.active_paper)}):`, '']
          for (const p of papers) {
            const flags = [p.active ? '✅ active' : '', p.track ? `track: ${p.track}` : '', p.type ? `type: ${p.type}` : ''].filter(Boolean).join(' | ')
            lines.push(`- ${p.active ? '*' : ' '} ${p.id} v${p.version} [${p.status}] — ${p.title ?? '(untitled)'}`)
            if (flags) lines.push(`    ${flags}`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.active_paper && v.action === 'switch') {
          const lines = [`Switched active paper to: ${String(v.active_paper)}`, '']
          if (v.summary) {
            const s = v.summary as Record<string, unknown>
            lines.push(`  ${String(s.title)} v${String(s.version)} [${String(s.status)}]`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.id && v.action === 'create') {
          const lines = [`Created new paper: ${String(v.id)}`, '']
          if (v.summary) {
            const s = v.summary as Record<string, unknown>
            lines.push(`  Title: ${String(s.title ?? '(untitled)')}`)
            lines.push(`  Status: ${String(s.status)} v${String(s.version)}`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
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
        // list action 不需要paper参数
        if (action === 'list') {
          const papers = listPapers(ws)
          const activeId = getActivePaperId(ws)
          return losslessJson({
            ok: true,
            active_paper: activeId,
            papers: papers.map((p) => ({
              id: p.id,
              title: p.metadata.title,
              status: p.metadata.status,
              version: p.metadata.version,
              track: p.metadata.researchTrack,
              type: p.metadata.paperType,
              active: p.id === activeId,
            })),
          }) as unknown as Record<string, JsonValue>
        }

        // switch action 切换激活论文
        if (action === 'switch') {
          const targetParam = typeof a.paper === 'string' ? a.paper.trim() : ''
          if (!targetParam) return fail('请指定要切换到的论文ID或别名。')
          const resolvedId = resolvePaperParameter(ws, targetParam)
          if (!readPaper(ws, resolvedId)) return fail(`找不到论文 \`${targetParam}\`。`)
          setActivePaperId(ws, resolvedId)
          return losslessJson({
            ok: true,
            active_paper: resolvedId,
            summary: paperStatusSummary(ws, resolvedId),
          }) as unknown as Record<string, JsonValue>
        }

        // 其他action解析paper参数
        const paperId = resolvePaperParameter(ws, typeof a.paper === 'string' ? a.paper : undefined)

        if (action === 'status') {
          if (!readPaper(ws, paperId)) {
            return losslessJson({ ok: false, error: `No paper \`${paperId}\` in this workspace. Create one with action "create".` }) as unknown as Record<string, JsonValue>
          }
          const summary = paperStatusSummary(ws, paperId)
          return losslessJson({ ok: true, summary, active: paperId === getActivePaperId(ws) }) as unknown as Record<string, JsonValue>
        }

        if (action === 'create') {
          const created = createPaper(ws, {
            ...(a.id ? { id: String(a.id) } : {}),
            ...(a.title ? { title: String(a.title) } : {}),
            ...(a.research_track ? { researchTrack: String(a.research_track) } : {}),
            ...(a.paper_type ? { paperType: String(a.paper_type) } : {}),
            ...(a.target_venue ? { targetVenue: String(a.target_venue) } : {}),
            ...(a.authors ? { authors: String(a.authors) } : {}),
            ...(a.set_active === false ? { setActive: false } : {}),
          })
          if ('error' in created) return fail(created.error)
          return losslessJson({ ok: true, id: created.id, summary: paperStatusSummary(ws, created.id) }) as unknown as Record<string, JsonValue>
        }

        if (action === 'gaps') {
          if (!readPaper(ws, paperId)) return fail(`No paper \`${paperId}\`.`)
          const result = detectAndRecordGaps(ws, paperId)
          return losslessJson({
            ok: true,
            paper: paperId,
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
            paper: paperId,
            recommendations,
            note: 'Suggestions only. Create a plan for one if you agree (plans/), then the user reviews it.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'maturity') {
          if (!readPaper(ws, paperId)) return fail(`No paper \`${paperId}\`.`)
          const suggested = suggestPaperMaturity(ws, paperId)
          const applied = a.write === true
          if (applied) writePaperMaturity(ws, paperId, suggested)
          return losslessJson({ ok: true, paper: paperId, maturity: applied ? readPaperMaturity(ws, paperId) : suggested, applied }) as unknown as Record<string, JsonValue>
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
            paper: paperId,
            proposal: { id: proposal.id, status: proposal.status },
            note: 'Recorded as a proposal only. The manuscript is unchanged until the user accepts it.',
          }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, {
          allowed: ['status', 'create', 'list', 'switch', 'gaps', 'recommend', 'maturity', 'propose_revision'],
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
      'Each record also carries full-text links for download: `pdfUrl` (direct PDF), `openAccessUrl` ' +
      '(OA full text), `landingPageUrl` (publisher landing page), `doi` (DOI resolver URL), and ' +
      '`openAccessStatus` (gold/green/hybrid/bronze/closed). To fetch the full text, pass these fields ' +
      'to `research_paper_download` (the record\'s `id` maps to that tool\'s `openalexId`).\n' +
      'Notes: `total` is the number of matches, `returned` is how many came back — a coverage claim ' +
      'needs the query set, not one page of results. Increase `perPage` or narrow the query rather than ' +
      'paging blindly.\n' +
      '`field` controls how wide the search is, and it changes what "no results" means: `any` ' +
      '(default) searches full text and is easily flooded by surveys and textbooks; `title_abstract` ' +
      'restricts to title+abstract and is the recommended default for exploration; `title` is for ' +
      'confirming whether anyone has already used a specific name. The `provenance.field` value records ' +
      'which one was used — quote it, because "not found" under `title` is a much stronger claim than ' +
      'under `any`.\n' +
      'If no API key is configured the request still works through OpenAlex\'s public ' +
      'pool but with lower rate limits. Requests are automatically serialized (one at a time) with a ' +
      'minimum interval, and HTTP 429/5xx are retried with backoff — do not pace or serialize queries ' +
      'yourself.',
    parameters: {
      query: { type: 'string', description: 'The search expression (natural language or OpenAlex boolean syntax).' },
      perPage: {
        type: 'number',
        description: `How many records to return (1..${OPENALEX_MAX_PER_PAGE}, default 20).`,
      },
      field: {
        type: 'string',
        enum: [...LITERATURE_FIELDS],
        description:
          'How wide the search is (default any). any = full text (broad, noisy); ' +
          'title_abstract = title + abstract (recommended for exploration); ' +
          'title = title only (for "has anyone used this name").',
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
          provenance?: {
            source?: string
            retrievedAt?: string
            total?: number
            returned?: number
            usedApiKey?: boolean
            /** 实际使用的检索字段 —— 决定"未发现"有多可信。 */
            field?: string
          }
          results?: Array<{
            title?: string
            authors?: string[]
            /** 作者总数（可能大于 `authors` 的长度，用于补 `et al.`）。 */
            authorCount?: number
            year?: number
            venue?: string
            citedByCount?: number
            doi?: string
            openAccessUrl?: string
            openAccessStatus?: string
            landingPageUrl?: string
            pdfUrl?: string
          }>
          coverageNote?: string
        }
        if (v.ok === false) {
          return [{ type: 'text' as const, text: `Literature search failed: ${v.error ?? ''}` }]
        }
        const p = v.provenance ?? {}
        const lines = [
          `OpenAlex · "${v.query ?? ''}"`,
          // 字段必须渲染出来：只放进结构化 payload 的话，"未发现"就无法被解释 ——
          // 全文检索没命中与仅标题没命中，可信度完全不同。
          `hits ${p.total ?? '?'} · returned ${p.returned ?? '?'} · field ${p.field ?? 'any'} · ` +
            `key ${p.usedApiKey ? 'yes' : 'no'} · ${p.retrievedAt ?? ''}`,
        ]
        for (const [i, r] of (v.results ?? []).entries()) {
          // 作者是构建参考文献的必需字段：记录里有，就必须渲染出来 ——
          // 只放进结构化 payload 而渲染时丢掉，等于模型看不到。
          const names = (r.authors ?? []).filter(Boolean)
          const authors = names.length > 0
            ? names.join(', ') + (r.authorCount !== undefined && r.authorCount > names.length ? ', et al.' : '')
            : undefined
          const bits = [
            authors,
            r.year ? String(r.year) : undefined,
            r.venue,
            r.citedByCount !== undefined ? `${r.citedByCount} cites` : undefined,
            r.openAccessStatus ? `OA:${r.openAccessStatus}` : undefined,
          ].filter(Boolean)
          // 论文链接：优先 PDF 直链，其次 OA 全文，再落地页/DOI —— 给下载全文用
          const link = r.pdfUrl ?? r.openAccessUrl ?? r.landingPageUrl ?? r.doi
          const linkTag = link ? ` · ${link}` : ''
          lines.push(`${i + 1}. ${r.title ?? '(untitled)'} — ${bits.join(' · ')}${linkTag}`)
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
        field?: LiteratureQuery['field']
      }
      const query: LiteratureQuery = {
        query: typeof a.query === 'string' ? a.query : '',
        ...(typeof a.perPage === 'number' ? { perPage: a.perPage } : {}),
        ...(typeof a.yearFrom === 'number' ? { yearFrom: a.yearFrom } : {}),
        ...(typeof a.yearTo === 'number' ? { yearTo: a.yearTo } : {}),
        ...(a.sort === 'relevance' || a.sort === 'cited' || a.sort === 'recent' ? { sort: a.sort } : {}),
        ...(a.openAccessOnly === true ? { openAccessOnly: true } : {}),
        ...(typeof a.field === 'string' && a.field.trim() ? { field: a.field as LiteratureQuery['field'] } : {}),
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
          field: outcome.field,
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

  /**
   * 论文全文下载工具。
   *
   * 做基准 / 基线对比时要从论文全文里抽取数据集、指标、实验设置，摘要不够用。
   * 本工具把 `research_literature_search` 返回的一条记录（或手填的链接）
   * 变成工作区里的全文文件：解析候选 URL → 下载 → 校验 PDF/HTML → 落盘带序号
   * → 登记 manifest。拉不到全文则生成同名占位 `.txt`（含候选链接，用户自取替换）。
   *
   * 全文落在 `research/literature/fulltext/`，manifest 在 `.../manifest.json`。
   */
  const paperDownloadTool = defineTool({
    name: PAPER_DOWNLOAD_TOOL,
    description:
      'Download the full text of a paper into the workspace, with a stable sequence number, ' +
      'for later extraction of datasets, baselines and experimental elements that only appear ' +
      'in the full text (not in the abstract).\n' +
      'Give it the link fields from a `research_literature_search` record (`pdfUrl`, ' +
      '`openAccessUrl`, `landingPageUrl`, `doi`, `id`) plus the paper `title`. It resolves ' +
      'candidate download URLs (PDF direct → OA → arXiv → ACL Anthology → landing → DOI), ' +
      'fetches the bytes, validates them as PDF (`%PDF-`) or HTML, and writes the file to ' +
      '`research/literature/fulltext/<NNN>_<title>.pdf|.html` with a manifest entry.\n' +
      'If no open full text can be fetched, it creates a same-named `<NNN>_<title>.txt` ' +
      'placeholder listing the candidate links so the user can download manually and replace ' +
      'the placeholder with the real PDF/HTML.\n' +
      'Actions:\n' +
      '- `download`: fetch the full text for one paper and write it to the workspace.\n' +
      '- `list`: list all full-text files and their manifest entries (seq, title, kind, ' +
      'placeholder, source).\n' +
      '- `candidates`: show which download URLs would be tried for given links, without ' +
      'fetching anything (useful to preview before downloading).',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: download | list | candidates.',
        enum: ['download', 'list', 'candidates'],
      },
      title: {
        type: 'string',
        description: 'Paper title (used for the filename and the manifest entry).',
      },
      pdfUrl: { type: 'string', description: 'Direct PDF URL (from OpenAlex `pdfUrl`).' },
      openAccessUrl: { type: 'string', description: 'Open-access full-text URL (from OpenAlex `openAccessUrl`).' },
      landingPageUrl: { type: 'string', description: 'Publisher landing-page URL (from OpenAlex `landingPageUrl`).' },
      doi: { type: 'string', description: 'DOI URL or bare DOI (from OpenAlex `doi`).' },
      openalexId: { type: 'string', description: 'OpenAlex work id (e.g. `https://openalex.org/W123`).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          action?: string
          entry?: {
            seq?: number
            title?: string
            filename?: string
            path?: string
            kind?: string
            placeholder?: boolean
            downloadedFrom?: string
            reason?: string
          }
          entries?: Array<{ seq?: number; title?: string; filename?: string; kind?: string; placeholder?: boolean; source?: string }>
          candidates?: Array<{ url?: string; source?: string }>
          count?: number
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `Paper download failed: ${v.error ?? ''}` }]
        if (v.action === 'list') {
          const lines = [`Full-text files: ${v.count ?? 0}`]
          for (const e of v.entries ?? []) {
            const tag = e.placeholder ? '占位' : e.kind ?? '?'
            lines.push(`${e.seq ?? '?'}. [${tag}] ${e.title ?? '(untitled)'} → ${e.filename ?? ''}`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'candidates') {
          const lines = ['Candidate download URLs:']
          for (const c of v.candidates ?? []) lines.push(`- [${c.source ?? '?'}] ${c.url ?? ''}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        const e = v.entry ?? {}
        const status = e.placeholder
          ? `占位文件已创建（未拿到全文）：${e.reason ?? ''}`
          : `全文已下载（${e.kind ?? '?'}）`
        return [
          {
            type: 'text' as const,
            text: `${e.seq ?? '?'}. ${e.title ?? '(untitled)'}\n${status}\n${e.path ?? ''}${e.downloadedFrom ? `\n来源：${e.downloadedFrom}` : ''}`,
          },
        ]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'list')

      try {
        if (action === 'list') {
          const manifest = readManifest(ws)
          return losslessJson({
            ok: true,
            action: 'list',
            count: manifest.entries.length,
            entries: manifest.entries.map((e) => ({
              seq: e.seq,
              title: e.title,
              filename: e.filename,
              path: e.path,
              kind: e.kind,
              placeholder: e.placeholder,
              ...(e.source ? { source: e.source } : {}),
              ...(e.bytes ? { bytes: e.bytes } : {}),
            })),
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'candidates') {
          const links = {
            id: typeof a.openalexId === 'string' ? a.openalexId : undefined,
            doi: typeof a.doi === 'string' ? a.doi : undefined,
            openAccessUrl: typeof a.openAccessUrl === 'string' ? a.openAccessUrl : undefined,
            landingPageUrl: typeof a.landingPageUrl === 'string' ? a.landingPageUrl : undefined,
            pdfUrl: typeof a.pdfUrl === 'string' ? a.pdfUrl : undefined,
          }
          const candidates = resolveDownloadCandidates(links)
          return losslessJson({
            ok: true,
            action: 'candidates',
            candidates: candidates.map((c) => ({ url: c.url, source: c.source })),
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'download') {
          if (!downloadDeps) {
            return fail('论文全文下载未启用（插件装配时未注入下载依赖）。')
          }
          const links = {
            id: typeof a.openalexId === 'string' ? a.openalexId : undefined,
            doi: typeof a.doi === 'string' ? a.doi : undefined,
            openAccessUrl: typeof a.openAccessUrl === 'string' ? a.openAccessUrl : undefined,
            landingPageUrl: typeof a.landingPageUrl === 'string' ? a.landingPageUrl : undefined,
            pdfUrl: typeof a.pdfUrl === 'string' ? a.pdfUrl : undefined,
          }
          // 至少要给一个链接锚点，否则无法解析候选
          if (!links.id && !links.doi && !links.openAccessUrl && !links.landingPageUrl && !links.pdfUrl) {
            return fail('缺少论文链接：至少提供 openalexId / doi / pdfUrl / openAccessUrl / landingPageUrl 之一。')
          }
          const title = typeof a.title === 'string' ? a.title : undefined
          const result = await downloadPaper(ws, { title, links }, downloadDeps)
          return losslessJson({
            ok: true,
            action: 'download',
            entry: {
              seq: result.seq,
              title: title,
              filename: result.filename,
              path: result.path,
              kind: result.kind,
              placeholder: result.placeholder,
              ...(result.downloadedFrom ? { downloadedFrom: result.downloadedFrom } : {}),
              ...(result.reason ? { reason: result.reason } : {}),
            },
          }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, { allowed: ['download', 'list', 'candidates'] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string; title?: string }
      return { card: 'generic', title: `论文下载 · ${a.action ?? ''} ${a.title ?? ''}`.trim(), kind: 'execute' }
    },
  })

  /**
   * LaTeX 工具（移植自 ConvFusion-dev `modules/paper/latex`）。
   *
   * v2 的论文手稿是 Markdown（`papers/<id>/paper.md`），但最终交付是 LaTeX。
   * 迁移时只搬来技能、没搬工具，`papers/<id>/latex/` 一直是空目录 —— 本工具补齐这条链路：
   * 组装（Markdown → main.tex）→ 编译（tectonic → PDF）→ 按日志确定性修复 → 结构化错误（供 Agent 精修）。
   *
   * 与旧版的关键差异：旧版有一个自动调 LLM 的 `latex_llm_fixer` 节点；v2 的工具**不能调 LLM**，
   * 因此这里只产出结构化错误与上下文，由 Agent 自己读日志、改文件（Native Harness 原则）。
   */
  const paperLatexTool = defineTool({
    name: PAPER_LATEX_TOOL,
    description:
      'Compose the Markdown manuscript into a compilable LaTeX document and compile it to PDF.\n' +
      'Actions:\n' +
      '- `compose`: read `papers/<paperId>/paper.md`, turn its sections into ' +
      '`papers/<paperId>/latex/main.tex` (+ `main_intermediate.tex` keeping raw `[cite_key]` ' +
      'placeholders for human reading). Markdown artefacts, citations and `<<EQ:key>>` ' +
      'placeholders are handled; an existing `main.tex` is backed up first.\n' +
      '- `compile`: run Tectonic on `main.tex` to produce `main.pdf`, returning `{ success, pdfPath, errors }`.\n' +
      '- `repair`: deterministic, LLM-free repair of `main.tex` using the last compile log ' +
      '(escapes stray `%`, fixes double-subscript / math-mode errors). Returns how many lines it fixed.\n' +
      '- `errors`: structured compile errors with line numbers and code context — use this to fix ' +
      'what `repair` could not, then call `compile` again.\n' +
      '- `validate`: list unrecognised LaTeX commands/environments (advisory, not a gate).\n' +
      '- `status`: show what exists in the paper\'s `latex/` directory and the last compile state.\n' +
      'Templates: `conference` (IEEEtran, default) or `journal` (IEEEtran journal option).',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: compose | compile | repair | errors | validate | status.',
        enum: ['compose', 'compile', 'repair', 'errors', 'validate', 'status'],
      },
      paperId: { type: 'string', description: 'Paper id (default: `paper-main`).' },
      template: {
        type: 'string',
        description: 'For `compose`: `conference` (IEEEtran, default) or `journal` (IEEEtran journal).',
        enum: ['conference', 'journal'],
      },
      maxErrors: { type: 'number', description: 'For `errors`: how many errors to return with context (default 15).' },
      contextSize: { type: 'number', description: 'For `errors`: context lines around each error line (default 6).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          action?: string
          latexPath?: string
          intermediatePath?: string
          backup?: string
          warnings?: string[]
          sections?: number
          success?: boolean
          pdfPath?: string
          reason?: string
          fixedCount?: number
          remaining?: number
          errors?: Array<{ line?: number; message?: string; severity?: string; context?: string }>
          unknownCommands?: string[]
          unknownEnvs?: string[]
          files?: string[]
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `LaTeX action failed: ${v.error ?? ''}` }]
        if (v.action === 'compose') {
          const lines = [`LaTeX composed: ${v.sections ?? 0} section(s)`, `→ ${v.latexPath ?? ''}`]
          if (v.intermediatePath) lines.push(`→ ${v.intermediatePath} (raw citation placeholders)`)
          if (v.backup) lines.push(`previous main.tex backed up → ${v.backup}`)
          for (const w of v.warnings ?? []) lines.push(`⚠ ${w}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'compile') {
          const head = v.success ? `✅ Compile OK → ${v.pdfPath ?? ''}` : `❌ Compile failed${v.reason ? `: ${v.reason}` : ''}`
          const lines = [head, `errors: ${v.errors?.length ?? 0}`]
          for (const e of (v.errors ?? []).slice(0, 8)) {
            lines.push(`  ${e.line ? `L${e.line}: ` : ''}${e.message ?? ''}`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'repair') {
          return [
            {
              type: 'text' as const,
              text: `Repaired ${v.fixedCount ?? 0} line(s); ${v.remaining ?? 0} error(s) left for manual fixing. Run \`errors\` to see them.`,
            },
          ]
        }
        if (v.action === 'errors') {
          const lines = [`${v.errors?.length ?? 0} compile error(s)`]
          for (const e of v.errors ?? []) {
            lines.push(`--- ${e.line ? `line ${e.line}` : 'no line'} [${e.severity ?? ''}] ${e.message ?? ''} ---`)
            if (e.context) lines.push(e.context)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'validate') {
          const lines = [`unknown commands: ${v.unknownCommands?.length ?? 0}`, `unknown environments: ${v.unknownEnvs?.length ?? 0}`]
          if (v.unknownCommands?.length) lines.push(`  ${v.unknownCommands.slice(0, 20).join(', ')}`)
          if (v.unknownEnvs?.length) lines.push(`  ${v.unknownEnvs.slice(0, 20).join(', ')}`)
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        const lines = [`LaTeX dir: ${v.files?.length ?? 0} file(s)`]
        for (const f of v.files ?? []) lines.push(`  ${f}`)
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'status')
      const paperId = resolvePaperParameter(ws, typeof a.paperId === 'string' ? a.paperId : undefined)

      const paperDir = join(ws, 'papers', paperId)
      const latexDir = join(paperDir, LATEX_SUBDIR)
      const texPath = join(latexDir, MAIN_TEX)

      try {
        if (action === 'status') {
          if (!existsSync(latexDir)) {
            return losslessJson({
              ok: true,
              action: 'status',
              files: [],
              note: '尚无 latex/ 目录 —— 先执行 compose。',
            }) as unknown as Record<string, JsonValue>
          }
          const files = readdirSync(latexDir)
            .filter((f) => !f.startsWith('.'))
            .map((f) => {
              const st = statSync(join(latexDir, f))
              return `${f} (${st.size} B, ${st.mtime.toISOString()})`
            })
          return losslessJson({ ok: true, action: 'status', files }) as unknown as Record<string, JsonValue>
        }

        if (action === 'compose') {
          const mdPath = join(paperDir, 'paper.md')
          if (!existsSync(mdPath)) return fail(`论文正文不存在：papers/${paperId}/paper.md`)
          const source = readFileSync(mdPath, 'utf8')
          const template = normalizeTemplate(typeof a.template === 'string' ? a.template : undefined)
          const input = buildComposeInput(source, template, readPaperMeta(paperDir))
          const result = composeDocument(input)

          if (!existsSync(latexDir)) mkdirSync(latexDir, { recursive: true })
          let backup: string | undefined
          if (existsSync(texPath)) {
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
            const bak = join(latexDir, `main_bak_${ts}.tex`)
            renameSync(texPath, bak)
            backup = `${LATEX_SUBDIR}/main_bak_${ts}.tex`
          }
          writeFileSync(texPath, result.latex, 'utf8')
          writeFileSync(join(latexDir, INTERMEDIATE_TEX), result.latexIntermediate, 'utf8')

          return losslessJson({
            ok: true,
            action: 'compose',
            latexPath: `papers/${paperId}/${LATEX_SUBDIR}/${MAIN_TEX}`,
            intermediatePath: `papers/${paperId}/${LATEX_SUBDIR}/${INTERMEDIATE_TEX}`,
            ...(backup ? { backup } : {}),
            sections: input.sections.length,
            template,
            warnings: result.warnings,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'compile') {
          if (!existsSync(texPath)) return fail('main.tex 不存在 —— 先执行 compose。')
          /**
           * 缓存放在研究根的 `harness/` 下**共享**，不放在每篇论文的 `latex/` 里：
           * tectonic 首次编译要下载约 43 MB 宏包，共享后多篇论文只下一次。
           * 且必须避开 `~/Library/Caches`（受限沙箱下写入被拒，实测过）。
           */
          const cacheDir = join(ws, 'harness', '.tectonic-cache')
          if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
          const res = compileLatex(texPath, { cacheDir })
          return losslessJson({
            ok: true,
            action: 'compile',
            success: res.success,
            pdfPath: res.pdfPath ? `papers/${paperId}/${LATEX_SUBDIR}/main.pdf` : '',
            ...(res.reason ? { reason: res.reason } : {}),
            errors: res.errors.slice(0, 30) as unknown as JsonValue,
            errorCount: res.errors.length,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'errors') {
          if (!existsSync(texPath)) return fail('main.tex 不存在 —— 先执行 compose。')
          const logPath = join(latexDir, 'main.log')
          if (!existsSync(logPath)) return fail('尚无 main.log —— 先执行 compile。')
          const errors = parseCompileErrors(readFileSync(logPath, 'utf8'))
          const max = typeof a.maxErrors === 'number' ? Math.max(1, Math.floor(a.maxErrors)) : 15
          const ctxSize = typeof a.contextSize === 'number' ? Math.max(1, Math.floor(a.contextSize)) : 6
          const tex = readFileSync(texPath, 'utf8')
          const enriched = errors.slice(0, max).map((e) => ({
            ...e,
            context: e.line > 0 ? extractErrorContext(tex, e.line, ctxSize).text : '',
          }))
          return losslessJson({ ok: true, action: 'errors', errors: enriched as unknown as JsonValue }) as unknown as Record<
            string,
            JsonValue
          >
        }

        if (action === 'repair') {
          if (!existsSync(texPath)) return fail('main.tex 不存在 —— 先执行 compose。')
          const logPath = join(latexDir, 'main.log')
          if (!existsSync(logPath)) return fail('尚无 main.log —— 先执行 compile，再 repair。')
          const errors = parseCompileErrors(readFileSync(logPath, 'utf8'))
          const tex = readFileSync(texPath, 'utf8')
          const repaired = repairLatex(tex, errors)
          if (repaired.fixedCount > 0) writeFileSync(texPath, repaired.latex, 'utf8')
          return losslessJson({
            ok: true,
            action: 'repair',
            fixedCount: repaired.fixedCount,
            remaining: repaired.remaining.length,
            remainingErrors: repaired.remaining.slice(0, 10) as unknown as JsonValue,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'validate') {
          if (!existsSync(texPath)) return fail('main.tex 不存在 —— 先执行 compose。')
          const scan = scanUnsafeTokens(readFileSync(texPath, 'utf8'))
          return losslessJson({
            ok: true,
            action: 'validate',
            unknownCommands: scan.unknownCommands,
            unknownEnvs: scan.unknownEnvs,
            allKnown: scan.allKnown,
          }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, {
          allowed: ['compose', 'compile', 'repair', 'errors', 'validate', 'status'],
        })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string; paperId?: string }
      return { card: 'generic', title: `LaTeX · ${a.action ?? ''} ${a.paperId ?? ''}`.trim(), kind: 'execute' }
    },
  })

  /* ── Diagram（C08P07 `paper-diagrams` 的执行通道）────────────────────── */
  /**
   * 论文配图：Agent 写 **Diagram IR**，Renderer 确定性地画。
   *
   * 为什么必须有这个工具，而不是让 Agent 用 `write` 直接产 SVG：
   *
   * 1. **出不了坏图**：校验不过就不写 SVG。这条路径在系统里**不存在**，不是"记得别写"。
   * 2. **可复现**：同一个 IR 渲染 N 次逐字节相同 —— 图因此可以进 git、可以 review。
   * 3. **可演化**：改图是改 IR（`read` → 改 → `render`），不是重新画一张。
   * 4. **风格统一**：样式只能引用内置 token，一篇论文里的图不会各写各的配色与字体。
   *
   * `create` 只写 IR（起草阶段拿诊断），`render` 写 IR 并出 SVG（校验通过才写）。
   * 校验失败时**不覆盖**已有 SVG，并把上一次成功的那份留在 `figures/.last-good/`。
   */
  const diagramTool = defineTool({
    name: DIAGRAM_TOOL,
    description:
      'Create publication figures from a structured **Diagram IR** (paper C08P07 `paper-diagrams`).\n' +
      'You decide *what* to draw; the IR records the nodes/groups/edges; the renderer draws it ' +
      'deterministically. **Never hand-write SVG** — write an IR and render it.\n' +
      'Actions:\n' +
      '- `create`: validate the IR and write it to `papers/<paperId>/figures/<name>.json` (no SVG). ' +
      'Use this while drafting, to get diagnostics early.\n' +
      '- `render`: validate and render; writes both the IR and `<name>.svg`. If validation fails, ' +
      'the previous good SVG is kept and no new one is written.\n' +
      '- `export`: convert the rendered SVG into a **vector PDF** for LaTeX `\\includegraphics`. ' +
      'Needs a Python interpreter with PyMuPDF (set `CONVFUSION_PYTHON` if it is not on PATH). ' +
      'It reports the figure\'s on-page text size — pass `column_width_pt` (252 = IEEE single column, ' +
      '516 = full width) and read `legible`: a wide diagram shrunk into one column becomes unreadable.\n' +
      '- `validate`: run validation only (no writes) on `ir`, or on the stored IR when `ir` is omitted.\n' +
      '- `read`: return the stored IR for an incremental edit (modify it, then `render` again).\n' +
      '- `list`: list the diagram artifacts already in the paper\'s `figures/` directory.\n' +
      'IR shape: {version, type, title?, canvas?, layout?:{direction,algorithm}, nodes[], groups[], edges[], cards?, labels?}.\n' +
      `- type: ${DIAGRAM_TYPES.join(' | ')}\n` +
      `- node.type: ${NODE_TYPES.join(' | ')} (role in the figure, never a method-specific name)\n` +
      `- edge.type: ${EDGE_TYPES.join(' | ')}\n` +
      `- layout.direction: ${LAYOUT_DIRECTIONS.join(' | ')} (LR default) · layout.algorithm: ${LAYOUT_ALGORITHMS.join(' | ')}\n` +
      '- layout.layer_gap (optional, 12-120, default 64): gap between layers. Lower it to pack a long, ' +
      'content-heavy diagram so its text is still legible after the figure is scaled into a column; ' +
      'leave it out for short figures, where the default reads better.\n' +
      `- style tokens (nodes/groups/edges only reference these): ${STYLE_TOKENS.join(' | ')}\n` +
      '- sequence mode: `nodes[]` are PARTICIPANTS (declaration order = left-to-right columns) and `edges[]`\n' +
      '  are MESSAGES (declaration order = time, top to bottom). A self-message draws as a return loop.\n' +
      '  Groups have no meaning here; declaring them warns (`UNSUPPORTED_IN_MODE`) and ignores them.\n' +
      '- lifecycle mode: states + transitions. Self-transitions are supported (drawn as a loop), an `input`\n' +
      '  node gets an initial-state marker, an `output` node a final-state ring, and cycles are expected\n' +
      '  (no `CYCLE_DETECTED` noise).\n' +
      '- refs (optional, on a node/group/edge/card): the paper assets this element CARRIES, e.g. `["C1","E008"]`.\n' +
      '  A figure exists to carry the paper\'s argument, so a box should say which claim it supports; refs render\n' +
      '  as a small line at the bottom of the box. Ids are checked against the workspace — a ref that is not a\n' +
      '  recorded claim/evidence is an error (`UNKNOWN_REF`), because a dead citation on a figure is worse than none.\n' +
      '- cards (optional, top level): [{"title","body?","refs?"}] rendered in a panel OUTSIDE the flow.\n' +
      '  Use a card for a secondary point, a key number or a condition, instead of adding another edge: a denser\n' +
      '  graph is harder to read, and every extra edge is another chance for a bad route.\n' +
      'No x/y coordinates: layout is the renderer\'s job. An edge may target a group id, which ' +
      'draws the arrow to the group border. Within-layer order follows declaration order, so ' +
      'reordering the `nodes` array is how you move a box.',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: create | render | export | validate | read | list.',
        enum: ['create', 'render', 'export', 'validate', 'read', 'list'],
      },
      name: {
        type: 'string',
        description: 'Figure name / file stem, e.g. `fig1_method`. Written to `papers/<paperId>/figures/<name>.{json,svg}`.',
      },
      paperId: { type: 'string', description: 'Paper id (default: the active paper).' },
      ir: {
        type: 'object',
        description: 'The Diagram IR. Required for `create` and `render`; optional for `validate` (falls back to the stored IR).',
        additionalProperties: true,
      },
      show_descriptions: {
        type: 'boolean',
        description: 'Render each node as label + description (default false — figures should carry as little text as possible).',
      },
      column_width_pt: {
        type: 'number',
        description: 'For `export`: the width the figure will be drawn at in the paper, in pt (252 = IEEE single column, 516 = full width). Default 252.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          action?: string
          valid?: boolean
          errorCount?: number
          warningCount?: number
          irPath?: string
          svgPath?: string
          svgWritten?: boolean
          keptPrevious?: string
          summary?: string
          nodes?: number
          edges?: number
          groups?: number
          width?: number
          height?: number
          entries?: Array<{ name: string; complete: boolean; type?: string | null }>
          ir?: unknown
          pdfPath?: string
          pdfBytes?: number
          effectiveNodePt?: number
          legible?: boolean
          maxCanvasUnitsFor7pt?: number
          columnWidthPt?: number
          allFontsEmbedded?: boolean
          pymupdf?: string
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `Diagram action failed: ${v.error ?? ''}` }]
        if (v.action === 'list') {
          const rows = (v.entries ?? []).map((e) => `- ${e.name}${e.type ? ` (${e.type})` : ''}${e.complete ? '' : ' — IR or SVG missing'}`)
          return [{ type: 'text' as const, text: rows.length > 0 ? `Diagrams:\n${rows.join('\n')}` : 'No diagrams yet.' }]
        }
        if (v.action === 'read') {
          return [{ type: 'text' as const, text: `IR at ${v.irPath ?? ''}:\n${JSON.stringify(v.ir ?? null, null, 2)}` }]
        }
        if (v.action === 'export') {
          const lines = [
            `✅ ${v.pdfPath ?? ''} (${Math.round((v.pdfBytes ?? 0) / 1024)} KB, vector, fonts ${v.allFontsEmbedded ? 'embedded' : 'NOT embedded'})`,
            `node text ≈ ${v.effectiveNodePt ?? '?'} pt when drawn ${v.columnWidthPt ?? '?'} pt wide — ${v.legible ? 'legible' : 'TOO SMALL ❌'}`,
          ]
          if (v.legible === false) {
            lines.push(
              `→ this figure is too wide for that column: keep the canvas under ${v.maxCanvasUnitsFor7pt} units ` +
                '(fewer layers, or split it into a method figure + a module figure), or draw it full width.',
            )
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        const head = v.valid
          ? v.svgWritten
            ? `✅ ${v.svgPath ?? ''}`
            : `✅ IR valid (${v.irPath ?? ''})`
          : `❌ IR invalid — ${v.errorCount ?? 0} error(s), ${v.warningCount ?? 0} warning(s)`
        const lines = [head]
        if (v.valid && v.width !== undefined) {
          lines.push(`${v.nodes ?? 0} node(s), ${v.groups ?? 0} group(s), ${v.edges ?? 0} edge(s) · ${v.width}×${v.height}`)
        }
        if (v.keptPrevious) lines.push(`kept previous figure: ${v.keptPrevious}`)
        if (v.summary) lines.push(v.summary)
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = args as Record<string, unknown>
      const action = String(a.action ?? 'list')
      const paperId = resolvePaperParameter(ws, typeof a.paperId === 'string' ? a.paperId : undefined)
      const DIAGRAM_ACTIONS = ['create', 'render', 'export', 'validate', 'read', 'list']
      if (!DIAGRAM_ACTIONS.includes(action)) {
        return fail(`Unknown action "${action}".`, { allowed: DIAGRAM_ACTIONS })
      }
      try {
        if (action === 'list') {
          const entries = listDiagramArtifacts(ws, paperId).map((e) => ({ name: e.name, complete: e.complete, type: e.type }))
          return losslessJson({ ok: true, action, paperId, entries }) as unknown as Record<string, JsonValue>
        }

        const nameResult = sanitizeDiagramName(a.name)
        if (!nameResult.ok) return fail(nameResult.error)
        const name = nameResult.name
        const paths = diagramPaths(ws, paperId, name)

        if (action === 'read') {
          const read = readDiagramIr(paths)
          if (!read.ok) return fail(read.error)
          return losslessJson({ ok: true, action, irPath: paths.relIr, ir: read.raw as JsonValue }) as unknown as Record<string, JsonValue>
        }

        /**
         * `export` 在**读 IR 之前**处理：它转的是**已经渲染好的 SVG**，不需要 IR，
         * 也不重新布局。放在 IR 解析之后会导致"没传 ir 就不给导出"这种无理由的限制。
         */
        if (action === 'export') {
          if (!existsSync(paths.svgPath)) {
            return fail(`No rendered figure at ${paths.relSvg} — run \`render\` first (and fix any validation errors).`)
          }
          const columnWidthPt = typeof a.column_width_pt === 'number' && a.column_width_pt > 0 ? a.column_width_pt : COLUMN_WIDTH_PT
          const pdfPath = paths.svgPath.replace(/\.svg$/i, '.pdf')
          const result = exportDiagramPdf({ svgPath: paths.svgPath, pdfPath, targetWidthPt: columnWidthPt })
          if (!result.ok) return fail(result.error ?? 'export failed')
          return losslessJson({
            ok: true,
            action,
            name,
            paperId,
            svgPath: paths.relSvg,
            pdfPath: `papers/${paperId}/${FIGURES_SUBDIR}/${name}.pdf`,
            pdfBytes: result.bytes ?? 0,
            widthPt: result.widthPt,
            heightPt: result.heightPt,
            allFontsEmbedded: result.allFontsEmbedded,
            effectiveNodePt: result.effectiveNodePt,
            legible: result.legible,
            maxCanvasUnitsFor7pt: result.maxCanvasUnitsFor7pt,
            columnWidthPt,
            pymupdf: result.pymupdf,
            python: result.python,
          }) as unknown as Record<string, JsonValue>
        }

        let raw: unknown = a.ir
        if (raw === undefined || raw === null) {
          /**
           * 省略 `ir` 时回落到**已落盘**的 IR：这样"Agent 用原生 `write` 手改了
           * `<name>.json`，再 `render` 一次"这条最自然的编辑路径也能走通。
           * `create` 例外 —— 没有 IR 就没有要创建的东西。
           */
          if (action === 'validate' || action === 'render') {
            const read = readDiagramIr(paths)
            if (!read.ok) return fail(`${read.error} Pass \`ir\` explicitly for an unsaved diagram.`)
            raw = read.raw
          } else {
            return fail(`\`ir\` is required for action "${action}".`)
          }
        }
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw) as unknown
          } catch (e) {
            return fail(`\`ir\` is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
          }
        }

        /**
         * `knownRefs`：把工作区里**真实存在**的 claim / evidence 编号交给校验器，
         * 这样图上印的 `[C3]` 如果是个不存在的编号，会直接报 `UNKNOWN_REF`。
         *
         * 为什么在这里读、而不是内核里去读：内核是纯函数（同输入同输出、可测），
         * "编号存不存在"属于研究记录的事实，只有工具层知道去哪儿读。
         */
        const knownRefs = new Set<string>([
          ...listClaims(ws).map((c) => c.id),
          ...listEvidence(ws).map((e) => e.id),
        ])
        const options = { showDescriptions: a.show_descriptions === true, knownRefs }

        if (action === 'validate') {
          const inspection = inspectDiagram(raw, options)
          return losslessJson({
            ok: true,
            action,
            valid: inspection.report.valid,
            errorCount: inspection.report.errors.length,
            warningCount: inspection.report.warnings.length,
            errors: inspection.report.errors as unknown as JsonValue,
            warnings: inspection.report.warnings as unknown as JsonValue,
            summary: formatDiagnostics(inspection.report),
          }) as unknown as Record<string, JsonValue>
        }

        /* create / render：先校验，再落盘 */
        const build = buildDiagram(raw, options)
        const report = build.report
        const canonical = build.diagram !== null ? toCanonicalIr(build.diagram) : raw
        writeDiagramIr(paths, canonical)

        let svgWritten = false
        let keptPrevious: string | undefined
        // `create` 只固化 IR：起草阶段拿诊断，不产图（图由 `render` 出）。
        if (action !== 'create' && build.svg !== null && build.diagram !== null && build.layout !== null) {
          writeDiagramSvg(paths, build.svg)
          saveLastGood(paths, canonical, build.svg)
          svgWritten = true
        } else if (existsSync(paths.svgPath)) {
          const st = statSync(paths.svgPath)
          keptPrevious = `${paths.relSvg} (from ${st.mtime.toISOString()})`
        }

        return losslessJson({
          ok: true,
          action,
          valid: report.valid,
          errorCount: report.errors.length,
          warningCount: report.warnings.length,
          errors: report.errors as unknown as JsonValue,
          warnings: report.warnings as unknown as JsonValue,
          irPath: paths.relIr,
          ...(svgWritten ? { svgPath: paths.relSvg } : {}),
          svgWritten,
          ...(keptPrevious !== undefined ? { keptPrevious } : {}),
          ...(build.layout !== null
            ? {
                nodes: build.layout.nodes.length,
                groups: build.layout.groups.length,
                edges: build.layout.edges.length,
                width: build.layout.width,
                height: build.layout.height,
              }
            : {}),
          summary: formatDiagnostics(report),
        }) as unknown as Record<string, JsonValue>
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string; name?: string }
      return { card: 'generic', title: `Diagram · ${a.action ?? ''} ${a.name ?? ''}`.trim(), kind: 'execute' }
    },
  })

  /* ── Action Construction（Paper 4 的度量，纯计算）────────────────────── */
  /**
   * 论文 d4 的度量：一个决策买到的信息量取决于**动作是怎么写下来的**。
   * 这里只做度量与规范化，不发模型调用——在 DSH 里"写动作"的是当前 agent 本身。
   *
   * 在 `/research` 里的用法（实验前）：
   *   set_state（把这次实验的机制集/臂/信念/预算写下来）
   *     → prompt（拿到该层级的提示词）→ evaluate（打分）→ record（落盘）
   *   → 预算闸门 + `action-construction` 信号据此判断"这个动作写成了可执行设计、且预算付得起"
   *     → 才允许发真实调用。
   */
  const actionConstructionTool = defineTool({
    name: ACTION_CONSTRUCTION_TOOL,
    description:
      'Measure how much information a research action buys, as a function of how it was ' +
      'written down (Action Construction, paper d4). An action such as "run an ablation" ' +
      'names neither the mechanism nor the arms nor the seeds, so an executor must invent ' +
      'them; the metric averages information gain per unit cost over the designs the answer ' +
      'could mean, and reports the gap to an optimal design as a pointer gap, a resolution ' +
      'gap and a feasibility term.\n' +
      'Two scales are returned: `bound_share` (share of the unconstrained cost-efficiency ' +
      'bound, the informativeness scale) and `compliant` (a design the stated budget cannot ' +
      'pay for counts as buying nothing, normalised by the affordable optimum).\n' +
      'Actions:\n' +
      '- `prompt`: the prompt an agent at a given level receives (L1 named / L2 intent / ' +
      'L3 structured / L4 + predicted); use it to ask a model for an action.\n' +
      '- `evaluate`: score an answer (raw text parsed at `level`) or a structured `design`.\n' +
      '- `sample`: return a synthetic research state from the built-in panel (demo/testing).\n' +
      '- `state`: show the state this workspace scores against (`research/action-state.json`).\n' +
      '- `set_state`: write that state (the candidate mechanisms, the arms, the belief and ' +
      'the budget the experiment is decided under) so the next action can be measured.\n' +
      '- `record`: evaluate an action and append the result to ' +
      '`research/action-construction.jsonl` — the trace the experiment gate reads.\n' +
      '- `report`: summarise the recorded evaluations (count, in-budget rate, latest).\n' +
      '- `extract`: build action objects from actions that already exist — the steps of a ' +
      'plan (`plan`) or a list of action texts (`actions`). Each item is classified as ' +
      'measurable by this metric (an ablation-design action) or not, and measurable ones get ' +
      'a constructed object plus both scores (as written / constructed). Use `record: true` ' +
      'to log the ones you are about to run. This is the path that works while the decision ' +
      'layer (paper 1) does not exist yet: plan steps and the agent\'s own proposals are ' +
      'already actions, they are just not written in a measurable form.\n' +
      'State resolution order: explicit `state` argument, else the workspace state written by ' +
      '`set_state`, else `state_index` for a synthetic demo state. `record` and the experiment ' +
      'gate need a *real* workspace state — a synthetic panel state is for demos only. ' +
      'No model call is made; only `set_state` and `record` write to the workspace.',
    parameters: {
      action: {
        type: 'string',
        description:
          'One of: prompt | evaluate | sample | state | set_state | record | report | extract. ' +
          '`record` = evaluate + append to the workspace log (what the experiment gate reads).',
        enum: [
          'prompt', 'evaluate', 'sample', 'state', 'set_state', 'record', 'report', 'extract',
        ],
      },
      level: {
        type: 'string',
        description:
          'Representation level. L1 named / L2 intent / L3 structured / L4 structured+predicted. ' +
          'Defaults to L3.',
        enum: [...AC_LEVELS],
      },
      answer: {
        type: 'string',
        description:
          'For `evaluate`: the agent answer verbatim. It is parsed at `level` (last occurrence ' +
          'of each field wins; a design that cannot discriminate two hypotheses counts as a ' +
          'failed answer, not a repaired one).',
      },
      design: {
        type: 'object',
        additionalProperties: true,
        description:
          'For `evaluate`: a structured design instead of raw text, e.g. ' +
          '{"action_type":"component_scan","target":1,"arms":[0,1,2,3,4,5],"n":11}.',
      },
      state: {
        type: 'object',
        additionalProperties: true,
        description:
          'The research state: {question, method, partial_results, mechanisms[6], arms[6], ' +
          'prior[6], budget, truth?}. Mechanism count must match the environment (6).',
      },
      state_index: {
        type: 'number',
        description: 'Which synthetic state to use when `state` is omitted (0..29). Default 0.',
      },
      seed: {
        type: 'number',
        description: 'Seed for the synthetic panel. Default 11.',
      },
      note: {
        type: 'string',
        description:
          'For `record`: why this action was chosen (kept next to the numbers in the log).',
      },
      plan: {
        type: 'string',
        description:
          'For `extract`: workspace-relative Markdown to mine for action-like steps, e.g. ' +
          '"plans/experiment-pipeline.md". Checklist items, numbered steps and plan-step ' +
          'table rows are recognised.',
      },
      text: {
        type: 'string',
        description: 'For `extract`: Markdown text to mine instead of a file.',
      },
      actions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For `extract`: explicit action texts to construct objects for (e.g. pasted from a ' +
          'plan, or the actions an agent proposed). Each is parsed, or its design shape is ' +
          'inferred from the wording.',
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For `extract` with `record: true`: which extracted ids to log. Default: the first ' +
          'constructed action the stated budget can pay for (never a silent bulk write).',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          action?: string
          level?: string
          source?: string
          path?: string
          configured?: boolean
          hint?: string
          next?: string
          count?: number
          inBudget?: number
          latest?: { ig_per_cost: number; bound_share: number; feasible: boolean; cost: number | null; budget: number }
          recent?: Array<{ level: string; ig_per_cost: number; bound_share: number; feasible: boolean; cost: number | null; budget: number; at: string; note?: string }>
          prompt?: string
          summary?: string
          parse_status?: string
          state?: AcState
          evaluation?: {
            ig_per_cost?: number
            bound_share?: number
            compliant?: number
            feasible?: boolean
            cost?: number | null
            budget?: number
            guess_rate?: number
            pointer_gap?: number
            resolution_gap?: number
            status?: string
          }
        }
        if (v.ok === false) return [{ type: 'text' as const, text: `Action construction failed: ${v.error ?? ''}` }]

        const describeState = (s: AcState): string =>
          `${s.question}\n${s.partial_results}\nBelief: ` +
          `${s.prior.map((p, i) => `h${i} ${p.toFixed(2)}`).join(' | ')} | budget ${s.budget}`

        /* state / set_state / report: the workspace flow around the metric */
        if (v.action === 'state') {
          if (v.configured === false) {
            return [{ type: 'text' as const, text: `${v.hint ?? 'No action state yet.'} (${v.path ?? ''})` }]
          }
          return [{ type: 'text' as const, text: `Action state (${v.path ?? ''}):\n${v.state ? describeState(v.state) : ''}` }]
        }
        if (v.action === 'set_state') {
          return [
            {
              type: 'text' as const,
              text: `Action state written → ${v.path ?? ''}\n${v.state ? describeState(v.state) : ''}\n${v.next ?? ''}`,
            },
          ]
        }
        if (v.action === 'report') {
          const lines = [`Action construction log (${v.path ?? ''}): ${v.count ?? 0} evaluation(s), ${v.inBudget ?? 0} within the stated budget.`]
          for (const r of (v.recent ?? []).slice().reverse()) {
            const cost = r.cost === null || r.cost === undefined ? 'n/a' : r.cost.toFixed(2)
            lines.push(
              `  - ${r.at.slice(0, 16).replace('T', ' ')} ${r.level}: IG/cost ${r.ig_per_cost.toFixed(4)} · ` +
                `${(100 * r.bound_share).toFixed(1)}% of the bound · cost ${cost}/${r.budget.toFixed(1)} · ` +
                `${r.feasible ? 'in budget' : 'OVER BUDGET'}${r.note ? ` · ${r.note}` : ''}`,
            )
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'extract') {
          const lines: string[] = []
          const items = (v as unknown as { items?: Array<{ id: string; actionType: string | null; text: string; design: { target: number | null; arms: number[] | null; n: number | null }; constructed: { ig_per_cost: number; bound_share: number; feasible: boolean; cost: number | null; budget: number }; as_written: { ig_per_cost: number; guess_rate: number } }> }).items ?? []
          const skipped = (v as unknown as { skipped?: Array<{ id: string; text: string; reason: string }> }).skipped ?? []
          const recorded = (v as unknown as { recorded?: string[] }).recorded ?? []
          lines.push(
            `Action objects: ${items.length} measurable · ${skipped.length} not covered by this metric` +
              (recorded.length > 0 ? ` · recorded: ${recorded.join(', ')}` : ''),
          )
          for (const item of items) {
            const e = item.constructed
            const cost = e.cost === null ? 'n/a' : e.cost.toFixed(2)
            lines.push(
              `  ${item.id}  ${item.actionType ?? '?'} → target ${item.design.target}, arms [${(item.design.arms ?? []).join(',')}], seeds ${item.design.n}` +
                `  ·  ${(100 * e.bound_share).toFixed(1)}% of the bound · cost ${cost}/${e.budget.toFixed(1)} · ${e.feasible ? 'in budget' : 'OVER BUDGET'}` +
                `  ·  as written ${item.as_written.ig_per_cost.toFixed(4)} (executor invents ${(100 * item.as_written.guess_rate).toFixed(0)}%)`,
            )
          }
          for (const item of skipped.slice(0, 5)) {
            lines.push(`  ${item.id}  skipped — ${item.reason}`)
          }
          return [{ type: 'text' as const, text: lines.join('\n') }]
        }
        if (v.action === 'prompt' && v.prompt) {
          return [
            {
              type: 'text' as const,
              text: `Prompt for ${v.level} (${v.summary ?? ''}):\n\n${v.prompt}`,
            },
          ]
        }
        if (v.state && !v.evaluation) {
          return [{ type: 'text' as const, text: `Synthetic state:\n${describeState(v.state)}` }]
        }
        const e = v.evaluation
        if (!e) return [{ type: 'text' as const, text: 'Action construction returned no evaluation.' }]
        if (e.status !== 'ok') {
          return [
            {
              type: 'text' as const,
              text:
                `No usable design (parse status: ${v.parse_status ?? 'unknown'}): ` +
                `information gain 0, whole gap attributed to the resolution gap.`,
            },
          ]
        }
        const cost = e.cost === null || e.cost === undefined ? 'n/a' : e.cost.toFixed(2)
        const overBudget = e.feasible === false ? ' OVER BUDGET' : ''
        const recorded = v.action === 'record' ? `\nrecorded → ${v.path ?? ''}` : ''
        return [
          {
            type: 'text' as const,
            text:
              `IG/cost ${(e.ig_per_cost ?? 0).toFixed(4)} · ` +
              `${(100 * (e.bound_share ?? 0)).toFixed(1)}% of the bound · ` +
              `compliant ${(e.compliant ?? 0).toFixed(3)} · ` +
              `cost ${cost} vs budget ${e.budget?.toFixed(1)}${overBudget} · ` +
              `executor invents ${(100 * (e.guess_rate ?? 0)).toFixed(0)}% of the design · ` +
              `gap: pointer ${(e.pointer_gap ?? 0).toFixed(4)} / resolution ${(e.resolution_gap ?? 0).toFixed(4)}` +
              recorded,
          },
        ]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const a = (args ?? {}) as Record<string, unknown>
      const action = String(a.action ?? 'evaluate')
      const level = String(a.level ?? 'L3')
      const workspace = resolveWorkspace(exec?.agent)
      try {
        if (!AC_LEVELS.includes(level as (typeof AC_LEVELS)[number])) {
          return fail(`Unknown level "${level}".`, { allowed: [...AC_LEVELS] })
        }
        const allowed = ['prompt', 'evaluate', 'sample', 'state', 'set_state', 'record', 'report', 'extract']
        if (!allowed.includes(action)) return fail(`Unknown action "${action}".`, { allowed })

        /* ── `state` / `set_state`: the state this workspace scores against ── */
        if (action === 'state') {
          const state = acReadState(workspace)
          if (!state) {
            return losslessJson({
              ok: true,
              action,
              configured: false,
              path: ACTION_STATE_FILE,
              hint:
                'No action state yet. Write one with action="set_state" and a `state` object ' +
                '({question, method, partial_results, mechanisms[6], arms[6], prior[6], budget, truth?}) ' +
                'so the next experiment can be measured instead of just named.',
            }) as unknown as Record<string, JsonValue>
          }
          return losslessJson({ ok: true, action, configured: true, path: ACTION_STATE_FILE, state }) as unknown as Record<string, JsonValue>
        }
        if (action === 'set_state') {
          if (a.state === undefined) {
            return fail('`set_state` needs a `state` object.', { path: ACTION_STATE_FILE })
          }
          const path = acWriteState(workspace, a.state)
          return losslessJson({
            ok: true,
            action,
            path,
            state: acReadState(workspace),
            next: 'Use action="prompt" to get the L3 prompt, then action="record" to log the evaluation.',
          }) as unknown as Record<string, JsonValue>
        }
        if (action === 'report') {
          const summary = acSummariseRecords(workspace)
          return losslessJson({
            ok: true,
            action,
            path: ACTION_LOG_FILE,
            count: summary.count,
            inBudget: summary.inBudget,
            latest: summary.latest,
            recent: acReadRecords(workspace, 5),
          }) as unknown as Record<string, JsonValue>
        }
        if (action === 'sample') {
          const state = acSampleState(Number(a.state_index ?? 0), Number(a.seed ?? 11))
          return losslessJson({
            ok: true,
            action,
            state,
            note:
              'Synthetic panel state — good for a demo, but `record` and the experiment gate ' +
              'expect the workspace state (action="set_state").',
          }) as unknown as Record<string, JsonValue>
        }

        /* ── state resolution: explicit > workspace > synthetic ── */
        let state: AcState | null = null
        let source = ''
        if (a.state !== undefined) {
          state = acNormaliseState(a.state)
          source = 'argument'
        } else {
          state = acReadState(workspace)
          source = state ? ACTION_STATE_FILE : ''
        }
        if (!state) {
          if (a.state_index !== undefined) {
            state = acSampleState(Number(a.state_index), Number(a.seed ?? 11))
            source = 'synthetic panel'
          } else {
            return fail(
              `No state to score against: this workspace has no ${ACTION_STATE_FILE}.`,
              {
                fix: 'Write one with action="set_state" (recommended), pass `state` explicitly, ' +
                  'or pass `state_index` to try a synthetic state.',
              },
            )
          }
        }

        if (action === 'extract') {
          // Build action objects from actions that already exist in the workspace.  This is
          // the path that works before the decision layer exists: plan steps and proposals
          // are actions already, they are just not written in a measurable form.
          const fromActions = Array.isArray(a.actions)
            ? (a.actions as unknown[]).map((x) => `- [ ] ${String(x)}`).join('\n')
            : ''
          let fromPlan = ''
          let planPath = ''
          if (a.plan !== undefined) {
            planPath = String(a.plan)
            const full = isAbsolute(planPath) ? planPath : join(workspace, planPath)
            if (!existsSync(full)) {
              return fail(`Plan not found: ${planPath}`, { workspace })
            }
            fromPlan = readFileSync(full, 'utf8')
          }
          const fromText = a.text !== undefined ? String(a.text) : ''
          const markdown = [fromPlan, fromText, fromActions].filter(Boolean).join('\n')
          if (!markdown.trim()) {
            return fail('`extract` needs `plan` (a Markdown file), `text` (Markdown) or `actions`.')
          }
          const candidates = acExtractCandidates(markdown, planPath || 'actions')
          const constructed = acConstructFromCandidates(state, candidates)
          const byId = new Map(constructed.map((item) => [item.candidate.id, item]))

          let recorded: string[] = []
          if (a.record === true) {
            const requested = Array.isArray(a.ids) ? (a.ids as unknown[]).map(String) : []
            const selected = requested.length > 0
              ? requested.filter((id) => byId.has(id))
              : [...byId.values()].filter((item) => item.constructed.feasible).slice(0, 1).map((i) => i.candidate.id)
            for (const id of selected) {
              const item = byId.get(id)
              if (!item) continue
              acAppendRecord(
                workspace,
                acToRecord(item.constructed, {
                  level,
                  answer: item.candidate.text,
                  design: item.design,
                  note: `${item.candidate.id}: ${item.candidate.text.slice(0, 80)}`,
                }),
              )
              recorded.push(id)
            }
          }

          return losslessJson({
            ok: true,
            action,
            level,
            source,
            plan: planPath || null,
            candidates: candidates.length,
            measurable: constructed.length,
            items: constructed.map((item) => ({
              id: item.candidate.id,
              text: item.candidate.text,
              actionType: item.candidate.actionType,
              confidence: item.candidate.confidence,
              calls: item.candidate.calls,
              materialisedFrom: item.materialisedFrom ?? null,
              design: item.design,
              as_written: item.asWritten,
              constructed: item.constructed,
              note: acExplainConstruction(item),
            })),
            skipped: candidates
              .filter((c) => !c.measurable)
              .map((c) => ({ id: c.id, text: c.text, reason: c.reason ?? 'not an ablation-design action' })),
            recorded,
            hint:
              'Review the constructed objects (target/arms/seeds), edit the ones you disagree ' +
              'with, then run. `record: true` logs the selected ids so the experiment gate can ' +
              'see them.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'prompt') {
          return losslessJson({
            ok: true,
            action,
            level,
            source,
            summary: acLevelSummary(level as (typeof AC_LEVELS)[number]),
            prompt: acBuildPrompt(state, level as (typeof AC_LEVELS)[number]),
            state,
          }) as unknown as Record<string, JsonValue>
        }

        /* ── evaluate / record ── */
        if (a.answer === undefined && a.design === undefined) {
          return fail('`evaluate`/`record` need either `answer` (raw text) or `design` (structured).', {
            hint: 'Use action="prompt" first to see what the agent is asked to write.',
          })
        }
        const structured = a.design as AcDesign | undefined
        const answered = a.answer !== undefined
        const evaluation = answered
          ? acEvaluateAnswer(state, String(a.answer), level)
          : acEvaluateDesign(state, (structured ?? null) as AcDesign | null)

        if (action === 'record') {
          const record = acToRecord(evaluation, {
            level,
            answer: answered ? String(a.answer) : null,
            design: structured ?? null,
            ...(a.note !== undefined ? { note: String(a.note) } : {}),
          })
          const path = acAppendRecord(workspace, record)
          return losslessJson({
            ok: true,
            action,
            level,
            source,
            path,
            state,
            evaluation,
            record,
          }) as unknown as Record<string, JsonValue>
        }

        return losslessJson({
          ok: true,
          action: 'evaluate',
          level,
          source,
          state,
          evaluation,
          parse_status: 'parse_status' in evaluation ? evaluation.parse_status : 'direct',
        }) as unknown as Record<string, JsonValue>
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string; level?: string }
      return {
        card: 'generic',
        title: `Action construction · ${a.action ?? 'evaluate'} ${a.level ?? ''}`.trim(),
        kind: 'execute',
      }
    },
  })

  /* ── Research IR Kernel（v0.5.6，dev-notes/v0.5.6-ResearchIR.md）────── */
  const irTool = defineTool({
    name: IR_TOOL,
    description:
      'Work with the Research IR — the typed, machine-facing representation that sits between ' +
      'research decisions and execution (IR Kernel). Markdown stays the user interface; the IR is ' +
      'what the kernel validates and constrains.\n' +
      'An IR holds: research identity, question, hypotheses, a *typed* decision (closed set: ' +
      DECISION_TYPES.join(' | ') +
      '), the plan (execution projection) and evidence requirements, plus provenance.\n' +
      'Actions:\n' +
      '- `propose`: submit an IR proposal. It passes three validation layers (structural R0xx, ' +
      'scientific-structure R1xx, transition R2xx) and is saved as `IR###` only when valid. ' +
      'Invalid proposals return structured errors, each with a `repair` hint — fix and re-propose.\n' +
      '- `validate`: validate without saving (the repair loop).\n' +
      '- `delta`: apply an incremental change to an existing IR ({change, target, operations[], ' +
      'reason?}); a new revision is recorded and the old one archived — never overwritten.\n' +
      '- `transition`: execution → evidence → state: record which evidence satisfies which ' +
      'requirements (`satisfies`), which plan steps completed (`completed`), claim adjudications ' +
      '(`claims`). Illegal transitions are refused (claim supported without evidence, requirement ' +
      'satisfied by unknown evidence, completed step without artifact, stale revision).\n' +
      '- `coverage`: required evidence vs produced evidence (computable, not vibes).\n' +
      '- `trace`: the decision trace — state chain S### with parent links, IR revisions, evidence.\n' +
      '- `show` / `list`: read one IR (optionally an archived revision) / list IRs.\n' +
      'What this tool deliberately does NOT do: it never edits `research-state.md` (the ' +
      'user-controlled state keeps its propose/accept gate) and it never deletes history.',
    parameters: {
      action: {
        type: 'string',
        description: 'One of: propose | validate | delta | transition | coverage | trace | show | list.',
        enum: ['propose', 'validate', 'delta', 'transition', 'coverage', 'trace', 'show', 'list'],
      },
      ir: {
        type: 'object',
        additionalProperties: true,
        description:
          'For `propose`/`validate`: the IR proposal — {research:{key,title}, question:{statement}, ' +
          'hypotheses:[{id,statement,observableOutcome?}], decision:{type,objective,alternatives,' +
          'selected,rationale,baseline?,metric?,...}, plan:{steps:[{id,action,artifact?}]}, ' +
          'evidenceRequirements:[{id,type,description,step?}]}. Types: ' +
          EVIDENCE_REQUIREMENT_TYPES.join(' | ') +
          '. ids are assigned automatically when omitted.',
      },
      id: { type: 'string', description: 'IR id (`IR001`) for `delta` / `transition` / `coverage` / `show`.' },
      delta: {
        type: 'object',
        additionalProperties: true,
        description:
          'For `delta`: {change: string, target: string, operations: [{add|update|remove, items?}], ' +
          'reason?}. Targets: research · question · decision · plan · hypotheses · ' +
          'evidence_requirements · plan.steps, or an element like `hypotheses.H01`. Object targets: ' +
          'add=new fields, update=existing fields, remove=fields. Array targets use `items` to ' +
          'append/merge elements and `remove` for ids.',
      },
      revision: {
        type: 'number',
        description:
          'For `transition`: the IR revision you are working from (mismatch → refused, so a stale ' +
          'update cannot overwrite newer work). For `show`: which archived revision to read.',
      },
      decision_id: {
        type: 'string',
        description: 'For `propose`/`transition`: the decision id (`D001`) this belongs to (provenance).',
      },
      satisfies: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
        description: 'For `transition`: [{requirement: "ER01", evidence: "E001"}] — evidence satisfying IR requirements.',
      },
      completed: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
        description: 'For `transition`: [{step: "step-1", artifact: "experiments/x/results/main.json"}] — completed plan steps.',
      },
      claims: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
        description: 'For `transition`: [{claim: "C001", status: "supported"}] — claim adjudications (needs backing evidence).',
      },
      skill: { type: 'string', description: 'For `propose`: provenance — the skill that produced this IR.' },
      state_id: { type: 'string', description: 'For `propose`: provenance — the state it was decided under (`S001`).' },
      agent: { type: 'string', description: 'For `transition`: who executed it (recorded in provenance).' },
      note: { type: 'string', description: 'Free-form note kept in provenance / trace.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          ok?: boolean
          error?: string
          action?: string
          note?: string
          ir?: { id?: string; revision?: number; decision?: { type?: string } }
          validation?: { status?: string; errors?: Array<{ code: string; field: string; message: string; repair: string }>; warnings?: unknown[] }
          errors?: Array<{ code: string; field: string; message: string; repair: string }>
          applied?: string[]
          coverage?: number
          required?: number
          satisfied?: number
          count?: number
          state?: { stateId?: string }
          trace?: { stateId?: string; summary?: string }
        }
        if (v.ok === false) {
          const errs = v.errors ?? v.validation?.errors ?? []
          const lines = errs.map((e) => `[${e.code}] ${e.field}: ${e.message} → repair: ${e.repair}`)
          return [
            {
              type: 'text' as const,
              text: `${v.action ?? 'research_ir'} failed${v.error ? `: ${v.error}` : ''}\n${lines.join('\n')}${v.note ? `\n${v.note}` : ''}`,
            },
          ]
        }
        if (v.action === 'coverage') {
          return [
            {
              type: 'text' as const,
              text: `Evidence coverage: ${v.satisfied ?? 0}/${v.required ?? 0} requirements satisfied (${v.coverage ?? 0}).`,
            },
          ]
        }
        if (v.action === 'trace') return [{ type: 'text' as const, text: `Decision trace: ${v.count ?? 0} transition(s).` }]
        if (v.action === 'validate') {
          const st = v.validation?.status ?? '?'
          const warn = v.validation?.warnings?.length ?? 0
          return [{ type: 'text' as const, text: `Validation: ${st}${warn ? ` · ${warn} warning(s)` : ''}` }]
        }
        if (v.action === 'transition') {
          return [
            {
              type: 'text' as const,
              text: `State ${v.state?.stateId ?? ''} recorded · ${v.trace?.summary ?? ''}`,
            },
          ]
        }
        if (v.ir?.id) {
          return [
            {
              type: 'text' as const,
              text: `IR ${v.ir.id} r${v.ir.revision ?? 1} (${v.ir.decision?.type ?? '—'}) · validation ${v.validation?.status ?? 'valid'}${v.applied?.length ? ` · applied: ${v.applied.join(', ')}` : ''}${v.note ? `\n${v.note}` : ''}`,
            },
          ]
        }
        return [{ type: 'text' as const, text: `${v.count ?? 0} IR(s).` }]
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const ws = resolveWorkspace(exec?.agent)
      const a = (args ?? {}) as Record<string, unknown>
      const action = String(a.action ?? '')

      try {
        if (action === 'list') {
          const items = listIRs(ws)
          return losslessJson({ ok: true, action, count: items.length, irs: items }) as unknown as Record<string, JsonValue>
        }

        if (action === 'show') {
          const id = String(a.id ?? '').trim().toUpperCase()
          const rev = typeof a.revision === 'number' ? a.revision : undefined
          const current = readIR(ws, id)
          // 当前修订就在 IR###.json；只有历史修订才去 .history/ 找
          const ir =
            rev === undefined ? current : current?.revision === rev ? current : readIRRevision(ws, id, rev ?? 0)
          if (!ir) return fail(`找不到 IR \`${id}\`${rev !== undefined ? ` 修订 r${rev}` : ''}。`, { action })
          return losslessJson({
            ok: true,
            action,
            ir,
            revisions: listIRRevisions(ws, id),
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'validate') {
          if (!a.ir) return fail('`validate` 需要 `ir` 对象。', { action })
          const { ir, report } = parseIR(a.ir)
          return losslessJson({
            ok: report.status === 'valid',
            action,
            validation: report,
            ir,
            ...(report.status === 'failed' ? { note: 'Not saved — fix the errors (each carries a `repair` hint) and re-submit.' } : {}),
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'propose') {
          if (!a.ir) return fail('`propose` 需要 `ir` 对象。', { action })
          const base = normalizeIR(a.ir)
          const candidate = {
            ...base,
            id: '',
            revision: 1,
            provenance: {
              createdAt: new Date().toISOString(),
              ...(a.skill ? { skill: String(a.skill) } : {}),
              ...(a.decision_id ? { decisionId: String(a.decision_id) } : {}),
              ...(a.state_id ? { stateId: String(a.state_id) } : {}),
              source: 'proposal' as const,
              ...(a.note ? { note: String(a.note) } : {}),
            },
          }
          const { report } = parseIR(candidate)
          if (report.status === 'failed') {
            return losslessJson({
              ok: false,
              action,
              validation: report,
              note: 'IR not saved — fix the errors (each carries a `repair` hint) and re-propose.',
            }) as unknown as Record<string, JsonValue>
          }
          const saved = saveIR(ws, candidate)
          if (isIRWriteError(saved)) return fail(saved.error, { action })
          return losslessJson({
            ok: true,
            action,
            ir: { id: saved.id, revision: saved.revision, decision: { type: saved.decision.type } },
            validation: report,
            note: 'IR recorded. Intent is now typed — execution follows the plan projection.',
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'delta') {
          const id = String(a.id ?? '').trim().toUpperCase()
          const current = readIR(ws, id)
          if (!current) return fail(`找不到 IR \`${id}\`。`, { action })
          if (!a.delta) return fail('`delta` 需要 `delta` 对象。', { action })
          const delta = a.delta as IRDelta
          const res = applyDelta(current, delta)
          if (!res.ok) {
            return losslessJson({
              ok: false,
              action,
              errors: res.errors,
              note: 'Delta rejected — IR unchanged. Fix the errors and retry.',
            }) as unknown as Record<string, JsonValue>
          }
          const saved = saveIR(ws, res.ir)
          if (isIRWriteError(saved)) return fail(saved.error, { action })
          return losslessJson({
            ok: true,
            action,
            ir: { id: saved.id, revision: saved.revision, decision: { type: saved.decision.type } },
            applied: res.applied,
            delta: summarizeDelta(delta),
            validation: res.report,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'transition') {
          const id = String(a.id ?? '').trim().toUpperCase()
          const input: TransitionInput = {
            irId: id,
            ...(typeof a.revision === 'number' ? { revision: a.revision } : {}),
            ...(a.decision_id ? { decisionId: String(a.decision_id) } : {}),
            ...(Array.isArray(a.satisfies) ? { satisfies: a.satisfies as TransitionInput['satisfies'] } : {}),
            ...(Array.isArray(a.completed) ? { completed: a.completed as TransitionInput['completed'] } : {}),
            ...(Array.isArray(a.claims) ? { claims: a.claims as TransitionInput['claims'] } : {}),
            ...(a.agent ? { agent: String(a.agent) } : {}),
            ...(a.note ? { note: String(a.note) } : {}),
          }
          const res = applyTransition(ws, input)
          if (!res.ok) {
            return losslessJson({
              ok: false,
              action,
              errors: res.errors,
              note: 'Transition refused — state unchanged. Fix the errors and retry.',
            }) as unknown as Record<string, JsonValue>
          }
          return losslessJson({
            ok: true,
            action,
            state: { stateId: res.state.stateId, parentStateId: res.state.parentStateId ?? null },
            ir: { id: res.ir.id, revision: res.ir.revision, decision: { type: res.ir.decision.type } },
            trace: res.trace,
          }) as unknown as Record<string, JsonValue>
        }

        if (action === 'coverage') {
          const id = String(a.id ?? '').trim().toUpperCase()
          const cov = evidenceCoverage(ws, id)
          if (!cov.ok) return fail(cov.error, { action })
          return losslessJson({ action, ...cov }) as unknown as Record<string, JsonValue>
        }

        if (action === 'trace') {
          const trace = readTrace(ws)
          const states = listStates(ws).map((s) => ({
            stateId: s.stateId,
            parentStateId: s.parentStateId ?? null,
            irId: s.irId,
            irRevision: s.irRevision,
            decisionId: s.decisionId ?? null,
            evidence: s.evidence,
          }))
          return losslessJson({ ok: true, action, count: trace.length, states, trace }) as unknown as Record<string, JsonValue>
        }

        return fail(`Unknown action "${action}".`, {
          action,
          allowed: ['propose', 'validate', 'delta', 'transition', 'coverage', 'trace', 'show', 'list'],
        })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e), { action })
      }
    },
    presentCall: (args) => {
      const a = args as { action?: string }
      return { card: 'generic', title: `Research IR · ${a.action ?? 'show'}`, kind: 'execute' }
    },
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
    paperDownloadTool as ToolDefinition,
    paperLatexTool as ToolDefinition,
    actionConstructionTool as ToolDefinition,
    diagramTool as ToolDefinition,
    irTool as ToolDefinition,
  ]
}

/**
 * 从 Markdown 参考文献列表解析 `\bibitem` 条目。
 *
 * 支持 v2 论文里常见的写法：
 *   - `- [smith2024] A. Smith, "Title," Venue, 2024.`
 *   - `[1] A. Smith, ...`（数字引用 → 键 `ref1`，并建 numberToKey 映射）
 *   - `- **[smith2024]** ...`
 */
export function parseBibEntries(text: string): { entries: BibEntry[]; numberToKey: Record<string, string> } {
  const entries: BibEntry[] = []
  const numberToKey: Record<string, string> = {}
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    line = line.replace(/^[-*+]\s+/, '') // 列表标记
    line = line.replace(/\*\*/g, '') // 粗体包裹（`**[key]**`）
    const m = line.match(/^\[([A-Za-z0-9_:\-.]+)\]\s*(.+)$/)
    if (!m) continue
    let key = m[1]
    const body = m[2].replace(/^\*\*|\*\*$/g, '').trim()
    if (!body) continue
    if (/^\d+$/.test(key)) {
      const num = key
      key = `ref${num}`
      numberToKey[num] = key
    }
    if (seen.has(key)) continue
    seen.add(key)
    // thebibliography 非表格环境：作者列表里的 & / % / # 必须转义，否则
    // "Misplaced alignment tab character &" 之类的编译错误。
    // `_` 同理且更容易漏：DOI 里下划线是常态（如 `10.1162/tacl_a_00754`），
    // 不转义会直接报 "Missing $ inserted"，整篇编译失败。
    const safeText = body
      .replace(/\s+/g, ' ')
      .replace(/(?<!\\)&/g, '\\&')
      .replace(/(?<!\\)%/g, '\\%')
      .replace(/(?<!\\)#/g, '\\#')
      .replace(/(?<!\\)_/g, '\\_')
    entries.push({ key, text: safeText })
  }
  return { entries, numberToKey }
}

/**
 * 把 `paper.md` 组装成 {@link ComposeInput}。
 *
 * 取 `# 标题` 作 title，`## Abstract` 作 abstract，`## References` 作参考文献，
 * 其余章节按原顺序进入正文（v2 论文含 Results / Discussion，模板按需生成 `\section`）。
 */
/**
 * 从 `metadata.md` 读论文的作者块信息（authors / affiliation / keywords）。
 *
 * 为什么需要它：论文正文（`paper.md`）里**没有**作者声明的位置，作者属于元数据。
 * 不读 metadata，模板就永远渲染默认的 "Authors / Affiliation" —— 论文能编译、
 * 能读，署名却是空的，属于典型的事后才发现型缺陷。
 */
export function readPaperMeta(
  paperDir: string,
): { authors?: string; affiliation?: string; keywords?: string[] } {
  const p = join(paperDir, PAPER_FILES.metadata)
  if (!existsSync(p)) return {}
  const fm = parseFrontmatter(readFileSync(p, 'utf8'))
  const keywords = (fm.keywords ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    ...(fm.authors ? { authors: fm.authors } : {}),
    ...(fm.affiliation ? { affiliation: fm.affiliation } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
  }
}

export function buildComposeInput(
  source: string,
  template: string,
  meta: { authors?: string; affiliation?: string; keywords?: string[] } = {},
): ComposeInput {
  const body = stripFrontmatter(source)
  const parsed = parseSections(body)
  /**
   * 后置章节按**前缀**取：论文里常写成 `## Abstract`、`## References (to be compiled ...)`，
   * `findSection` 是全等匹配，会漏掉带说明文字的那种（实测漏过 References）。
   */
  const backMatter = (names: string[]): string =>
    parsed.sections.find((s) => names.some((n) => s.title.trim().toLowerCase().startsWith(n)))?.body ?? ''
  const abstract = backMatter(['abstract'])
  const references = backMatter(['references', 'bibliography'])
  const isBackMatter = (title: string): boolean => /^(abstract|references|bibliography)\b/i.test(title.trim())
  const sections = parsed.sections.filter((s) => !isBackMatter(s.title))
  const bib = parseBibEntries(references)

  return {
    template: normalizeTemplate(template),
    title: parsed.title ?? 'Untitled',
    // 作者信息来自 `metadata.md` —— 论文正文里没有作者块的位置。
    // 此前这里不读任何来源，模板于是永远渲染默认的 "Authors / Affiliation"：
    // 论文能编译、能读，署名却是空的，属于典型的"事后才发现"缺陷。
    ...(meta.authors ? { authors: meta.authors } : {}),
    ...(meta.affiliation ? { affiliation: meta.affiliation } : {}),
    ...(meta.keywords && meta.keywords.length > 0 ? { keywords: meta.keywords } : {}),
    abstract,
    sections,
    bibliography: bib.entries,
    knownKeys: bib.entries.map((e) => e.key),
    numberToKey: bib.numberToKey,
  }
}

/** 供测试/调试：Open Questions（不经过工具层）。 */
export { openQuestions }
