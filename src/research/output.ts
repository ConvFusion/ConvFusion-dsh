/**
 * ConvFusion 2.0 — Output Artifact 注册表与转换（Stage 5.1）
 *
 * ## 本模块负责
 *
 * - **Output Artifact**：create / read / edit / version / archive（Task 1）
 * - **Output Source**：Research State / Paper / Claims / Evidence / Plans（Task 3）
 * - **Output Review**：review / accept / edit / reject / version（Task 7）
 * - **Provenance**：Output → Source → Skill → Plan → Session → Evidence（Task 8）
 * - **Impact Analysis**：哪些 Output 受研究变化影响（Task 9）
 * - **Output Registry**：统一 `outputs/`，不为每种类型建独立系统（Task 10）
 *
 * ## 两条硬边界
 *
 * 1. **Output 不应修改 Research State**（§18）。本模块的**类型签名**体现了这一点：
 *    所有函数只接收输出目录，绝不触碰 `research/`；并且没有任何函数
 *    返回对 Research State 的写操作。
 * 2. **不做三套 workflow**（Task 10）：Patent / Report / Slides 共用同一套
 *    Artifact + Profile 机制，差异只在 `output-profiles.ts` 的数据里。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OUTPUT_AUX_DIRS,
  OUTPUT_AUX_FILES,
  OUTPUT_DIRS,
  OUTPUT_ID_PREFIX,
  OUTPUT_MAIN_FILE,
  OUTPUT_STATUSES,
  OUTPUT_TYPES,
  OUTPUT_VERSIONS_DIR,
  OUTPUTS_DIR,
  type OutputArtifact,
  type OutputDependency,
  type OutputProfile,
  type OutputQualityResult,
  type OutputReviewRecord,
  type OutputSource,
  type OutputStatus,
  type OutputType,
  type OutputVersionEntry,
} from './output-data.js'
import { getOutputProfile } from './output-profiles.js'
import {
  findSection,
  parseFrontmatter,
  parseIdList,
  parseSections,
  renderFrontmatter,
  renderSections,
  stripFrontmatter,
} from './markdown.js'

/* ════════════════════════════════════════════════════════════════════════
 * 路径
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一个成果**自己的目录**（`outputs/<type>/<id>/`，§14）。
 *
 * ⚠️ `paper` 是**特例**：Paper 是核心 Research Output，按 §8 放在 `papers/<id>/`，
 * **不在 `outputs/` 下**。
 *
 * 成果用子目录而不是单文件，是为了容纳它的附属产物（§14 的 `provenance.md`，
 * 以及将来的图表 / 版本）。§24 的"统一注册表"体现在**同一套结构**，
 * 而不是把它们压成同名文件。
 */
export function outputDir(workspace: string, type: OutputType, id: string): string {
  if (type === 'paper') return join(workspace, 'papers', id)
  return join(workspace, OUTPUTS_DIR, OUTPUT_DIRS[type], id)
}

/** 相对 workspace 的成果目录（如 `outputs/patents/patent-001`）。 */
export function outputRelDir(type: OutputType, id: string): string {
  if (type === 'paper') return `papers/${id}`
  return `${OUTPUTS_DIR}/${OUTPUT_DIRS[type]}/${id}`
}

/** 一个类型目录（绝对；= 该类型下所有成果目录的父目录）。 */
export function outputTypeDir(workspace: string, type: OutputType): string {
  if (type === 'paper') return join(workspace, 'papers')
  return join(workspace, OUTPUTS_DIR, OUTPUT_DIRS[type])
}

/** 相对 workspace 的类型目录。 */
export function outputTypeRelDir(type: OutputType): string {
  if (type === 'paper') return 'papers'
  return `${OUTPUTS_DIR}/${OUTPUT_DIRS[type]}`
}

/**
 * 成果的主文档（`<成果目录>/<主文档名>`）。
 *
 * §11–§13：`patents/patent-001/patent.md` / `reports/report-001/report.md` /
 * `slides/presentation-001/slides.md` —— **主文档不重复 id**。
 */
function outputPath(workspace: string, type: OutputType, id: string): string {
  return join(outputDir(workspace, type, id), OUTPUT_MAIN_FILE[type])
}

/** 附属文件（`metadata.md` / `claims.md` / `provenance.md`）的路径。 */
function outputAuxPath(workspace: string, type: OutputType, id: string, name: string): string {
  return join(outputDir(workspace, type, id), name)
}

function readTextOrNull(p: string): string | null {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 序列化
 * ════════════════════════════════════════════════════════════════════════ */

function normalizeStatus(raw: string | undefined): OutputStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return (OUTPUT_STATUSES as readonly string[]).includes(v) ? (v as OutputStatus) : 'draft'
}

function normalizeType(raw: string | undefined): OutputType {
  const v = (raw ?? '').trim().toLowerCase()
  return (OUTPUT_TYPES as readonly string[]).includes(v) ? (v as OutputType) : 'technical-report'
}

