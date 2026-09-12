/**
 * ConvFusion 2.0 — Paper Evolution 与 Maturity（Stage 5 核心）
 *
 * ## Paper Evolution 是什么（§10）
 *
 * 不是"修改论文"，而是一条**受控的演化链**：
 *
 * ```text
 * Research Change（新 Evidence / Claim / Research State / 用户要求）
 *       ↓
 * Paper Impact Analysis（哪些 Claim / 章节受影响）
 *       ↓
 * Revision Proposal（§11）
 *       ↓
 * User Review（Accept / Edit / Reject）
 *       ↓
 * Paper Revision
 *       ↓
 * Paper Version（§12 不删除性覆盖）
 * ```
 *
 * ## 两条硬约束
 *
 * 1. **修订必须经提案**（§11 / §32）：Agent 不直接改论文。这不是流程洁癖 ——
 *    §32 的理由是"Agent 生成的内容不能自动成为事实"，因此改正文前必须有人看过。
 * 2. **修订保留历史**（§12）：每次应用提案都先归档当前正文，并记录一条
 *    Evolution Event（§29），所以 `why did the conclusion change?` 永远可答。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAPER_FILES,
  PAPER_MATURITY_DIMENSIONS,
  type EvolutionTrigger,
  type PaperGap,
  type PaperMaturity,
  type PaperMaturityDimension,
  type PaperMaturityLevel,
  type RevisionProposal,
} from './paper-data.js'
import {
  archivePaperVersion,
  buildEvidenceMap,
  bumpPaperVersion,
  listEvolutionEvents,
  paperDir,
  paperRelDir,
  readClaimMap,
  readPaper,
  recordEvolutionEvent,
  saveManuscript,
} from './paper.js'
import { listPaperGaps } from './paper-gaps.js'
import { findSection, parseFrontmatter, parseSections, renderFrontmatter, stripFrontmatter } from './markdown.js'
import { listClaims } from './claims.js'
import { listEvidence } from './evidence.js'
import { loadResearchState } from './research-state.js'

/* ════════════════════════════════════════════════════════════════════════
 * Revision Proposal（§11 / Task 7）
 * ════════════════════════════════════════════════════════════════════════ */

function proposalsDir(workspace: string, paperId: string): string {
  return join(paperDir(workspace, paperId), PAPER_FILES.proposalsDir)
}

/** 提案序列化（Markdown；§11 的结构）。 */
export function serializeProposal(p: RevisionProposal): string {
  const front = renderFrontmatter({
    id: p.id,
    type: 'paper-revision-proposal',
    status: p.status,
    proposed_by: p.proposedBy,
    trigger: p.trigger,
    created_at: p.createdAt,
    from_version: p.resolved?.fromVersion,
    to_version: p.resolved?.toVersion,
  })
  const parts = [
    front,
    '',
    `# Revision Proposal ${p.id}`,
    '',
    '## Reason',
    '',
    p.reason || '(none)',
    '',
    '## Affected Claims',
    '',
    ...(p.affectedClaims.length ? p.affectedClaims.map((c) => `- ${c}`) : ['- (none)']),
    '',
    '## Affected Sections',
    '',
    ...(p.affectedSections.length ? p.affectedSections.map((s) => `- ${s}`) : ['- (none)']),
    '',
    '## Proposed Changes',
    '',
    p.proposedChanges || '(none)',
    '',
    '## Supporting Evidence',
    '',
    ...(p.supportingEvidence.length ? p.supportingEvidence.map((e) => `- ${e}`) : ['- (none)']),
    '',
    '## Related Research State',
    '',
    p.relatedResearchState ?? '(none)',
    '',
    '## Risk',
    '',
    p.risk ?? '(none recorded)',
    '',
    '## Status',
    '',
    p.status,
    ...(p.resolved
      ? ['', `Resolved: ${p.resolved.at} by ${p.resolved.by} (v${p.resolved.fromVersion} → v${p.resolved.toVersion})`]
      : []),
    '',
  ]
  return parts.join('\n').trim() + '\n'
}

