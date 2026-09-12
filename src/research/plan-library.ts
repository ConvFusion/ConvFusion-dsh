/**
 * ConvFusion 2.0 — Plan Library（Stage 3 写层）
 *
 * `plans.ts` 负责**单个 Plan 的 Markdown 事实**（解析 / 序列化 / 读取 / 生命周期校验）。
 * 本模块负责**库**这一层：
 *
 * ```text
 * Plan Library
 * ├── Create / Update / Save / Delete / Archive     （§32-A）
 * ├── Lifecycle 转换（draft → reviewed → ready → …）（§10 / §32-E）
 * ├── Versioning（历史版本不可被覆盖）              （§32-F）
 * ├── Skill → Plan（+ Research State + Paper + Intent）（§32-C）
 * ├── Plan → Evidence 关联（Expected Evidence）      （§32-H）
 * ├── Plan → Paper 关联                              （§32-I）
 * └── Library 检索（Search / Filter / Recent）       （§32-J）
 * ```
 *
 * ## 库状态：没有状态文件
 *
 * 早期版本把收藏 / 使用记录 / 演化历史写在 `<workspace>/plan-library.json`。那既不在
 * `v2-Workspace.md` §2 的结构里，也是多余的 —— §28 的 Active / Completed / Archived
 * 完全能由 `plans/*.md` 的 `status` **投影**得出（`loadPlanLibrary()` 就是这么做的）。
 * 因此本模块**不落任何状态文件**。
 *
 * ## 版本历史落在 Plan 资产自己内部
 *
 * 快照写 `plans/history/<id>/vNNN.md`（§19：历史版本不可被当前版本覆盖）。
 * 放在 `plans/` 内部而不是平级：版本历史属于 Plan 这个研究资产，不是工作区顶层概念。
 *
 * ⚠️ **Plan 版本化在真实运行路径上必须自动发生**：Agent 是用原生工具直接改
 * `plans/*.md` 的，插件截不到那次写入。所以 `syncPlanHistory()` 在每次进入研究
 * （`/research`）与每次 Plan handoff 前跑一遍：发现盘上内容与最后一份快照不同，
 * 就补一份快照。**不拦截写入，也能保证历史不被覆盖。**
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PlanDocument, PlanQuery, PlanReviewPolicy, PlanStatus } from './plans.js'
import {
  PLANS_DIR,
  PLAN_HISTORY_DIR,
  canTransition,
  filterPlans,
  isLegacyStylePlanId,
  listPlanDocuments,
  parsePlanDocument,
  parsePlanFrontmatter,
  readPlan,
  serializePlanDocument,
  stripPlanFrontmatter,
  toPlanId,
  transitionError,
} from './plans.js'

/** 某个 Plan 的历史快照目录（绝对路径）。 */
function planHistoryDir(workspace: string, id: string): string {
  return join(workspace, PLAN_HISTORY_DIR, id)
}

/* ════════════════════════════════════════════════════════════════════════
 * 库视图
 * ════════════════════════════════════════════════════════════════════════ */

/** Library 视图中的一个 Plan 条目。 */
export interface PlanEntry {
  document: PlanDocument
  /** 已保存的历史快照数量（§19）。 */
  versionCount: number
}

/** Library 视图（供命令 / UI / Handoff 使用）。 */
export interface PlanLibraryView {
  workspace: string
  entries: PlanEntry[]
  counts: Record<PlanStatus, number> & { total: number }
}

/** 构建 Library 视图（纯投影）。 */
export function loadPlanLibrary(workspace: string): PlanLibraryView {
  const docs = listPlanDocuments(workspace)
  const entries: PlanEntry[] = docs.map((document) => ({
    document,
    versionCount: listPlanVersions(workspace, document.id).length,
  }))
  const counts = { total: entries.length } as Record<PlanStatus, number> & { total: number }
  for (const s of ['draft', 'reviewed', 'ready', 'executing', 'completed', 'refined', 'archived'] as PlanStatus[]) {
    counts[s] = entries.filter((e) => e.document.status === s).length
  }
  return { workspace, entries, counts }
}