/**
 * Output id 的**权威来源**（§11–§13）。
 *
 * 目录式布局是 `<类型目录>/<id>/<主文档>.md`，主文档名**不重复 id**
 * （`patents/patent-001/patent.md`）—— 所以 id 必须取自**父目录**，不能取自文件名。
 * 仅当父目录本身就是类型目录（即 `<类型目录>/<id>.md` 的旧式布局）时才回落到文件名。
 */
function deriveOutputId(absPath: string, frontmatterId?: string): string {
  const explicit = (frontmatterId ?? '').trim()
  if (explicit) return explicit
  const segments = absPath.split('/').filter(Boolean)
  const file = segments.pop() ?? ''
  const parent = segments.pop() ?? ''
  const typeDirs = new Set<string>(Object.values(OUTPUT_DIRS))
  if (parent && !typeDirs.has(parent)) return parent
  return file.replace(/\.md$/, '')
}

/** 解析一个 Output Artifact。 */
export function parseOutputArtifact(absPath: string, relPath: string, typeHint?: OutputType): OutputArtifact | null {
  const source = readTextOrNull(absPath)
  if (source === null) return null
  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source).trim()
  const parsed = parseSections(body)
  const id = deriveOutputId(absPath, fm.id)

  // 处置记录**不在 Markdown 里**（frontmatter 只承担 identity / provenance）：
  // 结构化处置记录在 `outputs/.history/<id>/reviews.json`，由 readOutputReviews 读取。
  const reviews: OutputReviewRecord[] = []

  return {
    id,
    type: typeHint ?? normalizeType(fm.type),
    title: (parsed.title ?? '').replace(/^(?:Output|Patent|Report|Slides|Presentation|Paper):\s*/i, '').trim() || fm.title || id,
    status: normalizeStatus(fm.status),
    version: fm.version || '0.1',
    ...(fm.goal ? { goal: fm.goal } : {}),
    source: {
      ...(fm.source_research_state ? { researchState: fm.source_research_state } : {}),
      ...(fm.source_paper ? { paper: fm.source_paper } : {}),
      claims: parseIdList(fm.source_claims),
      evidence: parseIdList(fm.source_evidence),
      plans: (fm.source_plans ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    },
    ...(fm.skill ? { skill: fm.skill } : {}),
    ...(fm.plan ? { plan: fm.plan } : {}),
    ...(fm.harness_session ? { harnessSession: fm.harness_session } : {}),
    sections: parsed.sections,
    body,
    reviews,
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    path: absPath,
    relPath,
  }
}

/** 序列化一个 Output Artifact。 */
export function serializeOutputArtifact(input: {
  id?: string
  title: string
  type: OutputType
  status: OutputStatus
  version: string
  goal?: string
  source: OutputSource
  skill?: string
  plan?: string
  harnessSession?: string
  createdAt?: string
  updatedAt?: string
  sections: Array<{ title: string; body: string }>
}): string {
  const front = renderFrontmatter({
    id: input.id,
    title: input.title,
    type: input.type,
    status: input.status,
    version: input.version,
    goal: input.goal,
    source_research_state: input.source.researchState,
    source_paper: input.source.paper,
    source_claims: input.source.claims.length ? input.source.claims.join(', ') : undefined,
    source_evidence: input.source.evidence.length ? input.source.evidence.join(', ') : undefined,
    source_plans: input.source.plans.length ? input.source.plans.join(', ') : undefined,
    skill: input.skill,
    plan: input.plan,
    harness_session: input.harnessSession,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })
  const label = profileHeading(input.type, input.title)
  return `${front}\n\n${renderSections(label, input.sections)}`
}

function profileHeading(type: OutputType, title: string): string {
  const prefix: Record<OutputType, string> = {
    paper: 'Paper',
    patent: 'Patent',
    'technical-report': 'Technical Report',
    slides: 'Presentation',
  }
  return `${prefix[type]}: ${title}`
}

/* ════════════════════════════════════════════════════════════════════════
 * 发现（Task 10：统一注册表）
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

/**
 * 列出某个类型的全部 Output。
 *
 * `paper` 类型**不在此扫描** —— Paper 的文件由 `paper.ts` 管理（它有独立结构：
 * metadata/claims/gaps/evolution/history）。这里只处理 `outputs/` 下的其他成果。
 */
export function listOutputs(workspace: string, type: OutputType): OutputArtifact[] {
  if (type === 'paper') return []
  const out: OutputArtifact[] = []
  let dirs: import('node:fs').Dirent[]
  try {
    dirs = readdirSync(outputTypeDir(workspace, type), { withFileTypes: true })
  } catch {
    return out
  }
  for (const d of dirs.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = OUTPUT_MAIN_FILE[type]
    const abs = join(outputTypeDir(workspace, type), d.name, file)
    if (!existsSync(abs)) continue
    const doc = parseOutputArtifact(abs, `${outputTypeRelDir(type)}/${d.name}/${file}`, type)
    if (doc) out.push(doc)
  }
  return out
}