/** 解析一个提案文件。 */
export function parseProposal(source: string, fallbackId: string): RevisionProposal | null {
  const fm = parseFrontmatter(source)
  const sections = parseSections(stripFrontmatter(source)).sections
  const id = fm.id || fallbackId
  if (!id) return null
  const list = (title: string): string[] =>
    (findSection(sections, title).match(/^[-*]\s*(.+)$/gm) ?? []).map((l) => l.replace(/^[-*]\s*/, '').trim())
  return {
    id,
    reason: findSection(sections, 'Reason'),
    affectedClaims: list('Affected Claims'),
    affectedSections: list('Affected Sections'),
    proposedChanges: findSection(sections, 'Proposed Changes'),
    supportingEvidence: list('Supporting Evidence'),
    ...(findSection(sections, 'Related Research State')
      ? { relatedResearchState: findSection(sections, 'Related Research State') }
      : {}),
    ...(findSection(sections, 'Risk') ? { risk: findSection(sections, 'Risk') } : {}),
    ...(fm.trigger ? { trigger: fm.trigger } : {}),
    status: (fm.status as RevisionProposal['status']) ?? 'proposed',
    proposedBy: fm.proposed_by === 'user' ? 'user' : 'agent',
    createdAt: fm.created_at ?? new Date().toISOString(),
  }
}

/** 列出全部提案。 */
export function listProposals(workspace: string, paperId: string): RevisionProposal[] {
  const dir = proposalsDir(workspace, paperId)
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return []
  }
  const out: RevisionProposal[] = []
  for (const f of files) {
    try {
      const p = parseProposal(readFileSync(join(dir, f), 'utf8'), f.replace(/\.md$/, ''))
      if (p) out.push(p)
    } catch {
      /* 跳过损坏文件 */
    }
  }
  return out
}

/** 读一个提案。 */
export function readProposal(workspace: string, paperId: string, proposalId: string): RevisionProposal | undefined {
  return listProposals(workspace, paperId).find((p) => p.id === proposalId)
}

/** 下一个提案编号。 */
export function nextProposalId(existing: readonly RevisionProposal[]): string {
  const max = existing.reduce((n, p) => Math.max(n, Number(p.id.replace(/^RP?/, '')) || 0), 0)
  return `R${String(max + 1).padStart(3, '0')}`
}

function writeProposal(workspace: string, paperId: string, p: RevisionProposal): string {
  mkdirSync(proposalsDir(workspace, paperId), { recursive: true })
  const file = join(proposalsDir(workspace, paperId), `${p.id}.md`)
  writeFileSync(file, serializeProposal(p), 'utf8')
  return `${paperRelDir(paperId)}/${PAPER_FILES.proposalsDir}/${p.id}.md`
}

/**
 * 提出一次修订（Task 7 `create`）。
 *
 * §32：**Agent 生成的内容不能自动成为事实** —— 因此这里只落成提案，
 * 正文不变，等用户处置。
 */
export function proposeRevision(
  workspace: string,
  paperId: string,
  input: {
    reason: string
    proposedChanges: string
    affectedClaims?: readonly string[]
    affectedSections?: readonly string[]
    supportingEvidence?: readonly string[]
    relatedResearchState?: string
    risk?: string
    trigger?: EvolutionTrigger
    proposedBy?: 'agent' | 'user'
  },
): RevisionProposal | { error: string } {
  const paper = readPaper(workspace, paperId)
  if (!paper) return { error: `找不到 Paper \`${paperId}\`。` }
  if (!input.reason.trim()) return { error: '提案必须说明理由（§11 Reason）。' }

  const existing = listProposals(workspace, paperId)
  const proposal: RevisionProposal = {
    id: nextProposalId(existing),
    reason: input.reason,
    affectedClaims: [...(input.affectedClaims ?? [])],
    affectedSections: [...(input.affectedSections ?? [])],
    proposedChanges: input.proposedChanges,
    supportingEvidence: [...(input.supportingEvidence ?? [])],
    ...(input.relatedResearchState
      ? { relatedResearchState: input.relatedResearchState }
      : paper.metadata.researchStateVersion
        ? { relatedResearchState: `v${paper.metadata.researchStateVersion}` }
        : {}),
    ...(input.risk ? { risk: input.risk } : {}),
    ...(input.trigger ? { trigger: input.trigger } : {}),
    status: 'proposed',
    proposedBy: input.proposedBy ?? 'agent',
    createdAt: new Date().toISOString(),
  }
  writeProposal(workspace, paperId, proposal)
  return proposal
}

