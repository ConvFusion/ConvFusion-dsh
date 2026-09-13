/**
 * ConvFusion 2.0 — `/research` 统一入口（Stage 1 建立，Stage 3/4 收敛）
 *
 * ## 只有一个命令
 *
 * ConvFusion **只有 `/research` 一个命令**。不存在 `/plan`、`/skills`、`/skill` 这类
 * 分管理命令。
 *
 * 原因不是"少做功能"，而是**命令面本身就是流程的伪装**：一旦有 `/plan review`、
 * `/plan approve`、`/skills fork`，用户就被引导去操作"系统的零件"，而不是做研究。
 * ConvFusion 的能力面是 **Research Context + Skill + Plan 资产 + 自然语言**，
 * 不是命令行 API。
 *
 * ## Plan 是**每个阶段的产物**，不是命令
 *
 * > 每个阶段都可以形成一个**可供用户优化并继续运行的 Plan**。
 *
 * 所以 Plan 的循环是：
 *
 * ```text
 * /research <推进研究>            ← 用户用自然语言推进
 *        ↓
 * Agent 产出/更新一个 Plan 资产    ← plans/<capability>.md，写清这一次怎么做
 *        ↓
 * 用户直接编辑那个 Markdown        ← 优化（不需要任何命令）
 *        ↓
 * /research <继续>                ← Agent 读回已优化的 Plan 并继续运行
 * ```
 *
 * **用户的"优化"发生在 Markdown 文件里** —— 这正是 Markdown-first
 * （Stage 3 §4：Plan 必须可以被用户直接阅读、直接修改）。
 * 需要人工把关时，Plan frontmatter 的 `status`（`draft → reviewed → ready`）
 * 就是控制点（Stage 3 §11），由用户或 Agent 改，而不是由一条命令改。
 *
 * ## `/research` 的两个行为
 *
 * ```text
 * /research                    显示当前研究状态（含各阶段产出的 Plan 及状态）
 * /research <自然语言推进>      把意图交给 Harness 原生 Agent，继续做这件事
 * ```
 *
 * 第二个路径**只做交接**：把"当前研究状态 + 已有 Plan + 用户意图"作为一条普通任务消息
 * 交给 `agent.followup()` —— 执行完全是 Harness 原生过程（Stage 1 §13 / §27）。
 * ConvFusion 不选模块、不排步骤、不跑 Agent。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { mkdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { ensureWorkspaceLayout } from './workspace-layout.js'
import { ensureResearchState } from './research-state.js'
import { hasProjectDefinition, loadProjectFile, saveProjectFile } from './project.js'
import { researchWorkspaceOf } from './workspace.js'
import { loadSkillLibrary } from './library.js'
import { listPlans, loadPlanLibrary, syncPlanHistoryDetailed } from './plan-library.js'
import { createPlanMessage } from './plan.js'
import { listEvidence } from './evidence.js'
import { writeMethodsExport } from './methods-export.js'
import type { SkillCustomizationStore } from './skill-customization.js'

/**
 * 是否是「导出研究方法」指令。
 *
 * 导出是**命令自身的动作**（按编号拼一个固定格式的文件），不是交给 Agent 的任务 ——
 * 让 Agent 去猜格式只会得到每次都不一样的产物。因此这里做前缀识别，先于 followup 处理。
 */
function isMethodsExportArg(arg: string): boolean {
  return /^(导出研究方法|导出方法|export-methods|export\s+methods)/i.test(arg.trim())
}

interface CommandRuntimeLike {
  register(definition: {
    name: string
    description: string
    input?: { hint: string }
    recordInput?: boolean
    handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
  }): () => void
}

/** 品牌展示。 */
export const RESEARCH_LABEL = '/research'

/**
 * 研究目录骨架。
 *
 * ⚠️ 以 `v2-Workspace.md` 为准：核心目录由 `ensureWorkspaceLayout()` 统一建立
 * （`plans/`、`research/{evidence,claims,decisions,state-history}/`）。
 * **不预建** `papers/`、`outputs/`、`experiments/`、`attachments/` ——
 * 它们按需产生（没有成果就不该有空的成果目录）。
 */
const SKELETON_DIRS: string[] = []

/** 从 invocation 解析**会话工作区**（裸 cwd；它本身不一定是研究根目录）。 */
function sessionWorkspaceOf(invocation: CommandInvocation): string {
  const session = (invocation.agent as { session?: { header?: { cwd?: string } } } | undefined)?.session
  const cwd = session?.header?.cwd
  return cwd && cwd.trim() ? cwd : process.cwd()
}

