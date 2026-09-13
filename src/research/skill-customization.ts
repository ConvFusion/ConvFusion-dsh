/**
 * ConvFusion 2.0 — 用户定制 Skill 覆盖层
 *
 * ## 架构（用户拍板）
 *
 * ```text
 * 系统 Skill Library（包内资产，我们维护，**只读**）
 *        +
 * 用户定制（【设置】-【ConvFusion】-【本地研究方法】，按类别逐个定制可覆盖项）
 *        ↓ 以**拼接**方式合成
 * 模型看到的 Skill 正文
 * ```
 *
 * **用户定制绝不会写进系统 Skill 库。** 库本身不发生变化；用户只提供一段文本，
 * 在合成时被拼接进去（用户文本在前，原有方法主体与输出契约保持在后 —— 与原
 * ConvFusion 的 `user_skill` 层语义一致：注入个人方法而不破坏输出契约）。
 *
 * ## 存储：独立文件，设置里只存**文件名**
 *
 * 用户拍板：**用户定制保存为文件，设置里配置的是文件名** ——
 * 这样设置文件绝不会因为定制内容增多而过大。
 *
 * ```text
 * ~/.dsh/settings.yaml
 *   convfusion:
 *     customizationFile: skill-customizations.json    ← 只有文件名
 *
 * ~/.dsh/convfusion/skill-customizations.json       ← 定制内容在这里
 *   { "research-gap-analysis": { "Research Method": "我通常先……" } }
 * ```
 *
 * 存哪里被抽成 {@link SkillCustomizationStore}，因此换成别的位置（或云端同步）
 * 只需换一个实现，调用方（provider / 设置面 / Research Context）不动。
 *
 * ## 设置界面需要什么
 *
 * 【本地研究方法】要能**列出每个类别下允许定制的提示词**，因此本模块提供
 * {@link listCustomizationPoints}：把系统库按类别展开成
 * `类别 → 技能 → 可定制项`，并标注用户当前是否已覆盖。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { SkillDocument } from './skills.js'
import { listSkillDocuments, skillMethod, skillPurpose, skillWhenToUse } from './skills.js'
import { categoryName } from './taxonomy.js'
import { categoryCodeInfo, looksLikeSkillCode, skillIdByCode, skillSortKey } from './skill-codes.js'
import { findSection } from './markdown.js'

/* ════════════════════════════════════════════════════════════════════════
 * 可定制项
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一个可定制的部分（"提示词"）。
 *
 * 粒度是 Skill 的章节 —— 与原 ConvFusion 的节点提示词定制对应，
 * 但 v2 里按 **Category → Skill → 可定制项** 组织（原为 模块 → 节点）。
 */
export interface CustomizationPoint {
  /** Skill id（如 `research-gap-analysis`）。 */
  skillId: string
  /** Skill 显示名。 */
  skillName: string
  /** Skill 唯一编号（`CxxPyy`）—— 设置页展示与排序的锚点。 */
  skillCode?: string
  /** Skill 中文名 —— 设置页展示。 */
  skillLabel?: string
  /** 所属类别（顶层大类，设置面板的一级分组）。 */
  category: string
  /** 可定制章节标题（如 `Research Method`）。 */
  section: string
  /** 该部分的基线内容（只读展示，让用户知道自己在覆盖什么）。 */
  base: string
  /** 是否已被用户覆盖。 */
  overridden: boolean
  /** 用户当前的覆盖文本。 */
  userText?: string
}

/**
 * 允许用户定制的章节。
 *
 * ⚠️ **刻意不包含** `Expected Output` / `Evidence Requirements` 之外的结构性内容：
 * Skill 的输出契约是模型可靠性的基础，用户改它会让 Skill 失效。
 * 这对应原 ConvFusion 把用户文本拼在**前面**、把 JSON 输出要求留在**最后**的设计。
 */
export const CUSTOMIZABLE_SECTIONS: readonly string[] = [
  'Purpose',
  'When to Use',
  'Research Method',
  'Reasoning Guidance',
  'Evidence Requirements',
  'Expected Output',
]

/* ════════════════════════════════════════════════════════════════════════
 * 覆盖数据
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 用户覆盖集合（持久化形状，与设置里的 JSON 完全一致）。
 *
 * ```json
 * { "research-gap-analysis": { "Research Method": "我通常先……" } }
 * ```
 */
export type SkillCustomizations = Record<string, Record<string, string>>

/** 覆盖存储后端。 */
export interface SkillCustomizationStore {
  /** 读取全部覆盖。 */
  load(): SkillCustomizations
  /** 写入一个覆盖（`text` 为空 → 清除该覆盖）。 */
  set(skillId: string, section: string, text: string): void
  /** 后端说明（设置面板展示用，让用户知道定制存在哪里）。 */
  readonly description: string
}