/* ════════════════════════════════════════════════════════════════════════
 * Impact Analysis（§24 / Task 10）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一处变化的影响面。 */
export interface ImpactAnalysis {
  /** 触发来源（§30）。 */
  trigger: EvolutionTrigger
  /** 触发对象（evidence id / claim id / state version / 用户请求）。 */
  cause: string
  /** 受影响的 Claim（含其状态）。 */
  claims: Array<{ id: string; statement: string; status: string; viaEvidence?: string }>
  /** 受影响的章节。 */
  sections: string[]
  /** 受影响 Paper 的建议修订方向（不是自动改动）。 */
  recommendation: string
}

/**
 * 分析"新增证据/状态变化"会影响论文哪里（§24 / §10）。
 *
 * 纯只读分析：不改任何东西，输出的是"哪些 Claim 与章节会受影响"，
 * 交给 {@link proposeRevision} 形成提案。
 */
export function analyzeEvidenceImpact(
  workspace: string,
  paperId: string,
  evidenceId: string,
): ImpactAnalysis | { error: string } {
  const evidence = listEvidence(workspace).find((e) => e.id === evidenceId.trim().toUpperCase())
  if (!evidence) return { error: `找不到 Evidence \`${evidenceId}\`。` }

  const claimMap = readClaimMap(workspace, paperId)
  const byId = new Map(claimMap.map((c) => [c.id, c]))

  const touched: Array<{ id: string; statement: string; status: string; viaEvidence?: string }> = []
  const sections = new Set<string>()
  for (const claimId of [...evidence.supports, ...evidence.contradicts]) {
    const c = byId.get(claimId)
    if (c) {
      touched.push({
        id: c.id,
        statement: c.statement,
        status: c.status,
        ...(evidence.supports.includes(claimId) ? { viaEvidence: 'supports' } : {}),
      })
      for (const s of c.sections) sections.add(s)
    }
  }

  const relation = evidence.contradicts.length > 0 ? 'contradicts' : 'supports'
  return {
    trigger: 'evidence-added',
    cause: evidence.id,
    claims: touched,
    sections: [...sections],
    recommendation:
      touched.length === 0
        ? `Evidence ${evidence.id} is not linked to any claim used in the paper. Either link it to the claim it bears on, or record why it is not used.`
        : `Evidence ${evidence.id} ${relation} ${touched.map((c) => c.id).join(', ')}. Re-read the affected sections and propose a revision where the text no longer matches the evidence.`,
  }
}

