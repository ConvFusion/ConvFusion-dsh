/**
 * ConvFusion 2.0 — 把**本机研究项目**整理成服务器的 Research State 内容 Envelope
 *
 * ## 为什么需要这一层
 *
 * 【研究工作 · 我的】里点「寻找指导」时，要把本机的研究进展发布到 ConvFusion.com。
 * 服务器只认它的内容 Envelope（`ConvFusion-server/docs/API.md` §9.1），
 * 而本机的事实散在几个地方，字段**不是一一对应**：
 *
 * ```text
 * 本机                                 服务器 Envelope
 * ─────────────────────────────       ─────────────────────────────
 * project.md            主题 / 领域      summary / research_fields
 *                       研究问题        research_question
 *                       Motivation      motivation
 * research-state.md     Problem         motivation（无 Motivation 时）
 *                       Research Questions  research_question（优先）
 *                       Innovation      core_idea
 *                       Hypotheses      hypothesis
 *                       Method          method_overview
 *                       Open Questions  open_problems
 * research/evidence/    id/name/status  evidence[]（资产清单）
 * 「研究进展」快照       阶段 / 成熟度    stage / progress
 * 论文（latex/main.tex  论文标题          paper.title + **work_name**
 *  优先，其次 paper.md）
 * project.md            Topic           work_name（没有论文时）
 * ```
 *
 * ## `work_name`：这项研究工作的名字
 *
 * 网络里的列表（【可指导】/【可加入】/【指导中】）显示的"研究工作名称"来自**服务器**
 * ——看那些列表的人本机不一定有这份 workspace，所以名字只能由发布方在上送时给。
 * 取值规则（`research/work-name.ts`）：**有论文用论文标题，否则用确定的研究主题**，
 * 都没有才退回本机工作区名。服务端把它投影成 `work_name`（见
 * `dev-notes/v0.6.0-work-name-api.md`）。
 *
 * ## 两条硬规则
 *
 * 1. **不编造**：本机没有的字段就留空。服务器允许缺字段，网络里的卡片会少几行 ——
 *    这比编一段像样的"方法概述"要诚实得多（研究数据会被引用，编出来的东西会被当真）。
 * 2. **方法留在本机**（产品原则：methods stay private）：这里**只**导出研究进展
 *    （问题 / 假设 / 想法 / 方法概述这类"研究是什么"的表述），
 *    不导出任何提示词、Skill 定制、工作流与个人经验。
 *    `research-state.md` 的 `Risks` / `Decisions` 等内部维度**不上传**，
 *    只把它自己的问题与待解问题带出去。
 */

import { loadProjectFile } from './project.js'
import { researchWorkName, type WorkNameSource } from './work-name.js'
import type { ResearchProject } from './data.js'
import { loadResearchState } from './research-state.js'
import { listEvidence } from './evidence.js'
import type { ResearchStateDocument } from './research-data.js'
import type { WorkspaceProgress } from './progress.js'

/** 服务器允许的阶段枚举（`ResearchStage`）。 */
export type ServerStage =
  | 'IDEA'
  | 'LITERATURE'
  | 'HYPOTHESIS'
  | 'PLANNING'
  | 'IMPLEMENTATION'
  | 'EXPERIMENT'
  | 'ANALYSIS'
  | 'WRITING'
  | 'COMPLETED'

/**
 * 本机**研究过程阶段** → 服务器阶段枚举。
 *
 * 本机的八个阶段来自 ConvFusion 的研究过程定义（`taxonomy` / 进展面板），
 * 服务器只有九个枚举值。两者不是一一对应，这里是**显式**的翻译表：
 * 缺哪个映射就在注释里说清，而不是硬凑。
 */
export const PROCESS_STAGE_TO_SERVER_STAGE: Record<string, ServerStage> = {
  problem: 'IDEA', // 问题定义 → 想法
  literature: 'LITERATURE',
  innovation: 'HYPOTHESIS', // 创新与假设 → 假设
  method: 'PLANNING', // 方法设计 → 规划（服务器把"实现"单列为 IMPLEMENTATION，本机过程无此阶段）
  experiment: 'EXPERIMENT',
  analysis: 'ANALYSIS',
  decision: 'ANALYSIS', // 研究决策建立在分析之上；服务器没有"决策"阶段
  writing: 'WRITING',
}