/**
 * 把定制文件的键规范化成 skillId。
 *
 * 键允许两种写法（**输入宽容**）：
 *   - `"submission-compile-and-format"` —— skillId，稳定主键，规范形式
 *   - `"C08P07"` —— 技能编号，人手写时好记；这里反查成 skillId
 *
 * 查不到对应技能的编号**保留原键**（不静默丢数据）：它会在加载时匹配不到任何技能，
 * 因而无害，而用户还能在文件里看到自己写了什么。
 */
export function normalizeCustomizationKey(rawKey: string): string | undefined {
  const key = rawKey.trim()
  if (!key) return undefined
  if (looksLikeSkillCode(key)) return skillIdByCode(key) ?? key
  return key
}

/**
 * 按编号排序键（**输出严格**）。
 *
 * 定制的先后顺序没有意义；按 `CxxPyy` 排，文件读起来就是研究流程顺序。
 * 未登记编号的键排在最后，并保持彼此原有相对顺序。
 */
export function sortCustomizations(c: SkillCustomizations): SkillCustomizations {
  const out: SkillCustomizations = {}
  for (const skillId of Object.keys(c).sort((a, b) => skillSortKey(a).localeCompare(skillSortKey(b)))) {
    out[skillId] = c[skillId]
  }
  return out
}

/** 解析设置里的 JSON 字符串（损坏 → 空，绝不让坏数据让 Skill 不可用）。 */
export function parseCustomizations(raw: string | undefined): SkillCustomizations {
  if (!raw || !raw.trim()) return {}
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: SkillCustomizations = {}
    for (const [rawKey, sections] of Object.entries(v as Record<string, unknown>)) {
      if (!sections || typeof sections !== 'object' || Array.isArray(sections)) continue
      const skillId = normalizeCustomizationKey(rawKey)
      if (!skillId) continue
      // 同一技能可能既用 id 又用编号写了 —— 合并到同一个 skillId 下（章节级）
      const clean: Record<string, string> = { ...(out[skillId] ?? {}) }
      for (const [section, text] of Object.entries(sections as Record<string, unknown>)) {
        if (typeof text === 'string' && text.trim()) clean[section] = text
      }
      if (Object.keys(clean).length > 0) out[skillId] = clean
    }
    // 解析即规范化（键 → skillId + 编号排序）：内存表示与落盘形式一致，
    // 于是「读 → 写 → 再读」严格幂等，diff 也不会因为定制的先后顺序而抖动。
    return sortCustomizations(out)
  } catch {
    return {}
  }
}

/** 序列化覆盖集合（键按编号排序，便于人读与 diff）。 */
export function serializeCustomizations(c: SkillCustomizations): string {
  return JSON.stringify(sortCustomizations(c))
}

/**
 * 文件后端：定制内容存独立 JSON 文件，设置里只有文件名。
 *
 * @param resolvePath 由插件入口注入：把设置里的文件名解析成绝对路径
 *                    （相对名相对于 `$DSH_HOME`）。
 */
export function createFileCustomizationStore(resolvePath: () => string): SkillCustomizationStore {
  const readAll = (): SkillCustomizations => {
    const file = resolvePath()
    if (!existsSync(file)) return {}
    try {
      return parseCustomizations(readFileSync(file, 'utf8'))
    } catch {
      // 文件损坏时**不抛错**：Skill 退回基线内容，研究不会因此不可用。
      return {}
    }
  }
  const writeAll = (c: SkillCustomizations): void => {
    const file = resolvePath()
    // 空表 = 完全没有定制 → 不留下一个空的 `{}` 文件。
    // 这样"恢复系统原文"是干净的，`file.exists` 也才如实反映"有没有定制"。
    if (Object.keys(c).length === 0) {
      rmSync(file, { force: true })
      return
    }
    mkdirSync(dirname(file), { recursive: true })
    // 键按编号排序写回：文件顺序符合研究流程，且 diff 稳定（不受定制先后影响）
    writeFileSync(file, JSON.stringify(sortCustomizations(c), null, 2) + '\n', 'utf8')
  }
  return {
    get description(): string {
      return `file: ${resolvePath()}`
    },
    load: readAll,
    set: (skillId, section, text) => {
      const c = readAll()
      const sections = { ...(c[skillId] ?? {}) }
      if (text.trim()) sections[section] = text
      else delete sections[section]
      if (Object.keys(sections).length > 0) c[skillId] = sections
      else delete c[skillId]
      writeAll(c)
    },
  }
}

