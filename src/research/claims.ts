/**
 * ConvFusion 2.0 — Claim 与 Decision（Stage 4）
 *
 * ## 为什么 Claim 要成为研究对象（§11）
 *
 * Paper 的核心论断**不应该**是"Agent 生成的一段话"，而应该是：
 *
 * ```text
 * Claim C1
 *   ↓ 由哪些 Evidence 支持
 * E012 E015 E019
 * ```
 *
 * 这样 Paper 里的每一句关键论断都能追溯到证据，而不是追溯到某次对话。
 * 第一版**不建**复杂逻辑推理系统（§10）：只需要
 * `Evidence --supports--> Claim` 与 `Evidence --contradicts--> Claim`。
 *
 * ## 为什么 Decision 要落盘（§23）
 *
 * "用数据集 A / 否定方法 B / 放弃假设 H2"这些判断**不应该只存在聊天记录里**。
 * 它们要能回答"这个 Paper 在当时为什么做出这个决定？"（§22）。
 *
 * ## 双向一致性
 *
 * Evidence 侧存 `supports: [C001]`，Claim 侧存 `evidence: [E012]` —— 两份引用必须一致。
 * 本模块提供 {@link reconcileClaimEvidence} 做**只读校验**并报告不一致，
 * 避免"证据说支持 C1，但 C1 不认领这条证据"这种漂移。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAIMS_DIR,
  CLAIM_STATUSES,
  DECISIONS_DIR,
  makeResearchId,
  parseResearchId,
  type ClaimDocument,
  type ClaimStatus,
  type DecisionDocument,
} from './research-data.js'
import {
  findSection,
  parseFrontmatter,
  parseIdList,
  parseSections,
  renderFrontmatter,
  renderSections,
  stripFrontmatter,
  deriveShortName,
} from './markdown.js'
import { listEvidence } from './evidence.js'

/* ════════════════════════════════════════════════════════════════════════
 * 公共
 * ════════════════════════════════════════════════════════════════════════ */

export interface IdWriteError {
  error: string
}
export function isIdWriteError(v: unknown): v is IdWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

function listMarkdown(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

function nextIdIn(workspace: string, dir: string, kind: 'claim' | 'decision'): string {
  const nums = listMarkdown(join(workspace, dir))
    .map((f) => parseResearchId(f.replace(/\.md$/, ''))?.n ?? 0)
    .filter((n) => n > 0)
  return makeResearchId(kind, (nums.length ? Math.max(...nums) : 0) + 1)
}

/* ════════════════════════════════════════════════════════════════════════
 * Claim（§11 / §40-C）
 * ════════════════════════════════════════════════════════════════════════ */

function normalizeClaimStatus(raw: string | undefined): ClaimStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return (CLAIM_STATUSES as readonly string[]).includes(v) ? (v as ClaimStatus) : 'unverified'
}

/** 解析一个 Claim Markdown。 */
export function parseClaimDocument(absPath: string, relPath: string): ClaimDocument | null {
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source).trim()
  const parsed = parseSections(body)
  const id = (absPath.split('/').pop() ?? '').replace(/\.md$/, '').toUpperCase()

  return {
    id,
    statement: findSection(parsed.sections, 'Statement', 'Claim') || parsed.title || fm.name || id,
    status: normalizeClaimStatus(fm.status),
    evidence: parseIdList(fm.evidence),
    contradictions: parseIdList(fm.contradicts),
    ...(fm.required_evidence || findSection(parsed.sections, 'Required Evidence')
      ? { requiredEvidence: fm.required_evidence || findSection(parsed.sections, 'Required Evidence') }
      : {}),
    ...(fm.paper ? { paper: fm.paper } : {}),
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    sections: parsed.sections,
    body,
    path: absPath,
    relPath,
  }
}

