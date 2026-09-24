/**
 * ConvFusion 2.0 — 研究方法导出（`/research 导出研究方法`）
 *
 * ## 它做什么
 *
 * 把**全部研究方法（技能）及其提示词**拼成一个 Markdown 文件，按 `CxxPyy` 编号排序：
 *
 * ```text
 * ## C01 · 理解输入（Research Understanding）
 *
 * ### C01P01 · 理解输入 · 输入理解
 *
 * #### Purpose
 * …
 * ```
 *
 * ## 三个用途（设计目标）
 *
 * 1. **查阅 / 归档**：一个文件看完全部方法，且顺序符合研究进程（不是字母序）。
 * 2. **分享给他人**：专家可以照着这个格式写自己的方法集。
 * 3. **将来按编号合并（导入）**：`### CxxPyy` 是**唯一锚点**，合并时按编号对齐，
 *    因此编号必须稳定 —— 这也是 {@link skill-codes.ts} 把它当常量表维护的原因。
 *
 * ## 导出的是什么内容
 *
 * - 默认：**7 个可定制章节**（Purpose / When to Use / Prerequisites / Research Method /
 *   Reasoning Guidance / Evidence Requirements / Expected Output）的**生效版本** —— 用户定制过的部分会被标出来。
 *   这几节正是用户会编辑、会分享的部分，体量也适中（约 150–200 KB）。
 * - `full: true`：**完整生效正文**，含 `## Source Prompts`（逐字旧提示词，历史智能）。
 *   全部技能合计约 526 KB，所以默认不导。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listSystemSkills, type SkillDocument } from './skills.js'
import { CATEGORY_CODES, categoryCodeInfo } from './skill-codes.js'
import {
  CUSTOMIZABLE_SECTIONS,
  composeSkillContent,
  sectionBase,
  type SkillCustomizationStore,
} from './skill-customization.js'

/** 导出文件的默认落点（相对研究根）。 */
export const METHODS_EXPORT_FILE = 'research/methods-export.md'

/** 导出选项。 */
export interface MethodsExportOptions {
  /** 是否导出完整正文（含 Source Prompts）；缺省只导 7 个可定制章节。 */
  full?: boolean
  /** 用户定制来源（生效版本 = 基线 + 定制）。 */
  store?: SkillCustomizationStore
  /** 导出时间（测试可注入，缺省当前时刻）。 */
  now?: Date
}

/** 导出结果。 */
export interface MethodsExportResult {
  markdown: string
  skillCount: number
  categoryCount: number
  /** 字符数。 */
  bytes: number
  /** 是否含完整正文。 */
  full: boolean
}

/** 一个类别下的一组技能。 */
interface CategoryGroup {
  code: string
  label: string
  labelEn: string
  skills: SkillDocument[]
}