/**
 * 清空定制（设置面板的"恢复系统原文"）。
 *
 * @param skillId 只清这一个研究方法；缺省 = 清空全部
 *
 * ⚠️ 这里曾经写反过：原实现构造 `{...c, [skillId]: {}}` 后**删掉** skillId，
 * 于是"恢复这个 Skill"实际清空的是**其他所有** Skill，而"恢复全部"什么也不清。
 * 两个分支都是静默的（界面显示成功），所以只能靠断言抓住 ——
 * 见 `scripts/verify-settings-page.mjs` 第 2 节。
 */
export function clearAllCustomizations(store: SkillCustomizationStore, skillId?: string): void {
  const c = store.load()
  const ids = skillId ? [skillId] : Object.keys(c)
  for (const id of ids) {
    for (const section of Object.keys(c[id] ?? {})) store.set(id, section, '')
  }
}

/**
 * 纯内存后端（测试与"尚未接入设置"的降级用）。
 *
 * 也在"将来改成独立文件"时作为实现模板。
 */
export function createMemoryCustomizationStore(initial: SkillCustomizations = {}): SkillCustomizationStore & {
  current(): SkillCustomizations
} {
  let state: SkillCustomizations = { ...initial }
  return {
    description: 'in-memory (not persisted)',
    load: () => state,
    set: (skillId, section, text) => {
      const sections = { ...(state[skillId] ?? {}) }
      if (text.trim()) sections[section] = text
      else delete sections[section]
      state = { ...state }
      if (Object.keys(sections).length > 0) state[skillId] = sections
      else delete state[skillId]
    },
    current: () => state,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 合成分解
 * ════════════════════════════════════════════════════════════════════════ */

/** 用户覆盖在合成文本里的分隔标记（与 v1 的包裹语义一致，可读、可辨识）。 */
export const USER_SECTION_HEADER = '=== 用户额外要求（User additions）==='
export const BASE_SECTION_HEADER = '=== 原有方法（Original method）==='

/**
 * 把用户覆盖以**拼接**方式合成到 Skill 正文里。
 *
 * 顺序契约（重要，与原 ConvFusion 的 `user_skill` 层一致）：
 *
 * ```text
 * === 用户额外要求（User additions）===
 * <用户文本>
 * === 原有方法（Original method）===
 * <系统 Skill 正文>
 * ```
 *
 * 用户文本在**前**、原有方法在**后** —— 因此 Skill 末尾的输出契约与结构不被破坏，
 * 注入个人研究方法不会让 Skill 失效。
 */
export function composeSkillContent(baseContent: string, overrides: Record<string, string> | undefined): string {
  const entries = Object.entries(overrides ?? {}).filter(([, t]) => t.trim())
  if (entries.length === 0) return baseContent

  const userBlocks = entries.map(([section, text]) => `## ${section}\n\n${text.trim()}`)
  return [
    USER_SECTION_HEADER,
    '',
    'The researcher has specified the following additions to this method. Follow them as part of',
    'the method; where they are more specific than the original, they take precedence.',
    '',
    ...userBlocks,
    '',
    BASE_SECTION_HEADER,
    '',
    baseContent,
  ].join('\n')
}

/** 某个 Skill 的某章节的**基线**内容（用于设置面板展示"你在覆盖什么"）。 */
export function sectionBase(doc: SkillDocument, section: string): string {
  const hit = doc.sections.find((s) => s.title.toLowerCase() === section.toLowerCase())
  return hit?.body ?? ''
}

/* ════════════════════════════════════════════════════════════════════════
 * 设置面板所需：按类别列出可定制项
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个类别下的全部可定制项（设置面板的一级分组）。 */
export interface CategoryCustomization {
  /** 类别 id（顶层大类，如 `literature`）。 */
  categoryId: string
  /** 类别显示名（如 `Literature`）。 */
  categoryName: string
  /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
  categoryCode?: string
  /** 类别中文名（如「文献」）。 */
  categoryLabel?: string
  points: CustomizationPoint[]
  /** 该类别下已覆盖的数量。 */
  overriddenCount: number
}

/**
 * 列出**全部**可定制项，按类别分组（【本地研究方法】的数据面）。
 *
 * 这是"允许用户定制每一个类别中各个允许定制的提示词"的直接实现：
 * 遍历系统 Skill Library → 按 Category 分组 → 展开允许定制的章节。
 */
export function listCustomizationPoints(
  workspace: string,
  customizations: SkillCustomizations,
): CategoryCustomization[] {
  const docs = listSkillDocuments(workspace)
  const byCategory = new Map<string, CustomizationPoint[]>()

  for (const doc of docs) {
    const categoryId = doc.category?.split('/')[0] ?? 'uncategorized'
    const points = byCategory.get(categoryId) ?? []
    for (const section of CUSTOMIZABLE_SECTIONS) {
      const base = sectionBase(doc, section)
      // 章节不存在就不提供定制（不能给用户一个"覆盖不存在内容"的入口）
      if (!base.trim()) continue
      const userText = customizations[doc.id]?.[section]
      points.push({
        skillId: doc.id,
        skillName: doc.name,
        ...(doc.code ? { skillCode: doc.code } : {}),
        ...(doc.label ? { skillLabel: doc.label } : {}),
        category: categoryId,
        section,
        base,
        overridden: Boolean(userText?.trim()),
        ...(userText?.trim() ? { userText } : {}),
      })
    }
    byCategory.set(categoryId, points)
  }

  return [...byCategory.entries()]
    .map(([categoryId, points]) => {
      const info = categoryCodeInfo(categoryId)
      return {
        categoryId,
        categoryName: categoryName(categoryId),
        ...(info ? { categoryCode: info.code, categoryLabel: info.label } : {}),
        // ⚠️ 技能按**编号**排序（CxxPyy），不是 skillName 字母序 ——
        // 字母序会把消融（实验阶段）排到理解问题之前，与做研究的顺序无关。
        points: points.sort(
          (a, b) =>
            skillSortKey(a.skillId).localeCompare(skillSortKey(b.skillId)) ||
            a.section.localeCompare(b.section),
        ),
        overriddenCount: points.filter((p) => p.overridden).length,
      }
    })
    // 类别按**研究过程顺序**（C01 → C09），不是类别名字母序 ——
    // 字母序会让 Academic Writing 排最前，而它其实是倒数第二步。
    .sort((a, b) => (a.categoryCode ?? 'C99').localeCompare(b.categoryCode ?? 'C99'))
}

/* ════════════════════════════════════════════════════════════════════════
 * 系统库定位（包内资产）
 * ════════════════════════════════════════════════════════════════════════ */

const here = dirname(fileURLToPath(import.meta.url))

/**
 * 系统 Skill Library 的目录（**包内资产**，不随 workspace 变化）。
 *
 * 定位顺序：`lib/research/` 或 `src/research/` → 包根 → `skills/`。
 * 与 Stage 1 的 `skillDir()` 同款兜底，兼容直接跑 `src` 与跑构建产物 `lib`。
 */
export function systemSkillRoot(): string {
  const candidates = [
    join(here, '..', '..', 'skills'),
    join(here, '..', '..', '..', 'skills'),
    join(process.cwd(), 'skills'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      // 目录非空才算命中（避免命中无关的空 skills 目录）
      try {
        if (readdirSync(c).some((f) => f.endsWith('.md') || existsSync(join(c, f, '')))) return c
      } catch {
        /* 继续尝试 */
      }
    }
  }
  return candidates[0]
}

/** 供设置面板展示"系统模板加载情况"。 */
export function systemLibraryStatus(): { root: string; skillCount: number } {
  const root = systemSkillRoot()
  let count = 0
  try {
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name))
        else if (e.name.endsWith('.md') && !e.name.startsWith('.')) count++
      }
    }
    walk(root)
  } catch {
    count = 0
  }
  return { root, skillCount: count }
}

