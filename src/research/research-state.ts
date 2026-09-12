/**
 * ConvFusion 2.0 — Research State（Stage 4 核心）
 *
 * ## Research State 是什么（§12 / §13）
 *
 * > **当前整个研究对象的可持续、可更新状态表示。**
 *
 * 它是**状态空间**（Problem / Knowledge / Innovation / Method / Experiment / Evidence …），
 * **不是** Workflow State Machine —— 维度可以一直存在、反复变化、被否定重提。
 * 因此本模块的类型里**没有** `currentStage` / `next` / `progress` 之类字段。
 *
 * ## 三条硬约束
 *
 * 1. **允许不完整**（§14）：科研不是线性完成。未涉及的维度**不出现**即可，
 *    绝不为了让文档"看起来完整"而编造内容。
 * 2. **不是 Harness Session 的聊天总结**（§16）：Session 记的是"一次 Agent 交互"，
 *    Research State 记的是"研究项目当前的科研理解"。两者只通过 provenance 引用相连。
 * 3. **不删除性覆盖**（§22 / §42 Historical Integrity）：每次 Apply 都先归档旧版本到
 *    `research/state-history/`，历史可回答"当时为什么这样判断"。
 *
 * ## State Update 的人工控制点（§20 / §21）
 *
 * Agent **不直接改**长期研究状态，而是提出 {@link StateUpdateProposal}，
 * 由用户 `Accept / Edit / Reject`。无论走哪条路，都保留
 * **who / when / based on what**（§21）。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MATURITY_DIMENSIONS,
  MATURITY_LEVELS,
  RESEARCH_DIR,
  RESEARCH_STATE_FILE,
  STATE_DIMENSIONS,
  STATE_HISTORY_DIR,
  PROPOSALS_DIR,
  type MaturityDimension,
  type MaturityLevel,
  type ResearchStateDocument,
  type StateDimension,
  type StateUpdateProposal,
  type StateUpdateRecord,
} from './research-data.js'
import { findSection, parseListItems, parseFrontmatter, parseSections, renderFrontmatter, renderSections, stripFrontmatter } from './markdown.js'
import { listEvidence } from './evidence.js'
import { listClaims } from './claims.js'

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 序列化
 * ════════════════════════════════════════════════════════════════════════ */

function normalizeMaturity(raw: string | undefined): MaturityLevel {
  const v = (raw ?? '').trim()
  const hit = MATURITY_LEVELS.find((l) => l.toLowerCase() === v.toLowerCase())
  return hit ?? 'Unknown'
}

/** 从正文提取各维度（按 §17 的 `## <Dimension>` 结构）。 */
function extractDimensions(sections: Array<{ title: string; body: string }>): Partial<Record<StateDimension, string>> {
  const out: Partial<Record<StateDimension, string>> = {}
  for (const d of STATE_DIMENSIONS) {
    const body = findSection(sections, d)
    // ⚠️ 只收**有实质内容**的维度：空章节 / 占位注释不算"已建立"，
    // 否则 §14「允许不完整」会被一堆空标题伪装成"完整"。
    const cleaned = body.replace(/<!--[\s\S]*?-->/g, '').trim()
    if (cleaned) out[d] = cleaned
  }
  return out
}

/** 解析 Research State（不存在 → null）。 */
export function parseResearchState(absPath: string, relPath: string): ResearchStateDocument | null {
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source).trim()
  const parsed = parseSections(body)

  const maturity = {} as Record<MaturityDimension, MaturityLevel>
  for (const m of MATURITY_DIMENSIONS) {
    maturity[m] = normalizeMaturity(fm[`maturity_${m.toLowerCase()}`] ?? fm[m.toLowerCase()])
  }

  return {
    version: fm.version || '1',
    dimensions: extractDimensions(parsed.sections),
    maturity,
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    body,
    path: absPath,
    relPath,
  }
}

