/**
 * ConvFusion 2.0 — `project.md`：研究定义（`v2-Workspace.md` §3）
 *
 * ## 它和 `research-state.md` 的分工
 *
 * ```text
 * project.md         定义研究**是什么**     ← 目标、问题、范围（相对稳定）
 * research-state.md  描述研究**到了哪一步** ← 知道什么、相信什么、缺什么（持续变化）
 * ```
 *
 * 二者共同构成 Workspace 的 **Research Definition** 层（§1），放在工作区根目录。
 *
 * ## 不存在第二份定义
 *
 * v1 用 `research.json` 存 `work_id` 等机器可读字段。v2 **推倒**这条线：
 * `v2-Workspace.md` §2 的最终目录结构里没有 `research.json`，因为
 * **workspace 路径本身就是研究身份**，不需要额外锚文件。所以研究定义只有 `project.md` 一份。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROJECT_FILE } from './research-data.js'
import { parseListItems, stripFrontmatter, parseFrontmatter, renderFrontmatter } from './markdown.js'
import type { ResearchProject } from './data.js'

/** `project.md` 的推荐章节（**弱结构**：缺章节不报错）。 */
export const PROJECT_SECTIONS: readonly string[] = [
  'Research Statement',
  'Motivation',
  'Research Questions',
  'Scope',
  'Domain',
]

/** `project.md` 的绝对路径。 */
export function projectPath(workspace: string): string {
  return join(workspace, PROJECT_FILE)
}

/** 从 `project.md` 解析研究定义；不存在/损坏 → null。 */
export function loadProjectFile(workspace: string): ResearchProject | null {
  const file = projectPath(workspace)
  if (!existsSync(file)) return null
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return null
  }

  const fm = parseFrontmatter(source)
  const body = stripFrontmatter(source)
  /**
   * 取一个 `## 章节` 的正文（到下一个 `##` 或文末）。
   *
   * ⚠️ 这里修过一个**静默截断**的 bug：早先的 lookahead 写成 `(?=^##\\s|\\s*$)`，
   * 而带 `m` 标志时 `$` 会在**任意行尾**成立 —— 于是每个多行章节都被截成**第一行**。
   * 症状很隐蔽：单行章节（如早先的 Research Statement）看起来正常，
   * 一旦用户写多行（研究问题、Motivation）就只剩第一句。
   */
  const section = (name: string): string => {
    const re = new RegExp(`^##\\s+${name}\\s*$\\n([\\s\\S]*?)(?=\\n##\\s|(?![\\s\\S]))`, 'm')
    return body.match(re)?.[1]?.replace(/<!--[\s\S]*?-->/g, '').trim() ?? ''
  }

  const statement = section('Research Statement')
  const topic = fm.topic || firstLine(statement)
  if (!topic) return null
  const initialTopic = fm.initial_topic || undefined

  // 用共享的段落级解析：跨行的条目要合成一条，且不能被 `**加粗**` 的
  // `*` 误当列表标记（曾经把 `**Q1（…）**` 解析成 `Q1（…）**`）
  const questions = parseListItems(section('Research Questions'))

  return {
    topic,
    ...(initialTopic ? { initialTopic } : {}),
    ...(fm.domain || section('Domain') ? { domain: fm.domain || firstLine(section('Domain')) } : {}),
    ...(section('Scope') ? { scope: section('Scope') } : {}),
    ...(questions.length > 0 ? { questions } : {}),
    ...(section('Motivation') ? { goal: firstLine(section('Motivation')) } : {}),
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? ''
}