/**
 * 列出全部 Output（跨类型；统一注册表视图）。
 *
 * 不含 Paper —— 它由 `papers/` 承载，`paperStatusSummary()` 是其视图。
 */
export function listAllOutputs(workspace: string): OutputArtifact[] {
  return OUTPUT_TYPES.filter((t) => t !== 'paper').flatMap((t) => listOutputs(workspace, t))
}

/** 按 id 找 Output（跨类型）。 */
export function readOutput(workspace: string, id: string): OutputArtifact | undefined {
  return listAllOutputs(workspace).find((o) => o.id === id)
}

/** 下一个 id（如 `patent-001`）。 */
export function nextOutputId(workspace: string, type: OutputType): string {
  const existing = listOutputs(workspace, type)
  // id 用**单数**前缀（patent-001），目录用复数（patents/）—— 两者刻意分开
  const prefix = OUTPUT_ID_PREFIX[type]
  const max = existing.reduce((n, o) => {
    const m = o.id.match(/(\d+)$/)
    return m ? Math.max(n, Number(m[1])) : n
  }, 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

/* ════════════════════════════════════════════════════════════════════════
 * 创建 / 编辑（Task 1）
 * ════════════════════════════════════════════════════════════════════════ */

export interface OutputWriteError {
  error: string
}
export function isOutputWriteError(v: unknown): v is OutputWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

/**
 * Output 的正文骨架 —— **由 Profile 的结构生成**（§7）。
 *
 * 这是"Profile 是数据"的直接体现：结构不同只因为数据不同，
 * 不需要为每种类型写一段代码。
 */
export function outputSectionsTemplate(profile: OutputProfile, context: { goal?: string } = {}): Array<{ title: string; body: string }> {
  return profile.structure.map((title) => ({
    title,
    body:
      title.toLowerCase().includes('claim') && profile.type === 'patent'
        ? '<!-- 专利权利要求：由技术特征限定，**不是**研究主张（见 PATENT_CLAIM_NOTE）。 -->'
        : `<!-- ${title} -->`,
  }))
}

/**
 * 创建一个 Output Artifact（Task 1 create）。
 *
 * 注意：**不触碰 Research State**（§18）。来源只作为引用记录在 frontmatter。
 */
export function createOutput(
  workspace: string,
  input: {
    id?: string
    type: OutputType
    title: string
    goal?: string
    source?: Partial<OutputSource>
    skill?: string
    plan?: string
    harnessSession?: string
    /** 自定义正文；缺省用 Profile 结构生成骨架。 */
    sections?: Array<{ title: string; body: string }>
  },
): OutputArtifact | OutputWriteError {
  const title = input.title.trim()
  if (!title) return { error: 'Output 需要一个标题。' }

  const id = (input.id ?? nextOutputId(workspace, input.type)).trim()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { error: `非法 Output id：${id}（kebab-case）` }

  const file = outputPath(workspace, input.type, id)
  if (existsSync(file)) return { error: `Output \`${id}\` 已存在。` }

  const profile = getOutputProfile(input.type)
  const now = new Date().toISOString()
  const dir = outputDir(workspace, input.type, id)
  mkdirSync(dir, { recursive: true })
  // §11–§13：成果目录内的标准附属目录（如 slides 的 assets/）
  for (const sub of OUTPUT_AUX_DIRS[input.type]) mkdirSync(join(dir, sub), { recursive: true })
  writeFileSync(
    file,
    serializeOutputArtifact({
      id,
      title,
      type: input.type,
      status: 'draft',
      version: '0.1',
      ...(input.goal ? { goal: input.goal } : {}),
      source: {
        ...(input.source?.researchState ? { researchState: input.source.researchState } : {}),
        ...(input.source?.paper ? { paper: input.source.paper } : {}),
        claims: [...(input.source?.claims ?? [])],
        evidence: [...(input.source?.evidence ?? [])],
        plans: [...(input.source?.plans ?? [])],
      },
      ...(input.skill ?? profile.recommendedSkill ? { skill: input.skill ?? profile.recommendedSkill } : {}),
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.harnessSession ? { harnessSession: input.harnessSession } : {}),
      createdAt: now,
      updatedAt: now,
      sections: input.sections ?? outputSectionsTemplate(profile, { ...(input.goal ? { goal: input.goal } : {}) }),
    }),
    'utf8',
  )
  const created = parseOutputArtifact(file, `${outputRelDir(input.type, id)}/${OUTPUT_MAIN_FILE[input.type]}`, input.type)
  if (!created) return { error: '创建后解析失败。' }

  // §11–§13：metadata.md（成果自己的元数据）
  writeOutputMetadata(workspace, id)
  // §11：patent 的 claims.md（专利权利要求草案，**不同于** research claims）
  if (input.type === 'patent') writePatentClaimsFile(workspace, id)
  // §14：provenance 是成果的一部分，创建时就落盘（而非只在内存里可算）
  writeOutputProvenance(workspace, id)

  return created
}

/** 写成果自己的 `metadata.md`（§11–§13 都要求）。 */
export function writeOutputMetadata(workspace: string, id: string): string | undefined {
  const doc = readOutput(workspace, id)
  if (!doc) return undefined
  const front = renderFrontmatter({
    id: doc.id,
    type: doc.type,
    title: doc.title,
    status: doc.status,
    version: doc.version,
    goal: doc.goal,
    skill: doc.skill,
    plan: doc.plan,
    harness_session: doc.harnessSession,
    source_paper: doc.source.paper,
    source_research_state: doc.source.researchState,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  })
  const lines = [
    front,
    '',
    `# ${doc.title}`,
    '',
    `- **Type**: ${doc.type}`,
    `- **Status**: ${doc.status}`,
    `- **Version**: v${doc.version}`,
    ...(doc.goal ? [`- **Goal**: ${doc.goal}`] : []),
    ...(doc.skill ? [`- **Skill**: ${doc.skill}`] : []),
    ...(doc.plan ? [`- **Plan**: ${doc.plan}`] : []),
    ...(doc.source.paper ? [`- **Paper**: ${doc.source.paper}`] : []),
    `- **Claims used**: ${doc.source.claims.length ? doc.source.claims.join(', ') : '(none)'}`,
    `- **Evidence used**: ${doc.source.evidence.length ? doc.source.evidence.join(', ') : '(none)'}`,
    '',
  ]
  const rel = `${outputRelDir(doc.type, id)}/metadata.md`
  writeFileSync(outputAuxPath(workspace, doc.type, id, 'metadata.md'), lines.join('\n'), 'utf8')
  return rel
}

/**
 * 写专利的 `claims.md`（§11）。
 *
 * ⚠️ **Patent Claim ≠ Research Claim**（§10）。这里生成的**只是骨架**：
 * 真正的权利要求必须由 Patent Drafting Skill 依据技术方案重新表述出技术特征，
 * 不能把 `research/claims/C001.md` 的内容抄过来。因此骨架里显式写明这一点，
 * 避免后来者（人或 Agent）把研究主张直接填进去。
 */
export function writePatentClaimsFile(workspace: string, id: string): string | undefined {
  const doc = readOutput(workspace, id)
  if (!doc || doc.type !== 'patent') return undefined
  const lines = [
    '# Patent Claims (draft)',
    '',
    '<!--',
    '  A patent claim defines the boundary of an exclusive right through technical features.',
    '  It is NOT a research claim: a research claim states what is true about the world.',
    '',
    '  Do not copy research claims here. Restate the solution as a feature combination,',
    '  e.g. "A localization calibration method, comprising: receiving ...; determining ...;',
    '  calibrating ...". See the Patent Drafting skill.',
    '-->',
    '',
    '## Claims',
    '',
    '1. <!-- claim 1: independent claim as a feature combination -->',
    '',
    '## Notes',
    '',
    ...(doc.source.claims.length
      ? [`Research claims that informed this draft: ${doc.source.claims.join(', ')}.`]
      : ['No research claims recorded as the source of this draft.']),
    '',
  ]
  const rel = `${outputRelDir(doc.type, id)}/claims.md`
  writeFileSync(outputAuxPath(workspace, doc.type, id, 'claims.md'), lines.join('\n'), 'utf8')
  return rel
}

/**
 * 整体保存正文（编辑器路径）。
 *
 * ⚠️ 必须把新正文的**章节重新解析**后交给 writeOutput —— 否则 writeOutput 会用
 * 内存里那份**旧的** `doc.sections` 重新序列化，把刚写进去的内容覆盖掉
 * （表现为"保存成功但内容没变"）。
 */
export function saveOutputBody(workspace: string, id: string, body: string): OutputArtifact | OutputWriteError {
  const doc = readOutput(workspace, id)
  if (!doc) return { error: `找不到 Output \`${id}\`。` }
  const sections = parseSections(stripFrontmatter(body)).sections
  return writeOutput(workspace, doc, { sections })
}

/** 替换单个章节。 */
export function updateOutputSection(
  workspace: string,
  id: string,
  section: string,
  body: string,
): OutputArtifact | OutputWriteError {
  const doc = readOutput(workspace, id)
  if (!doc) return { error: `找不到 Output \`${id}\`。` }
  const idx = doc.sections.findIndex((s) => s.title.toLowerCase() === section.toLowerCase())
  const sections = [...doc.sections]
  if (idx >= 0) sections[idx] = { title: sections[idx].title, body }
  else sections.push({ title: section, body })
  return writeOutput(workspace, doc, { sections })
}

function touchOutput(workspace: string, doc: OutputArtifact): OutputArtifact | OutputWriteError {
  void workspace
  return writeOutput(workspace, doc, {})
}

function writeOutput(
  workspace: string,
  doc: OutputArtifact,
  patch: {
    status?: OutputStatus
    version?: string
    source?: OutputSource
    sections?: Array<{ title: string; body: string }>
    skill?: string
    plan?: string
    harnessSession?: string
    goal?: string
    title?: string
  },
): OutputArtifact | OutputWriteError {
  void workspace
  writeFileSync(
    doc.path,
    serializeOutputArtifact({
      id: doc.id,
      title: patch.title ?? doc.title,
      type: doc.type,
      status: patch.status ?? doc.status,
      version: patch.version ?? doc.version,
      goal: patch.goal ?? doc.goal,
      source: patch.source ?? doc.source,
      skill: patch.skill ?? doc.skill,
      plan: patch.plan ?? doc.plan,
      harnessSession: patch.harnessSession ?? doc.harnessSession,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      sections: patch.sections ?? doc.sections,
    }),
    'utf8',
  )
  const next = parseOutputArtifact(doc.path, doc.relPath, doc.type)
  if (!next) return { error: '写入后解析失败。' }
  // metadata.md / provenance.md 是成果的一部分（§11–§14），随主文档保持同步
  writeOutputMetadata(workspace, next.id)
  writeOutputProvenance(workspace, next.id)
  return next
}

/* ════════════════════════════════════════════════════════════════════════
 * 版本化（§21：不删除性覆盖）
 * ════════════════════════════════════════════════════════════════════════ */

/** 递增 Output 版本：`0.1` → `0.2`。 */
export function bumpOutputVersion(version: string, kind: 'minor' | 'major' = 'minor'): string {
  const m = version.replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?/)
  const major = m ? Number(m[1]) : 0
  const minor = m && m[2] ? Number(m[2]) : 0
  return kind === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`
}

const ARCHIVE_HEADER_RE = /^<!--\s*(?:snapshot|archived):[\s\S]*?-->\r?\n/

/** 归档当前版本（`<成果目录>/history/v<version>.md`），幂等。 */
export function archiveOutputVersion(
  workspace: string,
  id: string,
  options: { reason?: string; version?: string } = {},
): OutputVersionEntry | undefined {
  const doc = readOutput(workspace, id)
  if (!doc) return undefined
  const version = options.version ?? doc.version
  const dir = join(outputDir(workspace, doc.type, id), 'history')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `v${version.replace(/^v/i, '')}.md`)

  let current: string
  try {
    current = readFileSync(doc.path, 'utf8')
  } catch {
    return undefined
  }
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').replace(ARCHIVE_HEADER_RE, '')
    if (existing.trim() === current.trim()) return undefined
  }
  const header = options.reason ? `<!-- snapshot: ${new Date().toISOString()} — ${options.reason} -->\n` : ''
  writeFileSync(file, header + current, 'utf8')
  return {
    version,
    path: `${outputRelDir(doc.type, id)}/history/v${version.replace(/^v/i, '')}.md`,
    ...(options.reason ? { reason: options.reason } : {}),
    at: new Date().toISOString(),
  }
}

/** 列出历史版本。 */
export function listOutputVersions(workspace: string, id: string): OutputVersionEntry[] {
  const doc = readOutput(workspace, id)
  if (!doc) return []
  const dir = join(outputDir(workspace, doc.type, id), 'history')
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  return files
    .map((f) => {
      const version = f.replace(/^v/, '').replace(/\.md$/, '')
      const source = readTextOrNull(join(dir, f)) ?? ''
      const reason = source.match(/^<!--\s*snapshot:[^—]*—\s*(.*?)\s*-->/)?.[1]
      const at = source.match(/^<!--\s*snapshot:\s*([0-9T:.\-Z]+)/)?.[1]
      return {
        version,
        path: `${outputRelDir(doc.type, id)}/history/${f}`,
        ...(reason ? { reason } : {}),
        ...(at ? { at } : {}),
      }
    })
    .sort((a, b) => {
      const [a1, a2 = 0] = a.version.split('.').map(Number)
      const [b1, b2 = 0] = b.version.split('.').map(Number)
      return a1 - b1 || a2 - b2
    })
}

/** 读某个历史版本。 */
export function readOutputVersion(workspace: string, id: string, version: string): string | undefined {
  const doc = readOutput(workspace, id)
  if (!doc) return undefined
  return (
    readTextOrNull(join(outputDir(workspace, doc.type, id), 'history', `v${version.replace(/^v/i, '')}.md`)) ?? undefined
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * Review（Task 7 / §19）
 * ════════════════════════════════════════════════════════════════════════ */

/** 处置记录文件（`<成果目录>/history/reviews.json`）。 */
function reviewsPath(workspace: string, id: string): string {
  const doc = readOutput(workspace, id)
  if (!doc) return join(workspace, OUTPUT_VERSIONS_DIR, id, 'reviews.json')
  return join(outputDir(workspace, doc.type, id), 'history', 'reviews.json')
}

/** 读处置记录（who / when / based on what，§19）。 */
export function readOutputReviews(workspace: string, id: string): OutputReviewRecord[] {
  const raw = readTextOrNull(reviewsPath(workspace, id))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as OutputReviewRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function appendReview(workspace: string, id: string, record: OutputReviewRecord): void {
  const doc = readOutput(workspace, id)
  const dir = doc
    ? join(outputDir(workspace, doc.type, id), 'history')
    : join(workspace, OUTPUT_VERSIONS_DIR, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(reviewsPath(workspace, id), JSON.stringify([...readOutputReviews(workspace, id), record], null, 2) + '\n', 'utf8')
}

export interface OutputReviewOutcome {
  output: OutputArtifact
  fromVersion: string
  toVersion: string
  action: OutputReviewRecord['action']
}

/**
 * 处置一个 Output（Task 7）。
 *
 * 顺序（与 Paper 修订一致，§21 不删除性覆盖）：
 *   1. 归档当前版本
 *   2. `edited` 时写入新正文
 *   3. `approved` / `edited` 推进版本号
 *   4. 记录处置（who / when / from → to）
 *
 * `rejected` **不推进版本**也不改正文 —— 但同样留痕。
 */
export function reviewOutput(
  workspace: string,
  id: string,
  action: 'reviewed' | 'approved' | 'rejected' | 'edited' | 'archived',
  options: { note?: string; finalText?: string; by?: 'user' | 'agent' } = {},
): OutputReviewOutcome | OutputWriteError {
  const doc = readOutput(workspace, id)
  if (!doc) return { error: `找不到 Output \`${id}\`。` }

  // 归档是**终态**（§21 保留历史，但不允许"悄悄复活"）：归档后的成果不应再被
  // 审阅/批准 —— 需要继续演化时应当新建一个成果，让历史保持可解释。
  if (doc.status === 'archived' && action !== 'archived') {
    return {
      error: `Output \`${id}\` 已归档，不能再 ${action}。如需继续演化，请新建一个成果（历史保持可读）。`,
    }
  }

  const fromVersion = doc.version

  if (action === 'rejected') {
    appendReview(workspace, id, {
      action,
      at: new Date().toISOString(),
      by: options.by ?? 'user',
      fromVersion,
      toVersion: fromVersion,
      ...(options.note ? { note: options.note } : {}),
    })
    return { output: doc, fromVersion, toVersion: fromVersion, action }
  }

  // 归档当前版本（记录处置原因）
  archiveOutputVersion(workspace, id, { reason: `${action}${options.note ? `: ${options.note}` : ''}` })

  const nextStatus: OutputStatus =
    action === 'approved' ? 'approved' : action === 'reviewed' ? 'reviewed' : action === 'archived' ? 'archived' : doc.status
  // reviewed / approved / edited 都推进版本；archived 保持版本号（它只是状态）
  const advances = action !== 'archived'
  const toVersion = advances ? bumpOutputVersion(fromVersion) : fromVersion

  const written = writeOutput(workspace, doc, {
    status: nextStatus,
    version: toVersion,
    ...(action === 'edited' && options.finalText !== undefined
      ? { sections: parseSections(stripFrontmatter(options.finalText)).sections }
      : {}),
  })
  if (isOutputWriteError(written)) return written

  appendReview(workspace, id, {
    action,
    at: new Date().toISOString(),
    by: options.by ?? 'user',
    fromVersion,
    toVersion,
    ...(options.note ? { note: options.note } : {}),
  })
  return { output: written, fromVersion, toVersion, action }
}