/** 序列化 Research State。 */
export function serializeResearchState(input: {
  version: string
  dimensions: Partial<Record<StateDimension, string>>
  maturity: Record<MaturityDimension, MaturityLevel>
  createdAt?: string
  updatedAt?: string
  /** 不写进文件的提示（如未建立维度），仅用于返回值。 */
  extraSections?: Array<{ title: string; body: string }>
}): string {
  const maturityFields: Record<string, string> = {}
  for (const m of MATURITY_DIMENSIONS) {
    maturityFields[`maturity_${m.toLowerCase()}`] = input.maturity[m]
  }
  const front = renderFrontmatter({
    name: 'Research State',
    type: 'research-state',
    version: input.version,
    ...maturityFields,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })

  // 只渲染**有内容**的维度 —— 不制造空章节（§14）
  const sections: Array<{ title: string; body: string }> = []
  for (const d of STATE_DIMENSIONS) {
    const body = input.dimensions[d]
    if (body && body.trim()) sections.push({ title: d, body })
  }
  for (const s of input.extraSections ?? []) sections.push(s)

  return `${front}\n\n${renderSections('Research State', sections)}`
}

/* ════════════════════════════════════════════════════════════════════════
 * 读写
 * ════════════════════════════════════════════════════════════════════════ */

export interface StateWriteError {
  error: string
}
export function isStateWriteError(v: unknown): v is StateWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

/**
 * Research State 文件绝对路径（`./research-state.md`，工作区根目录）。
 *
 * §2：Research State 属于 Research Definition 层，与 `project.md` 并列；
 * 不放 `research/`（那是结构化资产：evidence / claims / decisions）。
 */
export function statePath(workspace: string): string {
  return join(workspace, RESEARCH_STATE_FILE)
}

/** 读 Research State（不存在 → null）。 */
export function loadResearchState(workspace: string): ResearchStateDocument | null {
  return parseResearchState(statePath(workspace), RESEARCH_STATE_FILE)
}

/** 空成熟度（全部 `Unknown`）。 */
export function emptyMaturity(): Record<MaturityDimension, MaturityLevel> {
  const out = {} as Record<MaturityDimension, MaturityLevel>
  for (const m of MATURITY_DIMENSIONS) out[m] = 'Unknown'
  return out
}

/**
 * 创建 Research State（§40-A Create）。
 *
 * §14：**初始状态允许几乎是空的** —— 这是正常的，不是一个待填的表格。
 */
export function createResearchState(
  workspace: string,
  input: { dimensions?: Partial<Record<StateDimension, string>>; maturity?: Partial<Record<MaturityDimension, MaturityLevel>> } = {},
): ResearchStateDocument | StateWriteError {
  const file = statePath(workspace)
  if (existsSync(file)) return { error: 'Research State 已存在，请用 applyStateUpdate 更新。' }

  const now = new Date().toISOString()
  const maturity = { ...emptyMaturity(), ...(input.maturity ?? {}) }
  const dimensions = input.dimensions ?? {}

  writeFileSync(
    file,
    serializeResearchState({ version: '1', dimensions, maturity, createdAt: now, updatedAt: now }),
    'utf8',
  )
  return parseResearchState(file, RESEARCH_STATE_FILE) ?? { error: '创建后解析失败。' }
}

/** 确保 Research State 存在（不存在则创建空状态）。 */
export function ensureResearchState(workspace: string): ResearchStateDocument | StateWriteError {
  return loadResearchState(workspace) ?? createResearchState(workspace)
}

/** 归档当前版本到 `research/state-history/`（不删除性覆盖）。 */
export function archiveStateVersion(workspace: string, doc: ResearchStateDocument, note?: string): string | undefined {
  if (!existsSync(doc.path)) return undefined
  let current: string
  try {
    current = readFileSync(doc.path, 'utf8')
  } catch {
    return undefined
  }
  const dir = join(workspace, STATE_HISTORY_DIR)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `v${doc.version.replace(/^v/i, '')}.md`)
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').replace(/^<!--\s*snapshot:[\s\S]*?-->\r?\n/, '')
    if (existing.trim() === current.trim()) return undefined
  }
  const header = note ? `<!-- snapshot: ${new Date().toISOString()} — ${note} -->\n` : ''
  writeFileSync(file, header + current, 'utf8')
  return `${STATE_HISTORY_DIR}/v${doc.version.replace(/^v/i, '')}.md`
}