/** 各字段的长度上限（服务器内容上限 2 MB；这里收得更紧，避免把整章正文推上去）。 */
export const PUBLISH_FIELD_LIMIT = 2000
/** `summary` 更短：它是网络列表里的一行。 */
export const PUBLISH_SUMMARY_LIMIT = 200
/** 带出去的证据条数上限（网络卡片不需要 58 条）。 */
export const PUBLISH_EVIDENCE_LIMIT = 50

/** 服务器的内容 Envelope（只列我们真正会填的字段）。 */
export interface PublishContent {
  schema_version: 1
  /**
   * **这项研究工作的名字**：有论文用论文标题，否则用确定的研究主题。
   *
   * 服务端把它投影成列表里的 `work_name`（内容 Envelope 是 `extra="allow"`，
   * 所以这个字段今天就能收；投影需要后端配合，见 `dev-notes/v0.6.0-work-name-api.md`）。
   */
  work_name?: string
  /**
   * **研究主题**（当前采纳的那句，来自 `project.md` 的 `topic`）—— 上送的是**事实**。
   *
   * 为什么上送：服务器在 **`work_name` 缺省**时（更早发布的工作、没有算过名字的其它客户端）
   * 需要有名字可显示。它与 `work_name` 今天是同一个字符串也无妨：`work_name` 是"客户端
   * 已经算好的名字"（给不认识解析链的服务端直接用），`topic` 是"事实"，用途不同。
   * 解析链见 `dev-notes/v0.6.0-work-name-api.md`。
   */
  topic?: string
  /**
   * 开题时的初始输入主题（**只在主题演进过、且与 `topic` 不同**时上送）。
   *
   * 与 `topic` 相同时省略：同一句话不必发两遍 —— 这一级的价值恰恰在于"主题演进过"。
   */
  initial_topic?: string
  research_question?: string
  summary?: string
  motivation?: string
  hypothesis?: string
  core_idea?: string
  method_overview?: string
  open_problems?: string[]
  evidence?: Array<{ id: string; name: string; status: string }>
  /**
   * 论文。`present` = 有没有论文正文；`title` = 论文标题（有则给）。
   *
   * ⚠️ `paper` 本来就是 `dict` 字段（服务器不解释内容），所以 `title` 是**事实**
   * 而非新接口；网页端将来想显示"有论文：<标题>"可以直接用。
   */
  paper?: { present: boolean; title?: string }
  research_fields?: string[]
  stage?: ServerStage
  progress?: number
  /** 机器可读的来源信息（服务器允许扩展字段）。**不含**任何方法/提示词。 */
  extensions: {
    convfusion: {
      workspaceTitle: string
      stateVersion: string
      processStage: string | null
      maturity: Record<string, string>
      counts: Array<{ key: string; value: number; detail?: { code: string; count: number } }>
      paper: boolean
      generatedAt: string
    }
  }
}

/** 组装的输入（都可注入 → 可离线断言）。 */
export interface PublishContentInput {
  /** 研究根目录（`<会话工作区>/workspace`）。 */
  researchRoot: string
  /** 显示标题（注册表标题 / 目录名）。 */
  workspaceTitle: string
  /** 已算好的进展快照（与「研究进展」面板同源）。 */
  progress: WorkspaceProgress
  /** 组装时刻（ISO）。 */
  generatedAt: string
  /**
   * 研究工作名（可注入；不给就按 `research/work-name.ts` 的规则从磁盘推导）。
   *
   * 之所以可注入：① 单测要能钉住"有论文用论文标题"这条规则而不造一堆文件；
   * ② 发布流程已经算过一次的东西不该在这里再算一遍（同一份事实两个来源会漂）。
   */
  workName?: string
  /** 注入点（测试用；缺省从磁盘读）。 */
  project?: ResearchProject | null
  state?: ResearchStateDocument | null
  evidence?: Array<{ id: string; name: string; status: string }>
}