/** 分析"某个 Claim 状态变化"的影响。 */
export function analyzeClaimImpact(
  workspace: string,
  paperId: string,
  claimId: string,
): ImpactAnalysis | { error: string } {
  const norm = claimId.trim().toUpperCase()
  const researchClaim = listClaims(workspace).find((c) => c.id === norm)
  if (!researchClaim) return { error: `找不到 Claim \`${claimId}\`。` }

  const claimMap = readClaimMap(workspace, paperId)
  const inPaper = claimMap.find((c) => c.id === norm)
  const sections = inPaper?.sections ?? []

  return {
    trigger: 'claim-status-changed',
    cause: norm,
    claims: [
      {
        id: researchClaim.id,
        statement: researchClaim.statement,
        status: researchClaim.status,
        ...(researchClaim.evidence.length ? { viaEvidence: researchClaim.evidence.join(', ') } : {}),
      },
    ],
    sections,
    recommendation:
      sections.length === 0
        ? `Claim ${norm} is not referenced in the manuscript, so its status change has no direct textual impact.`
        : `Claim ${norm} is now \`${researchClaim.status}\` (evidence: ${researchClaim.evidence.join(', ') || 'none'}). The text in ${sections.join(', ')} should be checked against that status.`,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 应用修订（Task 7 accept / edit / reject；Task 10）
 * ════════════════════════════════════════════════════════════════════════ */

export interface ApplyRevisionResult {
  proposal: RevisionProposal
  fromVersion: string
  toVersion: string
  /** 新版本是否与旧版本内容不同。 */
  changed: boolean
}

/**
 * 应用一次修订（Accept / Edit）。
 *
 * 顺序（重要，保证 §12 不删除性覆盖）：
 *   1. 归档当前正文到 `history/v<from>.md`
 *   2. 递增版本
 *   3. 写回修订后的正文
 *   4. 记录 Evolution Event（§29）
 *   5. 提案置为 accepted/edited 并保留处置记录
 *
 * @param finalText 最终正文（`accept` 时用 `proposedChanges`，`edit` 时用用户改过的文本）
 */
export function applyRevision(
  workspace: string,
  paperId: string,
  proposalId: string,
  options: { action: 'accepted' | 'edited'; finalText?: string; by?: 'user' | 'agent'; note?: string; trigger?: EvolutionTrigger } = {
    action: 'accepted',
  },
): ApplyRevisionResult | { error: string } {
  const paper = readPaper(workspace, paperId)
  if (!paper) return { error: `找不到 Paper \`${paperId}\`。` }
  const proposal = readProposal(workspace, paperId, proposalId)
  if (!proposal) return { error: `找不到提案 \`${proposalId}\`。` }
  if (proposal.status !== 'proposed') {
    return { error: `提案 \`${proposalId}\` 已处置（${proposal.status}），不能重复应用。` }
  }

  const fromVersion = paper.metadata.version
  const finalText =
    options.finalText ?? (proposal.proposedChanges.trim() ? wrapProposalText(paper.manuscript, proposal) : paper.manuscript)

  // 1) 归档当前版本（原因 = 提案 id + 理由摘要）
  archivePaperVersion(workspace, paperId, {
    reason: `${proposal.id}: ${proposal.reason.slice(0, 80)}`,
  })

  // 2) 写回正文（保持 Markdown-first；不加任何隐藏格式）
  const saved = saveManuscript(workspace, paperId, finalText)
  if ('error' in saved) return saved

  // 3) 版本推进（saveManuscript 不改版本，这里显式推进）
  const toVersion = bumpPaperVersion(fromVersion)
  writeMetadataVersion(workspace, paperId, toVersion)

  // 4) 记录演化事件
  recordEvolutionEvent(workspace, paperId, {
    fromVersion,
    toVersion,
    trigger: options.trigger ?? (proposal.trigger as EvolutionTrigger) ?? 'user-revision-request',
    ...(proposal.relatedResearchState ? {} : {}),
    evidence: proposal.supportingEvidence,
    claims: proposal.affectedClaims,
    sections: proposal.affectedSections,
    action: options.action,
    author: options.by ?? 'user',
    summary: `${proposal.id} ${options.action}: ${proposal.reason.slice(0, 160)}`,
  })

  // 5) 提案处置记录
  const resolved: RevisionProposal = {
    ...proposal,
    status: options.action,
    resolved: {
      at: new Date().toISOString(),
      by: options.by ?? 'user',
      fromVersion,
      toVersion,
      ...(options.note ? { note: options.note } : {}),
    },
  }
  writeProposal(workspace, paperId, resolved)

  return {
    proposal: resolved,
    fromVersion,
    toVersion,
    changed: finalText.trim() !== paper.manuscript.trim(),
  }
}

/**
 * 把提案的改动**追加**到正文（不覆盖既有内容）。
 *
 * 为什么不是替换：§32 —— Agent 写的文本不能自动成为事实，
 * 因此默认行为是"追加到对应章节之后由人重写"，而不是静默替换用户的正文。
 * 需要精确替换时，调用方用 `applyRevision(..., { finalText })` 显式给出最终正文。
 */
function wrapProposalText(manuscript: string, proposal: RevisionProposal): string {
  const section = proposal.affectedSections[0]
  const block = [
    '',
    `<!-- proposed by ${proposal.id} (${proposal.proposedBy}): ${proposal.reason.slice(0, 120)} -->`,
    proposal.proposedChanges,
    '',
  ].join('\n')

  if (!section) return `${manuscript.trimEnd()}\n${block}`

  const lines = manuscript.split('\n')
  const want = section.toLowerCase()
  let insertAt = -1
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/)
    if (m && m[1].toLowerCase().includes(want)) {
      // 插到该章节末尾（下一个 ## 之前）
      insertAt = lines.length
      for (let j = i + 1; j < lines.length; j++) {
        if (/^##\s+/.test(lines[j])) {
          insertAt = j
          break
        }
      }
      break
    }
  }
  if (insertAt < 0) return `${manuscript.trimEnd()}\n${block}`
  return [...lines.slice(0, insertAt), block, ...lines.slice(insertAt)].join('\n')
}

