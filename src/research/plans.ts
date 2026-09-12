/**
 * ConvFusion 2.0 — Plan System（Stage 3 核心）
 *
 * ## Plan 是什么（v2-Stage3 §2）
 *
 * ```text
 * Skill = Reusable Research Method            「这类问题我通常怎么研究？」
 * Plan  = Research-specific Execution Blueprint 「针对当前这项研究，这一次具体怎么做？」
 * ```
 *
 * 因此 `One Skill → Many Plans`：Skill 是长期方法资产，Plan 是针对**具体研究上下文**
 * 生成的执行资产（§7）。
 *
 * ## 四条硬边界
 *
 * 1. **Plan 不是 Workflow**（§3）：Plan 里当然能写"1. 2. 3."，那只是**本次任务的执行
 *    方案**；系统**绝不能**据此生成 Step Engine / State Machine / Workflow Runner。
 *    本模块的类型里没有可执行的 `steps[]`，也没有 `next`。
 * 2. **Plan 是持久化 Markdown 数据资产**（§4）：用户可读写、Agent 可读、Harness 可用、
 *    可版本控制。**不是运行时临时 Prompt。**
 * 3. **不建 Plan DSL**（§6 / §33）：frontmatter 只承担
 *    `Identity / Lifecycle / Provenance / Indexing / Versioning`。
 * 4. **Plan → Harness**（§12 / §33）：Plan 交给 **Harness 原生 Agent** 执行，
 *    不允许出现 `Plan → ConvFusion Agent → ConvFusion Tool Runtime`。
 *
 * ## 与前两阶段的关系
 *
 * - Stage 1 建立 `Plan → Harness` 的交接通道（`agent.followup` + plugin-sourced user message）；
 * - Stage 2 建立 Skill（研究方法）与 `ctx.skills`；
 * - Stage 3（本模块）把 Plan 从"一个 Markdown 文件的约定"提升为**一等研究资产**：
 *   生命周期、版本、Provenance、Library 检索、Expected Evidence 关联。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSections } from './markdown.js'

/* ════════════════════════════════════════════════════════════════════════
 * 类型
 * ════════════════════════════════════════════════════════════════════════ */

/** Plan 生命周期（§10）。**不是** workflow 状态 —— 它只描述 Plan 自身的阶段。 */
export type PlanStatus = 'draft' | 'reviewed' | 'ready' | 'executing' | 'completed' | 'refined' | 'archived'

/** 全部生命周期状态。 */
export const PLAN_STATUSES: readonly PlanStatus[] = [
  'draft',
  'reviewed',
  'ready',
  'executing',
  'completed',
  'refined',
  'archived',
]

/**
 * 允许的状态迁移。
 *
 * ⚠️ 这是**数据校验规则**，不是流程引擎：它只拒绝明显非法的跳跃
 * （如 `archived → executing`），**不驱动任何自动推进** —— 谁改状态由用户/Agent 决定。
 */
const ALLOWED_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  draft: ['reviewed', 'ready', 'archived'],
  reviewed: ['ready', 'draft', 'archived'],
  ready: ['executing', 'draft', 'archived'],
  executing: ['completed', 'refined', 'ready', 'archived'],
  completed: ['refined', 'archived'],
  refined: ['ready', 'executing', 'archived'],
  archived: [],
}

/** 执行策略（§11）：审核必需 / 自动执行。 */
export type PlanReviewPolicy = 'review-required' | 'auto-execute'

/** 一个 Plan 的完整内容。 */
export interface PlanDocument {
  /** id（文件名去 `.md`；能力/任务命名，**不是** stepN，见 §27）。 */
  id: string
  /** 展示名（正文 `# Plan: X`，回退 frontmatter `name`，回退 id）。 */
  name: string
  type: string
  status: PlanStatus
  version: string
  /** 产生该 Plan 的 Skill（Provenance，§20）。 */
  sourceSkill?: string
  /** 生成时引用的 Skill 版本（§19：Plan 要能追溯到 Skill 的哪个版本）。 */
  sourceSkillVersion?: string
  /** 关联的 Paper（§15 / §32-I）。 */
  paper?: string
  /** 生成时引用的 Research Context 摘要（§14）。 */
  researchContext?: string
  createdAt?: string
  updatedAt?: string
  /** 执行策略（§11）。 */
  reviewPolicy?: PlanReviewPolicy
  /** 全部章节（按文件顺序，含我们不认识的 —— 用户自加内容不丢）。 */
  sections: Array<{ title: string; body: string }>
  /** 完整正文（不含 frontmatter）。 */
  body: string
  path: string
  relPath: string
}

