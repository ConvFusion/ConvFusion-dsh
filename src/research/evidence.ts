/**
 * ConvFusion 2.0 — Evidence Store（Stage 4）
 *
 * ## Evidence 是什么（§3）
 *
 * ```text
 * Evidence = Traceable Research Fact
 * ```
 *
 * 它**不是**"程序输出的漂亮包装"（§2），而是**能够支持研究判断的可追溯证据资产**。
 * 因此每条 Evidence 必须能回答：用了什么数据/模型/基线/参数/环境？能否复现？
 * 与什么比较？支持哪个假设？
 *
 * ## 三条硬约束
 *
 * 1. **不删除性覆盖**（§9）：Evidence 被新结果取代时标 `superseded` 并建立
 *    `supersedes` / `supersededBy` 双向关系，**历史永久保留**。
 * 2. **不把执行输出直接当 Evidence**（§29）：Execution Output → Candidate Evidence →
 *    Evidence Extraction → Validation → Evidence。本模块提供的是**资产层**，
 *    抽取语义仍由 Agent/用户完成。
 * 3. **原始产物必须保留**（§30）：Evidence 只**引用** raw artifacts（`## Supporting Data`
 *    / provenance），绝不替代它们。
 *
 * ## 文件布局（§36）
 *
 * ```text
 * research/evidence/E001.md
 * ```
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVIDENCE_DIR,
  EVIDENCE_SOURCES,
  EVIDENCE_STATUSES,
  RESEARCH_DIR,
  makeResearchId,
  parseResearchId,
  type EvidenceDocument,
  type EvidenceLinkKind,
  type EvidenceProvenance,
  type EvidenceSource,
  type EvidenceStatus,
} from './research-data.js'
import {
  findSection,
  parseFrontmatter,
  parseIdList,
  parseSections,
  renderFrontmatter,
  renderSections,
  stripFrontmatter,
  stripArchiveHeader,
} from './markdown.js'

/** 归档目录（版本快照）：`research/evidence/.history/`。 */
const EVIDENCE_HISTORY = `${EVIDENCE_DIR}/.history`

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 序列化
 * ════════════════════════════════════════════════════════════════════════ */

function normalizeSource(raw: string | undefined): EvidenceSource {
  const v = (raw ?? '').trim().toLowerCase()
  return (EVIDENCE_SOURCES as readonly string[]).includes(v) ? (v as EvidenceSource) : 'observation'
}

function normalizeStatus(raw: string | undefined): EvidenceStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return (EVIDENCE_STATUSES as readonly string[]).includes(v) ? (v as EvidenceStatus) : 'unverified'
}

/** 解析计划关联（`plan: experiment-design.md` 或 `plan: experiment-design`）。 */
function normalizePlanRef(raw: string | undefined): string | undefined {
  const v = (raw ?? '').trim()
  if (!v) return undefined
  return v.replace(/^plans\//, '').replace(/\.md$/, '')
}

/** 解析一条 Evidence Markdown。 */
export function parseEvidenceDocument(absPath: string, relPath: string): EvidenceDocument | null {
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
    name: (parsed.title ?? '').replace(/^Evidence:\s*/i, '').trim() || fm.name || id,
    type: fm.type || `${normalizeSource(fm.source_kind ?? fm.source)}-evidence`,
    sourceKind: normalizeSource(fm.source_kind ?? fm.source),
    status: normalizeStatus(fm.status),
    supports: parseIdList(fm.supports ?? findSection(parsed.sections, 'Supports')),
    contradicts: parseIdList(fm.contradicts),
    ...(fm.supersedes ? { supersedes: fm.supersedes.toUpperCase() } : {}),
    ...(fm.superseded_by ? { supersededBy: fm.superseded_by.toUpperCase() } : {}),
    provenance: {
      ...(normalizePlanRef(fm.plan) ? { plan: normalizePlanRef(fm.plan) } : {}),
      ...(fm.harness_session ? { harnessSession: fm.harness_session } : {}),
      ...(fm.source_skill ? { sourceSkill: fm.source_skill } : {}),
      ...(fm.citation ? { citation: fm.citation } : {}),
      ...(fm.source && !EVIDENCE_SOURCES.includes(fm.source as EvidenceSource) ? { source: fm.source } : {}),
      ...(fm.paper ? { paper: fm.paper } : {}),
      // ⚠️ 两种载体要分别解析：frontmatter 里是 `a | b`，Markdown 章节里是列表项。
      // 混用同一个解析器会把 frontmatter 形式解析成空数组（曾经的真 bug）。
      rawArtifacts: fm.raw_artifacts
        ? splitDelimited(fm.raw_artifacts)
        : parseArtifacts(findSection(parsed.sections, 'Supporting Data')),
    },
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    sections: parsed.sections,
    body,
    path: absPath,
    relPath,
  }
}