/**
 * 从 invocation 解析**研究根目录**（ConvFusion 数据文件所在目录）。
 *
 * 新布局 = 会话工作区下的 `workspace/` 子目录；旧布局（研究数据直接在会话工作区根）
 * 由 {@link researchWorkspaceOf} 自动兼容。
 */
function workspaceOf(invocation: CommandInvocation): string {
  return researchWorkspaceOf(sessionWorkspaceOf(invocation))
}

/** 研究根目录相对会话工作区的展示前缀（空串 = 旧布局，直接就是会话工作区）。 */
function rootPrefixOf(invocation: CommandInvocation): string {
  const rel = relative(resolve(sessionWorkspaceOf(invocation)), resolve(workspaceOf(invocation)))
  return rel && rel !== '.' && !isAbsolute(rel) && !rel.startsWith('..') ? `${rel}/` : ''
}

/**
 * 打开/更新研究项目（幂等）。
 *
 * 已存在 `project.md` 时只更新 topic，保留其它字段与 `createdAt` ——
 * 研究项目是用户的资产，不是插件的工作区，**不覆盖用户手写内容**。
 */
function openProject(workspace: string, topic: string): { created: boolean } {
  // 新布局下研究根目录 = 会话工作区的 `workspace/` 子目录，创建前必须存在
  try {
    mkdirSync(workspace, { recursive: true })
  } catch {
    /* 目录已存在或不可写：不阻断（后续写入失败会走同一兜底） */
  }
  for (const d of SKELETON_DIRS) {
    try {
      mkdirSync(join(workspace, d), { recursive: true })
    } catch {
      /* 目录已存在或不可写：不阻断 */
    }
  }
  // `created` 必须在写入前判定 —— 写完之后 `project.md` 必然存在
  const created = !hasProjectDefinition(workspace)
  // v2 规范：建立核心目录骨架 + 写 `project.md`（研究定义）+ 初始化 `research-state.md`
  try {
    ensureWorkspaceLayout(workspace)
    saveProjectFile(workspace, { topic })
    // Research State 与 Research Definition 同层：建项目时一并初始化（幂等）。
    ensureResearchState(workspace)
  } catch {
    /* 目录/文件不可写时不阻断，后续提示由调用方给出 */
  }
  return { created }
}

/**
 * 当前研究状态摘要（`/research` 无参数）。
 *
 * 列出**各阶段产出的 Plan 及其状态** —— 这正是"每个阶段形成一份可优化、可继续运行的
 * Plan"的体现：用户在这里看到"手上现在有哪些方案、各自到哪一步"。
 */
function describeProject(workspace: string): string {
  const project = loadProjectFile(workspace)
  if (!project) {
    return [
      'This workspace is not a research project yet.',
      '',
      `Start one with: \`${RESEARCH_LABEL} <research topic>\``,
    ].join('\n')
  }

  const plans = loadPlanLibrary(workspace)
  const skills = loadSkillLibrary(workspace)
  const evidence = listEvidence(workspace)

  const lines = [`Research project: ${project.topic}`]
  if (project.initialTopic && project.initialTopic !== project.topic) {
    lines.push(`Initial topic: ${project.initialTopic}（开题输入；主题已演进）`)
  }
  if (project.domain) lines.push(`Domain: ${project.domain}`)
  if (project.goal) lines.push(`Goal: ${project.goal}`)
  if (project.questions?.length) {
    lines.push('Questions:')
    for (const q of project.questions) lines.push(`  - ${q}`)
  }
  lines.push('')

  if (plans.entries.length === 0) {
    lines.push('Plans: none yet — describe what you want to do and the agent will produce one.')
  } else {
    lines.push(`Plans (${plans.counts.total}) — edit the Markdown to refine, then continue:`)
    for (const e of plans.entries) {
      const d = e.document
      const extra = [d.sourceSkill ? `skill:${d.sourceSkill}` : '', d.paper ? `paper:${d.paper}` : '']
        .filter(Boolean)
        .join(' ')
      lines.push(`  - \`${d.relPath}\` [${d.status}] v${d.version} — ${d.name}${extra ? `  (${extra})` : ''}`)
    }
    const pending = plans.entries.filter((e) => e.document.status === 'draft' || e.document.status === 'reviewed')
    if (pending.length > 0) {
      lines.push('')
      lines.push(`${pending.length} plan(s) are waiting for review. Edit the file and set \`status: ready\` when`)
      lines.push('you are happy with it — or just continue and the latest one becomes the current task.')
    }
  }

  lines.push('')
  lines.push(
    `Skills: ${skills.counts.total} (system ${skills.counts.system} · user ${skills.counts.user} · derived ${skills.counts.derived})`,
  )
  lines.push(`Evidence: ${evidence.length} item(s)`)
  lines.push('')
  lines.push('Continue with natural language — e.g. "analyse the direction", "design the experiment",')
  lines.push('"re-check the baseline claim". The agent decides what to do; there is no step list to follow.')
  return lines.join('\n')
}