/** 序列化一个 Claim。 */
export function serializeClaimDocument(input: {
  id: string
  /** 短标题（缺省从 statement 派生）。 */
  name?: string
  statement: string
  status: ClaimStatus
  evidence: readonly string[]
  contradictions: readonly string[]
  requiredEvidence?: string
  paper?: string
  createdAt?: string
  updatedAt?: string
  sections?: Array<{ title: string; body: string }>
}): string {
  const sections =
    input.sections ??
    [
      { title: 'Statement', body: input.statement },
      ...(input.requiredEvidence ? [{ title: 'Required Evidence', body: input.requiredEvidence }] : []),
      {
        title: 'Evidence',
        body: input.evidence.length ? input.evidence.map((e) => `- ${e}`).join('\n') : '<!-- 尚无证据支持 -->',
      },
      ...(input.contradictions.length
        ? [{ title: 'Contradicting Evidence', body: input.contradictions.map((e) => `- ${e}`).join('\n') }]
        : []),
    ]
  const front = renderFrontmatter({
    name: input.name?.trim() || deriveShortName(input.statement),
    type: 'research-claim',
    status: input.status,
    evidence: input.evidence.length ? input.evidence.join(', ') : undefined,
    contradicts: input.contradictions.length ? input.contradictions.join(', ') : undefined,
    required_evidence: input.requiredEvidence,
    paper: input.paper,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })
  return `${front}\n\n${renderSections(`Claim: ${input.id}`, sections)}`
}