/** 兼容 Stage 1/2 的轻量摘要（`/research` 的现状展示用）。 */
export interface PlanSummary {
  id: string
  title: string
  status?: string
  path: string
}

/** 列出 Plan 摘要（供 Research Context 与命令使用）。 */
export function listPlans(workspace: string): PlanSummary[] {
  return listPlanDocuments(workspace).map((d) => ({
    id: d.id,
    title: d.name,
    status: d.status,
    path: d.relPath,
  }))
}

/** 发现（Search / Filter / Recent）。 */
export function discoverPlans(workspace: string, query: PlanQuery = {}): PlanEntry[] {
  const view = loadPlanLibrary(workspace)
  const docs = filterPlans(
    view.entries.map((e) => e.document),
    query,
  )
  const byId = new Map(view.entries.map((e) => [e.document.id, e]))
  return docs.map((d) => byId.get(d.id)!)
}

/* ════════════════════════════════════════════════════════════════════════
 * 写操作（§32-A）
 * ════════════════════════════════════════════════════════════════════════ */

export interface PlanWriteError {
  error: string
}
export function isPlanWriteError(v: unknown): v is PlanWriteError {
  return typeof v === 'object' && v !== null && 'error' in v
}

function ensurePlansDir(workspace: string): string {
  const dir = join(workspace, PLANS_DIR)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Plan 的默认章节骨架（§5 的弱结构；**按需裁剪**，不强制全填）。 */
export function planSectionsTemplate(input: {
  objective?: string
  context?: string
  questions?: string
  strategy?: string
  expectedEvidence?: string
  expectedOutputs?: string
  constraints?: string
  completionCriteria?: string
}): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = []
  sections.push({ title: 'Objective', body: input.objective?.trim() || '<!-- 本次任务要达成什么？一句话。 -->' })
  sections.push({
    title: 'Context',
    body: [
      '### Research Problem',
      '',
      input.context?.trim() || '<!-- 当前研究问题 -->',
      '',
      '### Current Research State',
      '',
      '<!-- 相关的研究现状（来自 Research Context） -->',
    ].join('\n'),
  })
  if (input.questions) sections.push({ title: 'Research Questions', body: input.questions })
  sections.push({
    title: 'Execution Strategy',
    body: input.strategy?.trim() || '<!-- 这一次具体怎么做。写方案，不要写成流程引擎的步骤定义。 -->',
  })
  sections.push({
    title: 'Expected Evidence',
    body: input.expectedEvidence?.trim() || '<!-- 产出哪些证据才能支撑结论？ -->',
  })
  if (input.expectedOutputs) sections.push({ title: 'Expected Outputs', body: input.expectedOutputs })
  if (input.constraints) sections.push({ title: 'Constraints', body: input.constraints })
  sections.push({
    title: 'Completion Criteria',
    body: input.completionCriteria?.trim() || '<!-- 满足什么条件才算完成？（与 Expected Evidence 对应） -->',
  })
  sections.push({ title: 'User Notes', body: '<!-- 你的补充、偏好、风险提示 -->' })
  return sections
}

export interface CreatePlanInput {
  name: string
  /** 显式 id（可选）；默认由 name 派生。 */
  id?: string
  type?: string
  status?: PlanStatus
  version?: string
  sourceSkill?: string
  sourceSkillVersion?: string
  paper?: string
  researchContext?: string
  reviewPolicy?: PlanReviewPolicy
  sections?: Array<{ title: string; body: string }>
  objective?: string
  strategy?: string
  expectedEvidence?: string
  completionCriteria?: string
}

/**
 * 创建一个 Plan（§32-A Create / §32-C Skill → Plan）。
 *
 * 命名约束（§27）：默认由 name 派生 kebab-case id；若派生结果像 `step1` /
 * `module3-plan`，**拒绝**并提示改用能力/任务命名 —— 从文件系统层面摆脱旧结构。
 */