/** 直接写 metadata 的版本号（避免与 updatePaperMetadata 的 import 环）。 */
function writeMetadataVersion(workspace: string, paperId: string, version: string): void {
  const metaPath = join(paperDir(workspace, paperId), PAPER_FILES.metadata)
  let source = ''
  try {
    source = readFileSync(metaPath, 'utf8')
  } catch {
    return
  }
  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source)
  const front = renderFrontmatter({
    id: fm.id,
    type: fm.type ?? 'research-paper',
    title: fm.title,
    status: fm.status ?? 'evolving',
    version,
    research_project: fm.research_project,
    research_state_version: fm.research_state_version,
    authors: fm.authors,
    target_venue: fm.target_venue,
    research_domain: fm.research_domain,
    created_at: fm.created_at,
    updated_at: new Date().toISOString(),
  })
  writeFileSync(metaPath, `${front}\n\n${body.trim()}\n`, 'utf8')
}

/** 拒绝一次提案（§11 reject）。 */
export function rejectRevision(
  workspace: string,
  paperId: string,
  proposalId: string,
  note?: string,
): RevisionProposal | { error: string } {
  const paper = readPaper(workspace, paperId)
  if (!paper) return { error: `找不到 Paper \`${paperId}\`。` }
  const proposal = readProposal(workspace, paperId, proposalId)
  if (!proposal) return { error: `找不到提案 \`${proposalId}\`。` }
  if (proposal.status !== 'proposed') return { error: `提案 \`${proposalId}\` 已处置。` }

  const resolved: RevisionProposal = {
    ...proposal,
    status: 'rejected',
    resolved: {
      at: new Date().toISOString(),
      by: 'user',
      fromVersion: paper.metadata.version,
      toVersion: paper.metadata.version,
      ...(note ? { note } : {}),
    },
  }
  writeProposal(workspace, paperId, resolved)

  // §21 精神：即使被拒也留痕（但不推进版本，因为正文没变）
  recordEvolutionEvent(workspace, paperId, {
    fromVersion: paper.metadata.version,
    toVersion: paper.metadata.version,
    trigger: 'user-revision-request',
    evidence: proposal.supportingEvidence,
    claims: proposal.affectedClaims,
    sections: proposal.affectedSections,
    action: 'rejected',
    author: 'user',
    summary: `${proposal.id} rejected${note ? `: ${note}` : ''}`,
  })
  return resolved
}

/* ════════════════════════════════════════════════════════════════════════
 * Paper Maturity（§16 / Task 11）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 成熟度文件（`maturity.md` 的 frontmatter 存结构化值）。
 *
 * §16 明确：成熟度**不是**进度百分比，也不是"跑到哪一步"，
 * 而是"这篇论文当前研究成熟到什么程度"。
 */
const MATURITY_FILE = 'maturity.md'

function maturityPath(workspace: string, paperId: string): string {
  return join(paperDir(workspace, paperId), MATURITY_FILE)
}