/** 读取一个 Skill 的基线正文（不经注册表；设置面板与测试用）。 */
export function readBaseSkillContent(workspace: string, skillId: string): string | undefined {
  return listSkillDocuments(workspace).find((d) => d.id === skillId)?.body
}

/** Skill 的展示摘要（设置面板的列表项）。 */
export function skillBrief(doc: SkillDocument): { id: string; name: string; purpose: string; whenToUse: string } {
  return {
    id: doc.id,
    name: doc.name,
    purpose: skillPurpose(doc),
    whenToUse: skillWhenToUse(doc),
  }
}

/** 便捷：取某 Skill 的方法主体（供 Agent 阅读）。 */
export function skillMethodBody(workspace: string, skillId: string): string | undefined {
  const doc = listSkillDocuments(workspace).find((d) => d.id === skillId)
  return doc ? skillMethod(doc) : undefined
}

/** 便捷：取某 Skill 的任意章节。 */
export function skillSectionBody(workspace: string, skillId: string, section: string): string | undefined {
  const doc = listSkillDocuments(workspace).find((d) => d.id === skillId)
  return doc ? findSection(doc.sections, section) : undefined
}

/** 读一个 Skill 的定义（供工具/命令使用）。 */
export function readSkillDocument(workspace: string, skillId: string): SkillDocument | undefined {
  return listSkillDocuments(workspace).find((d) => d.id === skillId)
}

/** 供测试：读取任意文件的文本（失败 → undefined）。 */
export function tryRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}