export function createPlan(workspace: string, input: CreatePlanInput): PlanDocument | PlanWriteError {
  const name = input.name.trim()
  if (!name) return { error: 'Plan 名称不能为空。' }

  const id = toPlanId(input.id ?? name)
  if (!id) return { error: `无法从名称生成合法 id：${name}` }
  if (isLegacyStylePlanId(id)) {
    return {
      error:
        `id \`${id}\` 是旧 Step 风格命名（§27 禁止）。请用能力/任务命名，` +
        '例如 `literature-gap-analysis` / `experiment-design` / `paper-revision`。',
    }
  }

  const dir = ensurePlansDir(workspace)
  const file = join(dir, `${id}.md`)
  if (existsSync(file)) return { error: `Plan \`${id}\` 已存在。` }

  const now = new Date().toISOString()
  const sections = input.sections ?? planSectionsTemplate(input)
  writeFileSync(
    file,
    serializePlanDocument({
      name,
      type: input.type ?? 'research-plan',
      status: input.status ?? 'draft',
      version: input.version ?? '1.0',
      sourceSkill: input.sourceSkill,
      sourceSkillVersion: input.sourceSkillVersion,
      paper: input.paper,
      researchContext: input.researchContext,
      reviewPolicy: input.reviewPolicy,
      createdAt: now,
      updatedAt: now,
      sections,
    }),
    'utf8',
  )
  return parsePlanDocument(file, `${PLANS_DIR}/${id}.md`) ?? { error: '创建后解析失败。' }
}

/** 整体保存正文（编辑器保存路径，§32-D）。**不改** frontmatter。 */
export function savePlanBody(workspace: string, id: string, body: string): PlanDocument | PlanWriteError {
  const doc = readPlan(workspace, id)
  if (!doc) return { error: `找不到 Plan \`${id}\`。` }
  writeFileSync(doc.path, body, 'utf8')
  return parsePlanDocument(doc.path, doc.relPath) ?? { error: '保存后解析失败。' }
}

/** 更新元数据（名称 / 类型 / 版本 / 策略 / 关联），正文保持不变。 */
export function updatePlanMeta(
  workspace: string,
  id: string,
  patch: {
    name?: string
    type?: string
    version?: string
    paper?: string
    sourceSkill?: string
    sourceSkillVersion?: string
    reviewPolicy?: PlanReviewPolicy
  },
): PlanDocument | PlanWriteError {
  const doc = readPlan(workspace, id)
  if (!doc) return { error: `找不到 Plan \`${id}\`。` }
  writeFileSync(
    doc.path,
    serializePlanDocument({
      name: patch.name ?? doc.name,
      type: patch.type ?? doc.type,
      status: doc.status,
      version: patch.version ?? doc.version,
      sourceSkill: patch.sourceSkill ?? doc.sourceSkill,
      sourceSkillVersion: patch.sourceSkillVersion ?? doc.sourceSkillVersion,
      paper: patch.paper ?? doc.paper,
      researchContext: doc.researchContext,
      reviewPolicy: patch.reviewPolicy ?? doc.reviewPolicy,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      sections: doc.sections,
    }),
    'utf8',
  )
  return parsePlanDocument(doc.path, doc.relPath) ?? { error: '更新后解析失败。' }
}

/** 替换单个章节（§32-D：用户可直接改 Objective / Context / … 中的任意一节）。 */
export function updatePlanSection(
  workspace: string,
  id: string,
  title: string,
  body: string,
): PlanDocument | PlanWriteError {
  const doc = readPlan(workspace, id)
  if (!doc) return { error: `找不到 Plan \`${id}\`。` }
  const idx = doc.sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase())
  const sections = [...doc.sections]
  if (idx >= 0) sections[idx] = { title: sections[idx].title, body }
  else sections.push({ title, body })
  return writeSections(workspace, doc, sections)
}