/** 读成熟度（不存在 → 全部 Unknown 并给出原因）。 */
export function readPaperMaturity(workspace: string, paperId: string): Record<PaperMaturityDimension, PaperMaturity> {
  let source: string | null = null
  try {
    source = readFileSync(maturityPath(workspace, paperId), 'utf8')
  } catch {
    /* 未评估过 */
  }
  const fm = source ? parseFrontmatter(source) : {}
  const body = source ? stripFrontmatter(source) : ''
  const sections = parseSections(body).sections

  const out = {} as Record<PaperMaturityDimension, PaperMaturity>
  for (const d of PAPER_MATURITY_DIMENSIONS) {
    const key = d.toLowerCase().replace(/\s+/g, '_')
    const raw = fm[key]
    const section = sections.find((s) => s.title.toLowerCase() === d.toLowerCase())
    out[d] = {
      status: (raw as PaperMaturityLevel) ?? 'Unknown',
      reason: section?.body ?? '',
      evidence: (section?.body.match(/\b(?:E\d{1,4}|C\d{1,4})\b/g) ?? []).map((x) => x.toUpperCase()),
    }
  }
  return out
}

/** 写成熟度。 */
export function writePaperMaturity(
  workspace: string,
  paperId: string,
  maturity: Record<PaperMaturityDimension, PaperMaturity>,
): string {
  const fields: Record<string, string | undefined> = {}
  for (const d of PAPER_MATURITY_DIMENSIONS) {
    fields[d.toLowerCase().replace(/\s+/g, '_')] = maturity[d].status
  }
  const parts = [
    renderFrontmatter({ name: 'Paper Maturity', type: 'paper-maturity', ...fields }),
    '',
    '# Paper Maturity',
    '',
    '<!-- 研究成熟度，不是进度百分比。每维给出 status / reason / evidence。 -->',
    '',
  ]
  for (const d of PAPER_MATURITY_DIMENSIONS) {
    parts.push(`## ${d}`, '', `Status: ${maturity[d].status}`, '', maturity[d].reason || '(not assessed)', '')
  }
  mkdirSync(paperDir(workspace, paperId), { recursive: true })
  writeFileSync(maturityPath(workspace, paperId), parts.join('\n').trim() + '\n', 'utf8')
  return `${paperRelDir(paperId)}/${MATURITY_FILE}`
}

/**
 * 从实际资产**推导**成熟度建议（§16 / Task 11）。
 *
 * ⚠️ 判据全部可核查（章节是否有实质内容、Claim 是否有证据、Gap 数量与优先级），
 * **不用百分比假装精度**。返回值是**建议**，由用户/Agent 决定是否写入。
 */
