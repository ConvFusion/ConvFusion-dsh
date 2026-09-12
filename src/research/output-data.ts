/**
 * ConvFusion 2.0 — Research Output 数据模型（Stage 5.1）
 *
 * ## 定位（§1）
 *
 * Stage 5.1 **不是新的研究阶段**，也不是 Paper 之后的 workflow step。它是
 * **对已有 Research State / Claims / Evidence / Paper 进行不同形式成果表达的能力层**。
 *
 * ## 核心边界（§3 / §18）
 *
 * ```text
 * Research State = 科学研究状态
 * Evidence       = 科学证据
 * Claim          = 科学主张
 * Paper          = 论文研究成果实体
 * OutputArtifact = 某一种具体成果表达形式
 * ```
 *
 * 所以 **Patent / Report / Slides 不是与 Research State 同等级的核心对象** ——
 * 它们首先是 `Research Output`。这也意味着：
 *
 * - §18：**Output 不应修改 Research State**（转换是单向的，见 `output.ts` 的类型约束）；
 * - §26：不要把来源写死成 `source_paper`，`source` 可以引用
 *   Research State / Paper / Claims / Evidence / Plans 中的任意组合。
 */

/* ════════════════════════════════════════════════════════════════════════
 * Output Type（§6）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 第一版实现的四种类型（§6：**不要一开始实现过多类型**）。
 *
 * `proposal` / `project-report` / `technical-document` / `poster` 是预留位，
 * 见 {@link RESERVED_OUTPUT_TYPES} —— 它们有 profile 骨架但不作为正式支持类型。
 */
export type OutputType = 'paper' | 'patent' | 'technical-report' | 'slides'

export const OUTPUT_TYPES: readonly OutputType[] = ['paper', 'patent', 'technical-report', 'slides']

/** 预留类型（§6 允许但不实现）。 */
export const RESERVED_OUTPUT_TYPES: readonly string[] = [
  'proposal',
  'project-report',
  'technical-document',
  'poster',
]

/** 类型 → 目录名（§24：一个 `outputs/` 统一注册表，不为每种类型建独立系统）。 */
/**
 * 类型 → 目录名（§2 / §10：`outputs/{patents,reports,slides}/`）。
 *
 * 注意 `paper` 不在 `outputs/` 下 —— Paper 是**核心 Research Output**，
 * 单独放 `papers/<id>/`（§8）。这里保留映射只为兼容按类型查目录的调用方。
 */
export const OUTPUT_DIRS: Record<OutputType, string> = {
  paper: 'papers',
  patent: 'patents',
  'technical-report': 'reports',
  slides: 'slides',
}

/* ════════════════════════════════════════════════════════════════════════
 * Output Source（§4 / §26 / Task 3）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一个 Output 的来源声明。
 *
 * ⚠️ §26：**不要写死 `source_paper`**。一个 Patent 可以直接由 Research State 转化，
 * 也可以在已有 Paper 基础上再转化；两者都必须能表达（§5 的 provenance 要求）。
 */
export interface OutputSource {
  /** 依据的 Research State 版本（引用，不复制）。 */
  researchState?: string
  /** 来源 Paper（可选 —— §5：`Research State → Patent` 同样合法）。 */
  paper?: string
  /** 依据的 Claim id。 */
  claims: string[]
  /** 依据的 Evidence id。 */
  evidence: string[]
  /** 依据的 Plan id（§17：转换本身经 Plan 交给 Harness）。 */
  plans: string[]
}

/* ════════════════════════════════════════════════════════════════════════
 * Output Status 与 Review（§19 / Task 7）
 * ════════════════════════════════════════════════════════════════════════ */

/** Output 生命周期。`draft` → `reviewed` → `approved`；`archived` 保留历史。 */
export type OutputStatus = 'draft' | 'reviewed' | 'approved' | 'archived'

export const OUTPUT_STATUSES: readonly OutputStatus[] = ['draft', 'reviewed', 'approved', 'archived']

/** 一次 Review 的处置记录（§19 / §21：保留 who / when / based on what）。 */
export interface OutputReviewRecord {
  action: 'reviewed' | 'approved' | 'rejected' | 'edited' | 'archived'
  at: string
  by: 'user' | 'agent'
  fromVersion: string
  toVersion: string
  note?: string
}

/* ════════════════════════════════════════════════════════════════════════
 * Output Artifact（§25 / Task 1）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一个成果表达形式。
 *
 * **统一使用 Output Artifact + Output Profile**（§24），不为 Patent / Report / Slides
 * 建三套独立系统。因此本类型对所有类型都是同一套字段，差异全部在 {@link OutputProfile}。
 */
export interface OutputArtifact {
  /** id（文件名去 `.md`），如 `patent-001`。 */
  id: string
  type: OutputType
  /** 展示名。 */
  title: string
  status: OutputStatus
  /** 版本（如 `0.1`）。 */
  version: string
  /**
   * 转换目标（§16 `Transformation Goal`）：这次转换要达到什么。
   *
   * 它不同于 Plan 的 objective —— 这里记录的是成果层面的意图，
   * 例如"把方法转化为可主张的技术方案"。
   */
  goal?: string
  source: OutputSource
  /** 产生它的 Skill（§15 / §16）。 */
  skill?: string
  /** 产生它的 Plan（§16 / Task 5）。 */
  plan?: string
  /** Harness Session（provenance 链的一环，Task 8）。 */
  harnessSession?: string
  /** 全部 Markdown 章节（含 type 特有结构）。 */
  sections: Array<{ title: string; body: string }>
  body: string
  /** 历史处置记录。 */
  reviews: OutputReviewRecord[]
  createdAt?: string
  updatedAt?: string
  path: string
  relPath: string
}

