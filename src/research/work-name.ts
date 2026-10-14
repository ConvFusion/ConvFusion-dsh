/**
 * ConvFusion — **一项研究工作的名字**（发布到网络时用的那一个）
 *
 * ## 为什么需要它
 *
 * 【可指导】/【可加入】/【指导中】三个列表里显示的"研究工作名称"，来自**服务器上那个
 * 项目标题** —— 也就是我们发布时送上去的 `title`。早先送的是 **DSH 工作区的注册表标题**
 * （或目录名，如 `ConvFusion-dsh（run）`），那是"这台机器上的哪个文件夹"，不是这项工作
 * 的名字：同一个人有多个工作区时，网络里全是一串目录名；别人（导师/学生）看到的
 * 也是这些名字。
 *
 * 正确的一层是**这项工作自己的名字**：
 *
 * ```text
 * 有论文  → 论文标题（这项工作的正式名字）
 * 没论文  → project.md 的 topic（已采纳的主题；初始输入 topic 会随演进更新）
 * 都没有  → 注册表标题（兜底，宁可显示"本机还叫这个名字"也不显示空）
 * ```
 *
 * ## 论文标题取自哪一份
 *
 * 与项目约定一致：**论文正文以 `papers/<id>/latex/main.tex` 为准**
 * （`paper.md` 可能是过期的草稿）。所以：
 *
 * 1. `<paper>/latex/main.tex` 的 `\title{...}`（权威）；
 * 2. 退回 `paperTitle(paper)`（`metadata.md` 的 frontmatter / 手稿 H1 / 论文 id）——
 *    老工作区可能还没有 latex/。
 *
 * 多篇论文时取**当前活跃的那一篇**（`getActivePaperId`），其次取最近改动的那一篇目录。
 *
 * ## 两条纪律
 *
 * 1. **不编**：没论文就不用论文标题，topic 为空就用兜底 —— 不拿摘要、不拿第一个
 *    研究问题凑一个像名字的东西。
 * 2. **可展示**：结果是给人看的字符串 —— 清掉 LaTeX 转义（`\&`、`\%`、`--`）、
 *    折平空白、去掉首尾标点，并按服务器的标题上限（500）留足余量截断。
 *    `Title` / `Untitled` 这类**模板占位**不算名字（刚建的论文还没起名）。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getActivePaperId, listPapers, paperDir } from './paper.js'
import { paperTitle } from './paper-gaps.js'
import { loadProjectFile } from './project.js'

/**
 * 名字长度上限。
 *
 * 服务器允许 500（`ResearchProjectCreate.title` 的 `max_length`），但这个名字要出现在
 * **列表行**里（`whiteSpace: nowrap + ellipsis`），太长等于看不见 —— 所以收得更紧，
 * 与 `PUBLISH_SUMMARY_LIMIT` 同量级。
 */
export const WORK_NAME_LIMIT = 200

/** 名字是从哪来的（界面/日志据此解释"为什么叫这个"）。 */
export type WorkNameSource = 'paper' | 'topic' | 'fallback'

export interface WorkName {
  /** 可以直接送去发布 / 显示的名字（已折平空白、清转义、截断）。 */
  name: string
  /** 来源：`paper` = 论文标题，`topic` = 项目主题，`fallback` = 兜底（注册表标题）。 */
  source: WorkNameSource
  /** 论文标题来自哪篇（`source === 'paper'` 时有值）。 */
  paperId?: string
  /**
   * 论文标题本身（`source === 'paper'` 时有值；**未截断**）。
   *
   * 与 {@link WorkName.name} 分开：名字要截断（列表行宽度），而论文标题是**事实**，
   * 上送时按原文（`paper.title`）—— 两者用途不同，别让截断污染事实。
   */
  paperTitle?: string
}

/**
 * 模板占位标题 —— 刚用模板建的论文 H1 就是 `Title`，那不是"这项工作的名字"。
 * 只在**小写完全相等**时命中，不做模糊匹配（`Titles of ...` 这种真标题不能被误伤）。
 */
const PLACEHOLDER_TITLES = new Set(['title', 'untitled', 'paper', 'manuscript', '未命名', '无题'])