/** 归档一个 Output（不是删除：保留正文与历史）。 */
export function archiveOutput(workspace: string, id: string, note?: string): OutputReviewOutcome | OutputWriteError {
  return reviewOutput(workspace, id, 'archived', { ...(note ? { note } : {}) })
}

/**
 * 彻底删除一个 Output（含历史与处置记录）。
 *
 * 与 Evidence / Paper 的取向一致：**归档优先**；删除需显式确认。
 */
export function deleteOutput(
  workspace: string,
  id: string,
  options: { confirm?: boolean } = {},
): { ok: true; id: string } | OutputWriteError {
  if (!options.confirm) {
    return { error: `删除 Output \`${id}\` 会丢失其历史与处置记录。请先考虑 archive；确需删除请显式确认。` }
  }
  const doc = readOutput(workspace, id)
  if (!doc) return { error: `找不到 Output \`${id}\`。` }
  try {
    rmSync(outputDir(workspace, doc.type, doc.id), { recursive: true, force: true })
  } catch (e) {
    return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id }
}

/* ════════════════════════════════════════════════════════════════════════
 * 质量检查（§20 / Task 2 quality checks）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 按 Profile 跑**规则化**质量检查（§20）。
 *
 * 为什么用正则而不是模型自评：检查必须**可复核**。模型可以声称"我已经检查过了"，
 * 但只有规则能给出同样的结论两次。
 */
