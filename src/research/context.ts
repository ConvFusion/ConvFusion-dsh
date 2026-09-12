/**
 * ConvFusion 2.0 — Research Context Service（Stage 1 核心）
 *
 * ## 它实现 v2-Stage1 的哪一条
 *
 * §5  Research Context = Harness 当前 Agent 对科研项目的**最小有效上下文**
 * §6  Research Context 必须是 **Agent Runtime 的动态上下文**，不是固定启动参数
 * §8  Research Context 必须能进入 Agent 的**上下文构建过程**，且**按需选择**、不无条件全量注入
 *
 * ## 为什么用 `systemPrompt.context()` 而不是自己拼 prompt
 *
 * Harness 的 `@deepseek-ai/dsh-system-prompt` 已经提供了这正是需要的机制（已核实其
 * 类型声明）：`SystemPrompt.context({name, order, text})` 注册的是
 * **"Dynamic model context materialized as a durable user-role snapshot"**，
 * 每次组装模型输入时求值 —— 即**动态**（§6）、**进入上下文构建**（§8）。
 *
 * 而且它的 `text` 可以是 `(assemblyContext) => string`：**每次组装时重新求值**，
 * 所以 Research Context 能随会话/用户反馈实时变化（§6）。
 *
 * 这是 **Extend Harness, do not wrap Harness**（§1）的直接体现：
 * 我们不是"构造一个巨大的 system prompt 塞给 Harness"，而是**注册一个上下文贡献者**，
 * 由 Harness 自己的组装管线在正确的时机、正确的顺序纳入。
 *
 * ## 我们不做什么
 *
 * - 不创建 Agent / 不驱动 LLM / 不建第二套事件流（§12 / §27）；
 * - 不把整个 workspace 无脑拼进去（§5 明确禁止）；
 * - 不判断"下一步该跑哪个模块"（§10 Skill Selection 必须是 agentic）。
 *
 * 本服务只做一件事：**如实、精简地告诉 Agent「这个研究项目现在是什么样子」**。
 */