/** 列出全部 Claim。 */
export function listClaims(workspace: string): ClaimDocument[] {
  const dir = join(workspace, CLAIMS_DIR)
  const out: ClaimDocument[] = []
  for (const file of listMarkdown(dir)) {
    const doc = parseClaimDocument(join(dir, file), `${CLAIMS_DIR}/${file}`)
    if (doc) out.push(doc)
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** 读一个 Claim。 */
export function readClaim(workspace: string, id: string): ClaimDocument | undefined {
  const norm = id.trim().toUpperCase()
  return listClaims(workspace).find((c) => c.id === norm)
}

/** 创建 Claim（§40-C）。 */
export function createClaim(
  workspace: string,
  input: {
    id?: string
    /** 短标题（缺省从 statement 派生；用于列表展示）。 */
    name?: string
    statement: string
    status?: ClaimStatus
    evidence?: readonly string[]
    requiredEvidence?: string
    paper?: string
  },
): ClaimDocument | IdWriteError {
  const statement = input.statement.trim()
  if (!statement) return { error: 'Claim 内容不能为空。' }

  const id = (input.id ?? nextIdIn(workspace, CLAIMS_DIR, 'claim')).trim().toUpperCase()
  const parsed = parseResearchId(id)
  if (!parsed || parsed.kind !== 'claim') return { error: `非法 Claim id：${id}（应为 C001 形式）` }

  const dir = join(workspace, CLAIMS_DIR)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${id}.md`)
  if (existsSync(file)) return { error: `Claim \`${id}\` 已存在。` }

  const now = new Date().toISOString()
  writeFileSync(
    file,
    serializeClaimDocument({
      id,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      statement,
      status: input.status ?? 'unverified',
      evidence: (input.evidence ?? []).map((e) => e.toUpperCase()),
      contradictions: [],
      requiredEvidence: input.requiredEvidence,
      paper: input.paper,
      createdAt: now,
      updatedAt: now,
    }),
    'utf8',
  )
  return parseClaimDocument(file, `${CLAIMS_DIR}/${id}.md`) ?? { error: '创建后解析失败。' }
}

function writeClaim(workspace: string, doc: ClaimDocument, patch: Partial<ClaimDocument>): ClaimDocument | IdWriteError {
  writeFileSync(
    doc.path,
    serializeClaimDocument({
      id: doc.id,
      statement: patch.statement ?? doc.statement,
      status: patch.status ?? doc.status,
      evidence: patch.evidence ?? doc.evidence,
      contradictions: patch.contradictions ?? doc.contradictions,
      requiredEvidence: patch.requiredEvidence ?? doc.requiredEvidence,
      paper: patch.paper ?? doc.paper,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
    }),
    'utf8',
  )
  return parseClaimDocument(doc.path, doc.relPath) ?? { error: '写入后解析失败。' }
}

/** 设置 Claim 状态（§11 `Status`）。 */
export function setClaimStatus(workspace: string, id: string, status: ClaimStatus): ClaimDocument | IdWriteError {
  const doc = readClaim(workspace, id)
  if (!doc) return { error: `找不到 Claim \`${id}\`。` }
  return writeClaim(workspace, doc, { status })
}

/**
 * 从 Evidence 侧**重算** Claim 的状态与证据列表（§18 结构化索引的用途之一）。
 *
 * 规则（保守，不越权做科学判断）：
 *   - 有 `verified` 证据且无矛盾证据 → `verified`
 *   - 有 `supported`/`verified` 证据但存在矛盾证据 → `unverified`（有争议，需人判断）
 *   - 全部证据都是 `rejected` → `rejected`
 *   - 有 `superseded` 证据则忽略之（§8/§9：已被取代的证据不再作为依据）
 *   - 无有效证据 → 保持 `unverified`
 */
export function reconcileClaimEvidence(workspace: string, id: string): ClaimDocument | IdWriteError {
  const doc = readClaim(workspace, id)
  if (!doc) return { error: `找不到 Claim \`${id}\`。` }

  const all = listEvidence(workspace)
  const supporting = all.filter((e) => e.supports.includes(doc.id) && e.status !== 'superseded')
  const against = all.filter((e) => e.contradicts.includes(doc.id) && e.status !== 'superseded')

  const hasVerified = supporting.some((e) => e.status === 'verified')
  const hasSupported = supporting.some((e) => e.status === 'supported' || e.status === 'verified')
  const allRejected = supporting.length > 0 && supporting.every((e) => e.status === 'rejected')

  let status: ClaimStatus = doc.status
  if (allRejected) status = 'rejected'
  else if (hasSupported && against.length === 0) status = hasVerified ? 'verified' : 'supported'
  else if (hasSupported && against.length > 0) status = 'unverified'

  return writeClaim(workspace, doc, {
    status,
    evidence: supporting.map((e) => e.id),
    contradictions: against.map((e) => e.id),
  })
}

/** 一致性报告：Evidence 与 Claim 两侧的引用是否对齐。 */
export interface ClaimEvidenceConsistency {
  claimId: string
  /** Evidence 声称支持但 Claim 未认领。 */
  missingFromClaim: string[]
  /** Claim 认领但 Evidence 不再声称支持（或不存在）。 */
  missingFromEvidence: string[]
  consistent: boolean
}

/**
 * 只读一致性校验（不自动修复 —— 修复涉及科学判断，交给人或显式 `reconcile`）。
 */
export function checkClaimEvidenceConsistency(workspace: string, claimId: string): ClaimEvidenceConsistency {
  const claim = readClaim(workspace, claimId)
  if (!claim) {
    return { claimId, missingFromClaim: [], missingFromEvidence: [], consistent: false }
  }
  const all = listEvidence(workspace)
  const fromEvidence = all.filter((e) => e.supports.includes(claim.id)).map((e) => e.id)
  const existing = new Set(all.map((e) => e.id))

  const missingFromClaim = fromEvidence.filter((e) => !claim.evidence.includes(e))
  const missingFromEvidence = claim.evidence.filter((e) => !existing.has(e) || !fromEvidence.includes(e))

  return {
    claimId: claim.id,
    missingFromClaim,
    missingFromEvidence,
    consistent: missingFromClaim.length === 0 && missingFromEvidence.length === 0,
  }
}

/** 删除 Claim（同时从相关 Evidence 上解除引用）。 */
export function deleteClaim(workspace: string, id: string): { ok: true; id: string } | IdWriteError {
  const doc = readClaim(workspace, id)
  if (!doc) return { error: `找不到 Claim \`${id}\`。` }
  try {
    rmSync(doc.path)
  } catch (e) {
    return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id: doc.id }
}

/* ════════════════════════════════════════════════════════════════════════
 * Decision（§23 / §40-D）
 * ════════════════════════════════════════════════════════════════════════ */

/** 解析一个 Decision Markdown。 */
export function parseDecisionDocument(absPath: string, relPath: string): DecisionDocument | null {
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source).trim()
  const parsed = parseSections(body)
  const id = (absPath.split('/').pop() ?? '').replace(/\.md$/, '').toUpperCase()

  return {
    id,
    decision: findSection(parsed.sections, 'Decision') || parsed.title || fm.name || id,
    reason: findSection(parsed.sections, 'Reason'),
    evidence: parseIdList(fm.evidence),
    alternatives: findSection(parsed.sections, 'Alternatives Considered', 'Alternatives'),
    status: fm.status || 'decided',
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    sections: parsed.sections,
    body,
    path: absPath,
    relPath,
  }
}

