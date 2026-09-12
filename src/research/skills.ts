/**
 * ConvFusion 2.0 — Skill 定义与解析（Stage 2 建立，架构收敛后重写）
 *
 * ## Skill 是什么
 *
 * > 一种可复用、可解释、可修改、可组合的**研究方法**。
 *
 * **Prompt 是 Skill 的执行表达，不是 Skill 本身** —— 所以 Skill 是一份 Markdown 文档。
 *
 * ## 架构（用户拍板，与初版 Stage 2 不同）
 *
 * ```text
 * 系统 Skill Library = 包内资产 skills/<category>/<skill>.md，**我们维护、只读**
 * 用户定制           = 【设置】-【ConvFusion】-【本地设置】→ 独立文件（拼接覆盖）
 * ```
 *
 * 因此本模块**没有写操作**：
 *   - 系统库文件随发行版提供，运行时不改；
 *   - 用户的个性化不写进库，而是作为**覆盖层**在合成时拼接
 *     （见 `skill-customization.ts`）。
 *
 * 早期版本曾有 `skills/user/`、`skills/derived/`、`forkSkill`、`reviseSkill` 等
 * "workspace 内可写 Skill" 的概念 —— 那与"我们维护 Skill Library、用户只做覆盖"的
 * 设计冲突，已移除。
 *
 * ## 两条边界
 *
 * 1. **Markdown-first**：frontmatter 只是轻量元数据，正文才是语义来源。
 * 2. **不是 DSL**：章节用宽松匹配解析，缺章节不报错。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillOrigin } from './taxonomy.js'
import { normalizeCategoryId } from './taxonomy.js'
import { parseSections } from './markdown.js'

/* ════════════════════════════════════════════════════════════════════════
 * 类型
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Skill 来源。
 *
 * 新架构里系统库全是 `system`（由我们维护）；`user`/`derived` 保留在类型里是为了
 * 兼容历史归档与将来的扩展，运行时不再产生。
 */
export type SkillType = SkillOrigin | 'derived'

/** Skill 生命周期状态。 */
export type SkillStatus = 'active' | 'draft' | 'archived'

/**
 * 一个 Skill 的完整内容。
 *
 * `sections` 保存**全部**章节（含我们不认识的），因此不会因为"只认识某几个标题"而丢内容。
 */
export interface SkillDocument {
  /** 稳定 id（文件名去 `.md`）。 */
  id: string
  /** 展示名（正文 `# Skill: X`，回退 frontmatter `name`，回退 id）。 */
  name: string
  /** 分类（规范 id，如 `literature/research-gap`）。 */
  category?: string
  type: SkillType
  status: SkillStatus
  version: string
  /** 正文全部章节。 */
  sections: Array<{ title: string; body: string }>
  /** 完整正文（不含 frontmatter）。 */
  body: string
  /** 文件绝对路径。 */
  path: string
  /** 相对包根的路径（如 `skills/literature/research-gap-analysis.md`）。 */
  relPath: string
  /** 是否可编辑（系统库恒为 false）。 */
  editable: boolean
}

/** 系统 Skill Library 的目录名（包内）。 */
export const SKILLS_DIR = 'skills'

/* ════════════════════════════════════════════════════════════════════════
 * 章节读取（宽松匹配）
 * ════════════════════════════════════════════════════════════════════════ */

function findSection(doc: Pick<SkillDocument, 'sections'>, ...names: string[]): string {
  for (const want of names) {
    const w = want.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    const hit = doc.sections.find((s) => s.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '') === w)
    if (hit) return hit.body
  }
  return ''
}

/** `## Purpose` 内容。 */
export function skillPurpose(doc: SkillDocument): string {
  return findSection(doc, 'Purpose', '目的')
}

/** `## When to Use` 内容。 */
export function skillWhenToUse(doc: SkillDocument): string {
  return findSection(doc, 'When to Use', 'When To Use', 'When')
}

/** `## Research Method` 内容（方法论主体）。 */
export function skillMethod(doc: SkillDocument): string {
  return findSection(doc, 'Research Method', 'Method')
}

/** `## Expected Output` 内容。 */
export function skillExpectedOutput(doc: SkillDocument): string {
  return findSection(doc, 'Expected Output')
}

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 序列化
 * ════════════════════════════════════════════════════════════════════════ */

/** 受限 YAML frontmatter 解析（标量；保持轻量）。 */
export function parseSkillFrontmatter(source: string): Record<string, string> {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) continue
    out[key] = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/** 去掉 frontmatter。 */
export function stripSkillFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/** 把正文按 `##` 章节切开（`#` 一级标题单独取）。 */
function normalizeStatus(raw: string | undefined): SkillStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return v === 'draft' || v === 'archived' || v === 'active' ? v : 'active'
}