/** 序列化 `project.md`（研究定义）。 */
export function serializeProject(input: {
  topic: string
  initialTopic?: string
  domain?: string
  goal?: string
  questions?: readonly string[]
  scope?: string
  createdAt?: string
  updatedAt?: string
}): string {
  const front = renderFrontmatter({
    type: 'research-project',
    topic: input.topic,
    // 初始输入主题：创建时等于 topic；主题演进后与 topic 不同（追溯"怎么演进的"）
    initial_topic: input.initialTopic ?? input.topic,
    domain: input.domain,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  })

  const parts = [front, '', '# Research Project', '', '## Research Statement', '', input.topic, '']
  if (input.goal) parts.push('## Motivation', '', input.goal, '')
  parts.push(
    '## Research Questions',
    '',
    ...(input.questions?.length ? input.questions.map((q) => `- ${q}`) : ['<!-- 尚未凝练出可检验的研究问题 -->']),
    '',
  )
  // Scope 此前**写死成占位注释** —— 连创建时都填不进去（改这里之前 `scope` 无处可写）
  parts.push('## Scope', '', input.scope || '<!-- 这项研究包含什么、明确不包含什么 -->', '')
  parts.push('## Domain', '', input.domain || '<!-- 研究领域 -->', '')
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * 写入研究定义（幂等）。
 *
 * @returns 实际写入的字段
 */
export function saveProjectFile(
  workspace: string,
  input: { topic: string; domain?: string; goal?: string; questions?: readonly string[] },
): ResearchProject {
  const file = projectPath(workspace)
  const now = new Date().toISOString()

  // 保留已有字段（用户/前序写入的内容不被静默丢弃）
  const existing = loadProjectFile(workspace)

  const merged: ResearchProject = {
    topic: input.topic.trim(),
    // 初始主题只允许"首次确定"：已有值（含前次演进保留下来的）绝不覆盖
    initialTopic: existing?.initialTopic ?? input.topic.trim(),
    ...(input.domain ?? existing?.domain ? { domain: (input.domain ?? existing?.domain)! } : {}),
    ...(input.goal ?? existing?.goal ? { goal: (input.goal ?? existing?.goal)! } : {}),
    ...(input.questions?.length ?? existing?.questions?.length
      ? { questions: [...(input.questions ?? existing?.questions ?? [])] }
      : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  writeFileSync(file, serializeProject(merged), 'utf8')
  return merged
}

/* ════════════════════════════════════════════════════════════════════════
 * 主题演进（topic evolution）
 *
 * 课题**不冻结在初始输入**。研究会收敛出更准确的主题表述 —— 歧义被裁定
 * （如 D001）、机制被收窄、范围被限定 —— 此时 `topic`（当前采纳的主题）
 * 应当更新为**最后采纳的主题**，而不是永远显示开题时那句话。
 *
 * 三条硬约束：
 *   1. **初始输入不丢**：第一次更新时把旧主题写入 `initial_topic`，之后只读保留；
 *   2. **正文零改动**：`project.md` 是用户资产（研究陈述 / 范围 / 领域都是手写的）。
 *      更新**只做 frontmatter 行的外科手术**，绝不走 `serializeProject`
 *      （那会用骨架重新生成整个文件，把手写内容洗掉）；
 *   3. **留痕**：每次变更追加一条记录到 `research/topic-history.json`
 *      （from / to / 时间 / 理由 / 依据 / 谁改的），与 state-proposals 的
 *      applied.json 同一纪律 —— 历史不被擦除。
 * ════════════════════════════════════════════════════════════════════════ */

/** 主题变更记录。 */
export interface TopicChange {
  /**
   * 改的是哪个字段。缺省 = `topic`（历史记录里旧条目没有这个键，读作 topic）。
   */
  field?: 'topic' | 'statement' | 'questions' | 'scope' | 'domain' | 'motivation'
  from: string
  to: string
  /** ISO 8601。 */
  at: string
  /** 为什么主题演进（依据哪个裁定 / 发现）。 */
  reason?: string
  /** 新主题所依据的决策 / 证据 id（如 `D001`）。 */
  evidence?: string[]
  by: 'agent' | 'user'
}

/** 主题演进历史（与 `project.md` 同层的结构化资产，放 `research/` 下）。 */
export const TOPIC_HISTORY_FILE = 'research/topic-history.json'

/** 读取主题演进历史；缺失 / 损坏 → 空列表。 */
export function listTopicChanges(workspace: string): TopicChange[] {
  try {
    const raw = JSON.parse(readFileSync(join(workspace, TOPIC_HISTORY_FILE), 'utf8')) as TopicChange[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** 把任意输入收敛成可安全写入 frontmatter 的单行主题。 */
function sanitizeTopic(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/^["']+|["']+$/g, '')
}

export type TopicUpdateResult =
  | { changed: true; previous: string; current: string; initial: string }
  | { changed: false; previous: string; current: string }
  | { changed: false; error: string }

/**
 * 把项目主题更新为最后采纳的主题（**外科手术式**，只动 frontmatter 指定行）。
 *
 * - 主题相同 → 幂等 no-op；
 * - 首次更新时（旧项目没有 `initial_topic`）把**当前**主题固化为初始输入；
 * - 变更追加到 `research/topic-history.json`。
 */
export function updateProjectTopic(
  workspace: string,
  input: { topic: string; reason?: string; evidence?: readonly string[]; by?: 'agent' | 'user' },
): TopicUpdateResult {
  const file = projectPath(workspace)
  if (!existsSync(file)) return { changed: false, error: 'No project.md in this workspace.' }

  const source = readFileSync(file, 'utf8')
  const current = loadProjectFile(workspace)?.topic ?? ''
  const next = sanitizeTopic(input.topic)
  if (!next) return { changed: false, error: 'Topic must be a non-empty single line.' }
  if (next === current) {
    return { changed: false, previous: current, current }
  }

  const fm = parseFrontmatter(source)
  // 旧项目没有 initial_topic：此刻的（即将被替换的）主题就是初始输入
  const initial = fm.initial_topic || current

  // ── 外科手术：逐行处理 frontmatter，只替换/插入目标键，其余行原样保留 ──
  const m = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!m) return { changed: false, error: 'project.md has no frontmatter block.' }

  const now = new Date().toISOString()
  const lines = m[2].split(/\r?\n/)
  const out: string[] = []
  let topicDone = false
  let initialDone = Boolean(fm.initial_topic)
  for (const line of lines) {
    const key = line.split(':')[0]?.trim()
    if (key === 'topic') {
      out.push(`topic: ${next}`)
      if (!initialDone) {
        out.push(`initial_topic: ${initial}`)
        initialDone = true
      }
      topicDone = true
      continue
    }
    if (key === 'initial_topic') {
      out.push(line)
      initialDone = true
      continue
    }
    if (key === 'updated_at') {
      out.push(`updated_at: ${now}`)
      continue
    }
    out.push(line)
  }
  if (!initialDone) out.unshift(`initial_topic: ${initial}`)
  if (!topicDone) out.unshift(`topic: ${next}`)
  if (!fm.updated_at) out.push(`updated_at: ${now}`)

  writeFileSync(file, `${m[1]}${out.join('\n')}${m[3]}${source.slice(m[0].length)}`, 'utf8')

  // ── 留痕：追加变更记录（历史不被擦除）──
  const change: TopicChange = {
    from: current,
    to: next,
    at: now,
    by: input.by ?? 'agent',
    ...(input.reason ? { reason: input.reason.replace(/\s+/g, ' ').trim() } : {}),
    ...(input.evidence && input.evidence.length ? { evidence: [...input.evidence] } : {}),
  }
  const history = listTopicChanges(workspace)
  history.push(change)
  const historyFile = join(workspace, TOPIC_HISTORY_FILE)
  mkdirSync(dirname(historyFile), { recursive: true })
  writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n', 'utf8')

  return { changed: true, previous: current, current: next, initial }
}

/** 研究定义是否存在（即 `project.md`）。 */
export function hasProjectDefinition(workspace: string): boolean {
  return existsSync(projectPath(workspace))
}

/** 供工具/命令：取研究主题。 */
export function projectTopic(workspace: string): string | undefined {
  return loadProjectFile(workspace)?.topic
}

/* ════════════════════════════════════════════════════════════════════════
 * 研究定义的其余字段（陈述 / 研究问题 / 范围 / 领域 / 动机）
 *
 * 与主题不同，这些章节**几十个版本以来没有过任何写入路径**：`serializeProject` 能在
 * **创建时**写 `questions` / `goal` / `domain`（`Scope` 连创建时都写不进去），
 * 创建之后只有 `updateProjectTopic` 能改 frontmatter 的 `topic` —— 于是它们永远停在
 * 工作区创建时生成的脚手架注释上（`<!-- 尚未凝练出可检验的研究问题 -->`）。
 *
 * 这条写入路径的两条纪律：
 *   1. **只替换占位**：章节正文仍是空或**单个 HTML 注释**时才写；一旦有人手写过内容，
 *      默认**永不覆盖**（`force: true` 才改写，且必须给 reason）——与状态里的自动段同一条纪律；
 *   2. **留痕**：每次变更进 `research/topic-history.json`（带 `field`），可审计、可追溯。
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 读一个 `## 章节` 的正文（去掉注释；章节不存在 → null）。
 *
 * ⚠️ `Research Statement` 的"上一版"**必须**这样读：`loadProjectFile` 的 `topic` 优先取
 * frontmatter，主题演进后它与正文那段就不一致了 —— 拿 `topic` 当 statement 的现值，
 * 会永远判成"没变化"，正文于是永远停在初始输入（这个 bug 已经修过一次）。
 */
export function readProjectSection(workspace: string, section: string): string | null {
  const file = projectPath(workspace)
  if (!existsSync(file)) return null
  const body = stripFrontmatter(readFileSync(file, 'utf8'))
  const m = body.match(sectionRegex(section))
  if (!m) return null
  return m[2].replace(/<!--[\s\S]*?-->/g, '').trim()
}

/**
 * `## 章节` 的匹配式：**捕获 1 = 标题行，捕获 2 = 正文**（到下一个 `## ` 或文末）。
 *
 * ⚠️ 两个坑，都真踩过：
 *   1. 标题后的空白**不能用 `\s*`**：`\s` 会吞掉标题后的空行，正文于是从 `## 下一节`
 *      开头，而前瞻 `\n##` 又匹配不上（它前面已经没有换行）→ **整节被并进上一节**，
 *      随后被覆写时**整段吃掉**（实测把 `## Motivation` 吞了）。所以标题尾用 `[ \t]*`，
 *      前瞻改成行首锚定的 `^##`。
 *   2. 前瞻必须是 `(?![\s\S])` 而不是 `$`：带 `m` 时 `$` 在任意行尾成立，
 *      老代码曾因此把多行章节**截成第一行**。
 */
function sectionRegex(section: string): RegExp {
  const name = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^##[ \\t]+${name}[ \\t]*$)([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, 'm')
}

/** 一个章节的正文是否还是"空占位"（没有人类内容）。 */
export function isPlaceholderSection(workspace: string, section: string): boolean {
  const raw = readProjectSection(workspace, section)
  // 章节缺失（null）也算可填：`## Motivation` 这类章节本来就可能整段不存在
  return raw === null || raw === ''
}

export type DefinitionField = Exclude<NonNullable<TopicChange['field']>, 'topic'>

/** 写一个章节的正文（保留文件其余部分原样）。 */
function writeSection(source: string, section: string, text: string): string | null {
  const re = sectionRegex(section)
  if (!re.test(source)) return null
  return source.replace(re, (_m, head: string) => `${head}\n\n${text.trim()}\n\n`)
}

export type DefinitionUpdateResult =
  | { changed: true; field: DefinitionField; previous: string; current: string }
  | { changed: false; field: DefinitionField; current: string }
  | { changed: false; field: DefinitionField; error: string }

/**
 * 更新研究定义的一个章节（外科手术式，只动那一段）。
 *
 * @param input.field `statement` / `questions` / `scope` / `domain` / `motivation`
 * @param input.force 章节里已有手写内容时是否仍覆盖（默认 false = 只填占位）
 */
export function updateProjectDefinition(
  workspace: string,
  input: {
    field: DefinitionField
    value: string | readonly string[]
    reason?: string
    force?: boolean
  },
): DefinitionUpdateResult {
  const field = input.field
  const file = projectPath(workspace)
  if (!existsSync(file)) return { changed: false, field, error: 'No project.md in this workspace.' }

  const sectionOf: Record<DefinitionField, string> = {
    statement: 'Research Statement',
    questions: 'Research Questions',
    scope: 'Scope',
    domain: 'Domain',
    motivation: 'Motivation',
  }
  const section = sectionOf[field]
  const source = readFileSync(file, 'utf8')
  const project = loadProjectFile(workspace)
  const previous = ((): string => {
    switch (field) {
      case 'statement':
        // 正文那一段，不是 frontmatter 的 topic（见 readProjectSection 的注释）
        return readProjectSection(workspace, section) ?? ''
      case 'questions':
        return (project?.questions ?? []).join('\n')
      case 'scope':
        return project?.scope ?? ''
      case 'domain':
        return project?.domain ?? ''
      case 'motivation':
        return project?.goal ?? ''
    }
  })()

  /*
   * 规范化：**单行字段**（陈述/领域）折叠空白；**多行字段**（范围/动机）保留行结构 ——
   * 一开始统一用了 `sanitizeTopic`，结果 Scope 的三行被压成一行（真实踩过）。
   */
  const normalize = (raw: string): string => {
    const single = field === 'statement' || field === 'domain'
    if (single) return sanitizeTopic(raw)
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n')
  }
  const text = Array.isArray(input.value)
    ? (input.value as readonly string[]).map((q) => `- ${sanitizeTopic(q)}`).join('\n')
    : normalize(String(input.value))
  if (!text.trim() || text.trim() === '') return { changed: false, field, error: 'Value must not be empty.' }
  if (text.trim() === previous.trim()) return { changed: false, field, current: previous }

  if (!input.force && !isPlaceholderSection(workspace, section) && field !== 'statement') {
    /*
     * 有人手写过 → 不覆盖。把"为什么没改"说清楚，而不是静默跳过：
     * 调用方（工具/同步）会把它报出来。
     */
    return { changed: false, field, current: previous, error: `${section} already has hand-written content.` }
  }

  /*
   * `## Motivation` 可能整段不存在（创建时没有 goal）→ 按需插入到 Statement 之后。
   */
  let next = source
  if (section === 'Motivation' && !/^##[ \t]+Motivation[ \t]*$/m.test(source)) {
    /*
     * 插在**下一个 `## 章节` 之前**（= Statement 正文之后）。
     * ⚠️ 别插在标题与正文之间 —— 那会把 Statement 的正文挤进 Motivation，
     * 下一次写 Statement 时整段被吃掉（这个 bug 已经犯过一次）。
     */
    const after = /^##[ \t]+Research Questions[ \t]*$/m.exec(source)
    const block = `## Motivation\n\n${text.trim()}\n\n`
    next = after
      ? `${source.slice(0, after.index)}${block}${source.slice(after.index)}`
      : `${source.trimEnd()}\n\n${block}`
  } else if (field === 'statement') {
    // 研究陈述 = 主题的正文镜像：直接替换那一段（frontmatter 的 topic 另由 updateProjectTopic 管）
    next = writeSection(source, section, text) ?? source
  } else {
    next = writeSection(source, section, text) ?? source
  }
  if (next === source) return { changed: false, field, error: `${section} section not found.` }

  const now = new Date().toISOString()
  writeFileSync(file, /^updated_at:/m.test(source) ? next.replace(/^updated_at:.*$/m, `updated_at: ${now}`) : next, 'utf8')

  const change: TopicChange = {
    field,
    from: previous,
    to: text.trim(),
    at: now,
    by: 'agent',
    ...(input.reason ? { reason: input.reason.replace(/\s+/g, ' ').trim() } : {}),
  }
  const history = listTopicChanges(workspace)
  history.push(change)
  const historyFile = join(workspace, TOPIC_HISTORY_FILE)
  mkdirSync(dirname(historyFile), { recursive: true })
  writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n', 'utf8')

  return { changed: true, field, previous, current: text.trim() }
}