/** 解析 `|` 分隔的 frontmatter 字段（如 `raw_artifacts: a.csv | b.log`）。 */
function splitDelimited(raw: string | undefined): string[] {
  if (!raw) return []
  return [...new Set(raw.split('|').map((s) => s.trim()).filter((s) => s.length > 0))]
}

/** 从 `## Supporting Data` 提取文件引用（列表项 / 反引号路径）。 */
function parseArtifacts(raw: string | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/) ?? line.match(/`([^`]+)`/)
    if (m) {
      const v = m[1].trim().replace(/^`|`$/g, '')
      if (v && !v.startsWith('<!--')) out.push(v)
    }
  }
  return [...new Set(out)]
}

/** 序列化一条 Evidence。 */
export function serializeEvidenceDocument(input: {
  id: string
  name: string
  type: string
  sourceKind: EvidenceSource
  status: EvidenceStatus
  supports: readonly string[]
  contradicts: readonly string[]
  supersedes?: string
  supersededBy?: string
  provenance: EvidenceProvenance
  createdAt?: string
  updatedAt?: string
  sections: Array<{ title: string; body: string }>
}): string {
  const front = renderFrontmatter({
    name: input.name,
    type: input.type,
    status: input.status,
    source_kind: input.sourceKind,
    supports: input.supports.length ? input.supports.join(', ') : undefined,
    contradicts: input.contradicts.length ? input.contradicts.join(', ') : undefined,
    supersedes: input.supersedes,
    superseded_by: input.supersededBy,
    plan: input.provenance.plan,
    paper: input.provenance.paper,
    source_skill: input.provenance.sourceSkill,
    citation: input.provenance.citation,
    source: input.provenance.source,
    harness_session: input.provenance.harnessSession,
    raw_artifacts: input.provenance.rawArtifacts.length ? input.provenance.rawArtifacts.join(' | ') : undefined,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })
  return `${front}\n\n${renderSections(`Evidence: ${input.name}`, input.sections)}`
}

/* ════════════════════════════════════════════════════════════════════════
 * 发现（读）
 * ════════════════════════════════════════════════════════════════════════ */

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

/** 列出全部 Evidence（按 id 排序）。 */
export function listEvidence(workspace: string): EvidenceDocument[] {
  const dir = join(workspace, EVIDENCE_DIR)
  const out: EvidenceDocument[] = []
  for (const file of listMarkdown(dir)) {
    const doc = parseEvidenceDocument(join(dir, file), `${EVIDENCE_DIR}/${file}`)
    if (doc) out.push(doc)
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** 读一条 Evidence。 */
export function readEvidence(workspace: string, id: string): EvidenceDocument | undefined {
  const norm = id.trim().toUpperCase()
  return listEvidence(workspace).find((e) => e.id === norm)
}

/** 下一个可用 Evidence id（§37 的连续编号）。 */
export function nextEvidenceId(workspace: string): string {
  const used = listEvidence(workspace)
    .map((e) => parseResearchId(e.id)?.n ?? 0)
    .filter((n) => n > 0)
  const max = used.length ? Math.max(...used) : 0
  return makeResearchId('evidence', max + 1)
}

/* ════════════════════════════════════════════════════════════════════════
 * 写操作
 * ════════════════════════════════════════════════════════════════════════ */

export interface EvidenceWriteError {
  error: string
}
export function isEvidenceWriteError(v: unknown): v is EvidenceWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

function ensureDir(workspace: string): string {
  const dir = join(workspace, EVIDENCE_DIR)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(workspace, RESEARCH_DIR), { recursive: true })
  return dir
}

export interface CreateEvidenceInput {
  /** 显式 id（可选）；缺省自动取下一个 E 编号。 */
  id?: string
  name: string
  type?: string
  sourceKind?: EvidenceSource
  status?: EvidenceStatus
  /** 该 Evidence 支持 / 反驳的 Claim id（§10）。 */
  supports?: readonly string[]
  contradicts?: readonly string[]
  plan?: string
  paper?: string
  sourceSkill?: string
  citation?: string
  source?: string
  harnessSession?: string
  rawArtifacts?: readonly string[]
  /** 正文章节（缺省套用 §6 的推荐结构）。 */
  sections?: Array<{ title: string; body: string }>
  /** 一句话结论（写入 `## Claim`）。 */
  claim?: string
  /** 结果（写入 `## Result`）。 */
  result?: string
  /** 观察（写入 `## Observation`）。 */
  observation?: string
}