import { isAbsolute, relative, resolve } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { PromptContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { ResearchContext } from './data.js'
import { isResearchWorkspace, loadPaper, loadProject } from './workspace.js'
import { recommendSkills, skillSummaries } from './library.js'
import type { SkillSummary } from './library.js'
import { assessResearchProcess } from './research-process.js'
import type { ProcessAssessment } from './research-process.js'
import { buildResearchIndex, loadResearchState, openQuestions } from './research-state.js'
import { DEFAULT_PAPER_ID } from './paper-data.js'
import { paperStatusSummary } from './paper-evolution.js'
import { prioritizeGaps, listPaperGaps } from './paper-gaps.js'
import { listAllOutputs } from './output.js'
import { OUTPUT_DIRS } from './output-data.js'
import { listPlans } from './plan-library.js'
import { listSystemSkills, skillPurpose, skillWhenToUse } from './skills.js'
import type { SkillDocument } from './skills.js'

/**
 * 我们的 Prompt Context 排序位。
 *
 * Harness 在 `dsh-system-prompt` 里为若干位置保留了官方 order（如
 * SANDBOX_POLICY=110 / APPROVAL_POLICY=115 / SUBAGENT_DELEGATION=120）。
 * ConvFusion 的科研上下文应在这些**运行时政策之后**、模型真正开始推理之前出现，
 * 因此取 200 —— 不占用官方保留位，也不与它们争夺语义。
 */
export const RESEARCH_CONTEXT_ORDER = 200

/**
 * 稳定指令段的排序位。
 *
 * 这里放的是"ConvFusion 是什么、研究模式怎么工作"的**不变说明**（不随项目变化），
 * 属于系统级指引，放在 persona 前缀之后、工具说明之前（工具说明从 1000 起）。
 * 取 400。
 */
export const RESEARCH_GUIDE_ORDER = 400

/** 注入段名（Harness 要求唯一；重复注册会抛错）。 */
export const RESEARCH_CONTEXT_NAME = 'convfusion:research-context'
/** Research State 文件引用（相对 workspace）。 */
const RESEARCH_STATE_REF = 'research/research-state.md'
export const RESEARCH_GUIDE_NAME = 'convfusion:research-guide'

/**
 * 科研模式指引（**稳定段**，不随 workspace 变化）。
 *
 * 刻意写得很短且不规定流程：v2 的核心是"能力驱动、由 Agent 决定下一步"，
 * 因此这里只说明**身份与边界**，绝不写"先做 A 再做 B"（那是 workflow，§12 禁止）。
 */
export const RESEARCH_GUIDE_TEXT = [
  '# Research project mode',
  '',
  'This session is attached to a long-lived ConvFusion research project.',
  'All research files live under one research root — by default the `workspace/` ' +
    'subdirectory of the session workspace (the context below states the actual root ' +
    'for this session).',
  'The research context below reflects that project as it currently stands.',
  '',
  'How to work here:',
  '',
  '- Treat the research context as the authoritative state of the project.',
  '- Decide what the project needs next from the state, the user message and the',
  '  available skills — there is no fixed pipeline to follow, and no step order',
  '  to complete.',
  '- When a skill matches what the project needs, read that skill file and follow',
  '  its method. Skills are research methods, not commands.',
  '- When a task needs substantial execution (experiments, coding, data work),',
  '  write the plan into `plans/*.md` first so the user can review it, then carry',
  '  it out with the native tools.',
  '- Keep research knowledge in the workspace (`project.md`, `research-state.md`,',
  '  `plans/`, `research/`, `papers/`), not only in the conversation.',
].join('\n')

/** 组装 Research Context 所需的运行时输入。 */
export interface ResearchContextSource {
  /** 当前**研究根目录**（ConvFusion 数据文件所在目录；绝对路径）。 */
  workspace: string
  /**
   * 会话工作区（新布局下研究根目录 = `<会话工作区>/workspace`）。
   * 用于计算研究根目录的展示前缀 —— Agent 用原生工具读文件时按**会话工作区**解析路径。
   */
  sessionWorkspace?: string
  /** 当前用户输入，用于"相关选择"（§8：按任务动态选择，不无条件全量注入）。 */
  userInput?: string
  /**
   * 取某个能力**生效正文**（含用户定制）。
   *
   * 过程定义（`research-process`）是一个可定制能力，所以"当前阶段"必须按**用户定制后**的
   * 内容判定 —— 否则用户在设置里改了过程，选择逻辑却还按默认过程走。
   */
  skillContent?: (id: string) => string | undefined
}

/** 收集当前研究状态（纯读盘；每次组装都重新求值以确保动态性）。 */
export function collectResearchContext(source: ResearchContextSource): ResearchContext {
  const ws = source.workspace
  const paper = loadPaper(ws)
  // 研究根目录相对会话工作区的展示前缀：新布局 → 'workspace'；旧布局（研究根 = 会话
  // 工作区）→ 不设置（路径按原样渲染，行为与旧版一致）。非常规位置（自定义配置在
  // 会话工作区之外）时同样不设置，避免渲染出 `../..` 之类的误导前缀。
  let rootPrefix: string | undefined
  if (source.sessionWorkspace) {
    const rel = relative(resolve(source.sessionWorkspace), resolve(ws))
    if (rel && rel !== '.' && !isAbsolute(rel) && !rel.startsWith('..')) rootPrefix = rel
  }
  return {
    ...(rootPrefix ? { rootPrefix } : {}),
    project: loadProject(ws),
    paperTitle: paper.title,
    paperExcerpt: paper.excerpt,
    plans: listPlans(ws),
    skills: skillSummaries(ws),
    process: assessResearchProcess(ws, { ...(source.skillContent ? { skillContent: source.skillContent } : {}) }),
    suggestedSkills: suggestSkillsFor(ws, source.userInput, source.skillContent),
    state: loadResearchState(ws),
    index: buildResearchIndex(ws),
    openQuestions: openQuestions(ws),
    paper: paperStatusSummary(ws, DEFAULT_PAPER_ID) ?? null,
    paperGaps: prioritizeGaps(listPaperGaps(ws, DEFAULT_PAPER_ID)).filter((g) => !g.resolved),
    outputs: listAllOutputs(ws).map((o) => ({
      id: o.id,
      type: o.type,
      status: o.status,
      version: o.version,
      title: o.title,
      relPath: o.relPath,
    })),
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 渲染
 * ════════════════════════════════════════════════════════════════════════ */

/** 一次最多推荐多少个能力（够用即可，避免又变成全量倾倒）。 */
const MAX_SUGGESTED_SKILLS = 6

/** 粗略的"相关性"判定：输入里提到 plan 名/标题即视为相关（Stage 1 的最小选择）。 */
/**
 * 按**当前请求**挑出可能相关的能力（最大 6 个）。
 *
 * 为什么需要它：此前 Research Context 把 47 个能力**全量**注入，实测占 26,893 / 27,565 字符
 * （98%）——既违背 Stage 1 §8"不无条件全量注入"，也和 Harness 原生的 skill 目录重复了一遍。
 * 现在这里只给"这一问可能用得上"的少数几个，完整清单交给 Harness 原生目录 + `skill` 工具按需加载。
 *
 * ⚠️ 已知边界：能力库正文是英文，而 `recommendSkills` 的切词对中文长串不敏感，
 * 因此中文提问可能挑不出任何一项 —— 这时**返回空**，让调用方只给一句指针，
 * 绝不回退成"那就全量注入"。
 */
function suggestSkillsFor(
  ws: string,
  userInput?: string,
  skillContent?: (id: string) => string | undefined,
): SkillSummary[] {
  const out: SkillSummary[] = []
  const seen = new Set<string>()
  const add = (s: SkillSummary): void => {
    if (seen.has(s.id) || out.length >= MAX_SUGGESTED_SKILLS) return
    seen.add(s.id)
    out.push(s)
  }
  const toSummary = (e: { document: SkillDocument; purpose: string; whenToUse: string }): SkillSummary => ({
    id: e.document.id,
    name: e.document.name,
    purpose: e.purpose,
    whenToUse: e.whenToUse,
    ...(e.document.category ? { category: e.document.category } : {}),
    type: e.document.type,
    path: e.document.relPath,
  })

  // ① 先给**当前科研过程阶段**该用的能力 —— 这是"遵循基本科研过程"的落点：
  //    不靠对话内容猜，而是由真实研究资产判断"哪一步还没落地"。
  const process = assessResearchProcess(ws, { ...(skillContent ? { skillContent } : {}) })
  if (process.current) {
    const all = listSystemSkills().filter((d) => d.status === 'active')
    for (const doc of all) {
      if ((doc.category ?? '').split('/')[0] !== process.current.stage.category) continue
      add({
        id: doc.id,
        name: doc.name,
        purpose: skillPurpose(doc),
        whenToUse: skillWhenToUse(doc),
        ...(doc.category ? { category: doc.category } : {}),
        type: doc.type,
        path: doc.relPath,
      })
    }
  }

  // ② 再按**当前请求**补相关能力（原来的逻辑）
  const input = (userInput ?? '').trim()
  if (input) {
    for (const e of recommendSkills(ws, { topic: input, keywords: [input] })) add(toSummary(e))
  }
  return out
}

function isRelevant(text: string, input: string): boolean {
  if (!input) return false
  const haystack = input.toLowerCase()
  const needle = text.toLowerCase().trim()
  if (needle.length < 3) return false
  if (haystack.includes(needle)) return true
  // 逐词命中（技能名通常由连字符/空格分词）
  const words = needle.split(/[\s\-_/]+/).filter((w) => w.length >= 4)
  return words.length > 0 && words.some((w) => haystack.includes(w))
}

/**
 * 把 Research Context 渲染成 Markdown 文本。
 *
 * 设计约束（§5 / §8）：
 * - **无研究项目 → 返回空串**（不注入噪音；该会话就退化成普通 Harness 助手）；
 * - **不无条件全量注入**：Paper 正文只在没有具体任务、或用户提到论文时给出节选；
 *   Plan / Skill 列表给出标题级信息，相关项才给细节；
 * - **不规定流程**：不输出"下一步应该做 X"，只陈述现状与可用能力。
 */
export function renderResearchContext(ctx: ResearchContext, userInput = ''): string {
  if (!ctx.project) return ''

  const lines: string[] = []
  lines.push('# Current research context')
  lines.push('')

  const p = ctx.project
  // 研究根目录提示：新布局下所有研究文件在会话工作区的 `workspace/` 子目录里，
  // 必须先说清楚 —— 否则 Agent 按会话 cwd 去读 `project.md` 会扑空。
  const root = ctx.rootPrefix ? `${ctx.rootPrefix}/` : ''
  lines.push('## Research project')
  lines.push('')
  if (ctx.rootPrefix) {
    lines.push(
      `- Files root: \`${root}\` — all research files live in this subdirectory of the session ` +
        'workspace; every path in this context is relative to that root.',
    )
  }
  // topic = **当前采纳的主题**（会随研究收敛被 `research_project set_topic` 更新）；
  // 初始输入主题只要发生过演进就作为第二行给出 —— 演进可追溯，但不喧宾夺主。
  lines.push(`- Topic: ${p.topic}`)
  if (p.initialTopic && p.initialTopic !== p.topic) lines.push(`- Initial topic: ${p.initialTopic}`)
  if (p.domain) lines.push(`- Domain: ${p.domain}`)
  if (p.goal) lines.push(`- Goal: ${p.goal}`)
  if (p.questions && p.questions.length > 0) {
    lines.push('- Open questions:')
    for (const q of p.questions) lines.push(`  - ${q}`)
  }
  lines.push('')

  if (ctx.paperTitle || ctx.paperExcerpt) {
    lines.push('## Current paper')
    lines.push('')
    if (ctx.paperTitle) lines.push(`- Title: ${ctx.paperTitle}`)
    // 相关性：提到 paper/论文/写作，或本轮没有明确任务时才给正文节选
    const wantsPaper = /\b(paper|manuscript|section|abstract|writ|论文|写作|章节)\b/i.test(userInput)
    if (!userInput || wantsPaper) {
      if (ctx.paperExcerpt) {
        lines.push('')
        lines.push('Excerpt:')
        lines.push('')
        lines.push(ctx.paperExcerpt)
      }
    } else {
      lines.push(`- (Full manuscript available at \`${root}paper/\`; read it when the task needs it.)`)
    }
    lines.push('')
  }

  if (ctx.plans.length > 0) {
    lines.push('## Plans')
    lines.push('')
    for (const plan of ctx.plans) {
      const status = plan.status ? ` [${plan.status}]` : ''
      lines.push(`- \`${root}${plan.path}\` — ${plan.title}${status}`)
    }
    lines.push('')
  }

  // ── Research State（§12 / §25 / §26）────────────────────────────────
  // 只给「已建立维度的标题 + 成熟度」，**不复制正文** —— 正文在
  // research/research-state.md 里，模型需要时自己读（§8：不无条件全量注入）。
  if (ctx.state) {
    const established = Object.entries(ctx.state.dimensions)
      .filter(([, v]) => v)
      .map(([k]) => k)
    const maturity = Object.entries(ctx.state.maturity)
      .filter(([, v]) => v && v !== 'Unknown')
      .map(([k, v]) => `${k}=${v}`)
    lines.push('## Research state')
    lines.push('')
    lines.push(`- Version: v${ctx.state.version}`)
    if (established.length > 0) lines.push(`- Established dimensions: ${established.join(', ')}`)
    else lines.push('- Established dimensions: none yet (an empty state is normal early on)')
    if (maturity.length > 0) lines.push(`- Maturity: ${maturity.join(', ')}`)
    lines.push(`- Full state: \`${root}${RESEARCH_STATE_REF}\``)
    lines.push('')
  }

  // 未被证据支撑 / 有争议的 Claim —— 这是"研究下一步最该做什么"的真实信号
  if (ctx.index && (ctx.index.unsupportedClaims.length > 0 || ctx.index.contestedClaims.length > 0)) {
    lines.push('## Evidence gaps')
    lines.push('')
    if (ctx.index.unsupportedClaims.length > 0) {
      lines.push(`- Claims with no supporting evidence yet: ${ctx.index.unsupportedClaims.join(', ')}`)
    }
    if (ctx.index.contestedClaims.length > 0) {
      lines.push(`- Claims with contradicting evidence: ${ctx.index.contestedClaims.join(', ')}`)
    }
    if (ctx.index.evidenceWithoutRawArtifact.length > 0) {
      lines.push(
        `- Evidence lacking a raw artifact reference: ${ctx.index.evidenceWithoutRawArtifact.join(', ')} (provenance is incomplete)`,
      )
    }
    lines.push('')
  }

  if (ctx.openQuestions.length > 0) {
    lines.push('## Open questions')
    lines.push('')
    for (const q of ctx.openQuestions) lines.push(`- ${q}`)
    lines.push('')
  }

  // ── Paper 状态与缺口（Stage 5 §46：要能回答"最大的问题是什么"）────────
  if (ctx.paper) {
    const p = ctx.paper
    lines.push('## Paper')
    lines.push('')
    lines.push(`- Title: ${p.title}`)
    lines.push(`- Version: v${p.version} [${p.status}]`)
    lines.push(`- Sections with content: ${p.sections.substantive}/${p.sections.total}`)
    lines.push(
      `- Claims: ${p.claims.total}${p.claims.withoutEvidence ? ` (${p.claims.withoutEvidence} without evidence)` : ''}`,
    )
    lines.push(`- Evidence used in the manuscript: ${p.evidence.usedInManuscript}/${p.evidence.total}`)
    if (p.maturity.established.length) lines.push(`- Maturity established: ${p.maturity.established.join(', ')}`)
    if (p.openProposals > 0) lines.push(`- ${p.openProposals} revision proposal(s) awaiting your review`)
    lines.push(`- Paper files: \`${root}papers/${p.paperId}/\``)
    lines.push('')
  }

  // Research Outputs（Stage 5.1）：同一研究的不同成果表达
  if (ctx.outputs.length > 0) {
    lines.push('## Research outputs')
    lines.push('')
    lines.push('The same research expressed in other forms (a paper is one of them):')
    lines.push('')
    for (const o of ctx.outputs) {
      lines.push(`- \`${o.id}\` [${o.status}] v${o.version} (${o.type}) — ${o.title}  · \`${root}${o.relPath}\``)
    }
    const drafts = ctx.outputs.filter((o) => o.status === 'draft').length
    if (drafts > 0) lines.push('', `${drafts} output(s) are drafts awaiting review.`)
    lines.push('')
    void OUTPUT_DIRS
  }

  if (ctx.paperGaps.length > 0) {
    lines.push('## Current paper gaps')
    lines.push('')
    lines.push('These are what the paper is missing right now (from rule checks + recorded notes):')
    lines.push('')
    for (const g of ctx.paperGaps.slice(0, 6)) {
      lines.push(
        `- [${g.priority}] ${g.type}: ${g.description}${g.suggestedSkill ? ` (a suitable skill: \`${g.suggestedSkill}\`)` : ''}`,
      )
    }
    if (ctx.paperGaps.length > 6) lines.push(`- …and ${ctx.paperGaps.length - 6} more`)
    lines.push('')
    lines.push('Gaps only *suggest* what could be done — decide yourself what to act on.')
    lines.push('')
  }

  // ── 能力（Skill）────────────────────────────────────────────────────
  //
  // 这里**不再全量列出能力库**：Harness 原生 Skill 目录已经列了全部能力（含描述），
  // 并用 `skill` 工具按需加载正文。再抄一份进 Research Context 会造成两个后果：
  //   ① 实测占 26,893 / 27,565 字符（98%）的上下文开销；
  //   ② 与原生目录重复，且容易被误读成"这些都要按顺序读一遍"。
  //
  // 这里只做两件事：给一句指针（有多少能力、怎么按需加载），
  // 以及**按当前请求**列出可能用得上少数几项。
  // ── 基本科研过程（提示性）──────────────────────────────────────────
  //
  // v2 没有模块流水线，但基本科研过程仍在：不先弄清问题就查文献、不先有假设就设计实验，
  // 得到的东西不可解释。这里只**陈述**"从研究资产看哪一步还没落地"，并据此推荐该阶段的
  // 能力 —— 不规定顺序、不阻塞用户，用户可以完全忽略它继续自由对话。
  if (ctx.process.stages.length > 0) {
    lines.push('## Research process')
    lines.push('')
    if (ctx.process.current) {
      lines.push(
        `Current stage: **${ctx.process.current.stage.label}** — ${ctx.process.current.stage.produces}.`,
      )
      lines.push(`Basis: ${ctx.process.current.evidence}.`)
    } else {
      lines.push('Every stage of the research process has landed artifacts; there is no obvious missing step.')
    }
    const landed = ctx.process.stages.filter((s) => s.satisfied).map((s) => s.stage.label)
    const pending = ctx.process.missing.map((s) => s.stage.label)
    if (landed.length > 0) lines.push(`Landed: ${landed.join(' → ')}`)
    if (pending.length > 0) lines.push(`Not yet: ${pending.join(' · ')}`)
    lines.push('')
    lines.push(
      'This is a description of the research assets, not a procedure to follow: stages are not a ' +
        'pipeline, and you may work on any of them in any order the research actually needs.',
    )
    lines.push('')
  }

  if (ctx.skills.length > 0) {
    lines.push('## Research skills')
    lines.push('')
    lines.push(
      `The capability library holds ${ctx.skills.length} research skills; the full catalogue and its ` +
        'on-demand loading are provided by the native skill list. Load a skill before following its method.',
    )
    if (ctx.suggestedSkills.length > 0) {
      lines.push('')
      lines.push('Possibly relevant to this request (navigation only — no execution order):')
      for (const s of ctx.suggestedSkills) {
        const purpose = s.purpose ? ` — ${s.purpose.split('\n')[0]}` : ''
        lines.push(`- **${s.name}** (\`${s.path}\`)${purpose}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

/* ════════════════════════════════════════════════════════════════════════
 * Cordis Service
 * ════════════════════════════════════════════════════════════════════════ */

/** 解析当前会话 workspace 的钩子（由插件入口注入，避免本模块依赖会话内部结构）。 */
export type WorkspaceResolver = () => string

/**
 * Research Context 服务：把研究状态注册为 Harness 的**动态上下文贡献者**。
 *
 * 生命周期：`apply()` 时调用 {@link mount}，注册两个贡献：
 *   - `section`  → 科研模式指引（稳定，不含流程）；
 *   - `context`  → 研究现状快照（动态，每次组装重新读盘）。
 *
 * 两者返回 Cordis disposer；插件卸载时自动清理（不残留全局 prompt 污染）。
 */
export class ResearchContextService extends Service {
  private readonly resolveWorkspace: WorkspaceResolver
  /** 会话工作区（≠ 研究根目录；新布局下研究根 = `<会话工作区>/workspace`）。 */
  private readonly resolveSessionWorkspace?: WorkspaceResolver
  /**
   * 取能力**生效正文**（含用户定制）。
   *
   * 过程定义（`research-process`）本身是可定制能力，因此"当前阶段"必须按用户定制后的
   * 内容判定 —— 用户在【设置】里规定了自己的研究过程，选择逻辑就得跟着变。
   */
  private readonly skillContent: ((id: string) => string | undefined) | undefined
  /** 最近一次渲染的上下文（供 UI / 调试读取；§20 要求 Research Context 用户可见）。 */
  private lastRendered = ''
  private lastWorkspace = ''

  constructor(
    ctx: Context,
    resolveWorkspace: WorkspaceResolver,
    skillContent?: (id: string) => string | undefined,
    resolveSessionWorkspace?: WorkspaceResolver,
  ) {
    super(ctx, 'convfusionResearch')
    this.resolveWorkspace = resolveWorkspace
    this.skillContent = skillContent
    this.resolveSessionWorkspace = resolveSessionWorkspace
  }

  /** 最近一次注入给模型的 Research Context 文本（`''` = 当前会话不是研究项目）。 */
  get current(): string {
    return this.lastRendered
  }

  /** 最近一次解析出的 workspace 路径。 */
  get workspace(): string {
    return this.lastWorkspace
  }

  /**
   * 注册到 Harness 的 system prompt 组装管线。
   *
   * 返回 disposer 数组，由调用方（插件入口）按 Cordis effect 语义管理。
   */
  mount(): Array<() => void> {
    const disposers: Array<() => void> = []

    // ── 稳定段：科研模式指引 ────────────────────────────────────────────
    const guide: PromptSection = {
      name: RESEARCH_GUIDE_NAME,
      order: RESEARCH_GUIDE_ORDER,
      // 只有当前会话确实属于研究项目时才注入，避免污染普通对话。
      text: () => (isResearchWorkspace(this.resolveWorkspace()) ? RESEARCH_GUIDE_TEXT : ''),
    }
    disposers.push(this.ctx.systemPrompt.section(guide))

    // ── 动态段：研究现状快照（每次组装重新求值 —— §6）──────────────────
    const snapshot: PromptContext = {
      name: RESEARCH_CONTEXT_NAME,
      order: RESEARCH_CONTEXT_ORDER,
      text: () => {
        const ws = this.resolveWorkspace()
        this.lastWorkspace = ws
        if (!isResearchWorkspace(ws)) {
          this.lastRendered = ''
          return ''
        }
        const collected = collectResearchContext({
          workspace: ws,
          ...(this.skillContent ? { skillContent: this.skillContent } : {}),
          ...(this.resolveSessionWorkspace ? { sessionWorkspace: this.resolveSessionWorkspace() } : {}),
        })
        const rendered = renderResearchContext(collected)
        this.lastRendered = rendered
        return rendered
      },
    }
    disposers.push(this.ctx.systemPrompt.context(snapshot))

    return disposers
  }
}