function writeSections(
  workspace: string,
  doc: PlanDocument,
  sections: Array<{ title: string; body: string }>,
): PlanDocument | PlanWriteError {
  writeFileSync(
    doc.path,
    serializePlanDocument({
      name: doc.name,
      type: doc.type,
      status: doc.status,
      version: doc.version,
      sourceSkill: doc.sourceSkill,
      sourceSkillVersion: doc.sourceSkillVersion,
      paper: doc.paper,
      researchContext: doc.researchContext,
      reviewPolicy: doc.reviewPolicy,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      sections,
    }),
    'utf8',
  )
  return parsePlanDocument(doc.path, doc.relPath) ?? { error: '写入后解析失败。' }
}

/** 删除一个 Plan（同时清理其版本快照）。 */
export function deletePlan(workspace: string, id: string): { ok: true; id: string } | PlanWriteError {
  const doc = readPlan(workspace, id)
  if (!doc) return { error: `找不到 Plan \`${id}\`。` }
  try {
    rmSync(doc.path)
    rmSync(join(workspace, PLAN_HISTORY_DIR, id), { recursive: true, force: true })
  } catch (e) {
    return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id }
}

/* ════════════════════════════════════════════════════════════════════════
 * 生命周期（§10 / §11 / §32-E）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 迁移 Plan 状态（**校验即可**，不驱动流程）。
 *
 * §11 的执行策略在这里体现为数据：`review_policy: auto-execute` 的 Plan
 * 允许从 `draft` 直接进 `ready`（调用方据此免去人工 approve 步骤），
 * 但**不改变**"状态只能按允许集合迁移"这一约束。
 */
export function setPlanStatus(
  workspace: string,
  id: string,
  status: PlanStatus,
): PlanDocument | PlanWriteError {
  const doc = readPlan(workspace, id)
  if (!doc) return { error: `找不到 Plan \`${id}\`。` }
  if (!canTransition(doc.status, status)) return { error: transitionError(doc.status, status) }

  writeFileSync(
    doc.path,
    serializePlanDocument({
      name: doc.name,
      type: doc.type,
      status,
      version: doc.version,
      sourceSkill: doc.sourceSkill,
      sourceSkillVersion: doc.sourceSkillVersion,
      paper: doc.paper,
      researchContext: doc.researchContext,
      reviewPolicy: doc.reviewPolicy,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      sections: doc.sections,
    }),
    'utf8',
  )
  return parsePlanDocument(doc.path, doc.relPath) ?? { error: '状态更新后解析失败。' }
}

/** §32-E：用户已检查 → `reviewed`。 */
export function reviewPlan(workspace: string, id: string): PlanDocument | PlanWriteError {
  return setPlanStatus(workspace, id, 'reviewed')
}

/** §32-E：用户明确允许执行 → `ready`。 */
export function approvePlan(workspace: string, id: string): PlanDocument | PlanWriteError {
  return setPlanStatus(workspace, id, 'ready')
}

/** 标记为执行中（交接给 Harness 后调用）。 */
export function markPlanExecuting(workspace: string, id: string): PlanDocument | PlanWriteError {
  return setPlanStatus(workspace, id, 'executing')
}

/** 标记完成。 */
export function completePlan(workspace: string, id: string): PlanDocument | PlanWriteError {
  return setPlanStatus(workspace, id, 'completed')
}

/** 归档（不再作为当前任务）。 */
export function archivePlan(workspace: string, id: string): PlanDocument | PlanWriteError {
  return setPlanStatus(workspace, id, 'archived')
}

/* ════════════════════════════════════════════════════════════════════════
 * 版本化（§19 / §32-F）
 * ════════════════════════════════════════════════════════════════════════ */