export function checkOutputQuality(workspace: string, id: string): OutputQualityResult | OutputWriteError {
  const doc = readOutput(workspace, id)
  if (!doc) return { error: `找不到 Output \`${id}\`。` }
  const profile = getOutputProfile(doc.type)
  const text = doc.body

  const checks = profile.qualityChecks.map((c) => {
    let hit = false
    if (c.pattern) {
      try {
        hit = new RegExp(c.pattern, 'm').test(text)
      } catch {
        hit = false
      }
    } else {
      // 无 pattern 的检查（如"幻灯片要短"）按长度判断
      hit = text.length < 4000
    }
    const ok = c.kind === 'require' ? hit : !hit
    return { id: c.id, description: c.description, ok, advice: c.advice }
  })

  const sectionTitles = new Set(doc.sections.map((s) => s.title.toLowerCase()))
  const missingSections = profile.structure.filter((s) => !sectionTitles.has(s.toLowerCase()))

  return { profile: doc.type, passed: checks.every((c) => c.ok), checks, missingSections }
}

/* ════════════════════════════════════════════════════════════════════════
 * Provenance（Task 8）
 * ════════════════════════════════════════════════════════════════════════ */

/** Output 的完整 provenance 链。 */
export interface OutputProvenance {
  output: string
  /** 链上的每一跳。 */
  hops: Array<{
    kind: 'output' | 'skill' | 'plan' | 'session' | 'source' | 'evidence' | 'claim'
    ref: string
    relation: string
  }>
  /** 是否可追溯到 Evidence（Task 8 要求的完整链）。 */
  reachesEvidence: boolean
}

