/**
 * dsh-convfusion — host half（ConvFusion 2.0 / Stage 1: Harness Runtime）
 *
 * ## 这一版是什么
 *
 * ConvFusion 2.0 是**推倒重来**：不再有 Module / Step / 固定流水线 / 子 Agent 编排 /
 * 自造会话事件 / 自绘原生 UI（v2-Stage0 §6.3、v2-Stage1 §12 / §27）。
 *
 * 本插件现在的唯一职责，是让 Harness 成为 ConvFusion 的**原生 Agent Runtime**
 * （v2-Stage1 §1：Extend Harness, do not wrap Harness）：
 *
 * ```text
 * Research Context   →  ctx.systemPrompt.context()     动态、按需、逐步求值
 * Research Guide     →  ctx.systemPrompt.section()     稳定说明（不含流程）
 * Skills             →  ctx.skills.registerProvider()  白拿 Harness 原生 skill 通道
 * Runtime Observation→  ctx.on('agent/*' | 'tools/*')  只观察，不接管
 * Plan-as-input      →  agent.followup(user message)   原生交接
 * ```
 *
 * Agent Loop / Tool Registry / Session / 流式 / Coding **全部由 Harness 原生提供**，
 * 本插件一行都不实现、也不包装。
 *
 * ## 明确不做（v2-Stage1 §26）
 *
 * 不建 Agent Loop、Workflow Engine、Coding Agent、Tool Registry、Session 系统、
 * 严格 DSL。Skill Library（Stage 2）、Plan System（Stage 3）、Evidence（Stage 4）、
 * Paper Evolution（Stage 5）属后续阶段。
 *
 * ## 已知外部约束（影响设计，勿忘）
 *
 * 外部插件**不能**持久化自定义 session 事件类型：`Session.append` 无法设置
 * `ignorable`，而持久化读取路径会拒绝未知类型（会话将不可恢复）。
 * 因此本插件**只使用** Harness 已有的 `user/message`（经 `agent.followup`）与
 * `system/message`（经 system prompt 段）通道；观测状态只留在**内存**。
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolve } from 'node:path'
import {
  Config,
  OPENALEX_API_KEY_ENV,
  resolveConfig,
  resolveCustomizationPath,
  type Config as ConfigShape,
} from './config.js'
import { SETTINGS_ROUTE_PREFIX, createSettingsRouteHandler } from './settings-rpc.js'
import { createFileCustomizationStore } from './research/skill-customization.js'
import { systemLibraryStatus } from './research/skill-customization.js'
import { ResearchContextService } from './research/context.js'
import { mountEventBridge, type ResearchEventBridge } from './research/runtime-events.js'
import { mountProgressBridge } from './research/progress-bridge.js'
import { effectiveSkillContentById, mountSkillProvider } from './research/library.js'
import { defineResearchCommand } from './research/commands.js'
import { defineResearchTools } from './research/research-tools.js'
import { isResearchWorkspace, researchWorkspaceOf, resolveWorkspace } from './research/workspace.js'
import { resolveSessionWorkspace } from './research/session-workspace.js'

export const name = 'dsh-convfusion'
export { Config }

/**
 * 依赖声明。
 *
 * 只声明**必需**服务 `tools`；其余（`commands` / `skills` / `agent-loop`）在 apply
 * 内做能力探测后降级。这样本插件在精简 profile（headless、无 web、无 commands）下
 * 也能加载而不崩 —— 这是 v2-Stage1 §13「不破坏 Harness 原生体验」的前提：
 * 一个插件不应让整个 profile 起不来。
 */
/**
 * 依赖声明。
 *
 * ⚠️ **必须列出所有会被访问的服务**。Cordis 的规则是：*未 inject 的服务不可访问*，
 * 直接属性访问会抛 `cannot get property "X" without inject`，而插件加载是
 * **全有或全无**的 —— 一个未声明的服务会让整个 profile 起不来（2026-09-12 实际发生）。
 *
 * 因此这里声明了插件真正用到的三个服务：
 *   - `tools`        注册研究资产工具；
 *   - `systemPrompt` Research Context / Research Guide 的注入点（Stage 1 核心）；
 *   - `skills`       Skill Library 的注册点（Stage 2 核心）。
 *
 * 三者都是本插件功能的核心依赖；缺少它们时插件没有意义，故不做"可降级"处理。
 * 而**可选**能力（`commands`、agent 事件）用 `ctx.inject(...)` / `ctx.on(...)`
 * 按需挂载，不在此列。
 */