/** §6 的推荐章节骨架（**推荐**，不是必需 —— 缺章节不报错）。 */
export function evidenceSectionsTemplate(input: CreateEvidenceInput): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = []
  sections.push({
    title: 'Claim',
    body: input.claim?.trim() || '<!-- 这条证据支持（或反驳）的判断是什么？ -->',
  })
  sections.push({
    title: 'Experimental Context',
    body: '<!-- 数据集 / 基线 / 配置 / 环境。缺少这些，结果不可比较。 -->',
  })
  sections.push({ title: 'Result', body: input.result?.trim() || '<!-- 具体数值或表格 -->' })
  sections.push({ title: 'Observation', body: input.observation?.trim() || '<!-- 从结果里读出了什么 -->' })
  sections.push({
    title: 'Supporting Data',
    body:
      input.rawArtifacts?.length
        ? input.rawArtifacts.map((a) => `- ${a}`).join('\n')
        : '<!-- 原始产物路径：结果文件 / 日志 / 可视化 / 配置。**必须保留原始数据**（§30） -->',
  })
  sections.push({ title: 'Reproducibility', body: '<!-- 别人怎么复现？ -->' })
  sections.push({
    title: 'Validation',
    body: `Status: ${input.status ?? 'unverified'}`,
  })
  return sections
}

/**
 * 创建一条 Evidence。
 *
 * ⚠️ 语义提醒（§29）：调用方应当**已经完成** Evidence Extraction ——
 * 本函数不把执行输出自动转成证据，只负责把整理好的证据落成资产。
 */
export function createEvidence(workspace: string, input: CreateEvidenceInput): EvidenceDocument | EvidenceWriteError {
  const name = input.name.trim()
  if (!name) return { error: 'Evidence 名称不能为空。' }

  const id = (input.id ?? nextEvidenceId(workspace)).trim().toUpperCase()
  const parsed = parseResearchId(id)
  if (!parsed || parsed.kind !== 'evidence') {
    return { error: `非法 Evidence id：${id}（应为 E001 形式）` }
  }

  const dir = ensureDir(workspace)
  const file = join(dir, `${id}.md`)
  if (existsSync(file)) return { error: `Evidence \`${id}\` 已存在。` }

  const now = new Date().toISOString()
  const status = input.status ?? 'unverified'
  writeFileSync(
    file,
    serializeEvidenceDocument({
      id,
      name,
      type: input.type ?? `${input.sourceKind ?? 'observation'}-evidence`,
      sourceKind: input.sourceKind ?? 'observation',
      status,
      supports: (input.supports ?? []).map((s) => s.toUpperCase()),
      contradicts: (input.contradicts ?? []).map((s) => s.toUpperCase()),
      provenance: {
        ...(input.plan ? { plan: input.plan.replace(/^plans\//, '').replace(/\.md$/, '') } : {}),
        ...(input.paper ? { paper: input.paper } : {}),
        ...(input.sourceSkill ? { sourceSkill: input.sourceSkill } : {}),
        ...(input.citation ? { citation: input.citation } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.harnessSession ? { harnessSession: input.harnessSession } : {}),
        rawArtifacts: [...(input.rawArtifacts ?? [])],
      },
      createdAt: now,
      updatedAt: now,
      sections: input.sections ?? evidenceSectionsTemplate(input),
    }),
    'utf8',
  )
  return parseEvidenceDocument(file, `${EVIDENCE_DIR}/${id}.md`) ?? { error: '创建后解析失败。' }
}

/** 记录一条历史快照（不删除性覆盖的实现）。 */
function snapshot(workspace: string, doc: EvidenceDocument, note: string): void {
  const dir = join(workspace, EVIDENCE_HISTORY.replace(`${EVIDENCE_DIR}/`, `${EVIDENCE_DIR}/`))
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    const current = readFileSync(doc.path, 'utf8')
    writeFileSync(join(dir, `${doc.id}.${stamp}.md`), `<!-- snapshot: ${note} -->\n${current}`, 'utf8')
  } catch {
    /* 首次创建时可能无文件；静默跳过 */
  }
}

/** 列出某条 Evidence 的历史快照。 */
export function listEvidenceHistory(workspace: string, id: string): string[] {
  const dir = join(workspace, EVIDENCE_HISTORY)
  const norm = id.trim().toUpperCase()
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith(`${norm}.`) && f.endsWith('.md'))
      .sort()
      .map((f) => `${EVIDENCE_HISTORY}/${f}`)
  } catch {
    return []
  }
}