/** 解析一个 Skill Markdown（正文优先）。 */
export function parseSkillDocument(
  absPath: string,
  relPath: string,
  typeDefault: SkillType = 'system',
): SkillDocument | null {
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const fm = parseSkillFrontmatter(source)
  const body = stripSkillFrontmatter(source).trim()
  // 标题去掉 `Skill: ` 前缀（渲染器写的就是 `# Skill: X`）
  const parsed = parseSections(body)
  const skillTitle = parsed.title?.replace(/^Skill:\s*/i, '') ?? null
  const id = (absPath.split('/').pop() ?? '').replace(/\.md$/, '')
  const category = normalizeCategoryId(fm.category)
  const type: SkillType =
    fm.type === 'system' || fm.type === 'user' || fm.type === 'derived' ? (fm.type as SkillType) : typeDefault

  return {
    id,
    name: skillTitle || fm.name || id,
    ...(category ? { category } : {}),
    type,
    status: normalizeStatus(fm.status),
    version: fm.version || '1.0',
    sections: parsed.sections,
    body,
    path: absPath,
    relPath,
    // 系统库由我们维护，运行时**只读**
    editable: false,
  }
}

/** 序列化 Skill（供导出/归档使用；运行时不会写系统库）。 */
export function serializeSkillDocument(input: {
  name: string
  category?: string
  type?: SkillType
  status?: SkillStatus
  version?: string
  sections: Array<{ title: string; body: string }>
}): string {
  const front = ['---', `name: ${input.name}`, `type: ${input.type ?? 'system'}`]
  if (input.category) front.push(`category: ${input.category}`)
  front.push(`status: ${input.status ?? 'active'}`, `version: ${input.version ?? '1.0'}`, '---')
  const parts = [`# Skill: ${input.name}`, '']
  for (const s of input.sections) parts.push(`## ${s.title}`, '', s.body.trim(), '')
  return `${front.join('\n')}\n\n${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/* ════════════════════════════════════════════════════════════════════════
 * 发现（读）—— 只读系统 Skill Library
 * ════════════════════════════════════════════════════════════════════════ */

function listMarkdownRecursive(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = []
  const walk = (dir: string): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue
      const abs = join(dir, e.name)
      if (e.isDirectory()) walk(abs)
      else if (e.name.endsWith('.md')) out.push({ abs, rel: abs.slice(root.length + 1) })
    }
  }
  walk(root)
  return out
}

/** 包内系统库根目录（兼容 `src/` 直跑与 `lib/` 构建产物）。 */
export function systemSkillRoot(): string {
  const hereDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(hereDir, '..', '..', SKILLS_DIR), // lib/research → 包根
    join(hereDir, '..', '..', '..', SKILLS_DIR), // 布局变化兜底
    join(process.cwd(), SKILLS_DIR),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

/**
 * 系统 Skill 的**基线**文档（纯包内资产，不含用户定制）。
 *
 * 用户定制在消费侧拼接（`composeSkillContent`），因此这里永远是"我们发布的样子"。
 */
export function listSystemSkills(root?: string): SkillDocument[] {
  const base = root ?? systemSkillRoot()
  const docs: SkillDocument[] = []
  for (const { abs, rel } of listMarkdownRecursive(base)) {
    const doc = parseSkillDocument(abs, `${SKILLS_DIR}/${rel}`, 'system')
    if (doc) docs.push({ ...doc, type: 'system', editable: false })
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * 列出全部 Skill。
 *
 * ⚠️ `_workspace` 参数在新架构下**不用于定位 Skill**（Skill 不在 workspace 里）。
 * 保留它是为了不改动既有调用点；正文合成请用 `composeSkillContent`。
 */
export function listSkillDocuments(
  _workspace: string,
  options: { types?: readonly SkillType[] } = {},
): SkillDocument[] {
  const docs = listSystemSkills()
  if (!options.types?.length) return docs
  return docs.filter((d) => options.types!.includes(d.type))
}

/** 读一个 Skill（按 id）。 */
export function readSkill(_workspace: string, id: string): SkillDocument | undefined {
  const norm = id.trim()
  return listSystemSkills().find((s) => s.id === norm)
}

/* ════════════════════════════════════════════════════════════════════════
 * 过滤（§18 Search / Category Filter）
 * ════════════════════════════════════════════════════════════════════════ */

export interface SkillQuery {
  search?: string
  category?: string
  types?: readonly SkillType[]
  status?: readonly SkillStatus[]
  ids?: readonly string[]
}

/** 纯函数过滤（便于测试与复用）。 */
export function filterSkills(docs: readonly SkillDocument[], query: SkillQuery): SkillDocument[] {
  let out = [...docs]
  if (query.types?.length) out = out.filter((d) => query.types!.includes(d.type))
  if (query.status?.length) out = out.filter((d) => query.status!.includes(d.status))
  if (query.ids) {
    const set = new Set(query.ids)
    out = out.filter((d) => set.has(d.id))
  }
  if (query.category) {
    const want = normalizeCategoryId(query.category) ?? query.category
    out = out.filter((d) => d.category === want || (d.category?.startsWith(`${want}/`) ?? false))
  }
  if (query.search) {
    const q = query.search.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          (d.category ?? '').toLowerCase().includes(q) ||
          d.body.toLowerCase().includes(q),
      )
    }
  }
  return out
}