export const inject = ['tools', 'systemPrompt', 'skills']

/** 运行时句柄（供设置页 / 调试读取；**不**参与 Agent 决策）。 */
export interface ConvFusionRuntime {
  /** Research Context 服务：当前注入文本、workspace。 */
  research: ResearchContextService
  /** Harness 原生运行时的观测桥（内存环形缓冲）。 */
  events: ResearchEventBridge
  /** 生效配置（设置面板读取）。 */
  config: ConfigShape
  /** 用户定制文件的绝对路径（设置面板展示"定制存在哪里"）。 */
  customizationPath: string
  /** 用户定制存储（设置面板读写）。 */
  customizationStore: import('./research/skill-customization.js').SkillCustomizationStore
  /** 系统 Skill Library 状态（包内资产，只读）。 */
  systemLibrary: { root: string; skillCount: number }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    convfusion: ConvFusionRuntime
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 可选服务的结构化视图
 *
 * 只声明**我们真正调用**的那几个成员。`dsh-settings` / `dsh-client-connection`
 * 不是本插件的必需依赖（精简 profile 里没有它们），因此不能 import 它们的类型 ——
 * 那会把可选能力变成硬依赖。这里是结构镜像，与 dsh-additive 同款做法。
 * ════════════════════════════════════════════════════════════════════════ */

interface SettingsLike {
  register: (
    ns: string,
    schema: unknown,
    options: { base: unknown },
  ) => { get: () => unknown; watch: (cb: () => void) => () => void }
}

interface ConnectionLike {
  /** Harness 的信任 / 鉴权栅栏（返回非 undefined = 拒绝，值为 HTTP 状态码）。 */
  requestRejection: (request: {
    headers: Record<string, string | string[] | undefined>
    method: string
    url: string
  }) => number | undefined
}

interface WebServerLike {
  register: (route: {
    kind: 'prefix'
    path: string
    handler: (req: unknown, res: unknown) => void | Promise<void>
  }) => () => void
}

export function apply(ctx: Context, rawConfig: Partial<ConfigShape> = {}): void {
  // ── 配置：设置里只有「定制文件名」，内容存独立文件（设置文件不会变大）──
  //
  // ⚠️ 配置必须**可被设置页改写**：用户在【设置】-【ConvFusion】-【本地设置】里改文件名后，
  // 定制内容要立刻写到新文件。因此这里用 `source()` 这个**可替换的取值函数**：
  // 装配时是入口配置；settings 命名空间一旦可用，就换成"设置文档 > 组合层"的解析结果。
  const entryConfig = resolveConfig(rawConfig)
  let source: () => ConfigShape = () => entryConfig
  const currentConfig = (): ConfigShape => source()
  // store 的路径解析是**延迟求值**的：每次读写都按当时生效的文件名解析。
  const customizationStore = createFileCustomizationStore(() =>
    resolveCustomizationPath(currentConfig()),
  )
  ctx.logger?.info(
    `[convfusion] user customizations: ${customizationStore.description}` +
      ` · system skills: ${systemLibraryStatus().skillCount}`,
  )

  // ── workspace 解析（**每次求值**，不是启动时固定）──────────────────────
  // v2-Stage1 §6：Research Context 必须是运行时动态上下文。装配阶段拿不到会话，
  // 所以这里维护一个由 `agent/pre-step` 持续同步的 cwd，并返回动态解析函数。
  // v2 无「锚文件」概念：一个研究根目录 = 一个研究；非研究目录会被
  // `isResearchWorkspace` 判否，从而不注入任何研究上下文（会话退化为普通助手）。
  //
  // **两级目录**（v2-Workspace.md §2）：会话工作区是用户的工作区（放用户自己的
  // 论文/数据等），ConvFusion 全部数据文件在会话工作区下的 **`workspace/` 子目录**。
  // `resolveCurrentWorkspace` 返回的是**研究根目录**（`researchWorkspaceOf` 处理
  // 新旧布局兼容）；`resolveCurrentSessionWorkspace` 返回会话工作区本身，
  // 供 Research Context 渲染"文件根目录"提示（新布局下为 `workspace/`）。
  let currentCwd = process.cwd()
  const resolveCurrentSessionWorkspace = (): string => resolveWorkspace(currentCwd, undefined)
  const resolveCurrentWorkspace = (): string => researchWorkspaceOf(resolveCurrentSessionWorkspace())

  // 研究资产工具的 workspace 解析：**按调用所属会话**取（权威来源 = 会话自己的
  // `header.cwd`，见 `session-workspace.ts`）。为什么不能直接用 `resolveCurrentWorkspace`：
  // 它依赖 `agent/pre-step` 持续同步的**全局** `currentCwd` —— 多会话并行时该值可能已被
  // 其它会话覆盖（或从未同步、停留在 DSH 进程启动目录），会把研究数据写进别的工作区
  // （2026-09 实测：一条 state proposal 被写进插件开发仓库根目录）。
  // 拿不到会话身份时退化为全局解析，保持可用性。
  const resolveWorkspaceForAgent = (agent?: { id?: unknown } | null): string => {
    const sessionWs =
      typeof agent?.id === 'string' && agent.id.trim() ? resolveSessionWorkspace(ctx, agent.id) : undefined
    if (sessionWs) return researchWorkspaceOf(sessionWs)
    return resolveCurrentWorkspace()
  }

  // ── 1. Research Context（核心：动态上下文注入）─────────────────────────
  // 过程定义是一个**可定制能力**：读它的"生效正文"必须经过用户覆盖层合成。
  const skillContent = (id: string): string | undefined =>
    effectiveSkillContentById(id, customizationStore)
  const research = new ResearchContextService(ctx, resolveCurrentWorkspace, skillContent, resolveCurrentSessionWorkspace)
  ctx.effect(() => {
    const disposers = research.mount()
    return () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* 卸载路径必须健壮：单个取消失败不影响其余 */
        }
      }
    }
  }, 'convfusion:research-context')

  // ── 2. Skill Awareness（注册为 Harness 原生 Skill Provider）────────────
  ctx.effect(() => mountSkillProvider(ctx, customizationStore), 'convfusion:skill-provider')

  // ── 3. Research Runtime 观测桥（只观察，不接管，不写会话日志）───────────
  const { bridge, dispose: disposeBridge } = mountEventBridge(ctx)
  ctx.effect(() => disposeBridge, 'convfusion:runtime-events')

  // ── 3b. 研究进展桥（每轮结束展示一次 Research Progress Snapshot）────────
  // 依据 `v2-Progress.md`：把"这一轮到底让研究前进了多少"显示在本轮对话末尾。
  // 用**已知事件类型** `user/message` + `form:'notice'` 追加（收起行 + 展开正文），
  // 不新增自定义事件类型，也不唤醒新一轮。
  ctx.effect(
    () =>
      mountProgressBridge(ctx, resolveCurrentWorkspace, skillContent, {
        // 每次求值：用户在设置里改完立即生效
        enabled: currentConfig().autoContinue,
        maxRounds: currentConfig().autoContinueMaxRounds,
      }),
    'convfusion:progress-bridge',
  )

  // ── 4. 会话 cwd 感知（动态 workspace）──────────────────────────────────
  // ⚠️ `agent/pre-step` 是 **waterfall**：必须 `return next()` 放行，否则会**阻断
  // Agent 运行**。这里只同步 workspace，不做任何内容注入（注入由 systemPrompt 段负责）。
  //
  // ⚠️ 必须有**兜底**：曾经只读载荷里的 `session.header.cwd`，一旦取不到就静默保留
  // `process.cwd()`（= DSH 服务进程启动目录），于是插件开发仓库的会话会被当成
  // 某个研究项目（2026-09 实测发生）。现在取不到就向会话存储要
  // （`ctx.sessions.get(id).header.cwd`，权威且与会话绑定）。
  ctx.on('agent/pre-step', (payload, next) => {
    const p = payload as unknown as {
      agent?: { id?: unknown; session?: { id?: unknown; header?: { cwd?: string } } }
    }
    const direct = p.agent?.session?.header?.cwd
    const fromPayload = typeof direct === 'string' && direct.trim() ? resolve(direct) : undefined
    const sid = p.agent?.id ?? p.agent?.session?.id
    const resolved = fromPayload ?? resolveSessionWorkspace(ctx, sid == null ? undefined : String(sid))
    if (resolved) currentCwd = resolved
    return next()
  })

  // ── 5. `/research` —— ConvFusion 的**唯一**命令 ─────────────────────────
  // 没有 /plan、/skills 等分管理命令：Plan 是每个阶段产出的 Markdown 资产，
  // 用户的"优化"发生在文件里，不由命令操作（见 commands.ts 顶部说明）。
  ctx.inject(['commands'], (cmdCtx) => {
    const disposers = [
      ...(defineResearchCommand(cmdCtx, resolveCurrentWorkspace) ?? []),
    ]
    if (disposers.length === 0) return
    cmdCtx.effect(() => () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* 卸载路径必须健壮 */
        }
      }
    }, 'convfusion:research-commands')
  })

  // ── 6. 研究资产工具（Evidence / Claim / Decision / Research State）─────
  // 让 Agent 有**正确通道**记录科研事实：ID 与双向引用由我们保证，
  // 且 `research_state_propose` **只提案、不应用**（Stage 4 §20 / §21）。
  ctx.effect(() => {
    const disposers = defineResearchTools(
      resolveWorkspaceForAgent,
      {
        // OpenAlex Key 从设置（或 OPENALEX_API_KEY 环境变量）**每次调用时**读取：
        // 用户在设置页改完立即生效，不需要重启。
        apiKey: () => currentConfig().openalexApiKey || process.env[OPENALEX_API_KEY_ENV] || '',
      },
      // 论文全文下载依赖：复用全局 fetch（与 OpenAlex 检索同一网络栈）。
      // 不需要单独的 API Key —— 下载走论文的开放获取源（arXiv / ACL / OA）。
      // mailto 复用检索同款（进 polite pool），这里暂不注入，留待需要时扩展。
      { fetchImpl: globalThis.fetch as unknown as import('./research/paper-download.js').DownloadFetchLike },
    ).map((tool) => ctx.tools.register(tool))
    return () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* 卸载路径必须健壮 */
        }
      }
    }
  }, 'convfusion:research-tools')

  // ── 7. 设置面：命名空间 + 定制内容 RPC ─────────────────────────────────
  // 【设置】-【ConvFusion】由两半组成，缺一不可：
  //   host  ：注册 settings 命名空间（保存文件名）+ 提供 /convfusion RPC（读写定制文件）
  //   client：注册 `settings.section`（浏览器里那一页）
  // 两半都走**可选注入**：精简 profile（无 settings / 无 web）下插件照常工作，
  // 只是没有设置界面 —— 而不是让整个 profile 起不来。
  ctx.inject(['settings'], (sctx) => {
    // `ctx.get()` 而不是 `sctx.settings`：可选服务的读取统一走"不触发 inject 检查"的
    // 通道，避免"注释说可选、代码却硬访问"这种自相矛盾（客户端踩过一次）。
    const settings = sctx.get('settings') as SettingsLike | undefined
    if (!settings || typeof settings.register !== 'function') return
    const scope = settings.register('convfusion', Config, { base: entryConfig })
    source = () => resolveConfig(scope.get() as Partial<ConfigShape>)
    // 用户在设置页改文件名后，定制内容立即改写到新文件（store 路径是延迟解析的）
    scope.watch(() => {
      source = () => resolveConfig(scope.get() as Partial<ConfigShape>)
      ctx.logger?.info(`[convfusion] customization file → ${resolveCustomizationPath(currentConfig())}`)
    })
  })

  // ── /dsh-convfusion 路由（设置页的数据通道）──────────────────────────
  //
  // ⚠️ 这里**不用** `connection.rpc.handle()` —— 它在这版 DSH 上对外部插件不可用：
  // 其内部 `owner.webServer` 会抛 `cannot get property "webServer" without inject`
  // （owner 上挂着指向 connection 插件 fiber 的 shadow，那个 fiber 没有 webServer），
  // 而异常被它自己的 effect 吞掉 → 插件报告成功、路由却没注册 → 浏览器收到 405。
  // 详细实测见 `scripts/probe-settings-rpc-route.mjs` 与 `settings-rpc.ts` 文件头。
  //
  // 采用与 `dsh-additive` 相同、并在本 profile 验证过的做法：自己注册 webServer
  // 前缀路由，并用 `connection.requestRejection()` 过一遍 Harness 的信任栅栏。
  ctx.inject(['webServer', 'connection'], (cctx) => {
    const webServer = cctx.get('webServer') as WebServerLike | undefined
    if (!webServer || typeof webServer.register !== 'function') {
      ctx.logger?.warn(
        `[convfusion] webServer 不可用；${SETTINGS_ROUTE_PREFIX} 路由未注册（设置页将无法读取）`,
      )
      return
    }
    const connection = cctx.get('connection') as ConnectionLike | undefined
    const handler = createSettingsRouteHandler({
      getConfig: currentConfig,
      store: customizationStore,
      // 进度卡按**会话自己的工作区**判定是否研究项目（权威来源，见 session-workspace.ts）
      resolveSessionWorkspace: (sessionId) => resolveSessionWorkspace(ctx, sessionId),
      ...(connection && typeof connection.requestRejection === 'function'
        ? {
            reject: (req: {
              method?: string | undefined
              url?: string | undefined
              headers: Record<string, string | string[] | undefined>
            }) =>
              connection.requestRejection({
                headers: req.headers,
                method: req.method ?? 'GET',
                url: req.url ?? '/',
              }),
          }
        : {}),
    })

    // 先注册（可能抛），再把 disposer 交给 effect —— 分两步是为了让"注册失败"
    // 能被 try/catch 抓住并升级成日志，而不是被 effect 吞掉。
    let disposeRoute: (() => void) | undefined
    try {
      disposeRoute = webServer.register({
        kind: 'prefix',
        path: SETTINGS_ROUTE_PREFIX,
        handler: handler as unknown as (req: unknown, res: unknown) => void | Promise<void>,
      })
    } catch (e) {
      // 静默失败是这里最坏的形态（曾经就是）：宁可吵，也不要"看起来成功了"。
      ctx.logger?.error(
        `[convfusion] ${SETTINGS_ROUTE_PREFIX} 路由注册失败：${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }
    ctx.logger?.info(`[convfusion] settings route ready: ${SETTINGS_ROUTE_PREFIX}`)
    cctx.effect(() => () => {
      try {
        disposeRoute?.()
      } catch {
        /* 卸载路径必须健壮 */
      }
    }, 'convfusion:settings-route')
  })

  // ── 服务注册（供设置页 / 调试观察；**不**参与决策）─────────────────────
  // ⚠️ 必须是 `ctx.provide()` 而不是 `ctx.set()`：`set()` 只能改写**已经存在**的
  // 服务，用来首次发布会抛 `cannot set property "convfusion" without provide`，
  // 而插件加载是全有或全无的 —— 整个 profile 起不来（2026-09-12 实际发生）。
  // `provide()` 由当前 fiber 持有、随 fiber 卸载自动回收。
  ctx.provide('convfusion', {
    research,
    events: bridge,
    // 配置与定制路径用 getter：设置页改文件名后，调试读取立刻反映新值
    get config() {
      return currentConfig()
    },
    get customizationPath() {
      return resolveCustomizationPath(currentConfig())
    },
    customizationStore,
    systemLibrary: systemLibraryStatus(),
  })

  const ws = resolveCurrentWorkspace()
  ctx.logger?.info(
    '[convfusion] Stage 1 runtime mounted — research context + skill provider + event bridge' +
      (isResearchWorkspace(ws) ? ` · workspace ${ws}` : ' · (not a research workspace)'),
  )
}