export function suggestPaperMaturity(
  workspace: string,
  paperId: string,
): Record<PaperMaturityDimension, PaperMaturity> {
  const paper = readPaper(workspace, paperId)
  const claims = readClaimMap(workspace, paperId)
  const evidence = listEvidence(workspace)
  const evidenceMap = buildEvidenceMap(workspace, paperId)
  const gaps = listPaperGaps(workspace, paperId).filter((g) => !g.resolved)
  const state = loadResearchState(workspace)

  const hasSection = (re: RegExp): boolean =>
    (paper?.sections ?? []).some((s) => re.test(s.title) && s.body.replace(/<!--[\s\S]*?-->/g, '').trim().length > 60)

  const level = (n: number): PaperMaturityLevel =>
    (['Unknown', 'Weak', 'Emerging', 'Strong', 'Established'] as PaperMaturityLevel[])[Math.min(4, n)]

  const out = {} as Record<PaperMaturityDimension, PaperMaturity>

  // Problem —— 取决于 Research State 是否立住了问题
  {
    const hasProblem = Boolean(state?.dimensions['Problem']?.trim())
    const hasQuestions = Boolean(state?.dimensions['Research Questions']?.trim())
    out.Problem = {
      status: hasProblem && hasQuestions ? 'Established' : hasProblem ? 'Emerging' : 'Unknown',
      reason: hasProblem
        ? hasQuestions
          ? 'Research State records both the problem and the research questions.'
          : 'Research State records the problem but no explicit research questions.'
        : 'Research State has no Problem dimension yet.',
      evidence: [],
    }
  }
  // Literature —— Related Work 章节 + 文献证据
  {
    const litEvidence = evidence.filter((e) => e.sourceKind === 'literature')
    const hasRelated = hasSection(/related work|background/i)
    out.Literature = {
      status: level((hasRelated ? 2 : 0) + (litEvidence.length > 0 ? 1 : 0) + (litEvidence.length >= 3 ? 1 : 0)),
      reason: `${hasRelated ? 'Related Work section present' : 'No Related Work section'}; ${litEvidence.length} literature evidence item(s).`,
      evidence: litEvidence.slice(0, 5).map((e) => e.id),
    }
  }
  // Innovation —— Innovation 维度 + 贡献是否在正文出现
  {
    const hasInnovation = Boolean(state?.dimensions.Innovation?.trim())
    const inText = /contribut|novel|our approach|we propose/i.test(paper?.manuscript ?? '')
    out.Innovation = {
      status: hasInnovation && inText ? 'Strong' : hasInnovation || inText ? 'Emerging' : 'Unknown',
      reason: `Research State Innovation: ${hasInnovation ? 'recorded' : 'absent'}; manuscript states a contribution: ${inText ? 'yes' : 'no'}.`,
      evidence: [],
    }
  }
  // Method
  {
    const hasMethod = hasSection(/method|approach/i)
    const methodEvidence = evidence.filter((e) => e.sourceKind === 'implementation' || e.sourceKind === 'computation')
    out.Method = {
      status: hasMethod ? (methodEvidence.length > 0 ? 'Strong' : 'Emerging') : 'Unknown',
      reason: hasMethod
        ? methodEvidence.length > 0
          ? `Method section present with ${methodEvidence.length} implementation/computation evidence item(s).`
          : 'Method section present but no implementation evidence recorded.'
        : 'No substantive Method section.',
      evidence: methodEvidence.slice(0, 5).map((e) => e.id),
    }
  }
  // Experiment
  {
    const expEvidence = evidence.filter((e) => e.sourceKind === 'experiment')
    const hasExperiments = hasSection(/experiment|result/i)
    out.Experiment = {
      status: expEvidence.length === 0 ? (hasExperiments ? 'Weak' : 'Unknown') : hasExperiments ? 'Strong' : 'Emerging',
      reason: `${expEvidence.length} experiment evidence item(s); experiments/results section ${hasExperiments ? 'present' : 'missing'}.`,
      evidence: expEvidence.slice(0, 5).map((e) => e.id),
    }
  }
  // Evidence
  {
    const verified = evidence.filter((e) => e.status === 'verified').length
    const withoutArtifact = gaps.filter((g) => g.type === 'evidence-without-artifact').length
    out.Evidence = {
      status: evidence.length === 0 ? 'Unknown' : verified >= 3 && withoutArtifact === 0 ? 'Established' : verified > 0 ? 'Strong' : 'Emerging',
      reason: `${evidence.length} item(s), ${verified} verified; ${withoutArtifact} lacking a raw artifact reference.`,
      evidence: evidence.slice(0, 5).map((e) => e.id),
    }
  }
  // Claims
  {
    const supported = claims.filter((c) => c.evidence.length > 0).length
    const unsupported = claims.filter((c) => c.evidence.length === 0).length
    out.Claims = {
      status: claims.length === 0 ? 'Unknown' : unsupported === 0 && supported > 0 ? 'Strong' : supported > 0 ? 'Emerging' : 'Weak',
      reason: `${claims.length} claim(s) in the paper; ${supported} with evidence, ${unsupported} without.`,
      evidence: claims.flatMap((c) => c.evidence).slice(0, 5),
    }
  }
  // Writing —— 章节覆盖度
  {
    const substantive = (paper?.sections ?? []).filter((s) => s.body.replace(/<!--[\s\S]*?-->/g, '').trim().length > 60)
    const total = paper?.sections.length ?? 0
    const ratio = total > 0 ? substantive.length / total : 0
    out.Writing = {
      status: total === 0 ? 'Unknown' : ratio > 0.8 ? 'Strong' : ratio > 0.5 ? 'Emerging' : 'Weak',
      reason: `${substantive.length}/${total} sections have substantive content.`,
      evidence: [],
    }
  }
  // Reproducibility
  {
    const reproGaps = gaps.filter((g) => g.type === 'reproducibility' || g.type === 'evidence-without-artifact').length
    const artifacts = evidence.filter((e) => e.provenance.rawArtifacts.length > 0).length
    out.Reproducibility = {
      status: evidence.length === 0 ? 'Unknown' : reproGaps === 0 && artifacts > 0 ? 'Strong' : artifacts > 0 ? 'Emerging' : 'Weak',
      reason: `${artifacts}/${evidence.length} evidence item(s) reference raw artifacts; ${reproGaps} reproducibility gap(s) open.`,
      evidence: evidence.filter((e) => e.provenance.rawArtifacts.length > 0).slice(0, 5).map((e) => e.id),
    }
  }

  void evidenceMap
  return out
}