/** Plan 目录（§26：一级研究资产，**禁止** `plans/step1/plan.md` 这类层级）。 */
export const PLANS_DIR = 'plans'
/**
 * Plan 历史快照目录（`plans/history/<id>/vNNN.md`）。
 *
 * 放在 `plans/` **内部**而不是与它平级：Plan 的版本历史属于 Plan 这个研究资产，
 * 不是工作区的顶层概念。`listPlanDocuments()` 只扫 `plans/` 下的**文件**，
 * 因此子目录不会被误当成 Plan。
 */
export const PLAN_HISTORY_DIR = 'plans/history'

/* ════════════════════════════════════════════════════════════════════════
 * 解析 / 序列化
 * ════════════════════════════════════════════════════════════════════════ */

/** 受限 YAML frontmatter 解析（标量；保持轻量，不做嵌套）。 */
export function parsePlanFrontmatter(source: string): Record<string, string> {
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
export function stripPlanFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/**
 * 把正文切成 `# 标题` + `##` 章节（Plan 版）。
 *
 * 委托给共享的 {@link parseSections}：那里做了**围栏感知**。Plan 正文常含代码块，
 * 而代码块里的 `#` / `##`（Python 注释、YAML、shell）绝不能被当成 Markdown 结构。
 */
export function parsePlanSections(body: string): {
  title: string | null
  sections: Array<{ title: string; body: string }>
} {
  const parsed = parseSections(body)
  return { title: parsed.title?.replace(/^Plan:\s*/i, '') ?? null, sections: parsed.sections }
}

function normalizeStatus(raw: string | undefined): PlanStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return (PLAN_STATUSES as readonly string[]).includes(v) ? (v as PlanStatus) : 'draft'
}

/** 解析一个 Plan Markdown 文件（不存在/损坏 → null）。 */
export function parsePlanDocument(absPath: string, relPath: string): PlanDocument | null {
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const fm = parsePlanFrontmatter(source)
  const body = stripPlanFrontmatter(source).trim()
  const parsed = parsePlanSections(body)
  const id = absPath.split('/').pop()!.replace(/\.md$/, '')

  return {
    id,
    name: parsed.title || fm.name || id,
    type: fm.type || 'research-plan',
    status: normalizeStatus(fm.status),
    version: fm.version || '1.0',
    ...(fm.source_skill || fm.sourceSkill ? { sourceSkill: fm.source_skill || fm.sourceSkill } : {}),
    ...(fm.source_skill_version || fm.sourceSkillVersion
      ? { sourceSkillVersion: fm.source_skill_version || fm.sourceSkillVersion }
      : {}),
    ...(fm.paper ? { paper: fm.paper } : {}),
    ...(fm.research_context || fm.researchContext
      ? { researchContext: fm.research_context || fm.researchContext }
      : {}),
    ...(fm.created_at ? { createdAt: fm.created_at } : {}),
    ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    ...(fm.review_policy === 'auto-execute' || fm.review_policy === 'review-required'
      ? { reviewPolicy: fm.review_policy as PlanReviewPolicy }
      : {}),
    sections: parsed.sections,
    body,
    path: absPath,
    relPath,
  }
}