/**
 * 把任务交给原生 Agent，并在宿主日志里留一行。
 *
 * 为什么要有日志：`agent.followup()` 成功与失败在**界面上都可能是"没有反应"**
 * （消息进了会话但 Agent 没跑起来），没有日志就只能靠猜。这行日志能直接回答
 * "命令到底有没有把任务交出去"。
 */
function followup(
  ctx: Context,
  agent: { followup?: (m: unknown) => void },
  text: string,
  kind: 'kickoff' | 'continue',
): void {
  ctx.logger?.info(`[convfusion] /research ${kind} → agent.followup (${text.length} chars)`)
  agent.followup?.(createPlanMessage(text))
}

/**
 * 构造**开题**任务文本（新建研究项目时交给 Agent 的第一条任务）。
 *
 * 这是用户点下 `/research <主题>` 之后 Agent 实际读到的内容。它必须：
 *
 *   1. **像一次普通的用户请求**（它就是一条 user message）—— 一句话说清要做什么；
 *   2. 告诉 Agent 研究定义已经落在 `project.md`，别再去猜；
 *   3. **不规定步骤**：没有模块、没有阶段顺序，由 Agent 自己判断这项研究需要什么
 *      （这正是 v2 与 v0.1.x 模块流水线的根本区别）。
 *
 * 用中文：这条消息在对话里**对用户可见**（它是 user turn），界面全中文，不要出现
 * 一堵英文墙。模型侧的系统提示与 Research Context 仍是英文，两者不冲突。
 */
function buildKickoffText(workspace: string, topic: string, root = 'workspace/'): string {
  void workspace
  return [
    `开始这项研究：${topic}`,
    '',
    `研究定义已经写在 \`${root}project.md\`（研究根目录是 \`${root || '.'}\`，相对会话工作区）。`,
    '',
    '这是一项**长期研究**，不是一次问答。请自己判断现在最该做什么 —— 澄清问题、查文献、',
    '研判新意、设计方案、跑实验、写论文都可以，没有固定流程，也不需要按任何阶段顺序。',
    '',
    `如果这件事需要真正的执行（写代码、跑实验、处理数据），先把方案写进 \`${root}plans/*.md\`，`,
    '让用户能先看再改，然后再执行。',
  ].join('\n')
}

/**
 * 构造"继续研究"的任务文本。
 *
 * 只把**当前状态 + 已有 Plan + 用户意图**交给 Harness，**不规定步骤**。
 */
function buildContinueText(workspace: string, intent: string, root = ''): string {
  const project = loadProjectFile(workspace)
  const plans = listPlans(workspace)
  const lines: string[] = []

  lines.push(intent.trim())
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('Context for this request:')
  if (project) {
    lines.push(`- Research project: ${project.topic}${project.domain ? ` (${project.domain})` : ''}`)
    if (project.goal) lines.push(`- Goal: ${project.goal}`)
    if (project.questions?.length) lines.push(`- Open questions: ${project.questions.join('; ')}`)
  }
  if (plans.length > 0) {
    lines.push('- Existing plans (Markdown assets you can read and refine):')
    for (const p of plans) lines.push(`  - \`${root}${p.path}\` [${p.status ?? 'draft'}] — ${p.title}`)
  }
  lines.push('')
  lines.push(
    `Read the research workspace as needed (research root \`${root || '.'}\`, relative to the session workspace: ` +
      `\`${root}project.md\`, \`${root}research-state.md\`, \`${root}plans/\`, \`${root}papers/\`, \`${root}research/\`). ` +
      'Decide yourself what this needs — there is no fixed pipeline. ' +
      `If this work needs substantial execution, write or update a plan under \`${root}plans/\` first so the ` +
      'user can refine it, then carry it out.',
  )
  return lines.join('\n')
}

/**
 * 注册 `/research`（ConvFusion 的唯一命令）。
 *
 * @param customizationStore 用户定制来源：导出研究方法时要导**生效版本**（基线 + 定制）
 * @returns disposer 数组（命令运行时缺失时返回 `null`，不影响插件其余功能）。
 */
