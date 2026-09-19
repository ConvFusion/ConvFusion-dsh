/**
 * ConvFusion 2.0 — Markdown 子集**解析**（纯函数，无 React、无 DOM）
 *
 * ## 为什么需要
 *
 * 【可指导】里的摘要/简报字段（研究问题、动机、核心想法、假设、方法概览、待解问题）
 * 是研究者**自己的 Markdown 文件**里的一段正文 —— 里面必然有 `**强调**`、列表、
 * 引用块、表格、`` `代码` ``。原来这些值是 `white-space: pre-wrap` 直接当纯文本渲染，
 * 于是界面上出现的是 Markdown **源码**（`**分层结构**（D001 读法 B 之后）：| 层 | 假设 |…`），
 * 不是它的视觉效果。
 *
 * 解析放在**这里**（`.ts`，不带 JSX）而不是渲染组件里，是为了能被离线脚本直接执行断言
 * （`lib/**` 只编译宿主半边，客户端 .tsx 只出 d.ts；见 `scripts/verify-settings-page.mjs`）。
 *
 * ## 支持的范围（够用就好，不追规范）
 *
 * `#` 标题 · `-`/`1.` 列表 · `>` 引用 · ``` 代码块 · `| a | b |` 表格 · `---` 分隔线 ·
 * 段落；行内：`**粗**` `*斜*` `~~删~~` `` `代码` `` `[文字](链接)`。
 *
 * ## 安全
 *
 * 只产出**token**（字符串片段），由调用方用 React 元素渲染 —— 源码里的 HTML 标签
 * 会原样当文字显示，绝不会变成节点（不需要 sanitizer，也不许走危险注入那条路）。
 */

/** 行内 token。 */
export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'strike'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

/** 块级 token。`paragraph` / `quote` / `list.items` 里的正文由 `parseInline` 再切一遍。 */
export type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

/** 行内匹配：**粗** / __粗__ / *斜* / _斜_ / ~~删~~ / `代码` / [文字](链接)。 */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/

/** 表格分隔行（`| --- | :--: |`）。 */
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

/** 列表项（`- x` / `* x` / `+ x` / `1. x` / `1) x`）。 */
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/

/** 标题。 */
const HEADING = /^(#{1,6})\s+(.*)$/

/** 分隔线。 */
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

/** 一行拆成表格单元（去掉首尾空单元）。 */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/**
 * 把一个块级正文拆成块 token。
 *
 * 段落里的**单个换行保留**（渲染端用 `pre-wrap`）——研究笔记常按行断句，
 * 折行成空格会把它变成一坨。
 */
export function parseMarkdownBlocks(src: string): MdBlock[] {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string

    if (line.trim() === '') {
      i += 1
      continue
    }

    // 代码块（``` 或 ~~~ 起止；未闭合就一直吃到结尾 —— 大不了当代码显示）
    const fence = /^\s*(```+|~~~+)\s*(\S*)\s*$/.exec(line)
    if (fence) {
      const marker = fence[1] as string
      const lang = fence[2] ?? ''
      const body: string[] = []
      i += 1
      while (i < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i] as string)) {
        body.push(lines[i] as string)
        i += 1
      }
      i += 1 // 收尾围栏（没有就跳过末尾）
      blocks.push({ kind: 'code', lang, text: body.join('\n') })
      continue
    }

    if (HR.test(line)) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: (heading[1] as string).length, text: (heading[2] as string).trim() })
      i += 1
      continue
    }

    // 引用块：连续 `>` 行合成一段
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i] as string)) {
        quote.push((lines[i] as string).replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', text: quote.join('\n') })
      continue
    }

    // 表格：本行含 `|` 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1] as string)) {
      const head = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && (lines[i] as string).includes('|') && (lines[i] as string).trim() !== '') {
        rows.push(splitRow(lines[i] as string))
        i += 1
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    // 列表：连续的列表项（有序/无序各自成块；缩进不细分层级）
    const item = LIST_ITEM.exec(line)
    if (item) {
      const ordered = /^\d/.test(item[1] as string)
      const items: string[] = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i] as string)
        if (!m || /^\d/.test(m[1] as string) !== ordered) break
        items.push(m[2] as string)
        i += 1
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    // 段落：吃到空行 / 下一个块级起点
    const para: string[] = []
    while (i < lines.length) {
      const l = lines[i] as string
      if (
        l.trim() === '' ||
        HEADING.test(l) ||
        HR.test(l) ||
        LIST_ITEM.test(l) ||
        /^\s*>/.test(l) ||
        /^\s*(```+|~~~+)/.test(l)
      ) {
        break
      }
      para.push(l)
      i += 1
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') })
  }
  return blocks
}

/** 把一段行内文本拆成 token（未闭合的标记原样当文字）。 */
export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = []
  let rest = src ?? ''
  while (rest.length > 0) {
    const m = INLINE.exec(rest)
    if (!m || m.index === undefined) {
      out.push({ kind: 'text', text: rest })
      break
    }
    if (m.index > 0) out.push({ kind: 'text', text: rest.slice(0, m.index) })
    const token = m[0]
    if (token.startsWith('`')) {
      out.push({ kind: 'code', text: token.slice(1, -1) })
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push({ kind: 'bold', text: token.slice(2, -2) })
    } else if (token.startsWith('~~')) {
      out.push({ kind: 'strike', text: token.slice(2, -2) })
    } else if (token.startsWith('[')) {
      const at = token.indexOf('](')
      out.push({ kind: 'link', text: token.slice(1, at), href: token.slice(at + 2, -1) })
    } else {
      out.push({ kind: 'italic', text: token.slice(1, -1) })
    }
    rest = rest.slice(m.index + token.length)
  }
  return out
}