/** 按编号表的类别顺序分组（未登记编号的类别放最后，不丢）。 */
function groupByCategory(docs: readonly SkillDocument[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>()
  for (const doc of docs) {
    const groupId = doc.category?.includes('/') ? doc.category.split('/')[0] : (doc.category ?? '')
    const info = categoryCodeInfo(groupId)
    const key = info?.code ?? 'C99'
    if (!groups.has(key)) {
      groups.set(key, {
        code: key,
        label: info?.label ?? '未分类',
        labelEn: info?.labelEn ?? 'Uncategorized',
        skills: [],
      })
    }
    groups.get(key)!.skills.push(doc)
  }
  // 按类别编号排序（`C01` < `C02` < …），C99 自然排最后
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** 一个技能在导出文件里的标题行：`### C02P01 · 文献 · 文献检索`。 */
function skillHeading(doc: SkillDocument, categoryLabel: string): string {
  const code = doc.code ?? doc.id
  // 中文名优先（`skill-codes.ts` 的表），回退英文名 —— 标题行按用户要求是「编号 · 类别 · 名称」
  const parts = [code, categoryLabel, doc.label ?? doc.name].filter(Boolean)
  return `### ${parts.join(' · ')}`
}

/**
 * 渲染一个技能的正文。
 *
 * - 默认：逐个可定制章节输出；该章节有用户定制时，用引用块标出**用户补充**，
 *   这样导出文件既保留了基线方法，也保留了用户自己的东西。
 * - `full`：直接输出生效正文（去掉 `# Skill: X` 一级标题，避免与 `###` 层级冲突）。
 */
function renderSkillBody(
  doc: SkillDocument,
  opts: { full: boolean; customizations: Record<string, Record<string, string>> },
): string {
  if (opts.full) {
    // 复用**运行时同一套合成**（`composeSkillContent`），保证导出 = 实际生效的方法
    const body = composeSkillContent(doc.body, opts.customizations[doc.id])
    return `${body.trim()}\n`
  }

  const parts: string[] = []
  for (const section of CUSTOMIZABLE_SECTIONS) {
    const base = sectionBase(doc, section).trim()
    const userText = (opts.customizations[doc.id]?.[section] ?? '').trim()
    // 章节不存在且没有定制 → 跳过（不给导出文件塞空标题）
    if (!base && !userText) continue
    parts.push(`#### ${section}`, '')
    if (base) parts.push(base, '')
    if (userText) parts.push('> **用户补充**', '>', ...userText.split('\n').map((l) => `> ${l}`), '')
  }
  return parts.length > 0 ? `${parts.join('\n').trim()}\n` : ''
}

/**
 * 生成导出 Markdown（纯函数：只读技能库与定制，不写盘）。
 */
export function buildMethodsExport(opts: MethodsExportOptions = {}): MethodsExportResult {
  const full = opts.full === true
  const docs = listSystemSkills() // 已按 CxxPyy 排序
  const customizations = opts.store?.load() ?? {}
  const groups = groupByCategory(docs)
  const now = opts.now ?? new Date()

  const customizedCount = Object.values(customizations).reduce(
    (n, sections) => n + Object.values(sections).filter((t) => t.trim()).length,
    0,
  )

  const head: string[] = [
    '# ConvFusion 研究方法导出',
    '',
    `> 编号规则：\`CxxPyy\` —— 类别 \`C01\`–\`C09\` 按研究过程排序（理解输入 → 文献调研 → 创新假设 → 研究计划 → 资源估计 → 研究决策 → 实验验证 → 论文写作 → 工作评阅），类别内 \`P01\`–\`Pnn\`。`,
    `> 导出时间：${now.toISOString()}`,
    `> 技能：${docs.length} · 类别：${groups.length} · 用户定制：${customizedCount} 处`,
    full
      ? '> 内容：**完整正文**（含 `Source Prompts` 逐字历史提示词）。'
      : '> 内容：7 个可定制章节的生效版本（Purpose / When to Use / Prerequisites / Research Method / Reasoning Guidance / Evidence Requirements / Expected Output）。如需完整正文，用 `/research 导出研究方法 --full`。',
    '>',
    '> 导入/合并时以 `### CxxPyy` 为锚点按编号对齐。',
    '',
    '---',
    '',
  ]

  const body: string[] = []
  for (const group of groups) {
    body.push(`## ${group.code} · ${group.label}（${group.labelEn}）`, '')
    for (const doc of group.skills) {
      body.push(skillHeading(doc, group.label), '')
      // 中文标题行之外，保留 id 与英文名，便于跨语言检索与定位文件
      if (!full) {
        const meta = [`技能 id：\`${doc.id}\``]
        if (doc.code) meta.push(`编号 \`${doc.code}\``)
        if (doc.label && doc.label !== doc.name) meta.push(`英文名 ${doc.name}`)
        body.push(`> ${meta.join(' · ')}`, '')
      }
      const rendered = renderSkillBody(doc, { full, customizations })
      if (rendered) body.push(rendered)
      else body.push('_（该技能没有可导出的章节）_', '')
    }
  }

  const markdown = `${[...head, ...body].join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
  return {
    markdown,
    skillCount: docs.length,
    categoryCount: groups.length,
    bytes: markdown.length,
    full,
  }
}

/** 写导出文件（默认 `research/methods-export.md`）。 */
export function writeMethodsExport(
  workspace: string,
  opts: MethodsExportOptions & { path?: string } = {},
): MethodsExportResult & { path: string } {
  const result = buildMethodsExport(opts)
  const rel = opts.path?.trim() || METHODS_EXPORT_FILE
  const abs = join(workspace, rel)
  const dir = abs.slice(0, abs.lastIndexOf('/'))
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(abs, result.markdown, 'utf8')
  return { ...result, path: rel }
}

/** 类别编号表（供设置页/命令输出展示）。 */
export function categoryCodeTable(): Array<{ code: string; label: string; labelEn: string }> {
  return CATEGORY_CODES.map((c) => ({ code: c.code, label: c.label, labelEn: c.labelEn }))
}
