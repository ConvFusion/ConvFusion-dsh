import type { SkillSummary } from './library.js'
import type { ProcessAssessment } from './research-process.js'
import type { ResearchStateDocument } from './research-data.js'
import type { ResearchIndex } from './research-state.js'
import type { PaperGap } from './paper-data.js'
import type { PaperStatusSummary } from './paper-evolution.js'
/**
 * ConvFusion 2.0 — 科研数据模型（Stage 1 最小集）
 *
 * ## 本文件的边界（重要）
 *
 * Stage 1 只建立 **Harness Runtime 所必需的最小数据结构**。完整的
 * Research State / Evidence / Paper Evolution 系统属于 Stage 4–5，
 * 此处**不得**预先实现（v2-Stage1 §26-7..10）。
 *
 * 因此本文件刻意保持"少字段、无版本演进、无状态机"：
 *
 *   - 没有 Module / Step / graph 阶段概念（v2 Stage 0 §6.3 硬约束）；
 *   - 没有 workflow 游标或"当前跑到第几步"；
 *   - 没有百分比式成熟度评分（不假装精度）。
 *
 * 文件的角色是：**告诉 Harness「这个研究项目现在是什么样子」**，
 * 让 Agent 自己判断下一步该做什么（v2-Stage1 §10 / §12）。
 *
 * 数据落盘顺序（Stage 2–5 会扩展，但不会推翻这里的三个概念）：
 *
 *   workspace/                     ← 研究根目录（= 会话工作区下的 `workspace/` 子目录）
 *                                    一个研究根目录 = 一个 Research Project
 *   ├── project.md                 ← 研究定义（ResearchProject）
 *   ├── research-state.md          ← Research State
 *   ├── plans/*.md                 ← Plan 资产
 *   ├── research/                  ← Evidence / Claims / Decisions
 *   ├── papers/<id>/               ← Paper（持续演化的研究实体）
 *   └── outputs/                   ← Patent / Report / Slides
 *
 * Skill Library **不在 workspace 内** —— 它是包内的系统能力层（`v2-Workspace.md` §16）。
 */

/* ════════════════════════════════════════════════════════════════════════
 * Research Project —— 长期科研实体，与 Harness Session 解耦
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 研究意图。Stage 1 只要求能被 Agent 读到，不要求完备。
 *
 * ⚠️ 注意这里**没有** `currentStep` / `currentModule` / `phase` 之类的字段：
 * 研究的进展不由流程游标表达（v2-Stage0 §17 Principle 9）。
 */
export interface ResearchProject {
  /**
   * 研究主题（用户可读的一句话）。
   *
   * ⚠️ 这是**当前采纳的主题**，不是创建时的初始输入。研究会收敛出比初始输入
   * 更准确的主题表述（歧义裁定、机制收窄、范围缩小），`set_topic` 把它更新为
   * 最后采纳的主题；初始输入保留在 {@link initialTopic}，完整演进史在
   * `research/topic-history.json`（见 `project.ts`）。
   */
  topic: string
  /** 开题时的初始输入主题（只读保留，用于追溯"主题是怎么演进的"）。 */
  initialTopic?: string
  /** 领域（可选，用于检索上下文）。 */
  domain?: string
  /** 研究问题列表。 */
  questions?: string[]
  /** 期望产出 / 目标描述。 */
  goal?: string
  /** 创建与更新时间（ISO 8601）。 */
  createdAt?: string
  updatedAt?: string
}

/**
 * Research Context —— Harness 当前 Agent 对科研项目的**最小有效上下文**。
 *
 * v2-Stage1 §5 明确：这不是"把整个 workspace 拼成 Prompt"，而是
 * **动态、相关、可控**的上下文。因此这个结构只承载"当前这一步最需要知道的事"，
 * 并且由 `ResearchContextService` 在**每次组装时**重新求值（§6）。
 */
export interface ResearchContext {
  /**
   * 研究根目录相对**会话工作区**的展示前缀（如 `workspace`）。
   *
   * Agent 用原生工具按会话工作区解析路径：新布局（研究数据在 `<会话工作区>/workspace/`）
   * 下渲染上下文必须带上前缀，否则 `project.md` 这类相对路径会扑空；
   * 旧布局（研究根 = 会话工作区）下为 undefined，路径按原样渲染。
   */
  rootPrefix?: string
  /** 研究项目（缺失代表还没有 `project.md` —— 走通用助手模式）。 */
  project: ResearchProject | null
  /** 当前激活的论文ID */
  activePaperId: string
  /** workspace下所有论文的精简列表 */
  allPapers: Array<{
    id: string
    title?: string
    status: string
    version: string
    track?: string
    type?: string
    active: boolean
  }>
  /** 当前激活 Paper 的标题（来自 paper/ 下的一级标题；Stage 5 会扩展）。 */
  paperTitle: string | null
  /** 当前激活 Paper 的正文节选（Stage 1 直接读 paper 文件；Stage 5 改为分段/状态驱动）。 */
  paperExcerpt: string | null
  /** 当前已就绪的 Plan（plans/*.md 的元数据，见 PlanHandoff）。 */
  plans: PlanSummary[]
  /** 当前可用 Skill（Stage 2：来自 Skill Library 的摘要）。 */
  skills: SkillSummary[]
  /** 当前 Research State（Stage 4；null = 尚未建立）。 */
  state: ResearchStateDocument | null
  /** 派生索引（Stage 4 §18；用于暴露证据缺口等信号）。 */
  index: ResearchIndex | null
  /** Open Questions（Stage 4 §24）。 */
  openQuestions: string[]
  /**
   * 与**当前请求**可能相关的能力（最多 6 个）。
   *
   * 完整能力库不在这里 —— 它由 Harness 原生的 Skill 目录承载。
   * 见 `context.ts` 的 `suggestSkillsFor`：全量注入实测占上下文 98%。
   */
  suggestedSkills: SkillSummary[]
  /**
   * 基本科研过程评估（阶段 → 是否已落地）。
   *
   * ⚠️ **提示性**：v2 没有模块流水线，这里只回答"从研究资产看，哪一步还没落地"，
   * 用于能力选择与进展展示，不驱动执行。
   */
  process: ProcessAssessment
  /** 当前激活 Paper 状态摘要（Stage 5；null = 尚未建立 Paper）。 */
  paper: PaperStatusSummary | null
  /** 当前激活 Paper 未解决的缺口（Stage 5 §14；只作提示，不触发执行）。 */
  paperGaps: PaperGap[]
  /** 研究产出（Stage 5.1；同一研究的其他表达形式）。 */
  outputs: Array<{
    id: string
    type: string
    status: string
    version: string
    title: string
    relPath: string
  }>
}

/* ════════════════════════════════════════════════════════════════════════
 * Skill Awareness（Stage 1：元数据级；Stage 2 才做完整 Library）
 * ════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
 * Plan Handoff（Stage 1 只留接口；Stage 3 完整化）
 * ════════════════════════════════════════════════════════════════════════ */

/** Plan 的最小可读摘要（用于 Research Context 里"当前有哪些 Plan"）。 */
export interface PlanSummary {
  /** 文件名去掉 .md（如 `experiment-design`）。 */
  id: string
  /** 展示标题（一级标题或 frontmatter name）。 */
  title: string
  /** 生命周期状态（v2-Stage3 §10）。Stage 1 只读 frontmatter，不管理流转。 */
  status?: string
  /** Markdown 路径（相对 workspace）。 */
  path: string
}