/** 读取某个历史快照。 */
export function readEvidenceSnapshot(workspace: string, relPath: string): string | undefined {
  if (!relPath.startsWith(EVIDENCE_HISTORY) || relPath.includes('..')) return undefined
  try {
    return readFileSync(join(workspace, relPath), 'utf8')
  } catch {
    return undefined
  }
}

/** 整体保存正文（编辑器路径）。 */
export function saveEvidenceBody(workspace: string, id: string, body: string): EvidenceDocument | EvidenceWriteError {
  const doc = readEvidence(workspace, id)
  if (!doc) return { error: `找不到 Evidence \`${id}\`。` }
  snapshot(workspace, doc, 'before saveEvidenceBody')
  writeFileSync(doc.path, body, 'utf8')
  return parseEvidenceDocument(doc.path, doc.relPath) ?? { error: '保存后解析失败。' }
}

/** 替换单个章节。 */
export function updateEvidenceSection(
  workspace: string,
  id: string,
  title: string,
  body: string,
): EvidenceDocument | EvidenceWriteError {
  const doc = readEvidence(workspace, id)
  if (!doc) return { error: `找不到 Evidence \`${id}\`。` }
  snapshot(workspace, doc, `before update ${title}`)
  const idx = doc.sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase())
  const sections = [...doc.sections]
  if (idx >= 0) sections[idx] = { title: sections[idx].title, body }
  else sections.push({ title, body })
  return writeEvidence(workspace, doc, { sections })
}

function writeEvidence(
  workspace: string,
  doc: EvidenceDocument,
  patch: {
    status?: EvidenceStatus
    supports?: readonly string[]
    contradicts?: readonly string[]
    supersedes?: string
    supersededBy?: string
    provenance?: EvidenceProvenance
    sections?: Array<{ title: string; body: string }>
  },
): EvidenceDocument | EvidenceWriteError {
  writeFileSync(
    doc.path,
    serializeEvidenceDocument({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      sourceKind: doc.sourceKind,
      status: patch.status ?? doc.status,
      supports: patch.supports ?? doc.supports,
      contradicts: patch.contradicts ?? doc.contradicts,
      supersedes: patch.supersedes ?? doc.supersedes,
      supersededBy: patch.supersededBy ?? doc.supersededBy,
      provenance: patch.provenance ?? doc.provenance,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      sections: patch.sections ?? doc.sections,
    }),
    'utf8',
  )
  return parseEvidenceDocument(doc.path, doc.relPath) ?? { error: '写入后解析失败。' }
}

/** 设置验证状态（§8 / §40-B Validate）。 */
export function setEvidenceStatus(
  workspace: string,
  id: string,
  status: EvidenceStatus,
): EvidenceDocument | EvidenceWriteError {
  const doc = readEvidence(workspace, id)
  if (!doc) return { error: `找不到 Evidence \`${id}\`。` }
  snapshot(workspace, doc, `status ${doc.status} → ${status}`)
  const sections = doc.sections.some((s) => s.title === 'Validation')
    ? doc.sections.map((s) => (s.title === 'Validation' ? { title: 'Validation', body: `Status: ${status}` } : s))
    : [...doc.sections, { title: 'Validation', body: `Status: ${status}` }]
  return writeEvidence(workspace, doc, { status, sections })
}

/**
 * 用新 Evidence 取代旧 Evidence（§9：**不删除性覆盖**）。
 *
 * 建立双向关系：新证据 `supersedes` 旧证据，旧证据标 `superseded` 并记 `supersededBy`。
 * 旧的**文件永久保留** —— 这样才能回答"为什么研究结论变了"。
 */