/** 序列化 Plan（frontmatter + 正文）。 */
export function serializePlanDocument(input: {
  name: string
  type: string
  status: PlanStatus
  version: string
  sourceSkill?: string
  sourceSkillVersion?: string
  paper?: string
  researchContext?: string
  createdAt?: string
  updatedAt?: string
  reviewPolicy?: PlanReviewPolicy
  sections: Array<{ title: string; body: string }>
}): string {
  const front = ['---', `name: ${input.name}`, `type: ${input.type}`, `status: ${input.status}`, `version: ${input.version}`]
  if (input.sourceSkill) front.push(`source_skill: ${input.sourceSkill}`)
  if (input.sourceSkillVersion) front.push(`source_skill_version: ${input.sourceSkillVersion}`)
  if (input.paper) front.push(`paper: ${input.paper}`)
  if (input.researchContext) front.push(`research_context: ${input.researchContext}`)
  if (input.reviewPolicy) front.push(`review_policy: ${input.reviewPolicy}`)
  if (input.createdAt) front.push(`created_at: ${input.createdAt}`)
  front.push(`updated_at: ${input.updatedAt ?? new Date().toISOString()}`, '---')

  const parts = [`# Plan: ${input.name}`, '']
  for (const s of input.sections) parts.push(`## ${s.title}`, '', s.body.trim(), '')
  return `${front.join('\n')}\n\n${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/* ════════════════════════════════════════════════════════════════════════
 * 章节读取 / 写入
 * ════════════════════════════════════════════════════════════════════════ */

/** 按标题取章节（宽松匹配；找不到 → `''`）。 */
export function planSection(doc: PlanDocument, ...names: string[]): string {
  for (const want of names) {
    const w = want.toLowerCase().replace(/[^a-z]/g, '')
    const hit = doc.sections.find((s) => s.title.toLowerCase().replace(/[^a-z]/g, '') === w)
    if (hit) return hit.body
  }
  return ''
}

/** Objective —— 本次任务要达成什么。 */
export function planObjective(doc: PlanDocument): string {
  return planSection(doc, 'Objective', '目标')
}

/** Expected Evidence（§21 / §32-H）。 */
export function planExpectedEvidence(doc: PlanDocument): string {
  return planSection(doc, 'Expected Evidence', 'Evidence Requirements', '预期证据')
}

/** Completion Criteria（§21：必须与 Expected Evidence 对应）。 */
export function planCompletionCriteria(doc: PlanDocument): string {
  return planSection(doc, 'Completion Criteria', '完成标准')
}

/** Execution Strategy（本次具体怎么做）。 */
export function planExecutionStrategy(doc: PlanDocument): string {
  return planSection(doc, 'Execution Strategy', '执行策略')
}

/** 替换或追加一个章节（用户编辑路径：只动该章节，其余原样保留）。 */
export function withSection(doc: PlanDocument, title: string, body: string): Array<{ title: string; body: string }> {
  const idx = doc.sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase())
  const next = [...doc.sections]
  if (idx >= 0) next[idx] = { title: next[idx].title, body }
  else next.push({ title, body })
  return next
}

/* ════════════════════════════════════════════════════════════════════════
 * 发现
 * ════════════════════════════════════════════════════════════════════════ */

function listMarkdown(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

/** 列出全部 Plan（最近更新在前）。 */
export function listPlanDocuments(workspace: string): PlanDocument[] {
  const dir = join(workspace, PLANS_DIR)
  const out: PlanDocument[] = []
  for (const file of listMarkdown(dir)) {
    const doc = parsePlanDocument(join(dir, file), `${PLANS_DIR}/${file}`)
    if (doc) out.push(doc)
  }
  return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id))
}

/** 读一个 Plan。 */
export function readPlan(workspace: string, id: string): PlanDocument | undefined {
  return listPlanDocuments(workspace).find((p) => p.id === id)
}

/* ════════════════════════════════════════════════════════════════════════
 * Plan Library 搜索 / 过滤（§29 / §32-J）
 * ════════════════════════════════════════════════════════════════════════ */

export interface PlanQuery {
  search?: string
  status?: readonly PlanStatus[]
  skill?: string
  paper?: string
  type?: string
  /** 只看最近更新（取前 N）。 */
  recent?: number
}

/** 纯函数过滤（便于测试与复用）。 */
export function filterPlans(docs: readonly PlanDocument[], query: PlanQuery): PlanDocument[] {
  let out = [...docs]
  if (query.status?.length) out = out.filter((d) => query.status!.includes(d.status))
  if (query.skill) {
    const k = query.skill.toLowerCase()
    out = out.filter((d) => (d.sourceSkill ?? '').toLowerCase().includes(k))
  }
  if (query.paper) {
    const k = query.paper.toLowerCase()
    out = out.filter((d) => (d.paper ?? '').toLowerCase().includes(k))
  }
  if (query.type) out = out.filter((d) => d.type === query.type)
  if (query.search) {
    const q = query.search.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          (d.sourceSkill ?? '').toLowerCase().includes(q) ||
          d.body.toLowerCase().includes(q),
      )
    }
  }
  if (query.recent && query.recent > 0) out = out.slice(0, query.recent)
  return out
}

/* ════════════════════════════════════════════════════════════════════════
 * 生命周期（§10 / §32-E）
 * ════════════════════════════════════════════════════════════════════════ */

export interface PlanWriteError {
  error: string
}
export function isPlanWriteError(v: unknown): v is PlanWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

/** 迁移是否合法（**数据校验**，不驱动流程）。 */
export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** 非法迁移的可读原因。 */
export function transitionError(from: PlanStatus, to: PlanStatus): string {
  if (from === 'archived') return 'Plan 已归档，不能再进入执行状态。'
  return `非法状态迁移：${from} → ${to}（允许：${ALLOWED_TRANSITIONS[from].join(' / ') || '无'}）`
}

/** Plan id 规范化（kebab-case）。 */
export function toPlanId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * 是否旧 Step 风格命名（§27 明确不推荐/禁止）。
 *
 * 推荐 `literature-gap-analysis.md` / `experiment-design.md`；
 * 不推荐 `step1.md` / `module3-plan.md` / `discovery-step-plan.md`。
 */
export function isLegacyStylePlanId(id: string): boolean {
  if (/^step\d+$/i.test(id)) return true
  if (/^module\d+/i.test(id)) return true
  if (/(^|-)step(-|$)/i.test(id)) return true
  if (/^plan-\d+$/i.test(id)) return true
  return false
}