/**
 * 追踪 Output → Source → Skill → Plan → Session → Evidence（Task 8）。
 *
 * 只读遍历：不复制任何内容，只把已存在的引用串起来。
 */
export function traceOutputProvenance(workspace: string, id: string): OutputProvenance | undefined {
  const doc = readOutput(workspace, id)
  if (!doc) return undefined

  const hops: OutputProvenance['hops'] = [{ kind: 'output', ref: doc.id, relation: `${doc.type} v${doc.version}` }]
  if (doc.skill) hops.push({ kind: 'skill', ref: doc.skill, relation: 'produced by skill' })
  if (doc.plan) hops.push({ kind: 'plan', ref: doc.plan, relation: 'via plan' })
  if (doc.harnessSession) hops.push({ kind: 'session', ref: doc.harnessSession, relation: 'executed in session' })
  if (doc.source.researchState) {
    hops.push({ kind: 'source', ref: `research-state v${doc.source.researchState}`, relation: 'from research state' })
  }
  if (doc.source.paper) hops.push({ kind: 'source', ref: doc.source.paper, relation: 'from paper' })
  for (const p of doc.source.plans) hops.push({ kind: 'plan', ref: p, relation: 'from plan' })
  for (const c of doc.source.claims) hops.push({ kind: 'claim', ref: c, relation: 'uses claim' })
  for (const e of doc.source.evidence) hops.push({ kind: 'evidence', ref: e, relation: 'uses evidence' })

  return { output: doc.id, hops, reachesEvidence: doc.source.evidence.length > 0 }
}