/** 列出历史版本。 */
export function listStateVersions(workspace: string): Array<{ version: string; path: string }> {
  const dir = join(workspace, STATE_HISTORY_DIR)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ version: f.replace(/^v/, '').replace(/\.md$/, ''), path: `${STATE_HISTORY_DIR}/${f}` }))
      .sort((a, b) => Number(a.version) - Number(b.version))
  } catch {
    return []
  }
}

/** 读某个历史版本。 */
export function readStateVersion(workspace: string, version: string): string | undefined {
  try {
    return readFileSync(join(workspace, STATE_HISTORY_DIR, `v${version.replace(/^v/i, '')}.md`), 'utf8')
  } catch {
    return undefined
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * State Update Proposal（§20 / §21 / §40-F）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 下一个提案编号。
 *
 * ⚠️ 只统计 **S\d+.json** 形式的提案文件：目录里还有 `applied.json`（处置记录），
 * 早先按 `.json` 计数会把处置记录也算成提案，导致编号跳号。
 */
function nextProposalId(workspace: string): string {
  const dir = join(workspace, PROPOSALS_DIR)
  let max = 0
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(/^S(\d+)\.json$/)
      if (m) max = Math.max(max, Number(m[1]))
    }
  } catch {
    max = 0
  }
  return `S${String(max + 1).padStart(3, '0')}`
}

/**
 * 提出一次状态更新（§20：**Agent 不直接改长期状态**）。
 *
 * 提案是**数据**（JSON），不是文件改动 —— 只有 Apply 才会写 Research State。
 */