/** LaTeX 标题里的常见转义 → 可读文本（只处理会出现在标题里的那几个）。 */
function unescapeLatex(input: string): string {
  return input
    .replace(/\\([&%$#_{}])/g, '$1') // \& \% \$ \# \_ \{ \}
    .replace(/\\text[a-z]*\{([^{}]*)\}/g, '$1') // \textsc{Foo} → Foo
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\\,/g, ' ')
    .replace(/[{}]/g, '')
}

/** 折平空白 + 去掉包裹引号/句末标点（名字不该以句号结尾）。 */
function tidy(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”『「]+|["'“”『」]+$/g, '')
    .replace(/[。．.,;；:：]+$/, '')
    .trim()
}

/** 截断到上限（超出用省略号，与 publish-content 的 `clip` 同一手感）。 */
function clip(input: string, limit: number): string {
  const chars = [...input]
  return chars.length <= limit ? input : `${chars.slice(0, limit - 1).join('')}…`
}

/** 从 `latex/main.tex` 取 `\title{...}`（取不到 → `null`）。 */
function titleFromLatex(root: string, paperId: string): string | null {
  const main = join(paperDir(root, paperId), 'latex', 'main.tex')
  let text: string
  try {
    if (!existsSync(main)) return null
    text = readFileSync(main, 'utf8')
  } catch {
    return null
  }
  /*
   * ⚠️ 不能用 `\title\{([^}]*)\}`：标题里常有花括号（`{BERT}`、`\textsc{...}`），
   * 那样只取到第一个 `}` 之前的一截。这里做**花括号配平**扫描，取完整内容。
   */
  const at = /\\(?:icmltitle|title)\s*\{/.exec(text)
  if (!at) return null
  let depth = 1
  let out = ''
  for (let i = at.index + at[0].length; i < text.length; i += 1) {
    const ch = text[i]!
    if (ch === '\\') {
      // 转义对整体保留（后面统一 unescape），跳过一个字符免得把 `\{` 当左括号
      out += ch + (text[i + 1] ?? '')
      i += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) break
    }
    out += ch
  }
  if (depth !== 0) return null
  const title = tidy(unescapeLatex(out))
  return title && !PLACEHOLDER_TITLES.has(title.toLowerCase()) ? title : null
}

/**
 * 这项工作有没有"论文标题"可用（有则返回 { title, paperId }）。
 *
 * 活跃论文优先；活跃的那篇没有标题时，退到**最近改动过**的另一篇 —— 一个工作区里
 * 同时跑多篇论文是常见事（`progress.ts` 也是按多篇聚合的），只要其中一篇有像样的
 * 标题，它就是这项工作更正式的名字。
 */
function paperTitleOf(root: string): { title: string; paperId: string } | null {
  const docs = listPapers(root)
  if (docs.length === 0) return null
  const active = getActivePaperId(root)
  const ordered = [...docs].sort((a, b) => {
    if (a.id === active) return -1
    if (b.id === active) return 1
    return mtimeOf(join(paperDir(root, b.id))) - mtimeOf(join(paperDir(root, a.id)))
  })
  for (const doc of ordered) {
    const fromLatex = titleFromLatex(root, doc.id)
    if (fromLatex) return { title: fromLatex, paperId: doc.id }
    const fallback = tidy(unescapeLatex(paperTitle(doc)))
    // `paperTitle` 在没有标题时会回退成**论文 id** —— 那不是名字，别当名字用
    if (fallback && fallback !== doc.id && !PLACEHOLDER_TITLES.has(fallback.toLowerCase())) {
      return { title: fallback, paperId: doc.id }
    }
  }
  return null
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/**
 * 一项研究工作的**名字**：有论文用论文标题，否则用 `project.md` 的 topic，最后兜底。
 *
 * 纯读盘、不写、不抛（读不动就当没有 —— 名字永远有一个可显示的兜底值）。
 *
 * @param researchRoot 研究根（`<会话工作区>/workspace`，旧布局下就是会话工作区本身）
 * @param fallback 兜底名（注册表标题 / 目录名）—— 只在没有论文也没有主题时使用
 */
export function researchWorkName(researchRoot: string, fallback: string): WorkName {
  const paper = paperTitleOf(researchRoot)
  if (paper) {
    return {
      name: clip(paper.title, WORK_NAME_LIMIT),
      source: 'paper',
      paperId: paper.paperId,
      paperTitle: paper.title,
    }
  }

  let topic = ''
  try {
    topic = tidy(loadProjectFile(researchRoot)?.topic ?? '')
  } catch {
    topic = ''
  }
  if (topic) return { name: clip(topic, WORK_NAME_LIMIT), source: 'topic' }

  return { name: clip(tidy(fallback) || '未命名研究工作', WORK_NAME_LIMIT), source: 'fallback' }
}

/** 工作区里有没有论文目录（诊断用；`researchWorkName` 已隐含这件事）。 */
export function hasPaperDir(researchRoot: string): boolean {
  try {
    return readdirSync(join(researchRoot, 'papers'), { withFileTypes: true }).some(
      (e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== '__pycache__',
    )
  } catch {
    return false
  }
}