function clip(text: string, limit: number): string {
  const t = text.trim()
  return t.length <= limit ? t : `${t.slice(0, limit - 1)}…`
}

/** 取状态文档里的一个维度（去掉占位注释与多余空白）。 */
function dimension(state: ResearchStateDocument | null, name: string): string {
  const raw = state?.dimensions?.[name as keyof typeof state.dimensions]
  return typeof raw === 'string' ? raw.replace(/<!--[\s\S]*?-->/g, '').trim() : ''
}

/**
 * 组装服务器内容 Envelope。
 *
 * @returns `content`（可直接作为 `POST /projects/{id}/state` 的 `content`）与
 *   `missing`（**哪些字段本机没有**，用于界面如实提示"网络上只看得到这几项"）
 */
export function buildPublishContent(input: PublishContentInput): {
  content: PublishContent
  missing: string[]
  /** 这项研究工作的名字（`content.work_name` 的同一个值；发布流程用它当项目标题）。 */
  workName: string
  /** 名字是从哪来的（`paper` / `topic` / `fallback`）—— 回执与诊断要能说清。 */
  workNameSource: WorkNameSource
} {
  const project = input.project === undefined ? loadProjectFile(input.researchRoot) : input.project
  const state = input.state === undefined ? loadResearchState(input.researchRoot) : input.state
  const evidence =
    input.evidence === undefined
      ? listEvidence(input.researchRoot).map((e) => ({
          id: e.id,
          name: e.name,
          status: e.status,
        }))
      : input.evidence

  /*
   * 这项研究工作的名字。**随内容一起上送**，因为网络列表读的是服务器上的数据 ——
   * 看列表的人本机不一定有这份 workspace（见文件头）。
   *
   * ⚠️ 提前到这里算：下面的"研究问题 / 摘要"要用它做**去重** ——
   * 主题一旦收敛到论文标题，那几个字段就会与标题逐字相同（同一句话在卡片上出现三次）。
   */
  const work = input.workName
    ? { name: input.workName, source: 'fallback' as WorkNameSource }
    : researchWorkName(input.researchRoot, input.workspaceTitle)

  /** 与名字逐字相同的文本不该再上送（重复的字段会让卡片看起来像坏了）。 */
  const duplicatesName = (text: string): boolean =>
    text.trim() !== '' && text.trim() === work.name.trim()

  // 研究问题：project.md 的 Research Questions 优先（那是研究者显式写下的），
  // 其次是状态文档的同名维度，最后退回主题句。
  const questions =
    project?.questions && project.questions.length > 0
      ? project.questions.join('；')
      : dimension(state, 'Research Questions')
  const questionSource = questions || project?.topic || ''
  // ⚠️ 主题已收敛到论文标题（= 名字）时**不再重复送**：那个字段与标题逐字相同，没有信息
  const researchQuestion = duplicatesName(questionSource) ? '' : clip(questionSource, PUBLISH_FIELD_LIMIT)

  // 动机：优先 `project.md` 的 Motivation（研究者自己写下的一句话，适合做 Brief 的一行），
  // 其次状态文档的 `Problem` 段（更长，按上限截断）。
  // ⚠️ 状态文档的维度表里**没有** `Motivation`（见 `STATE_DIMENSIONS`），所以别再读它。
  const motivation = clip(project?.goal || dimension(state, 'Problem') || '', PUBLISH_FIELD_LIMIT)
  const hypothesis = clip(dimension(state, 'Hypotheses'), PUBLISH_FIELD_LIMIT)
  const coreIdea = clip(dimension(state, 'Innovation'), PUBLISH_FIELD_LIMIT)
  const methodOverview = clip(dimension(state, 'Method'), PUBLISH_FIELD_LIMIT)
  const openProblems = dimension(state, 'Open Questions')
    .split(/\n{2,}|(?=^\s*[-*]\s)/m)
    .map((x) => x.replace(/^\s*[-*]\s*/, '').trim())
    .filter((x) => x.length > 0)
    .slice(0, 20)
    .map((x) => clip(x, 400))

  const fields = (project?.domain ?? '')
    .split(/[,，、;；/]/)
    .map((f: string) => f.trim())
    .filter((f: string) => f.length > 0)
    .slice(0, 10)

  const stageId = input.progress.progress.stage?.id ?? null
  const stage = stageId ? PROCESS_STAGE_TO_SERVER_STAGE[stageId] : undefined



  /*
   * 摘要：本来是"这项工作在做什么"的一行（服务器文档里它是"进度概览"）。
   *
   * ⚠️ 主题一旦收敛到论文标题，这一栏就会与**标题**逐字相同 —— 同一句话出现在标题与摘要
   * 两处，会让人以为卡片坏了。这时**宁可不送**：
   *   · 退回"动机/问题"是错的 —— 那与 `motivation` 又重复一次（等于把重复换个位置）；
   *   · 本机确实没有第二句更合适的话时，空着比重复诚实。
   * （`missing` 不报它：那是"本机没有这个内容"，而这里是"内容与名字重复、故意不重复送"。）
   */
  const summarySource = project?.topic ?? ''
  const summary = summarySource && !duplicatesName(summarySource)
    ? clip(summarySource, PUBLISH_SUMMARY_LIMIT)
    : ''

  /*
   * 主题两级事实：`topic` = 当前采纳的主题；`initial_topic` = 开题时的初始输入。
   *
   * ⚠️ 与"摘要去重"不同：那两个是**展示字段**，重复会让人以为卡片坏了；
   * 这两个是**供服务端兜底的事实**，即使今天与 `work_name` 同值也必须上送
   * （其它客户端、以及服务器上更早发布的工作都靠它们取名）。
   */
  const topic = (project?.topic ?? '').trim()
  const initialTopic = (project?.initialTopic ?? '').trim()

  const content: PublishContent = {
    schema_version: 1,
    work_name: work.name,
    ...(topic ? { topic } : {}),
    ...(initialTopic && initialTopic !== topic ? { initial_topic: initialTopic } : {}),
    ...(researchQuestion ? { research_question: researchQuestion } : {}),
    ...(summary ? { summary } : {}),
    ...(motivation ? { motivation } : {}),
    ...(hypothesis ? { hypothesis } : {}),
    ...(coreIdea ? { core_idea: coreIdea } : {}),
    ...(methodOverview ? { method_overview: methodOverview } : {}),
    ...(openProblems.length ? { open_problems: openProblems } : {}),
    ...(evidence.length
      ? { evidence: evidence.slice(0, PUBLISH_EVIDENCE_LIMIT).map((e) => ({ id: e.id, name: e.name, status: e.status })) }
      : {}),
    paper: {
      present: input.progress.paper,
      // 论文标题只在**确实读到**时给（`work.source === 'paper'`）——不编
      ...(work.paperTitle ? { title: work.paperTitle } : {}),
    },
    ...(fields.length ? { research_fields: fields } : {}),
    ...(stage ? { stage } : {}),
    progress: Math.min(Math.max(input.progress.overall, 0), 1),
    extensions: {
      convfusion: {
        workspaceTitle: input.workspaceTitle,
        stateVersion: input.progress.stateVersion,
        processStage: stageId,
        maturity: Object.fromEntries(
          input.progress.progress.dimensions.map((d) => [d.dimension, d.level]),
        ),
        counts: input.progress.counts.map((c) => ({
          key: c.key,
          value: c.value,
          ...(c.detail ? { detail: { code: c.detail.code, count: c.detail.count } } : {}),
        })),
        paper: input.progress.paper,
        generatedAt: input.generatedAt,
      },
    },
  }

  // 如实报出本机没有的字段（界面据此说明"网络上只看得到哪几项"）
  const missing: string[] = []
  if (!researchQuestion) missing.push('research_question')
  if (!motivation) missing.push('motivation')
  if (!hypothesis) missing.push('hypothesis')
  if (!coreIdea) missing.push('core_idea')
  if (!methodOverview) missing.push('method_overview')
  if (!fields.length) missing.push('research_fields')
  return { content, missing, workName: work.name, workNameSource: work.source }
}