/** 递增语义版本：`1.0` → `1.1` → `2.0`。 */
export function bumpPlanVersion(version: string, kind: 'minor' | 'major' = 'minor'): string {
  const m = version.replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?/)
  const major = m ? Number(m[1]) : 1
  const minor = m && m[2] ? Number(m[2]) : 0
  return kind === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`
}

/** 归档注释（幂等比较时要剥掉）。 */
const ARCHIVE_HEADER_RE = /^<!--\s*archived:[\s\S]*?-->\r?\n/

/** 剥离归档注释，用于幂等比较。 */
export function stripPlanArchiveHeader(source: string): string {
  return source.replace(ARCHIVE_HEADER_RE, '')
}

/**
 * 快照当前的 Plan 内容（§19：历史版本不可被当前版本覆盖）。
 *
 * 快照名用**单调序号** `vNNN.md`，而不是 Plan 自己的 `version`：Agent 直接编辑
 * `plans/*.md` 时通常不会改 frontmatter 的 `version`，用版本号当文件名就会反复覆盖同一份
 * 快照 —— 那正好违反"历史不可被覆盖"。序号单调则永不重名。Plan 的语义版本仍记在
 * 快照文件自己的 frontmatter 里（`plan_version`）。
 *
 * @returns 快照相对路径；内容与最后一份快照相同则返回 `undefined`（幂等）
 */
export function archivePlanVersion(workspace: string, doc: PlanDocument, note?: string): string | undefined {
  const dir = planHistoryDir(workspace, doc.id)

  let current: string
  try {
    current = readFileSync(doc.path, 'utf8')
  } catch {
    return undefined
  }

  const existing = listPlanVersions(workspace, doc.id)
  const last = existing[existing.length - 1]
  if (last) {
    const previous = readPlanVersion(workspace, doc.id, last.version)
    // 幂等：剥掉我们自己写的时间戳注释再比较，否则同一内容会被反复追加。
    if (previous !== undefined && stripPlanArchiveHeader(previous).trim() === current.trim()) return undefined
  }

  const seq = String(existing.length + 1).padStart(3, '0')
  const header =
    `<!-- archived: ${new Date().toISOString()} — plan_version: ${doc.version}` +
    `${note ? ` — ${note}` : ''} -->\n`
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `v${seq}.md`), header + current, 'utf8')
  return `${PLAN_HISTORY_DIR}/${doc.id}/v${seq}.md`
}

/**
 * 同步 Plan 历史：**盘上内容变了就补一份快照**。
 *
 * 这是让 §19 在真实运行路径上成立的关键 —— Agent 用原生工具直接改 `plans/*.md`，
 * 插件截不到那次写入，所以改为在"进入研究"与"Plan handoff"这两个必经点上对账。
 *
 * @returns 本次新产生的快照（相对路径），无变化时为空数组
 */
export function syncPlanHistory(workspace: string): string[] {
  const created: string[] = []
  for (const doc of listPlanDocuments(workspace)) {
    const snap = archivePlanVersion(workspace, doc)
    if (snap) created.push(snap)
  }
  return created
}

/** 列出全部 Plan 的同步结果（供 `/research` 提示"本次记录了哪些版本"）。 */
export function syncPlanHistoryDetailed(workspace: string): Array<{ id: string; snapshot: string }> {
  const out: Array<{ id: string; snapshot: string }> = []
  for (const doc of listPlanDocuments(workspace)) {
    const snap = archivePlanVersion(workspace, doc)
    if (snap) out.push({ id: doc.id, snapshot: snap })
  }
  return out
}