/**
 * 把 provenance 落盘为 `provenance.md`（`v2-Workspace.md` §14）。
 *
 * 为什么必须落盘：provenance 只在内存里可算是不够的 —— §14 要求
 * **成果自身携带**"我从哪些 Research Knowledge 转换而来"，
 * 这样成果被复制/归档/移交时仍然可追溯，而不是依赖某个进程能重新算出它。
 *
 * @returns 相对路径；成果不存在时返回 `undefined`
 */
export function writeOutputProvenance(workspace: string, id: string): string | undefined {
  const prov = traceOutputProvenance(workspace, id)
  if (!prov) return undefined
  const doc = readOutput(workspace, id)
  if (!doc) return undefined

  const lines = [
    '# Provenance',
    '',
    `This ${doc.type} was transformed from the research below. Nothing here is copied —`,
    'these are references, so the source of every statement stays answerable.',
    '',
    '## Chain',
    '',
    '```text',
    ...prov.hops.map((h, i) => `${i === 0 ? h.kind : '  ↓ ' + h.kind}: ${h.ref}${h.relation ? `  (${h.relation})` : ''}`),
    '```',
    '',
    '## Source references',
    '',
    `- output type: ${doc.type}`,
    `- output version: v${doc.version}`,
    `- skill: ${doc.skill ?? '(none recorded)'}`,
    `- plan: ${doc.plan ?? '(none recorded)'}`,
    `- harness session: ${doc.harnessSession ?? '(none recorded)'}`,
    `- research state: ${doc.source.researchState ? `v${doc.source.researchState}` : '(none recorded)'}`,
    `- paper: ${doc.source.paper ?? '(none recorded)'}`,
    `- claims: ${doc.source.claims.length ? doc.source.claims.join(', ') : '(none)'}`,
    `- evidence: ${doc.source.evidence.length ? doc.source.evidence.join(', ') : '(none)'}`,
    `- plans used: ${doc.source.plans.length ? doc.source.plans.join(', ') : '(none)'}`,
    '',
    '> If any referenced claim or evidence changes, this output must be re-checked.',
    '> Run the impact analysis (`research_output` action `impact`) to see what would be affected.',
    '',
  ]
  const dir = outputDir(workspace, doc.type, id)
  mkdirSync(dir, { recursive: true })
  const rel = `${outputRelDir(doc.type, id)}/provenance.md`
  writeFileSync(join(dir, 'provenance.md'), lines.join('\n'), 'utf8')
  return rel
}