/* ════════════════════════════════════════════════════════════════════════
 * Output Profile（§7 / Task 2）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个质量检查规则（§20 / Task 2 `quality checks`）。 */
export interface OutputQualityCheck {
  id: string
  /** 人类可读的检查说明。 */
  description: string
  /** 触发该检查的正则（对全文匹配）。 */
  pattern?: string
  /**
   * `require` = 必须命中；`forbid` = 不得命中。
   *
   * 用正则表达是刻意的：规则必须**可复核**，而不是靠模型自评。
   */
  kind: 'require' | 'forbid'
  /** 命中/未命中时给用户的建议。 */
  advice: string
}

/**
 * Output Profile（§7）：描述一种输出类型。
 *
 * ⚠️ §7：**不要硬编码成复杂 Workflow**。Profile 只描述
 * 「输出类型 / 目标受众 / 推荐结构 / 内容约束 / 来源对象 / 格式要求」，
 * 不描述执行顺序。
 */
export interface OutputProfile {
  type: OutputType
  name: string
  /** 目标受众（§7）。 */
  audience: string
  /** 这种成果要服务什么目的。 */
  purpose: string
  /** 推荐章节结构（**弱结构**：缺章节只是质量提示，不是错误）。 */
  structure: string[]
  /**
   * 内容约束（§7）。这里的约束是**方法性**的，例如
   * "Patent 必须区分技术问题/方案/效果，不能照搬论文标题"。
   */
  constraints: string[]
  /** 质量检查规则（Task 2 / §20）。 */
  qualityChecks: OutputQualityCheck[]
  /** 格式要求。 */
  format: {
    /** 主格式。 */
    primary: 'markdown' | 'latex' | 'markdown+latex'
    /** 是否要求逐句可追溯到 Claim（Paper 需要，Slides 不需要）。 */
    requiresClaimTraceability: boolean
  }
  /** 推荐的转换 Skill id（§15；值为系统 Skill Library 中的能力）。 */
  recommendedSkill?: string
}

/* ════════════════════════════════════════════════════════════════════════
 * Output 目录（§24 / Task 10）
 * ════════════════════════════════════════════════════════════════════════ */

/** Output 注册表根目录。 */
export const OUTPUTS_DIR = 'outputs'
/** 版本快照目录（与各类型目录平级）。 */
export const OUTPUT_VERSIONS_DIR = 'outputs/.history'

/**
 * 类型 → id 前缀（**单数**）。
 *
 * ⚠️ 目录名是复数（`patents/`，§10），但成果 id 是单数编号（`patent-001`）——
 * 早期实现直接用目录名生成 id，产出了 `patents-001` 这种不规范的 id。
 *
 * 编号本身是必要的：成果**可以有多份**（初稿 / 修改稿 / 不同受众版本），
 * 不像 Paper 是每个研究的唯一科学表达实体（§8）。
 */
export const OUTPUT_ID_PREFIX: Record<OutputType, string> = {
  paper: 'paper',
  patent: 'patent',
  'technical-report': 'report',
  slides: 'presentation',
}

/**
 * 类型 → **主文档文件名**（`v2-Workspace.md` §11/§12/§13）。
 *
 * ```text
 * patents/patent-001/patent.md
 * reports/report-001/report.md
 * slides/presentation-001/slides.md
 * ```
 *
 * 主文档**不再重复 id**：id 已经由目录名表达（`patent-001/patent.md` 而非
 * `patent-001/patent-001.md`）。
 */
export const OUTPUT_MAIN_FILE: Record<OutputType, string> = {
  paper: 'paper.md',
  patent: 'patent.md',
  'technical-report': 'report.md',
  slides: 'slides.md',
}

/** 每个成果目录内的标准附属文件（§11–§13）。 */
export const OUTPUT_AUX_FILES: Record<OutputType, readonly string[]> = {
  paper: [],
  patent: ['metadata.md', 'claims.md', 'provenance.md'],
  'technical-report': ['metadata.md', 'provenance.md'],
  slides: ['metadata.md', 'provenance.md'],
}

/** 每个成果目录内的标准附属**目录**（§13：slides 有 assets/）。 */
export const OUTPUT_AUX_DIRS: Record<OutputType, readonly string[]> = {
  paper: ['history', 'latex', 'figures'],
  patent: [],
  'technical-report': [],
  slides: ['assets'],
}

/** 版本快照条目。 */
export interface OutputVersionEntry {
  version: string
  path: string
  reason?: string
  at?: string
}

/** 一个 Output 的质量检查结果。 */
export interface OutputQualityResult {
  profile: OutputType
  passed: boolean
  checks: Array<{
    id: string
    description: string
    ok: boolean
    advice: string
  }>
  /** 结构覆盖情况（§20）。 */
  missingSections: string[]
}

/**
 * 依赖图里的一条边（§23 / Task 9）。
 *
 * 回答"如果 C003 被推翻，哪些科研成果需要重新检查？"
 */
export interface OutputDependency {
  /** 被依赖的研究对象（claim / evidence / state 版本 / paper）。 */
  dependsOn: string
  kind: 'claim' | 'evidence' | 'research-state' | 'paper' | 'plan'
  /** 依赖它的 Output。 */
  outputs: Array<{ id: string; type: OutputType; version: string; relPath: string }>
}