/** 读一个 Plan 的历史版本（`version` 是快照序号，如 `001`）。 */
export function readPlanVersion(workspace: string, id: string, version: string): string | undefined {
  const file = join(planHistoryDir(workspace, id), `v${version.replace(/^v/i, '')}.md`)
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** 一个 Plan 的历史版本条目。 */
export interface PlanVersionEntry {
  /** 快照序号（如 `001`）—— 即 `readPlanVersion()` 的入参。 */
  version: string
  /** 快照产生时 Plan 自己的语义版本（取自快照 frontmatter）。 */
  planVersion?: string
  /** 快照对应的 Plan id。 */
  id: string
  path: string
}

/** 列出一个 Plan 的历史版本（按序号升序）。 */
export function listPlanVersions(workspace: string, id: string): PlanVersionEntry[] {
  let files: string[]
  try {
    files = readdirSync(planHistoryDir(workspace, id)).filter((f) => /^v\d+\.md$/.test(f))
  } catch {
    return []
  }
  return files
    .map((f) => {
      const version = f.replace(/^v/, '').replace(/\.md$/, '')
      const source = readPlanVersion(workspace, id, version)
      const fm = source ? parsePlanFrontmatter(stripPlanArchiveHeader(source)) : {}
      return {
        version,
        ...(fm.version ? { planVersion: fm.version } : {}),
        id,
        path: `${PLAN_HISTORY_DIR}/${id}/${f}`,
      }
    })
    .sort((a, b) => Number(a.version) - Number(b.version))
}

/**
 * 修订 Plan：**归档当前版本 → 递增版本 → 落盘新内容**（§32-F 的标准路径）。
 *
 * 与 Stage 2 的 `reviseSkill` 同款闭环。
 */
export function revisePlan(
  workspace: string,
  id: string,
  input: { body?: string; note?: string; bump?: 'minor' | 'major' },
): PlanDocument | PlanWriteError {
  const before = readPlan(workspace, id)
  if (!before) return { error: `找不到 Plan \`${id}\`。` }

  archivePlanVersion(workspace, before, input.note)

  if (input.body !== undefined) {
    writeFileSync(before.path, input.body, 'utf8')
  }
  const nextVersion = bumpPlanVersion(before.version, input.bump ?? 'minor')

  return updatePlanMeta(workspace, id, { version: nextVersion })
}

/* ════════════════════════════════════════════════════════════════════════
 * §32-H Plan → Evidence 关联 / §32-I Plan → Paper 关联
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 建立一个 Plan 的 **Expected Evidence** 声明。
 *
 * Stage 3 只负责"声明与保存"；完整的 Evidence 管理（真实证据、linkage、assess）属 Stage 4。
 * 因此本函数的输出是**期望**，不是证据本身 —— 不要把它当成 Evidence System。
 */
export function setPlanExpectedEvidence(
  workspace: string,
  id: string,
  evidence: string,
): PlanDocument | PlanWriteError {
  return updatePlanSection(workspace, id, 'Expected Evidence', evidence)
}

/** 关联 Plan 与当前 Paper（§32-I）。完整 Paper Evolution 属 Stage 5。 */
export function linkPlanToPaper(workspace: string, id: string, paper: string): PlanDocument | PlanWriteError {
  return updatePlanMeta(workspace, id, { paper })
}

/**
 * 读取一个 Plan 的**关联信息**（Provenance，§20）。
 *
 * 供 Stage 4/5 建立 Plan ↔ Evidence ↔ Paper 的反向索引；本阶段只做只读汇总。
 */
export interface PlanProvenance {
  planId: string
  sourceSkill?: string
  sourceSkillVersion?: string
  paper?: string
  researchContext?: string
  version: string
  status: PlanStatus
  /** 全部历史快照（`plans/history/<id>/`，权威）。 */
  versions: PlanVersionEntry[]
  /** 是否有 Expected Evidence 声明。 */
  hasExpectedEvidence: boolean
  /** 是否有 Completion Criteria。 */
  hasCompletionCriteria: boolean
}

/** 汇总一个 Plan 的 provenance（只读）。 */
export function planProvenance(workspace: string, id: string): PlanProvenance | undefined {
  const doc = readPlan(workspace, id)
  if (!doc) return undefined
  const body = doc.body
  return {
    planId: doc.id,
    ...(doc.sourceSkill ? { sourceSkill: doc.sourceSkill } : {}),
    ...(doc.sourceSkillVersion ? { sourceSkillVersion: doc.sourceSkillVersion } : {}),
    ...(doc.paper ? { paper: doc.paper } : {}),
    ...(doc.researchContext ? { researchContext: doc.researchContext } : {}),
    version: doc.version,
    status: doc.status,
    versions: listPlanVersions(workspace, id),
    hasExpectedEvidence: /^##\s+Expected Evidence/im.test(body) || /^##\s+Evidence Requirements/im.test(body),
    hasCompletionCriteria: /^##\s+Completion Criteria/im.test(body),
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * §32-C Skill → Plan
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Skill + Research Context + User Intent → Plan 的**请求描述**。
 *
 * Stage 3 只定义这个接口并把它交给 Harness：
 * **我们不替模型生成 Plan 内容**（那会变成"Skill 直接生成最终 Prompt"，§8 禁止）。
 * 正确的链路是：
 *
 * ```text
 * Skill（研究方法，Stage 2）
 *   ↓  我们把 Skill 正文 + 研究上下文 + 用户意图 作为**任务上下文**交给 Harness
 * Harness Agent（原生推理）
 *   ↓  它写出 Plan，并用原生的 write 工具落到 plans/*.md
 * Plan.md（Markdown 数据资产）
 * ```
 *
 * 但为了让 Plan 的元数据（`source_skill` / `paper` / `research_context`）可靠，
 * 我们提供一个**草稿骨架**：模型只需填内容，命名与 provenance 由我们保证。
 */
export interface PlanGenerationRequest {
  /** 使用的 Skill（id，来自 Stage 2 Skill Library）。 */
  skillId: string
  /** 期望的 Plan id（能力/任务命名；缺省由 skillId 派生）。 */
  planId?: string
  /** 用户意图（本次要做什么）。 */
  intent: string
  /** 关联 Paper（可选）。 */
  paper?: string
  /** 研究上下文摘要（可选；通常来自 Research Context）。 */
  researchContext?: string
}

/** 构造交给 Harness 的 "生成 Plan" 任务文本。 */
export function buildPlanGenerationText(
  workspace: string,
  request: PlanGenerationRequest,
  skill: { id: string; name: string; version?: string; method?: string; expectedOutput?: string },
): { text: string; suggestedId: string; suggestedPath: string } {
  const suggestedId = request.planId ? toPlanId(request.planId) : toPlanId(`${skill.id}-${request.paper ?? 'plan'}`)
  const suggestedPath = `${PLANS_DIR}/${suggestedId}.md`

  const lines = [
    `Generate a research execution plan using the skill **${skill.name}** (\`${skill.id}\`).`,
    '',
    'Write the plan as a Markdown file and save it with your normal file tools.',
    '',
    `- Path: \`${suggestedPath}\``,
    `- Required frontmatter:`,
    '  ```yaml',
    '  ---',
    `  name: <a short plan name>`,
    '  type: research-plan',
    '  status: draft',
    '  version: 1.0',
    `  source_skill: ${skill.id}`,
    skill.version ? `  source_skill_version: ${skill.version}` : '  source_skill_version: 1',
    ...(request.paper ? [`  paper: ${request.paper}`] : []),
    ...(request.researchContext ? [`  research_context: ${request.researchContext}`] : []),
    '  ---',
    '  ```',
    '',
    'Recommended sections (Markdown, keep it a *weak* structure — not a DSL):',
    '`## Objective`, `## Context`, `## Research Questions`, `## Execution Strategy`,',
    '`## Expected Evidence`, `## Expected Outputs`, `## Constraints`, `## Completion Criteria`.',
    '',
    'Rules:',
    '- This is a plan for **this specific piece of research**, not a copy of the skill.',
    '- Write what should be done and why. The agent executing it owns the step order —',
    '  do not encode a workflow, and do not write steps as if some engine will run them.',
    '- `## Expected Evidence` must state which claims the evidence will support.',
    '- `## Completion Criteria` must correspond to that evidence.',
    '- Keep the file readable and editable by a human researcher.',
    '',
    '---',
    '',
    '## User intent',
    '',
    request.intent.trim() || '(none specified)',
  ]

  if (skill.method?.trim()) {
    lines.push('', '## Skill method (follow this reasoning)', '', skill.method.trim())
  }
  if (skill.expectedOutput?.trim()) {
    lines.push('', '## Skill expected output', '', skill.expectedOutput.trim())
  }

  lines.push(
    '',
    '---',
    '',
    `After writing the file, tell the user it is at \`${suggestedPath}\` and that they can review`,
    'and edit it before approving execution.',
  )

  void workspace
  return { text: lines.join('\n'), suggestedId, suggestedPath }
}