export function supersedeEvidence(
  workspace: string,
  oldId: string,
  newId: string,
  note?: string,
): { ok: true; old: string; next: string } | EvidenceWriteError {
  const oldDoc = readEvidence(workspace, oldId)
  if (!oldDoc) return { error: `找不到旧 Evidence \`${oldId}\`。` }
  const newDoc = readEvidence(workspace, newId)
  if (!newDoc) return { error: `找不到新 Evidence \`${newId}\`。` }

  snapshot(workspace, oldDoc, note ?? `superseded by ${newDoc.id}`)
  const oldRes = writeEvidence(workspace, oldDoc, {
    status: 'superseded',
    supersededBy: newDoc.id,
    sections: oldDoc.sections.some((s) => s.title === 'Validation')
      ? oldDoc.sections.map((s) =>
          s.title === 'Validation'
            ? { title: 'Validation', body: `Status: superseded\n\nSuperseded by: ${newDoc.id}${note ? `\n\nReason: ${note}` : ''}` }
            : s,
        )
      : [...oldDoc.sections, { title: 'Validation', body: `Status: superseded\n\nSuperseded by: ${newDoc.id}` }],
  })
  if (isEvidenceWriteError(oldRes)) return oldRes

  snapshot(workspace, newDoc, `supersedes ${oldDoc.id}`)
  const newRes = writeEvidence(workspace, newDoc, { supersedes: oldDoc.id })
  if (isEvidenceWriteError(newRes)) return newRes

  return { ok: true, old: oldDoc.id, next: newDoc.id }
}

/** 把 Evidence 关联到某个 Claim（§10 的 `supports` / `contradicts`）。 */
export function linkEvidenceToClaim(
  workspace: string,
  evidenceId: string,
  claimId: string,
  kind: EvidenceLinkKind = 'supports',
): EvidenceDocument | EvidenceWriteError {
  const doc = readEvidence(workspace, evidenceId)
  if (!doc) return { error: `找不到 Evidence \`${evidenceId}\`。` }
  const claim = claimId.trim().toUpperCase()
  if (!/^C\d{1,4}$/.test(claim)) return { error: `非法 Claim id：${claimId}（应为 C001 形式）` }

  snapshot(workspace, doc, `${kind} ${claim}`)
  const supports = kind === 'supports' ? [...new Set([...doc.supports, claim])] : doc.supports.filter((c) => c !== claim)
  const contradicts =
    kind === 'contradicts' ? [...new Set([...doc.contradicts, claim])] : doc.contradicts.filter((c) => c !== claim)
  return writeEvidence(workspace, doc, { supports, contradicts })
}

/**
 * 删除一条 Evidence。
 *
 * ⚠️ 出于科研诚信，这里只允许删除**从未被任何 Claim 引用**的 Evidence（误录场景）。
 * 已被引用的证据应当 `supersede` 或标 `rejected`，**不是删除**（§9）。
 */
export function deleteEvidence(
  workspace: string,
  id: string,
  opts: { claimIds?: readonly string[] } = {},
): { ok: true; id: string } | EvidenceWriteError {
  const doc = readEvidence(workspace, id)
  if (!doc) return { error: `找不到 Evidence \`${id}\`。` }
  if (doc.supports.length > 0 || doc.contradicts.length > 0) {
    return {
      error: `\`${id}\` 已被 Claim 引用（${[...doc.supports, ...doc.contradicts].join(', ')}）。` +
        '科研证据不应删除：请用 supersede 或标记 rejected。',
    }
  }
  if (opts.claimIds?.includes(doc.id)) {
    return { error: `\`${id}\` 被 Claim 引用，拒绝删除。` }
  }
  snapshot(workspace, doc, 'before delete')
  try {
    rmSync(doc.path)
  } catch (e) {
    return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id: doc.id }
}

/* ════════════════════════════════════════════════════════════════════════
 * 语义读取（供 Claim / Research State / Paper 消费）
 * ════════════════════════════════════════════════════════════════════════ */

/** `## Claim` 章节内容（这条证据支持的具体判断）。 */
export function evidenceClaim(doc: EvidenceDocument): string {
  return findSection(doc.sections, 'Claim')
}

/** `## Result` 内容。 */
export function evidenceResult(doc: EvidenceDocument): string {
  return findSection(doc.sections, 'Result')
}

/** `## Observation` 内容。 */
export function evidenceObservation(doc: EvidenceDocument): string {
  return findSection(doc.sections, 'Observation')
}

/** `## Supporting Data` 内容（原始产物引用，§30）。 */
export function evidenceSupportingData(doc: EvidenceDocument): string {
  return findSection(doc.sections, 'Supporting Data')
}

/** 查出所有支持某 Claim 的 Evidence（§10 反向索引）。 */
export function evidenceForClaim(workspace: string, claimId: string): EvidenceDocument[] {
  const norm = claimId.trim().toUpperCase()
  return listEvidence(workspace).filter((e) => e.supports.includes(norm))
}

/** 查出所有反驳某 Claim 的 Evidence。 */
export function contradictionsForClaim(workspace: string, claimId: string): EvidenceDocument[] {
  const norm = claimId.trim().toUpperCase()
  return listEvidence(workspace).filter((e) => e.contradicts.includes(norm))
}