export function proposeStateUpdate(
  workspace: string,
  input: {
    changes: Partial<Record<StateDimension, string | null>>
    maturityChanges?: Partial<Record<MaturityDimension, MaturityLevel>>
    rationale: string
    evidence?: readonly string[]
    plan?: string
    harnessSession?: string
    actor?: 'agent' | 'user'
    confidence?: MaturityLevel
    id?: string
  },
): StateUpdateProposal {
  const proposal: StateUpdateProposal = {
    id: input.id ?? nextProposalId(workspace),
    origin: {
      actor: input.actor ?? 'agent',
      evidence: (input.evidence ?? []).map((e) => e.toUpperCase()),
      ...(input.plan ? { plan: input.plan.replace(/^plans\//, '').replace(/\.md$/, '') } : {}),
      ...(input.harnessSession ? { harnessSession: input.harnessSession } : {}),
    },
    changes: input.changes,
    maturityChanges: input.maturityChanges ?? {},
    rationale: input.rationale,
    confidence: input.confidence ?? 'Emerging',
    at: new Date().toISOString(),
  }

  const dir = join(workspace, PROPOSALS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${proposal.id}.json`), JSON.stringify(proposal, null, 2) + '\n', 'utf8')
  return proposal
}

/** 处置记录的固定文件名（与提案同目录，必须排除在提案之外）。 */
const APPLIED_LOG_FILE = 'applied.json'

/**
 * 列出**待处置**的提案。
 *
 * ⚠️ 必须排除 `applied.json`（处置记录，内容是数组）—— 早先按 `.json` 通配会把它
 * 当成一个提案，导致"已处置"的提案永远数不完。
 */
export function listStateProposals(workspace: string): StateUpdateProposal[] {
  const dir = join(workspace, PROPOSALS_DIR)
  let files: string[]
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== APPLIED_LOG_FILE)
      .sort()
  } catch {
    return []
  }
  const out: StateUpdateProposal[] = []
  for (const f of files) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, f), 'utf8')) as StateUpdateProposal)
    } catch {
      /* 损坏的提案跳过 */
    }
  }
  return out
}

/** 读一个提案。 */
export function readStateProposal(workspace: string, id: string): StateUpdateProposal | undefined {
  return listStateProposals(workspace).find((p) => p.id === id)
}

/** 处置记录目录（`research/state-proposals/applied.json`）。 */
const UPDATE_LOG = `${PROPOSALS_DIR}/${APPLIED_LOG_FILE}`

/** 读取处置历史（who / when / based on what）。 */
export function listStateUpdateLog(workspace: string): StateUpdateRecord[] {
  try {
    const raw = JSON.parse(readFileSync(join(workspace, UPDATE_LOG), 'utf8')) as StateUpdateRecord[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function appendUpdateLog(workspace: string, record: StateUpdateRecord): void {
  const log = listStateUpdateLog(workspace)
  log.push(record)
  mkdirSync(join(workspace, PROPOSALS_DIR), { recursive: true })
  writeFileSync(join(workspace, UPDATE_LOG), JSON.stringify(log, null, 2) + '\n', 'utf8')
}

/** 版本递增（整数语义：v1 → v2）。 */
export function bumpStateVersion(version: string): string {
  const n = Number(version.replace(/^v/i, ''))
  return String(Number.isFinite(n) && n > 0 ? n + 1 : 1)
}

/**
 * 应用一次状态更新（§21 `Execution → Proposal → User Review → Apply`）。
 *
 * @param action `accepted`（原样应用）/ `edited`（应用用户改过的 changes）/ `rejected`（不应用）
 */
export function applyStateUpdate(
  workspace: string,
  proposal: StateUpdateProposal,
  options: {
    action: 'accepted' | 'edited' | 'rejected'
    /** `edited` 时用户改过的实际变更。 */
    editedChanges?: Partial<Record<StateDimension, string | null>>
    by?: 'user' | 'agent'
  },
): ResearchStateDocument | StateWriteError {
  const current = ensureResearchState(workspace)
  if (isStateWriteError(current)) return current

  const fromVersion = current.version

  // rejected：不改状态，但**仍然记录**（§21 要求保留处置痕迹）
  if (options.action === 'rejected') {
    appendUpdateLog(workspace, {
      proposalId: proposal.id,
      action: 'rejected',
      at: new Date().toISOString(),
      fromVersion,
      toVersion: fromVersion,
      by: options.by ?? 'user',
    })
    return current
  }

  // 归档旧版本（不删除性覆盖）
  archiveStateVersion(workspace, current, `${options.action} ${proposal.id}`)

  const changes = options.action === 'edited' ? (options.editedChanges ?? proposal.changes) : proposal.changes

  const dimensions = { ...current.dimensions }
  for (const [dim, value] of Object.entries(changes) as Array<[StateDimension, string | null]>) {
    if (value === null) delete dimensions[dim]
    else if (value !== undefined) dimensions[dim] = value
  }
  const maturity = { ...current.maturity, ...proposal.maturityChanges }
  const toVersion = bumpStateVersion(fromVersion)

  writeFileSync(
    current.path,
    serializeResearchState({
      version: toVersion,
      dimensions,
      maturity,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    }),
    'utf8',
  )

  appendUpdateLog(workspace, {
    proposalId: proposal.id,
    action: options.action,
    at: new Date().toISOString(),
    fromVersion,
    toVersion,
    by: options.by ?? 'user',
    ...(options.action === 'edited' ? { appliedChanges: changes } : {}),
  })

  // 待处置的提案文件移除（处置记录已在 applied.json）
  try {
    rmSync(join(workspace, PROPOSALS_DIR, `${proposal.id}.json`))
  } catch {
    /* 不存在也无妨 */
  }

  const next = loadResearchState(workspace)
  return next ?? { error: '应用后解析失败。' }
}

/* ════════════════════════════════════════════════════════════════════════
 * 成熟度建议（§35 / §40-H）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 从实际存在的资产**推导**成熟度建议。
 *
 * ⚠️ 这是**建议**，不是自动写入：成熟度是对研究的定性判断，
 * 最终由用户/Agent 决定（因此返回 `suggested` 而不直接改状态）。
 *
 * 判据全部是"某类资产是否存在及其状态"，可解释、可核查 —— 不用百分比假装精度（§35）。
 */
export interface MaturitySuggestion {
  dimension: MaturityDimension
  suggested: MaturityLevel
  /** 为什么是这个层级（可核查的事实）。 */
  basis: string
}

/** 推导六个维度的成熟度建议。 */
export function suggestMaturity(workspace: string): MaturitySuggestion[] {
  const state = loadResearchState(workspace)
  const dims = state?.dimensions ?? {}
  const evidence = listEvidence(workspace)
  const claims = listClaims(workspace)

  const has = (d: StateDimension): boolean => Boolean(dims[d]?.trim())
  const established = (ids: readonly string[], pick: (e: (typeof evidence)[number]) => boolean): number =>
    evidence.filter((e) => pick(e) && ids.includes(e.id)).length

  const out: MaturitySuggestion[] = []

  // Problem
  {
    const q = has('Research Questions')
    const p = has('Problem')
    out.push({
      dimension: 'Problem',
      suggested: p && q ? 'Established' : p ? 'Emerging' : 'Unknown',
      basis: p ? (q ? 'Problem 与 Research Questions 都已写明' : '只有 Problem，尚无明确研究问题') : 'Problem 维度为空',
    })
  }
  // Knowledge
  {
    const k = has('Current Knowledge')
    const l = has('Literature')
    out.push({
      dimension: 'Knowledge',
      suggested: k && l ? 'Strong' : k || l ? 'Emerging' : 'Unknown',
      basis: `Current Knowledge=${k ? '有' : '无'}，Literature=${l ? '有' : '无'}`,
    })
  }
  // Innovation
  {
    const i = has('Innovation')
    const h = has('Hypotheses')
    out.push({
      dimension: 'Innovation',
      suggested: i && h ? 'Strong' : i ? 'Emerging' : 'Unknown',
      basis: i ? (h ? 'Innovation 与 Hypotheses 都已写明' : '有 Innovation，尚无 Hypotheses') : 'Innovation 维度为空',
    })
  }
  // Method
  {
    const m = has('Method')
    const verifiedMethod = evidence.filter((e) => e.sourceKind === 'implementation' || e.sourceKind === 'computation')
    out.push({
      dimension: 'Method',
      suggested: m ? (verifiedMethod.length > 0 ? 'Strong' : 'Emerging') : 'Unknown',
      basis: m
        ? verifiedMethod.length > 0
          ? `Method 已写明，且有 ${verifiedMethod.length} 条实现/计算证据`
          : 'Method 已写明，但尚无实现/计算证据'
        : 'Method 维度为空',
    })
  }
  // Experiment
  {
    const x = has('Experiments')
    const expEvidence = evidence.filter((e) => e.sourceKind === 'experiment')
    const anyVerified = expEvidence.some((e) => e.status === 'verified')
    out.push({
      dimension: 'Experiment',
      suggested: expEvidence.length === 0 ? 'Unknown' : anyVerified ? 'Strong' : x ? 'Emerging' : 'Weak',
      basis:
        expEvidence.length === 0
          ? '尚无实验类证据'
          : `${expEvidence.length} 条实验证据${anyVerified ? '，其中已验证' : '，尚未验证'}`,
    })
  }
  // Evidence
  {
    const verified = evidence.filter((e) => e.status === 'verified').length
    const supported = evidence.filter((e) => e.status === 'supported').length
    const linked = claims.filter((c) => c.evidence.length > 0).length
    const level: MaturityLevel =
      verified > 0 && linked > 0
        ? verified >= 3
          ? 'Established'
          : 'Strong'
        : supported > 0 || verified > 0
          ? 'Emerging'
          : evidence.length > 0
            ? 'Weak'
            : 'Unknown'
    out.push({
      dimension: 'Evidence',
      suggested: level,
      basis: `${evidence.length} 条证据（verified ${verified} / supported ${supported}）；${linked}/${claims.length} 个 Claim 已关联证据`,
    })
  }

  void established
  return out
}

/** 把成熟度建议写回 Research State（需显式调用 —— 不自动应用）。 */
export function applyMaturitySuggestions(
  workspace: string,
  suggestions: readonly MaturitySuggestion[],
): ResearchStateDocument | StateWriteError {
  const current = ensureResearchState(workspace)
  if (isStateWriteError(current)) return current
  archiveStateVersion(workspace, current, 'apply maturity suggestions')
  const maturity = { ...current.maturity }
  for (const s of suggestions) maturity[s.dimension] = s.suggested
  writeFileSync(
    current.path,
    serializeResearchState({
      version: bumpStateVersion(current.version),
      dimensions: current.dimensions,
      maturity,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    }),
    'utf8',
  )
  return loadResearchState(workspace) ?? { error: '写入后解析失败。' }
}

/* ════════════════════════════════════════════════════════════════════════
 * 供 Research Context / 推荐消费（§25 / §26 / §40-G）
 * ════════════════════════════════════════════════════════════════════════ */

/** Open Questions（§24 / §40-G）—— 后续 Skill / Plan 推荐的重要输入。 */
export function openQuestions(workspace: string): string[] {
  const state = loadResearchState(workspace)
  const raw = state?.dimensions['Open Questions']
  if (!raw) return []
  return parseListItems(raw)
}

/** Risks（§13 维度之一）。 */
export function risks(workspace: string): string[] {
  const state = loadResearchState(workspace)
  const raw = state?.dimensions['Risks']
  if (!raw) return []
  return parseListItems(raw)
}

/**
 * 结构化索引（§18：`Index = System Retrieval Representation`）。
 *
 * ⚠️ 索引**不取代** Markdown Research State（§18 原则）。它只是给系统做检索/推荐用的
 * 派生视图，随时可以从 Markdown 重建 —— 因此本函数返回**计算结果**，
 * 是否落盘由调用方决定（{@link writeResearchIndex}）。
 */
export interface ResearchIndex {
  /** 生成时刻。 */
  generatedAt: string
  stateVersion: string
  /** 维度 → 是否有实质内容（不做内容复制，避免成为第二事实来源）。 */
  dimensions: Record<string, boolean>
  maturity: Record<MaturityDimension, MaturityLevel>
  claims: Array<{ id: string; status: string; evidence: string[]; contradictions: string[] }>
  evidence: Array<{ id: string; status: string; sourceKind: string; supports: string[]; contradicts: string[] }>
  openQuestions: string[]
  /** 未被任何证据支撑的 Claim（Paper 最该补的地方）。 */
  unsupportedClaims: string[]
  /** 有矛盾证据的 Claim（Paper 最该讨论的地方）。 */
  contestedClaims: string[]
  /** 没有原始产物引用的 Evidence（§30：provenance 不完整）。 */
  evidenceWithoutRawArtifact: string[]
}

/** 构建索引（纯计算）。 */
export function buildResearchIndex(workspace: string): ResearchIndex {
  const state = loadResearchState(workspace)
  const evidence = listEvidence(workspace)
  const claims = listClaims(workspace)

  const dimensions: Record<string, boolean> = {}
  for (const d of STATE_DIMENSIONS) dimensions[d] = Boolean(state?.dimensions[d]?.trim())

  return {
    generatedAt: new Date().toISOString(),
    stateVersion: state?.version ?? '0',
    dimensions,
    maturity: state?.maturity ?? emptyMaturity(),
    claims: claims.map((c) => ({
      id: c.id,
      status: c.status,
      evidence: c.evidence,
      contradictions: c.contradictions,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      status: e.status,
      sourceKind: e.sourceKind,
      supports: e.supports,
      contradicts: e.contradicts,
    })),
    openQuestions: openQuestions(workspace),
    unsupportedClaims: claims.filter((c) => c.evidence.length === 0).map((c) => c.id),
    contestedClaims: claims.filter((c) => c.contradictions.length > 0).map((c) => c.id),
    evidenceWithoutRawArtifact: evidence
      .filter((e) => e.provenance.rawArtifacts.length === 0 && e.status !== 'rejected')
      .map((e) => e.id),
  }
}

/** 把索引写到 `research/index.json`（派生视图，可随时重建）。 */
export function writeResearchIndex(workspace: string): ResearchIndex {
  const index = buildResearchIndex(workspace)
  const dir = join(workspace, RESEARCH_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
  return index
}