export function defineResearchCommand(
  ctx: Context,
  resolveCurrentWorkspace: () => string,
  customizationStore?: SkillCustomizationStore,
): (() => void)[] | null {
  const commands = ctx.get('commands') as CommandRuntimeLike | undefined
  if (!commands || typeof commands.register !== 'function') return null

  return [
    commands.register({
      name: 'research',
      description: 'Open, inspect or continue the ConvFusion research project in this workspace.',
      input: { hint: '<what to do next> — omit to show the current research state' },
      recordInput: true,
      handler: (invocation: CommandInvocation): CommandResult => {
        const arg = (invocation.rawInput ?? '').trim()
        const workspace = workspaceOf(invocation)
        const root = rootPrefixOf(invocation)
        void resolveCurrentWorkspace

        try {
          // §19：`/research` 是"进入研究"的必经点 —— 盘上内容变了就补 Plan 快照。
          // Agent 是用原生工具直接改 `plans/*.md` 的，插件截不到那次写入；
          // 在这里对账，才能保证"历史版本不可被当前版本覆盖"真的成立。
          const snapshots = syncPlanHistoryDetailed(workspace)

          // ── 无参数：展示状态（含各阶段 Plan）──────────────────────────
          if (!arg) {
            const body = describeProject(workspace)
            const saved =
              snapshots.length > 0
                ? ['', '', 'Plan versions recorded in this pass:', ...snapshots.map((s) => `- \`${s.snapshot}\``)].join('\n')
                : ''
            return { kind: 'success', text: body + saved } as CommandResult
          }

          // ── 导出研究方法：`/research 导出研究方法 [--full]` ──────────────
          //
          // 必须**先于** followup 判定：否则这句会被当成研究任务丢给 Agent，
          // 而 Agent 每次拼出的格式都不一样（编号顺序、章节取舍都会漂）。
          if (isMethodsExportArg(arg)) {
            const full = /--full\b/i.test(arg)
            const res = writeMethodsExport(workspace, {
              full,
              ...(customizationStore ? { store: customizationStore } : {}),
            })
            const kb = Math.max(1, Math.round(res.bytes / 1024))
            return {
              kind: 'success',
              text: [
                `已导出 ${res.skillCount} 个研究方法 · ${res.categoryCount} 个类别 · ${kb} KB`,
                `文件：\`${res.path}\``,
                full
                  ? '内容：完整正文（含 `Source Prompts` 逐字历史提示词）'
                  : '内容：6 个可定制章节（生效版本）；需要完整正文加 `--full`',
                '编号：`CxxPyy` —— 类别 `C01`–`C09` 按研究过程排序，可直接用于排序与将来的按编号合并。',
              ].join('\n'),
            } as CommandResult
          }

          const project = loadProjectFile(workspace)

          // `agent.followup` 是**唯一**能把任务交给原生 Agent 的通道（v2 不再自建流程）。
          // 缺它就只能回一句说明，绝不能假装已经开跑。
          const agent = invocation.agent as unknown as { followup?: (m: unknown) => void }
          if (typeof agent.followup !== 'function') {
            return {
              kind: 'error',
              text: '当前 Harness 不提供 agent.followup()，无法把研究任务交给 Agent。',
            } as CommandResult
          }

          // ── 尚无研究项目：这句话即为研究主题，建好后**立即开跑** ──────
          //
          // ⚠️ 这里以前只建项目、返回一段静态说明就结束了 —— 于是 `/research <主题>`
          // "界面没有任何反应"：项目建好了（project.md 落盘），但没有任何东西开始跑。
          // 原生体验要求"说完就开始干活"，所以现在与"继续推进"走同一条路：
          // 建项目 → 把主题作为任务交给原生 Agent（Think / 工具 / 编码全部原生）。
          if (!project) {
            openProject(workspace, arg)
            followup(ctx, agent, buildKickoffText(workspace, arg, root), 'kickoff')
            return {
              kind: 'success',
              text: [`研究项目已创建：${arg}`, `研究根目录：\`${workspace}\``, '', 'Agent 已开始推进。'].join('\n'),
            } as CommandResult
          }

          // ── 已有项目：作为"继续推进"的意图交给 Harness ────────────────
          // 幂等补建：若 `research-state.md` 被误删，这里无痕恢复（已存在则不动）。
          try {
            ensureResearchState(workspace)
          } catch {
            /* 不可写时不阻断推进 */
          }
          followup(ctx, agent, buildContinueText(workspace, arg, root), 'continue')
          return {
            kind: 'success',
            text: [
              `继续推进：${project.topic}`,
              ...(snapshots.length > 0
                ? ['', '本次记录了 Plan 版本：', ...snapshots.map((s) => `- \`${s.snapshot}\``)]
                : []),
            ].join('\n'),
          } as CommandResult
        } catch (e) {
          return {
            kind: 'error',
            text: `Research command failed: ${e instanceof Error ? e.message : String(e)}`,
          } as CommandResult
        }
      },
    }),
  ]
}