/* ════════════════════════════════════════════════════════════════════════
 * 依赖图与影响分析（§23 / Task 9）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 构建依赖图（§23）：`Claim C003 → { Paper v0.8, Patent v0.2, Slides v0.3 }`。
 *
 * 这样系统能回答：**"如果 C003 被推翻，哪些成果需要重新检查？"**
 */
export function buildOutputDependencyMap(workspace: string): OutputDependency[] {
  const byKey = new Map<string, OutputDependency>()

  const add = (kind: OutputDependency['kind'], key: string, doc: OutputArtifact): void => {
    const mapKey = `${kind}:${key}`
    const entry = byKey.get(mapKey) ?? { dependsOn: key, kind, outputs: [] }
    if (!entry.outputs.some((o) => o.id === doc.id)) {
      entry.outputs.push({ id: doc.id, type: doc.type, version: doc.version, relPath: doc.relPath })
    }
    byKey.set(mapKey, entry)
  }

  for (const doc of listAllOutputs(workspace)) {
    for (const c of doc.source.claims) add('claim', c, doc)
    for (const e of doc.source.evidence) add('evidence', e, doc)
    for (const p of doc.source.plans) add('plan', p, doc)
    if (doc.source.paper) add('paper', doc.source.paper, doc)
    if (doc.source.researchState) add('research-state', `v${doc.source.researchState}`, doc)
  }

  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.dependsOn.localeCompare(b.dependsOn))
}

/** 一次研究变化对 Output 的影响。 */
export interface OutputImpact {
  /** 变化的对象（如 `C003`）。 */
  changed: string
  kind: OutputDependency['kind']
  /** 受影响的 Output 与建议动作。 */
  affected: Array<{
    id: string
    type: OutputType
    version: string
    relPath: string
    /** §23 要求输出 **Update Recommendation**。 */
    recommendation: string
  }>
}

/**
 * 影响分析（Task 9）：当 Research State / Claim / Evidence 发生变化，
 * 找出受影响的 Output 并给出**更新建议**。
 *
 * ⚠️ **只给建议，不改任何 Output** —— 与 §18（Output 不改 Research State）对称：
 * 研究变化也不会自动改写成果，必须由人决定。
 */
export function analyzeOutputImpact(workspace: string, changed: string, kind?: OutputDependency['kind']): OutputImpact[] {
  const map = buildOutputDependencyMap(workspace)
  const key = changed.trim()
  const matches = map.filter(
    (d) => (kind ? d.kind === kind : true) && (d.dependsOn === key || d.dependsOn === key.toUpperCase()),
  )

  return matches.map((d) => ({
    changed: d.dependsOn,
    kind: d.kind,
    affected: d.outputs.map((o) => ({
      ...o,
      recommendation:
        d.kind === 'claim'
          ? `Claim ${d.dependsOn} changed. Re-check whether ${o.id} still states it correctly; if the status dropped, the text may now overclaim.`
          : d.kind === 'evidence'
            ? `Evidence ${d.dependsOn} changed. Re-check every number or statement in ${o.id} that depends on it.`
            : `Source ${d.dependsOn} changed. Re-check ${o.id} against the updated source.`,
    })),
  }))
}

/** 影响摘要（供 Research Context / 工具输出）。 */
export function outputImpactSummary(workspace: string): {
  totalOutputs: number
  byType: Record<OutputType, number>
  pendingReview: number
  dependencies: number
} {
  const all = listAllOutputs(workspace)
  const byType = {} as Record<OutputType, number>
  for (const t of OUTPUT_TYPES) byType[t] = all.filter((o) => o.type === t).length
  return {
    totalOutputs: all.length,
    byType,
    pendingReview: all.filter((o) => o.status === 'draft').length,
    dependencies: buildOutputDependencyMap(workspace).length,
  }
}

/** 取某个 Output 的 Profile（含区分说明，供 UI/工具）。 */
export function outputProfileFor(doc: OutputArtifact): OutputProfile {
  return getOutputProfile(doc.type)
}

/** 供工具层：Profile 的结构是否齐全。 */
export function missingStructure(workspace: string, id: string): string[] {
  const result = checkOutputQuality(workspace, id)
  return 'error' in result ? [] : result.missingSections
}

/** 供工具层：读取某个章节。 */
export function outputSection(doc: OutputArtifact, ...names: string[]): string {
  return findSection(doc.sections, ...names)
}