/** 供状态摘要使用的成熟度总览。 */
export function maturityOverview(
  maturity: Record<PaperMaturityDimension, PaperMaturity>,
): { established: PaperMaturityDimension[]; emerging: PaperMaturityDimension[]; missing: PaperMaturityDimension[] } {
  const established: PaperMaturityDimension[] = []
  const emerging: PaperMaturityDimension[] = []
  const missing: PaperMaturityDimension[] = []
  for (const d of PAPER_MATURITY_DIMENSIONS) {
    const l = maturity[d].status
    if (l === 'Strong' || l === 'Established') established.push(d)
    else if (l === 'Unknown') missing.push(d)
    else emerging.push(d)
  }
  return { established, emerging, missing }
}

/* ════════════════════════════════════════════════════════════════════════
 * Evolution 摘要（供 Research Context / 工具）
 * ════════════════════════════════════════════════════════════════════════ */

/** Paper 演化状态摘要（"这篇论文现在怎么样"）。 */
export interface PaperStatusSummary {
  paperId: string
  title: string
  status: string
  version: string
  sections: { total: number; substantive: number }
  claims: { total: number; withEvidence: number; withoutEvidence: number }
  evidence: { usedInManuscript: number; total: number }
  gaps: { open: number; high: number }
  openProposals: number
  evolutionEvents: number
  maturity: { established: PaperMaturityDimension[]; emerging: PaperMaturityDimension[]; missing: PaperMaturityDimension[] }
}

/** 汇总 Paper 状态（纯只读）。 */
export function paperStatusSummary(workspace: string, paperId: string): PaperStatusSummary | undefined {
  const paper = readPaper(workspace, paperId)
  if (!paper) return undefined
  const claims = readClaimMap(workspace, paperId)
  const evidence = listEvidence(workspace)
  const evidenceMap = buildEvidenceMap(workspace, paperId)
  const gaps = listPaperGaps(workspace, paperId)
  const openGaps = gaps.filter((g) => !g.resolved)
  const substantive = paper.sections.filter((s) => s.body.replace(/<!--[\s\S]*?-->/g, '').trim().length > 60).length
  const maturity = readPaperMaturity(workspace, paperId)

  return {
    paperId,
    title: paper.metadata.title ?? paper.id,
    status: paper.metadata.status,
    version: paper.metadata.version,
    sections: { total: paper.sections.length, substantive },
    claims: {
      total: claims.length,
      withEvidence: claims.filter((c) => c.evidence.length > 0).length,
      withoutEvidence: claims.filter((c) => c.evidence.length === 0).length,
    },
    evidence: { usedInManuscript: evidenceMap.filter((e) => e.sections.length > 0).length, total: evidence.length },
    gaps: { open: openGaps.length, high: openGaps.filter((g) => g.priority === 'high').length },
    openProposals: listProposals(workspace, paperId).filter((p) => p.status === 'proposed').length,
    evolutionEvents: listEvolutionEvents(workspace, paperId).length,
    maturity: maturityOverview(maturity),
  }
}

/** 清理一个提案（用于测试/误建）。 */
export function deleteProposal(workspace: string, paperId: string, proposalId: string): boolean {
  const file = join(proposalsDir(workspace, paperId), `${proposalId}.md`)
  if (!existsSync(file)) return false
  rmSync(file)
  return true
}