/** 序列化一个 Decision（§23 的推荐结构）。 */
export function serializeDecisionDocument(input: {
  id: string
  /** 短标题（缺省从 decision 派生）。 */
  name?: string
  decision: string
  reason: string
  evidence: readonly string[]
  alternatives?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}): string {
  const front = renderFrontmatter({
    name: input.name?.trim() || deriveShortName(input.decision),
    type: 'research-decision',
    status: input.status ?? 'decided',
    evidence: input.evidence.length ? input.evidence.join(', ') : undefined,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })
  const sections = [
    { title: 'Decision', body: input.decision },
    { title: 'Reason', body: input.reason || '<!-- 为什么这样定 -->' },
    {
      title: 'Evidence',
      body: input.evidence.length ? input.evidence.map((e) => `- ${e}`).join('\n') : '<!-- 依据哪些证据 -->',
    },
    { title: 'Alternatives Considered', body: input.alternatives || '<!-- 考虑过但没采用的方案 -->' },
    { title: 'Status', body: input.status ?? 'decided' },
  ]
  return `${front}\n\n${renderSections(`Decision: ${input.id}`, sections)}`
}

/** 列出全部 Decision。 */
export function listDecisions(workspace: string): DecisionDocument[] {
  const dir = join(workspace, DECISIONS_DIR)
  const out: DecisionDocument[] = []
  for (const file of listMarkdown(dir)) {
    const doc = parseDecisionDocument(join(dir, file), `${DECISIONS_DIR}/${file}`)
    if (doc) out.push(doc)
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** 读一个 Decision。 */
export function readDecision(workspace: string, id: string): DecisionDocument | undefined {
  const norm = id.trim().toUpperCase()
  return listDecisions(workspace).find((d) => d.id === norm)
}

/** 创建 Decision。
 *
 * ⚠️ 研究决策应当**有依据**：若既没有 evidence 也没有 reason，我们仍然允许创建
 * （有时决定就是"先试试"），但会在 reason 里留下提示，避免它悄悄变成无据判断。
 */
export function createDecision(
  workspace: string,
  input: {
    id?: string
    /** 短标题（缺省从 decision 派生；用于列表展示）。 */
    name?: string
    decision: string
    reason?: string
    evidence?: readonly string[]
    alternatives?: string
    status?: string
  },
): DecisionDocument | IdWriteError {
  const decision = input.decision.trim()
  if (!decision) return { error: 'Decision 内容不能为空。' }
  const evidence = (input.evidence ?? []).map((e) => e.toUpperCase())
  if (evidence.length === 0 && !input.reason?.trim()) {
    return { error: 'Decision 需要理由或依据：请提供 reason 或 evidence（§23）。' }
  }

  const id = (input.id ?? nextIdIn(workspace, DECISIONS_DIR, 'decision')).trim().toUpperCase()
  const parsed = parseResearchId(id)
  if (!parsed || parsed.kind !== 'decision') return { error: `非法 Decision id：${id}（应为 D001 形式）` }

  const dir = join(workspace, DECISIONS_DIR)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${id}.md`)
  if (existsSync(file)) return { error: `Decision \`${id}\` 已存在。` }

  const now = new Date().toISOString()
  writeFileSync(
    file,
    serializeDecisionDocument({
      id,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      decision,
      reason: input.reason ?? '',
      evidence,
      alternatives: input.alternatives,
      status: input.status ?? 'decided',
      createdAt: now,
      updatedAt: now,
    }),
    'utf8',
  )
  return parseDecisionDocument(file, `${DECISIONS_DIR}/${id}.md`) ?? { error: '创建后解析失败。' }
}

/** 更新 Decision 状态（`decided` → `revisiting` → `reversed` 等）。 */
export function setDecisionStatus(workspace: string, id: string, status: string): DecisionDocument | IdWriteError {
  const doc = readDecision(workspace, id)
  if (!doc) return { error: `找不到 Decision \`${id}\`。` }
  const sections = doc.sections.map((s) => (s.title === 'Status' ? { title: 'Status', body: status } : s))
  writeFileSync(
    doc.path,
    serializeDecisionDocument({
      id: doc.id,
      decision: doc.decision,
      reason: doc.reason,
      evidence: doc.evidence,
      alternatives: doc.alternatives,
      status,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
    }),
    'utf8',
  )
  void sections
  return parseDecisionDocument(doc.path, doc.relPath) ?? { error: '写入后解析失败。' }
}

/** 删除 Decision。 */
export function deleteDecision(workspace: string, id: string): { ok: true; id: string } | IdWriteError {
  const doc = readDecision(workspace, id)
  if (!doc) return { error: `找不到 Decision \`${id}\`。` }
  try {
    rmSync(doc.path)
  } catch (e) {
    return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id: doc.id }
}

/* ════════════════════════════════════════════════════════════════════════
 * Provenance（§28 / §40-E）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 完整 provenance 链（§28 / §42）：
 *
 * ```text
 * Skill → Plan → Harness Session → Raw Artifact → Evidence → Claim → Research State
 * ```
 */
export interface ProvenanceChain {
  /** 入口资产（任一起点）。 */
  from: string
  /** 链上的每一跳。 */
  hops: Array<{
    kind: 'skill' | 'plan' | 'session' | 'artifact' | 'evidence' | 'claim' | 'decision' | 'state'
    ref: string
    /** 该跳的说明（如"支持" / "由 Plan 产出"）。 */
    relation: string
  }>
  /** 是否完整追溯到原始产物（§30 的关键判据）。 */
  reachesRawArtifact: boolean
}

/**
 * 从一条 Evidence 开始向上追溯（Evidence → Plan/Session/Artifact 与 → Claim）。
 *
 * 这是**只读**遍历：链上的资料都在各自文件里，本函数只做引用拼接，不复制内容。
 */
export function traceEvidenceProvenance(workspace: string, evidenceId: string): ProvenanceChain | undefined {
  const evidence = listEvidence(workspace).find((e) => e.id === evidenceId.trim().toUpperCase())
  if (!evidence) return undefined

  const hops: ProvenanceChain['hops'] = [
    { kind: 'evidence', ref: evidence.id, relation: 'evidence' },
  ]
  if (evidence.provenance.sourceSkill) {
    hops.push({ kind: 'skill', ref: evidence.provenance.sourceSkill, relation: 'produced by skill' })
  }
  if (evidence.provenance.plan) {
    hops.push({ kind: 'plan', ref: `${PLAN_REF_PREFIX}${evidence.provenance.plan}.md`, relation: 'from plan' })
  }
  if (evidence.provenance.harnessSession) {
    hops.push({ kind: 'session', ref: evidence.provenance.harnessSession, relation: 'executed in session' })
  }
  for (const artifact of evidence.provenance.rawArtifacts) {
    hops.push({ kind: 'artifact', ref: artifact, relation: 'raw artifact' })
  }
  for (const claimId of evidence.supports) {
    hops.push({ kind: 'claim', ref: claimId, relation: 'supports' })
  }
  for (const claimId of evidence.contradicts) {
    hops.push({ kind: 'claim', ref: claimId, relation: 'contradicts' })
  }

  return {
    from: evidence.id,
    hops,
    reachesRawArtifact: evidence.provenance.rawArtifacts.length > 0,
  }
}

const PLAN_REF_PREFIX = 'plans/'

/** 从 Claim 开始向下汇总（Claim → Evidence → raw artifacts）。 */
export function traceClaimProvenance(workspace: string, claimId: string): ProvenanceChain | undefined {
  const claim = readClaim(workspace, claimId)
  if (!claim) return undefined
  const all = listEvidence(workspace)
  const supporting = all.filter((e) => e.supports.includes(claim.id))
  const against = all.filter((e) => e.contradicts.includes(claim.id))

  const hops: ProvenanceChain['hops'] = [{ kind: 'claim', ref: claim.id, relation: 'claim' }]
  for (const e of supporting) hops.push({ kind: 'evidence', ref: e.id, relation: 'supports' })
  for (const e of against) hops.push({ kind: 'evidence', ref: e.id, relation: 'contradicts' })
  for (const e of [...supporting, ...against]) {
    for (const artifact of e.provenance.rawArtifacts) {
      hops.push({ kind: 'artifact', ref: artifact, relation: `via ${e.id}` })
    }
  }
  return {
    from: claim.id,
    hops,
    reachesRawArtifact: [...supporting, ...against].some((e) => e.provenance.rawArtifacts.length > 0),
  }
}
