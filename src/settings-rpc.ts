/**
 * ConvFusion 2.0 — 设置面 RPC（渠道 `/convfusion`）
 *
 * ## 它服务谁
 *
 * 【设置】-【ConvFusion】-【本地研究方法】（浏览器半边）通过**自己的同源 HTTP 路由**
 * 读/写用户定制：
 *
 * ```text
 * client: fetch('/dsh-convfusion/<endpoint>', { method: 'POST', body: { payload } })
 * host  : ctx.webServer.register({ kind: 'prefix', path: '/dsh-convfusion', handler })
 * ```
 *
 * ## 为什么不用 Connection 的 RPC 渠道（重要，别再试一次）
 *
 * 一开始用的是 `connection.rpc.handle('/convfusion', dispatch)` —— 它**看起来**是
 * 正确且更"原生"的选择，但在这版 DSH 上对**外部插件不可用**：
 *
 * ```js
 * // dsh-client-connection 内部
 * register(owner, channel, handler) {
 *   return owner.effect(() => owner.webServer.register(route), …)
 * }
 * ```
 *
 * 其中 `owner = this.ctx`（服务的 traceable ctx）。实测（见
 * `scripts/probe-settings-rpc-route.mjs`）：
 *
 * ```text
 * owner.fiber.name        : consumer          ← 看着是我们
 * owner[shadow].fiber.name: connection-plugin ← 但属性访问从 shadow 起步
 * owner.webServer         → THROW cannot get property "webServer" without inject
 * owner.get('webServer')  → true
 * ```
 *
 * 即：`owner` 上挂着指向 **connection 插件自身 fiber** 的 shadow，而那个 fiber 的
 * inject 里没有 `webServer`，于是 `owner.webServer` 必然抛错。**再加 inject 也救不了**
 * （四种组合实测全失败）。更糟的是异常被它自己的 `effect()` 吞掉：插件报告装配成功、
 * 路由却从未注册，浏览器 POST 落到 frontend-static 的 fallback 上收到 **HTTP 405**。
 *
 * `rpc.intercept('/api', …)` 也不行：共享通道只允许**一个** interceptor，已被
 * `dsh-api-gateway` 占用（`dsh-base` 层）。
 *
 * 所以采用与 `dsh-additive` 相同、且在本 profile 里**已验证可用**的做法：
 * 自己注册 `webServer` 前缀路由 + 浏览器同源 `fetch`，并用
 * `connection.requestRejection()` 过一遍 Harness 的信任/鉴权栅栏。
 *
 * ## 为什么定制内容不走 settings 文档
 *
 * 用户拍板：**设置里只配置文件名**，定制内容存独立文件。理由是可验证的：
 * 设置文档（`$DSH_HOME/settings.yaml`）每次提交都会整体序列化并落盘，
 * 47 个 Skill × 6 个可定制章节的正文塞进去会让它膨胀到不可读、不可手改。
 *
 * 因此本渠道分两类端点，不要混淆：
 *
 * | 类 | 落盘位置 | 端点 |
 * |---|---|---|
 * | **配置**（文件名 / 目录） | settings 文档（客户端经 `settingsScope` 读写，不经本渠道） | — |
 * | **定制内容**（章节覆盖文本） | `$DSH_HOME/convfusion/<file>.json` | `customization/*` |
 *
 * ## v2 与 v0.1.5 的结构差异（重建时最容易错的地方）
 *
 * v0.1.5 的层级是 `模块 → 提示词节点`（8 模块 / 110 节点，管线里的 Python 提示词）。
 * v2 没有模块，**Skill 库有类别**，层级是：
 *
 * ```text
 * 类别（taxonomy 的 9 个大类）
 *   └── 研究方法 Skill（如 research-gap-analysis）
 *         └── 可定制章节（Purpose / When to Use / Research Method / …）
 * ```
 *
 * 所以 v0.1.5 的 `methodTemplates[module][promptId]` 在 v2 里就是
 * `customizations[skillId][section]` —— 存储形态没变，变的只是键的语义。
 */

import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, join as joinPath, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  CONVFUSION_API_KEY_ENV,
  OPENALEX_API_KEY_ENV,
  defaultServerUrl,
  serverUrlPresets,
} from './config.js'
import { HOST_PROTOCOL, HOST_PROTOCOL_FIELD } from './protocol.js'
import type { SkillCustomizationStore } from './research/skill-customization.js'
import type { PaidBriefStore } from './research/paid-briefs.js'
import {
  CUSTOMIZABLE_SECTIONS,
  clearAllCustomizations,
  listCustomizationPoints,
  systemLibraryStatus,
} from './research/skill-customization.js'
import { effectiveSkillContentById } from './research/library.js'
import {
  readReviewFile,
  safeDirName,
  scanReviewFiles,
  writeFileUnique,
} from './research/workspace-sync.js'
import type { Config } from './config.js'
import {
  describeConvFusionKey,
  describeOpenAlexKey,
  redactConfig,
  resolveConvFusionApiKey,
  resolveCustomizationPath,
  resolveServerUrl,
  type SecretField,
} from './config.js'
import {
  acceptInvitation,
  createProject,
  fetchAcceptProposal,
  fetchAccount,
  fetchProjectArchive,
  fetchProjectFileBytes,
  fetchProjectFiles,
  fetchFeeSuggestion,
  fetchProposals,
  fetchPropose,
  fetchRejectProposal,
  fetchTokenBalance,
  fetchWorkBrief,
  fetchWorkList,
  fetchWorkSummary,
  normalizeApiKey,
  normalizeBaseUrl,
  fetchUsage,
  fetchProject,
  probeServerHealth,
  publishProject,
  readStateVersion,
  SERVER_TIMEOUT_MS,
  ServerError,
  uploadReviewFiles,
  uploadProjectFiles,
  uploadResearchState,
  type FetchLike,
  type FeeSuggestion,
  type MentorshipContract,
  type MentorshipProposal,
  type ServerAccount,
  type TokenBalance,
  type WorkBrief,
  type WorkItem,
} from './server-client.js'
import { isResearchWorkspace, researchWorkspaceOf } from './research/workspace.js'
import { latestTurnReport } from './research/progress-bridge.js'
import { buildWorkspaceProgress, captureProgress } from './research/progress.js'
import type { ProgressCountRow } from './research/progress.js'
import { buildPublishContent } from './research/publish-content.js'
import {
  buildUploadPlan,
  planUploadBatches,
  type UploadPlan,
} from './research/upload-selection.js'
import {
  createMemoryPublishedStore,
  type PublishedRecord,
  type PublishedStore,
} from './research/published-store.js'
import type { WorkspaceProgress } from './research/progress.js'
import { findTectonic, tectonicVersion, TECTONIC_ENV } from './research/latex-compile.js'

/**
 * 设置面的 HTTP 路由前缀（客户端必须用同一个）。
 *
 * 用 `dsh-` 前缀避免与 Harness 自己的路径空间冲突（同 `dsh-additive` 的做法）。
 */
export const SETTINGS_ROUTE_PREFIX = '/dsh-convfusion'

/** 请求体上限（状态是只读的，写请求也很小；4 MiB 足够且能挡住误用）。 */
export const SETTINGS_MAX_BODY_BYTES = 4 * 1024 * 1024

/** 统一信封（Connection 的 `ConnectionRpcResult`）。 */
export type SettingsRpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, never> } }

function fail(code: string, message: string): SettingsRpcResult {
  return { ok: false, error: { code, message, details: {} } }
}

/* ════════════════════════════════════════════════════════════════════════
 * 状态视图（设置页唯一的数据来源）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个可定制章节在设置页里的形态。 */
export interface SettingsSection {
  /** 章节标题（`Research Method` 等）。 */
  section: string
  /** 系统原文（只读展示 —— 让用户看得见自己在覆盖什么）。 */
  base: string
  /** 是否已被用户覆盖。 */
  overridden: boolean
  /** 用户当前的覆盖文本（未覆盖时缺省）。 */
  userText?: string
}

/** 一个研究方法 Skill 在设置页里的形态。 */
export interface SettingsSkill {
  /** Skill id。 */
  skillId: string
  /** 显示名。 */
  skillName: string
  /** 唯一编号（`CxxPyy`）—— 界面展示与排序用。 */
  code?: string
  /** 中文名 —— 界面展示用。 */
  label?: string
  sections: SettingsSection[]
  /** 该 Skill 已覆盖的章节数。 */
  overriddenCount: number
}

/** 一个类别（设置页的一级分组）在设置页里的形态。 */
export interface SettingsCategory {
  categoryId: string
  categoryName: string
  /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
  code?: string
  /** 类别中文名（如「文献」）。 */
  label?: string
  skills: SettingsSkill[]
  /** 该类别下已覆盖的可定制项数量。 */
  overriddenCount: number
  /** 该类别下的可定制项总数。 */
  pointCount: number
}

/** 文献检索凭据的**可用性**（只有布尔与来源，**没有密钥**）。 */
export interface RetrievalKeyStatus {
  configured: boolean
  source: 'settings' | 'env' | 'none'
  /** 提供 Key 的环境变量名（仅提示，不是值）。 */
  envVar: string
}

/**
 * 把宿主工作区注册表的**原始实体**归一成纯数据。
 *
 * 规则照抄 `dsh-additive` 的 `listWorkspaces`（那套已经在跑，行为经过验证）：
 *
 * ```text
 * ① path 必填，取不到 → 跳过该条
 * ② id 缺失 → 回退为 path
 * ③ 去重：id 或 path 任一已出现 → 跳过
 * ④ 顺序 = 注册表顺序（list() 不重排），与侧边栏那份清单一致
 * ```
 *
 * 只做纯数据归一：目录是否存在 / 真身路径由 fs 探测（见 `work/mine`），
 * 标题的友好缺省也留给端点（研究根永远叫 `workspace`，不能拿它当标题）。
 */
export function normalizeWorkspaceEntities(
  entities: ReadonlyArray<{ id?: unknown; title?: unknown; path?: unknown; updatedAt?: unknown }>,
): Array<{ id: string; title: string; path: string; updatedAt: string }> {
  const out: Array<{ id: string; title: string; path: string; updatedAt: string }> = []
  const seen = new Set<string>()
  for (const entity of entities) {
    const path = typeof entity?.path === 'string' ? entity.path.trim() : ''
    if (!path) continue
    const id = (typeof entity?.id === 'string' && entity.id.trim() ? entity.id : path).trim()
    if (seen.has(id) || seen.has(path)) continue
    seen.add(id)
    seen.add(path)
    out.push({
      id,
      title: typeof entity?.title === 'string' ? entity.title : '',
      path,
      updatedAt: typeof entity?.updatedAt === 'string' ? entity.updatedAt : '',
    })
  }
  return out
}

/**
 * **本机**的一项研究工作（【研究工作 · 我的】的一行）。
 *
 * 与 {@link WorkItem} 的区别：那个是**服务器上**别人公开的研究工作，这个是
 * **本机工作区**里的研究项目 —— 数据全部来自磁盘，不需要登录、不发网络请求。
 */
export interface LocalWorkItem {
  /** 工作区注册表 id（稳定；路径可能被重命名）。 */
  id: string
  /** 显示名（注册表标题，缺省用研究根目录名）。 */
  title: string
  /** 会话工作区路径（用户的工作区）。 */
  path: string
  /** 研究根目录（`<会话工作区>/workspace`，旧布局下可能是会话工作区本身）。 */
  researchRoot: string
  /** 注册表里的目录已消失。 */
  missingDir: boolean
  /**
   * 研究阶段：稳定 `id` + 宿主给的原始 `label`。
   *
   * ⚠️ 展示名**由客户端按 locale 翻译**（上游约定：宿主只给稳定 code/数值），
   * 客户端用 `translateOr(t, \`progress.stage.${id}\`, label)`，与「研究进展」面板同款。
   */
  stage: { id: string; label: string } | null
  /** 成熟度均值（0..1），与「研究进展」面板同一个数。 */
  overall: number
  /** 可数资产（证据 / 主张 / 计划 …）：稳定 key + 计数 + 结构化 detail，与进展面板同一份口径。 */
  counts: ProgressCountRow[]
  /** 是否已有论文正文。 */
  paper: boolean
  /** 当前推进判定（clear / ambiguous / blocked / unknown）。 */
  clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
  /** 注册表最近一次变更时刻（ISO）。 */
  updatedAt: string
  /**
   * 是否**在网络上可见**（`visibility = PUBLISHED`）。
   *
   * ⚠️ 判据是**服务器**（`GET /projects/{id}`），不是本地映射：本地记录只说明"我传过"，
   * 服务器删项目或取消发布时它不会自己更新。核对不通（离线/未登录）时退回本地记录，
   * 因为"读不到"不等于"服务器上没有"。
   */
  published: {
    projectId: string
    version: number
    updatedAt: string
    /** 记录属于哪台服务器（与当前生效地址不一致时界面要提示）。 */
    serverUrl: string
    /** 记录属于哪个账号。 */
    accountId: string
  } | null
}

/** 服务器上的账号（`GET /api/v1/auth/me`）。**不含任何凭据。** */
export interface AccountWire {
  id: string
  email: string
  displayName: string
  status: string
  /** `RESEARCHER` / `MENTOR` / `ADMIN`（可多个）。 */
  roles: string[]
}

/**
 * 【ConvFusion.com】的登录状态 —— **回给浏览器的那一份**。
 *
 * ⚠️ 这里只有"有没有凭据 + 是哪个账号"，**永远不会**出现 `cf_live_…` 明文。
 * 明文只在宿主内存里被 {@link resolveConvFusionApiKey} 取出、直接用于 HTTP 请求头。
 *
 * `account` 只有在**联网验证过**之后才非空：
 *
 * - `account/state` 不联网（服务器挂了也要能打开设置页）→ `account: null`；
 * - `account/verify` / `login` / `register` 联网成功 → 填入账号。
 */
export interface AccountState {
  /** 生效的服务器地址（不含 `/api/v1`）。 */
  serverUrl: string
  /** 当前环境的**默认**地址（界面占位符 / 提示用）。 */
  defaultServerUrl: string
  /** 这个地址是哪来的：设置文档 / 环境变量 / 环境配置文件 / 内置兜底。 */
  serverUrlSource: 'settings' | 'env' | 'config' | 'default'
  /**
   * **两个环境的地址**（开发 / 生产），给设置页那两个快捷按钮用。
   *
   * ⚠️ 由宿主按配置文件解析（`serverUrlPresets`）—— 界面不自己写死域名，
   * 否则部署把地址换成自有域名后按钮会指错地方。
   */
  serverPresets: Record<'development' | 'production', string>
  /**
   * 当前环境（开发 / 生产）。
   *
   * ⚠️ **地址随环境而变**：开发是 `http://localhost:8000`、生产是
   * `https://convfusion.com`（见 `src/server-env.ts`）。界面必须说清现在连的是哪一边，
   * 否则"在本机测通了"和"线上能用"会被混为一谈。
   */
  environment: 'development' | 'production'
  /** 地址与环境互相矛盾（生产却指向本机 / 开发却指向线上）。 */
  serverUrlMismatch: boolean
  /** 是否已有可用凭据（**只报可用性，不回传凭据**）。 */
  keyConfigured: boolean
  keySource: 'settings' | 'env' | 'none'
  /** 凭据的环境变量名（仅提示）。 */
  apiKeyEnvVar: string
  /** 已认证账号；未验证或未登录时为 null。 */
  account: AccountWire | null
  /**
   * Token 余额（登录后显示；未验证时为 null）。
   *
   * ⚠️ **尽力而为**：余额接口单独失败（网络抖动）不会让登录失败 —— 那种时候这里是 null，
   * 界面不显示余额，用户点「重新验证」即可。**绝不**把拿不到余额显示成 0。
   */
  tokens: TokenBalance | null
}

/**
 * 组装登录状态（纯函数，可离线验证）。
 *
 * @param config 生效配置（**可含明文 Key** —— 本函数只读它的"有没有"，不把它放进结果）
 * @param env 环境变量（测试注入）
 * @param account 已验证的账号（未验证传 null）
 * @param options.fresh 忽略环境配置文件的进程内缓存（测试用）
 */
export function buildAccountState(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
  account: AccountWire | null = null,
  options: { fresh?: boolean; tokens?: TokenBalance | null } = {},
): AccountState {
  const server = resolveServerUrl(config, env, options)
  const key = describeConvFusionKey(config, env)
  return {
    serverUrl: server.url,
    defaultServerUrl: defaultServerUrl(env),
    serverUrlSource: server.source,
    serverPresets: serverUrlPresets(env, options),
    environment: server.environment,
    serverUrlMismatch: server.mismatched,
    keyConfigured: key.configured,
    keySource: key.source,
    apiKeyEnvVar: CONVFUSION_API_KEY_ENV,
    account,
    tokens: options.tokens ?? null,
  }
}

/**
 * 一个**本地外部依赖**的可用性（目前只有 tectonic —— 它不在 Node 生态里，用户可能没装）。
 *
 * 论文写到最后要出 LaTeX/PDF，编译由 tectonic 完成；它不是 npm 依赖，装没装只有本机能查。
 * 因此设置页需要能看到"有没有 / 在哪 / 什么版本 / 没装怎么办"。
 */
export interface LocalDependencyStatus {
  /** 依赖名（展示用）。 */
  name: string
  /** 是否可用。 */
  available: boolean
  /** 可执行文件绝对路径（可用时）。 */
  path?: string
  /** 版本字符串（可用时）。 */
  version?: string
  /** 是否由环境变量覆盖指定。 */
  viaEnv: boolean
  /** 覆盖用的环境变量名。 */
  envVar: string
  /** 稳定用途码；展示文字由浏览器 locale 决定。 */
  purposeCode: string
}

/** 本机外部依赖的检测结果。 */
export interface LocalDependencyReport {
  tectonic: LocalDependencyStatus
}

/**
 * 检测本地外部依赖。
 *
 * **每次调用都重新探测**（用户可能刚装完就回来看），且只做只读检查（`--version`）。
 */
export function describeLocalDependencies(env: NodeJS.ProcessEnv = process.env): LocalDependencyReport {
  const override = (env[TECTONIC_ENV] ?? '').trim()
  const bin = findTectonic(env)
  return {
    tectonic: {
      name: 'tectonic',
      available: Boolean(bin),
      ...(bin ? { path: bin } : {}),
      ...(bin ? { version: tectonicVersion(bin) } : {}),
      viaEnv: Boolean(override && bin === override),
      envVar: TECTONIC_ENV,
      purposeCode: 'latex-pdf-compile',
    },
  }
}

/** 【本地研究方法】整页状态。 */
export interface SettingsState {
  /** 宿主协议版本；与客户端内联值不一致 = 宿主未重启。 */
  protocol: number
  /**
   * 生效配置（文件名的权威来源仍是 settings 文档）。
   *
   * ⚠️ **已剔除 secret**（见 {@link redactConfig}）：这个对象会经 HTTP 返回浏览器。
   */
  config: Omit<Config, SecretField>
  /** 定制文件的解析结果（展示"定制存在哪里"）。 */
  file: {
    path: string
    exists: boolean
    /** 已覆盖的 Skill 数。 */
    skillCount: number
    /** 已覆盖的"Skill × 章节"数。 */
    entryCount: number
  }
  /** 系统 Skill Library（包内只读资产）。 */
  library: { root: string; skillCount: number }
  /** 允许定制的章节白名单（UI 用它解释"为什么只有这些能改"）。 */
  customizableSections: readonly string[]
  categories: SettingsCategory[]
  /**
   * OpenAlex Key 是否可用。
   *
   * ⚠️ 这里**刻意只给可用性**：密钥本身是 `role('secret')` 字段，
   * 远端读取会被 `redactSecrets` 摘掉，界面也从不持有明文。
   */
  retrieval: RetrievalKeyStatus
  /** 【ConvFusion.com】的登录状态（服务器地址 + 是否有凭据 + 已验证的账号）。 */
  account: AccountState
  /** 本地外部依赖（tectonic 等）的可用性 —— 【系统设置】页展示。 */
  dependencies: LocalDependencyReport
}

/**
 * 组装整页状态（纯函数：给定 store 与配置即可算出，便于离线验证）。
 *
 * 分组在这里做，客户端只负责渲染 —— 设置页不该自己理解 Skill 的存储结构。
 */
export function buildSettingsState(
  config: Config,
  store: SkillCustomizationStore,
  resolvePath: (c: Config) => string = resolveCustomizationPath,
  probeDependencies: () => LocalDependencyReport = describeLocalDependencies,
  env: NodeJS.ProcessEnv = process.env,
): SettingsState {
  const customizations = store.load()
  const path = resolvePath(config)

  const categories: SettingsCategory[] = listCustomizationPoints('', customizations).map((cat) => {
    const bySkill = new Map<string, SettingsSkill>()
    for (const point of cat.points) {
      const skill = bySkill.get(point.skillId) ?? {
        skillId: point.skillId,
        skillName: point.skillName,
        ...(point.skillCode ? { code: point.skillCode } : {}),
        ...(point.skillLabel ? { label: point.skillLabel } : {}),
        sections: [],
        overriddenCount: 0,
      }
      skill.sections.push({
        section: point.section,
        base: point.base,
        overridden: point.overridden,
        ...(point.userText ? { userText: point.userText } : {}),
      })
      if (point.overridden) skill.overriddenCount += 1
      bySkill.set(point.skillId, skill)
    }
    return {
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      ...(cat.categoryCode ? { code: cat.categoryCode } : {}),
      ...(cat.categoryLabel ? { label: cat.categoryLabel } : {}),
      // ⚠️ 按**编号**排序（`CxxPyy`），不是 skillName 字母序 ——
      // 这是设置页技能列表的实际顺序来源；字母序会让实验阶段的方法排到最前面。
      skills: [...bySkill.values()].sort((a, b) => (a.code ?? 'Z').localeCompare(b.code ?? 'Z')),
      overriddenCount: cat.overriddenCount,
      pointCount: cat.points.length,
    }
  })

  const entryCount = Object.values(customizations).reduce(
    (n, sections) => n + Object.keys(sections).length,
    0,
  )

  // 存在性检查要容错：路径可能指向尚未创建的目录
  let exists = false
  try {
    exists = existsSync(path)
  } catch {
    exists = false
  }

  return {
    // 宿主内存中的协议版本（与客户端 bundle 内联的那份对比，见 protocol.ts）
    [HOST_PROTOCOL_FIELD]: HOST_PROTOCOL,
    // 注意 redactConfig：这条路不经过 DSH 的远端脱敏，必须自己摘掉 secret
    config: redactConfig(config),
    file: { path, exists, skillCount: Object.keys(customizations).length, entryCount },
    library: systemLibraryStatus(),
    customizableSections: [...CUSTOMIZABLE_SECTIONS],
    categories,
    retrieval: {
      ...describeOpenAlexKey(config),
      envVar: OPENALEX_API_KEY_ENV,
    },
    // 【ConvFusion.com】：只给"服务器地址 + 有没有凭据"。⚠️ 不联网、不带凭据。
    account: buildAccountState(config, env),
    dependencies: probeDependencies(),
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 分发
 * ════════════════════════════════════════════════════════════════════════ */

/** 文件内容指纹（与服务器 `FileMetadata.sha256` 同格式）。 */
async function fileDigest(absPath: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(absPath)
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`
}

/** 设置面依赖（由插件入口注入，便于离线测试）。 */
export interface SettingsRpcDeps {
  /** 当前生效配置（每次调用重新取，文件改名后立即生效）。 */
  getConfig: () => Config
  /** 定制存储（其路径解析同样跟随最新配置）。 */
  store: SkillCustomizationStore
  /** 覆盖路径解析（测试用；缺省按配置解析）。 */
  resolvePath?: (config: Config) => string
  /**
   * 会话 id → 该会话的工作区（**权威来源**：`ctx.sessions.get(id).header.cwd`）。
   *
   * 进度报告必须按**会话自己的工作区**判定"这是不是一个研究项目"，
   * 而不是按插件进程的启动目录 —— 否则会把另一个项目的上下文/进展显示到本会话
   * （2026-09 实测发生）。
   */
  resolveSessionWorkspace?: (sessionId: string) => string | undefined
  /**
   * 把配置补丁写回 **settings 用户层**（保存 API Key / 服务器地址）。
   *
   * 由插件入口接到 `settingsScope.update()`。缺省 = 设置存储不可用 —— 这时登录必须
   * **明确失败**（`storage-unavailable`），而不是"看着登录成功、重启后没了"。
   */
  setConfig?: (patch: Partial<Config>) => Promise<void>
  /**
   * 连接 ConvFusion.com 用的网络实现（测试注入假 fetch）。
   *
   * ⚠️ 插件自身**从不**在浏览器侧发这些请求：服务器未开 CORS，且凭据是 secret。
   * 见 `server-client.ts` 文件头。
   */
  fetchImpl?: FetchLike
  /** 环境变量（测试注入；缺省 `process.env`）。 */
  env?: NodeJS.ProcessEnv
  /**
   * 「这一项简报已经买过」的本地记录（`paid-briefs.ts`）。
   *
   * 服务器只在 `/brief` 的响应里给 `charged_tokens`，列表/摘要**不含**这个状态，
   * 所以"点之前要不要提醒"只能靠这份本地记忆。缺省 = 没有记忆（每次都提醒，
   * 行为保守但不静默扣费）。
   */
  paidBriefStore?: PaidBriefStore
  /** 服务器请求超时（测试用小值）。 */
  serverTimeoutMs?: number
  /**
   * 「本机研究工作 ↔ 服务器项目」的映射存储。
   *
   * 缺省 = 内存表（重启即失，只用于精简环境/测试）——真正的落盘由插件入口注入。
   */
  publishedStore?: PublishedStore
  /**
   * 本机**工作区注册表**里的条目（DSH `ctx.workspaceRegistry.list()` 的投影）。
   *
   * 用于【研究工作 · 我的】：只列**含有效 research workspace** 的工作区
   * （过滤与进度计算在本文件里做，入口只负责把注册表读出来）。
   * 缺省 = 这台机器上没有工作区注册表（列表为空，不报错）。
   */
  listLocalWorkspaces?: () => Promise<{
    /** DSH 是否真的提供了工作区注册表（false = 精简 profile / 服务缺失）。 */
    available: boolean
    /** 不可用时的原因（直接给界面看，用于区分"没数据"和"读不到"）。 */
    reason?: string
    items: Array<{ id: string; title: string; path: string; updatedAt: string }>
  }>
  /**
   * DSH 的**目录选择器**（`ctx.directoryPicker` 能力 seam）。
   *
   * 只有 `native` 能力才能拿到"用户选的绝对路径"；`browse` 只有列目录/建目录原语，
   * 未知能力按 DSH 的约定**隐藏**选择入口而不是硬凑 —— 所以这里返回能力描述，
   * 让界面自己决定是给【选择目录…】还是退回手填路径。
   */
  pickDirectory?: () => Promise<{
    /** false = 当前环境没有可用的系统选择器（界面退回手填）。 */
    supported: boolean
    /** `supported` 时的绝对路径；null = 用户取消（**不是错误**）。 */
    path: string | null
    /** 能力种类，供诊断与提示文案使用。 */
    kind?: string
  }>
  /** 只探测"有没有可用的系统选择器"，**不打开**任何窗口（`probe: true` 用）。 */
  probeDirectoryPicker?: () => Promise<{ supported: boolean; path: null; kind?: string }>
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 正整数（费用类字段：0 / 负数 / 非数字一律视为无效）。 */
function asInt(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0
}

/** 普通对象读取（非对象 → null，不抛）。 */
function asRecordLike(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/**
 * 建立一个端点分发器。
 *
 * 端点表（客户端约定，改名即破坏设置页）：
 *
 * | endpoint | payload | 说明 |
 * |---|---|---|
 * | `state` | `{}` | 整页状态（类别 → Skill → 章节） |
 * | `dependencies/check` | `{}` | 重新探测本地外部依赖（tectonic），供【系统设置】的"重新检查" |
 * | `customization/save` | `{ skillId, section, text }` | 写入覆盖（空文本 = 清除） |
 * | `customization/reset` | `{ skillId, section }` | 清除一个章节的覆盖 |
 * | `customization/resetSkill` | `{ skillId }` | 清除一个 Skill 的全部覆盖 |
 * | `customization/resetAll` | `{}` | 清除全部定制（回到全系统原文） |
 * | `account/state` | `{}` | 【ConvFusion.com】登录状态（**不联网**） |
 * | `account/probe` | `{ serverUrl? }` | **只测连通性**（匿名 `/health`，最长 8 秒）；`reachable` 是结果不是错误 |
 * | `account/login` | `{ apiKey, serverUrl? }` | 用 API Key 登录（联网验证后落盘） |
 * | `account/register` | `{ invitationCode, email, displayName, serverUrl? }` | 凭邀请码注册并登录 |
 * | `account/verify` | `{}` | 用已保存的凭据重新验证身份（联网） |
 * | `account/logout` | `{}` | 清除凭据（账号信息随之消失） |
 * | `account/tokens` | `{}` | 重新读 Token 余额（登录后显示 / 花完 Token 后刷新） |
 * | `work/mine` | `{}` | **本机**研究工作（有效研究项目的工作区；不联网、不需登录） |
 * | `work/uploadPlan` | `{ id }` | 发布前的**上传计划**（分类/体积/默认选择）+ 用量与配额 |
 * | `work/publish` | `{ id, selection?, remember? }` | 发布：建项目 → 传状态 → **传附件** → 发布 |
 * | `work/list` | `{}` | 研究网络里已公开的研究工作（需登录；条数由服务器定） |
 * | `work/summary` | `{ projectId }` | 一项研究工作的摘要（免费） |
 * | `work/brief` | `{ projectId, intentKey }` | 一项研究工作的简报（非 owner 花 1 Token） |
 * | `mentor/fee-suggestion` | `{}` | 默认指导费用建议（100 / 20 / 80，导师可改） |
 * | `mentor/propose` | `{ projectId, guidanceScope, totalFee, depositAmount, successPaymentAmount, successCondition }` | 发起指导提案（免费；同一项目同一导师只能有一个生效提案） |
 * | `mentor/list` | `{}` | 我涉及的指导提案（我发起的 + 我收到的）；ACCEPTED 的会附 `reviewFiles`（导师已上传几份指导结果） |
 * | `mentor/accept` | `{ proposalId, intentKey }` | 接受指导（研究者）→ **冻结押金**、建合同与关系 |
 * | `mentor/reject` | `{ proposalId }` | 拒绝指导（研究者） |
 * | `mentor/pickDirectory` | `{}` / `{ probe:true }` | 开系统目录选择器（`native` 才可用）；`probe` 只问能力不开窗 |
 * | `mentor/downloadState` | `{ projectId, prefix }` | 【下载】对话框一次拿齐：预检（文件数 / 体积 / 预计文件名）+ **全部**可选工作区 |
 * | `mentor/download` | `{ projectId, workspaceId, prefix }` | 只把 ZIP 存进所选工作区（**不解压、不覆盖**，同名加序号） |
 * | `mentor/scanReview` | `{ dir }` | 列出工作区 `review/` 下的文件（上传源） |
 * | `mentor/upload` | `{ projectId, dir, paths:[relPath] }` | 按原相对路径回传 `review/**` |
 *
 * ⚠️ **凭据纪律**（改动这里前先读 `server-client.ts` 文件头）：
 * 服务器地址与 API Key 只出现在**宿主**与**服务器**之间；本渠道的任何返回值都不得
 * 包含 `cf_live_…`。`account/*` 一律返回 {@link AccountState}（只有可用性 + 账号信息）。
 */
export function createSettingsRpcHandler(
  deps: SettingsRpcDeps,
): (endpoint: string, payload: unknown) => Promise<SettingsRpcResult> {
  const env = (): NodeJS.ProcessEnv => deps.env ?? process.env
  const state = (): SettingsState =>
    buildSettingsState(
      deps.getConfig(),
      deps.store,
      deps.resolvePath ?? resolveCustomizationPath,
      describeLocalDependencies,
      env(),
    )

  /** 服务器请求参数（统一注入 fetch / 超时 / 环境变量）。 */
  const netOptions = (): Parameters<typeof fetchAccount>[2] => ({
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.serverTimeoutMs === undefined ? {} : { timeoutMs: deps.serverTimeoutMs }),
  })

  /**
   * 当前凭据对应的账号 id（"这一项简报买过没有"要按**账号**分开记）。
   *
   * 缓存的键**含凭据**：同一台服务器换账号登录绝不会命中上一个人的记录 ——
   * 复用别人的"已买过"会导致**静默扣费**，正是要避免的事。
   *
   * 解析失败一律返回 `null`（= 不知道）：界面照常弹确认框。宁可多问一次。
   */
  const accountIdCache = new Map<string, string>()
  const resolveAccountId = async (base: string, apiKey: string): Promise<string | null> => {
    const cacheKey = `${base}\u0000${apiKey}`
    const cached = accountIdCache.get(cacheKey)
    if (cached) return cached
    try {
      const me = await fetchAccount(base, apiKey, netOptions())
      accountIdCache.set(cacheKey, me.id)
      return me.id
    } catch {
      return null
    }
  }

  /**
   * 给列表补上"这一项的简报已经买过"（本地记忆，见 `paid-briefs.ts`）。
   *
   * 拿不到账号时**不标注**（`briefOpened` 保持缺省）—— 界面会照常提醒，
   * 只是多问一次，而不会漏问。
   */
  const annotateOpenedBriefs = async (base: string, apiKey: string, items: WorkItem[]): Promise<WorkItem[]> => {
    if (!deps.paidBriefStore || items.length === 0) return items
    const accountId = await resolveAccountId(base, apiKey)
    if (!accountId) return items
    return items.map((item) => ({
      ...item,
      briefOpened: deps.paidBriefStore!.has(base, accountId, item.projectId),
    }))
  }

  /**
   * 把凭据（以及可选的服务器地址）写回设置，并返回**写完之后**的登录状态。
   *
   * ⚠️ 不能写回后再 `getConfig()` 读一遍：`settingsScope.update()` 是异步提交，
   * `watch` 也是异步触发的 —— 立刻重读会拿到旧值，界面会显示"未登录"，看起来像失败。
   * 所以这里用 patch 与旧配置**显式合并**出返回值。
   */
  const persist = async (
    patch: Partial<Config>,
    account: AccountWire | null,
    tokens: TokenBalance | null = null,
  ): Promise<SettingsRpcResult> => {
    if (!deps.setConfig) {
      return fail(
        'storage-unavailable',
        '设置存储当前不可用，无法保存 ConvFusion.com 凭据。请检查 DSH 的设置服务是否正常。',
      )
    }
    try {
      await deps.setConfig(patch)
    } catch (e) {
      return fail(
        'storage-unavailable',
        `保存凭据失败：${e instanceof Error ? e.message : String(e)}`,
      )
    }
    const merged: Config = { ...deps.getConfig(), ...patch }
    return { ok: true, value: buildAccountState(merged, env(), account, { tokens }) }
  }

  /**
   * 读余额，**尽力而为**：失败返回 null（不抛出）。
   *
   * 余额是登录成功的"附加信息"：把它做成硬依赖，会让一次网络抖动把已经成功的登录
   * 变成失败（用户看到的是"登录失败"，实际凭据已经验证通过并落盘）——
   * 那是最容易让人误判的形态。拿不到就不显示，用户点「重新验证」即可。
   */
  const tryBalance = async (base: string, apiKey: string): Promise<TokenBalance | null> => {
    try {
      return await fetchTokenBalance(base, apiKey, netOptions())
    } catch {
      return null
    }
  }

  /** 把 `ServerError` 变成设置面的失败信封（code 原样带出，界面据此给动作）。 */
  const serverFail = (e: unknown): SettingsRpcResult => {
    if (e instanceof ServerError) return fail(e.code, e.message)
    return fail('internal', e instanceof Error ? e.message : String(e))
  }

  /**
   * 定这次登录/注册要连哪台服务器。
   *
   * 请求里给了地址就用它（用户在界面上改过），否则用**当前生效**的地址 ——
   * 即 `resolveServerUrl` 的完整优先级（设置文档 > 环境变量 > 环境配置文件 > 内置兜底）。
   * 不能退化成"内置兜底"：那会让"没填地址"在生产环境里指向开发机。
   *
   * @throws {ServerError} `bad-url`
   */
  const requestBase = (raw: unknown): string => {
    const given = typeof raw === 'string' ? raw.trim() : ''
    if (given) return normalizeBaseUrl(given)
    return normalizeBaseUrl(resolveServerUrl(deps.getConfig(), env()).url)
  }

  /**
   * 本机研究工作的映射存储。
   *
   * 入口会注入**落盘**的实现；没注入时退回内存表（重启即失）——
   * 这样精简 profile / 测试里插件仍能工作，只是不会记住"已发布"。
   */
  const publishedStore: PublishedStore =
    deps.publishedStore ?? createMemoryPublishedStore()

  /**
   * 与"上次已上传的指纹"对比，算出**新增/变化**的文件。
   *
   * ⚠️ 服务器**不去重**（同路径重复上传 = 新行 + 新字节），所以「更新」只能靠
   * 本地指纹做增量 —— 否则每点一次「更新」，185 个文件就在服务器上多一份。
   */
  const diffAgainstUploaded = async (
    researchRoot: string,
    record: PublishedRecord | undefined,
  ): Promise<{ changed: string[]; unchanged: string[] }> => {
    const known = record?.files ?? {}
    const changed: string[] = []
    const unchanged: string[] = []
    for (const [relPath, digest] of Object.entries(known)) {
      const abs = resolve(researchRoot, relPath)
      if (!existsSync(abs)) continue // 本地已删除：这里不处理（服务器侧删除要显式 DELETE）
      const now = await fileDigest(abs)
      if (now === digest) unchanged.push(relPath)
      else changed.push(relPath)
    }
    return { changed, unchanged }
  }

  /**
   * 收集本机研究工作（注册表 → 有效研究项目 → 进展快照）。
   *
   * `work/mine` 与 `work/publish` 共用：**进度只算一次**（读盘不便宜），
   * 发布时就地把同一份快照组装成服务器的内容 Envelope。
   */
  const collectLocalWorks = async (): Promise<{
    available: boolean
    reason?: string
    items: LocalWorkItem[]
    sources: Map<string, { root: string; title: string; progress: WorkspaceProgress }>
  }> => {
    const listed = deps.listLocalWorkspaces
      ? await deps.listLocalWorkspaces()
      : { available: false, reason: '宿主未提供工作区注册表读取接口', items: [] }
    const skillContent = (id: string): string | undefined => effectiveSkillContentById(id, deps.store)
    const items: LocalWorkItem[] = []
    const sources = new Map<string, { root: string; title: string; progress: WorkspaceProgress }>()
    for (const w of listed.items) {
      /**
       * 目录真身 + 是否存在。
       *
       * ⚠️ 用 `realpath` 而不是直接用注册表里的字符串：注册表存的是**登记时的路径**，
       * 它可能是符号链接。Additive 的 `inspectWorkspaceDir` 就是同一语义 ——
       * 列表显示登记值，**实际读写走真身**。
       */
      let canonical = resolve(w.path)
      let isDir = false
      try {
        canonical = realpathSync(w.path)
        isDir = statSync(canonical).isDirectory()
      } catch {
        isDir = false
      }
      const missingDir = !isDir
      const root = researchWorkspaceOf(canonical)
      // 只列**有效**研究项目：目录不在、或没有 project.md / research-state.md 的都跳过
      if (missingDir || !isResearchWorkspace(root)) continue
      let progress: WorkspaceProgress | null = null
      try {
        progress = buildWorkspaceProgress(captureProgress(root, skillContent))
      } catch {
        /* 读不动就当"未知"，不把这个工作区从列表里抹掉 */
      }
      const title = w.title.trim() || basename(canonical)
      const record = publishedStore.get(root)
      if (progress) sources.set(w.id, { root, title, progress })
      items.push({
        id: w.id,
        // 缺省标题用**会话工作区**的目录名（`.../proj-b`），不是研究根
        // —— 研究根永远叫 `workspace`，拿它当标题等于每个项目同名
        title,
        // path 保留注册表里的**登记值**；researchRoot 是真身路径上的研究根
        path: w.path,
        researchRoot: root,
        missingDir,
        stage: progress?.progress.stage ?? null,
        overall: progress?.overall ?? 0,
        counts: progress?.counts ?? [],
        paper: progress?.paper ?? false,
        clarity: progress?.need.clarity ?? 'unknown',
        updatedAt: w.updatedAt,
        published: record
          ? {
              projectId: record.projectId,
              version: record.version,
              updatedAt: record.updatedAt,
              serverUrl: record.serverUrl,
              accountId: record.accountId,
            }
          : null,
      })
    }
    return {
      available: listed.available,
      ...(listed.reason ? { reason: listed.reason } : {}),
      items,
      sources,
    }
  }

  /**
   * 让「已在网络中」这个标记**以服务器为准**（本地记录只能说明"我传过"）。
   *
   * 服务器删了项目、或把项目取消发布，本地文件不会自己知道 —— 于是界面会一直挂着
   * 一个已经不存在的项目，点「更新」还会去写一个死掉的 `project_id`。所以列
   * 【研究工作 · 我的】时核一次（每个已记录的工作区一次 `GET /projects/{id}`）：
   *
   * | 服务器回答 | 显示标记 | 本地记录 |
   * |---|---|---|
   * | `visibility = PUBLISHED` | 是 | 回写 `serverVisibility` + `checkedAt` |
   * | 其它 visibility（如 `PRIVATE`） | 否 | 回写（下次发布仍复用同一项目） |
   * | `404`（项目已删） | 否 | **删掉**（否则永远撞死 id） |
   * | 查不通（离线/未登录/超时） | 按本地记录 | 不动 —— "读不到"不等于"服务器上没有" |
   */
  const verifyPublished = async (
    items: LocalWorkItem[],
    apiKey: string | null,
    base: string,
  ): Promise<LocalWorkItem[]> => {
    if (!apiKey) return items
    const targets = items.filter((it) => it.published && it.published.serverUrl === base)
    if (targets.length === 0) return items
    const checkedAt = new Date().toISOString()
    const checks = await Promise.all(
      targets.map(async (it) => {
        try {
          const project = await fetchProject(base, apiKey, it.published!.projectId, netOptions())
          return { id: it.id, root: it.researchRoot, visibility: project.visibility, gone: false }
        } catch (e) {
          // 只有"服务器明确说不存在"才算消失；网络/超时/其它错误一律不下结论
          return {
            id: it.id,
            root: it.researchRoot,
            visibility: null,
            gone: e instanceof ServerError && e.code === 'not-found',
          }
        }
      }),
    )
    const byId = new Map(checks.map((c) => [c.id, c]))
    // 服务器说什么就写回什么（`serverVisibility` / `checkedAt`）—— 本地记录里的
    // "我传过什么"（files / selection / version）在核对时不改
    for (const c of checks) {
      if (c.visibility === null && !c.gone) continue
      const record = publishedStore.get(c.root)
      if (!record) continue
      if (c.gone) publishedStore.remove(c.root)
      else publishedStore.set(c.root, { ...record, serverVisibility: c.visibility!, checkedAt })
    }
    return items.map((it) => {
      const c = byId.get(it.id)
      if (!c) return it
      if (c.gone) return { ...it, published: null }
      if (c.visibility && c.visibility !== 'PUBLISHED') return { ...it, published: null }
      return it
    })
  }

  /**
   * 服务器的工作列表（【可指导】）也是**服务器**的状态；顺带把本地记录对齐。
   *
   * 列表里出现的项目必然是"在网络上可见"的，所以若它的 `project_id` 正好是本机
   * 一条发布记录（自己的工作也出现在列表里），就把那条记录刷新为 `PUBLISHED`。
   * 列表是抽样、不是全集，所以**只在命中时更新，绝不由"没出现"推断删除**。
   */
  const syncRecordsFromWorkList = (items: WorkItem[]): void => {
    if (items.length === 0) return
    const ids = new Set(items.map((it) => it.projectId))
    const checkedAt = new Date().toISOString()
    for (const [root, record] of Object.entries(publishedStore.all())) {
      if (!ids.has(record.projectId)) continue
      if (record.serverVisibility === 'PUBLISHED' && record.checkedAt) continue
      publishedStore.set(root, { ...record, serverVisibility: 'PUBLISHED', checkedAt })
    }
  }

  return async (endpoint: string, payload: unknown): Promise<SettingsRpcResult> => {
    const p = (payload ?? {}) as Record<string, unknown>
    try {
      switch (endpoint) {
        case 'state':
          return { ok: true, value: state() }

        /**
         * 重新探测本地外部依赖。
         *
         * 用户可能刚装完 tectonic 就回到设置页 —— 整页 `state` 重载较重，
         * 这里只返回依赖检测结果，供"重新检查"按钮就地刷新。
         */
        case 'dependencies/check':
          return { ok: true, value: describeLocalDependencies() }

        /* ── 研究进展（顶部「研究进展」按钮的面板）─────────────────────────
         *
         * `v2-Progress.md` 的三段式，但改由**顶部按钮**承载（2026-09 用户拍板）：
         * 回合尾部的链式槽位（`conversation.chat.turnTail`）的 selector **拿不到会话身份**
         * （owner 只有 `{turn, seq, openFile}`），只能靠进程级全局变量猜"当前是不是研究会话"，
         * 于是会命中**所有**会话；按钮挂在 `conversation.session.header.utilities`
         * （session 作用域，组件拿得到自己的 `sessionId`），判定天然按会话正确。
         *
         * 端点只落在**当前会话自己的工作区**上（`ctx.sessions.get(id).header.cwd`）：
         *
         * ```text
         * research=false → report/lastTurn 都是 null，界面连按钮都不显示
         * research=true  → report = 从磁盘重算的"现在到哪了"
         *                  lastTurn = 本会话最近一轮的"这轮改变了什么"（可能还没有）
         * ```
         */
        case 'progress/workspace': {
          const sessionId = asString(p.sessionId)
          const sessionWorkspace = deps.resolveSessionWorkspace?.(sessionId)
          // 研究根目录（新布局 = 会话工作区下的 `workspace/`，见 workspace.ts）
          const root = sessionWorkspace ? researchWorkspaceOf(sessionWorkspace) : undefined
          if (!root || !isResearchWorkspace(root)) {
            return {
              ok: true,
              value: {
                protocol: HOST_PROTOCOL,
                sessionId,
                workspace: sessionWorkspace ?? null,
                research: false,
                report: null,
                lastTurn: null,
              },
            }
          }
          // 过程判定要读**生效**的能力正文（用户可在设置里定制 `research-process`）
          const skillContent = (id: string): string | undefined => effectiveSkillContentById(id, deps.store)
          const snapshot = captureProgress(root, skillContent)
          return {
            ok: true,
            value: {
              protocol: HOST_PROTOCOL,
              sessionId,
              workspace: root,
              research: true,
              report: buildWorkspaceProgress(snapshot),
              lastTurn: latestTurnReport(sessionId) ?? null,
            },
          }
        }

        case 'customization/save': {
          const skillId = asString(p.skillId)
          const section = asString(p.section)
          if (!skillId || !section) return fail('bad-request', 'skillId 与 section 都不能为空。')
          if (!CUSTOMIZABLE_SECTIONS.includes(section)) {
            // 白名单之外的章节不允许覆盖：Skill 的结构是可靠性基础
            return fail('not-customizable', `\`${section}\` 不是允许定制的章节。`)
          }
          const text = typeof p.text === 'string' ? p.text : ''
          deps.store.set(skillId, section, text)
          return { ok: true, value: state() }
        }

        case 'customization/reset': {
          const skillId = asString(p.skillId)
          const section = asString(p.section)
          if (!skillId || !section) return fail('bad-request', 'skillId 与 section 都不能为空。')
          deps.store.set(skillId, section, '')
          return { ok: true, value: state() }
        }

        case 'customization/resetSkill': {
          const skillId = asString(p.skillId)
          if (!skillId) return fail('bad-request', 'skillId 不能为空。')
          clearAllCustomizations(deps.store, skillId)
          return { ok: true, value: state() }
        }

        case 'customization/resetAll': {
          clearAllCustomizations(deps.store)
          return { ok: true, value: state() }
        }

        /* ── ConvFusion.com 登录（账号）──────────────────────────────────────
         *
         * 服务器**没有口令登录**：账号是邀请制，唯一凭据是 API Key。所以这里的两条入口是
         * 「已有 Key → 验证身份」与「有邀请码 → 注册并直接拿到 Key」。
         *
         * 三件事必须始终成立：
         *   ① 网络请求只在这里发（宿主侧；服务器未开 CORS）；
         *   ② 明文 Key 只在 `deps.getConfig()` / patch 里流动，**绝不进入返回值**；
         *   ③ 任何失败都**不改动**已保存的凭据（只有成功才写盘）。
         */

        case 'account/state':
          // 不联网：服务器挂了也要能打开设置页（因此也没有余额）
          return { ok: true, value: buildAccountState(deps.getConfig(), env(), null) }

        case 'account/probe': {
          /*
           * **只测连通性**（设置页两个服务器快捷按钮上色用：通了=绿）。
           *
           * 与 `account/verify` 的区别：这里是**匿名**的 —— 一个字节的凭据都不带。
           * 换地址发生在"还没登录 / 正要换账号"的时候，那时凭据可能根本不属于这台服务器；
           * 而且把 Key 发到用户手输的地址上就是白送凭据。
           *
           * 返回 `ok: true` + `reachable`（"连不上"是**结果**，不是 RPC 失败）；只有地址
           * 本身非法才是 `bad-request`。失败原因原样带回，界面放进悬浮提示。
           */
          let base: string
          try {
            base = requestBase(p.serverUrl)
          } catch (e) {
            return serverFail(e)
          }
          try {
            const opts = netOptions() ?? {}
            await probeServerHealth(base, {
              ...opts,
              // 探活是**按钮上的一次反馈**，不能让人等 30 秒：最长 8 秒就下结论
              timeoutMs: Math.min(opts.timeoutMs ?? SERVER_TIMEOUT_MS, SERVER_TIMEOUT_MS),
            })
            return { ok: true, value: { reachable: true, url: base, reason: null } }
          } catch (e) {
            return {
              ok: true,
              value: { reachable: false, url: base, reason: e instanceof Error ? e.message : String(e) },
            }
          }
        }

        case 'account/login': {
          const apiKey = normalizeApiKey(asString(p.apiKey))
          if (!apiKey) return fail('bad-request', '请填写 ConvFusion.com 的 API Key（cf_live_…）。')
          // 地址先归一（用户可能粘贴带 /api 或 /docs 的地址）；非法地址在联网前就报错
          let base: string
          try {
            base = requestBase(p.serverUrl)
          } catch (e) {
            return serverFail(e)
          }
          try {
            const account = await fetchAccount(base, apiKey, netOptions())
            // 余额与身份一起拿到（失败不影响登录成功）
            const tokens = await tryBalance(base, apiKey)
            // 只有验证通过才落盘 —— 失败绝不留下一份坏凭据
            return await persist({ convfusionApiKey: apiKey, serverUrl: base }, account, tokens)
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'account/register': {
          const invitationCode = asString(p.invitationCode)
          const email = asString(p.email)
          const displayName = asString(p.displayName)
          if (!invitationCode) return fail('bad-request', '请填写邀请码（cf_inv_…）。')
          if (!email) return fail('bad-request', '请填写邮箱（必须与邀请码指定的邮箱一致）。')
          if (!displayName) return fail('bad-request', '请填写显示名。')
          let base: string
          try {
            base = requestBase(p.serverUrl)
          } catch (e) {
            return serverFail(e)
          }
          try {
            // 注册成功即拿到一次性明文 Key → 直接存下来，用户不需要再复制粘贴一次
            const { account, apiKey } = await acceptInvitation(
              base,
              { invitationCode, email, displayName },
              netOptions(),
            )
            // 新账号余额为 0，但仍然要问一次服务器（不要自己假定）
            const tokens = await tryBalance(base, apiKey)
            return await persist({ convfusionApiKey: apiKey, serverUrl: base }, account, tokens)
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'account/verify': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const base = resolveServerUrl(config, env()).url
          try {
            const account = await fetchAccount(base, apiKey, netOptions())
            const tokens = await tryBalance(base, apiKey)
            return { ok: true, value: buildAccountState(config, env(), account, { tokens }) }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'account/tokens': {
          // 单独刷新余额：读完简报（扣 1 Token）之后界面用它把数字改对
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const base = resolveServerUrl(config, env()).url
          try {
            const tokens = await fetchTokenBalance(base, apiKey, netOptions())
            return { ok: true, value: { tokens } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'account/logout': {
          // 只清凭据，保留服务器地址（下次登录还要用）
          return await persist({ convfusionApiKey: '' }, null)
        }

        /* ── 研究工作（发现网络）──────────────────────────────────────────
         *
         * 服务器的分享对象是**研究项目**，披露分三层：摘要（免费）/ 简报（1 Token）/
         * 完整状态（需导师关系）。本轮接前两层 —— 完整状态需要关系，没有入口就先不做。
         *
         * 这三条都需要凭据：未登录时界面**自己**显示示例列表（不发请求），
         * 所以这里的 `not-configured` 是给"凭据刚被清掉"这种竞态兜底的。
         */

        /* ── 研究工作 · 我的（**本机**）───────────────────────────────────
         *
         * 数据源是 DSH 的工作区注册表（`ctx.workspaceRegistry`），过滤条件是
         * "该工作区里存在有效的 research workspace"（`project.md` 或
         * `research/research-state.md`，见 `isResearchWorkspace`）。
         *
         * ⚠️ 这一条**不联网、不需要登录**：本机有哪几个研究项目是本地事实。
         * 服务器上"我发布了什么"是另一回事（需要先有上传 / 发布流程）。
         */
        /* ── 研究工作 · 我的（**本机**）───────────────────────────────────
         *
         * 数据源是 DSH 的工作区注册表（`ctx.workspaceRegistry`），过滤条件是
         * "该工作区里存在有效的 research workspace"（`project.md` 或
         * `research/research-state.md`，见 `isResearchWorkspace`）。
         *
         * ⚠️ 这一条**不联网、不需要登录**：本机有哪几个研究项目是本地事实。
         * 服务器上"我发布了什么"是另一回事（见 `work/publish`）。
         */
        case 'work/mine': {
          const listed = await collectLocalWorks()
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          const items = await verifyPublished(
            listed.items,
            apiKey,
            resolveServerUrl(config, env()).url,
          )
          return {
            ok: true,
            value: {
              items,
              registry: {
                available: listed.available,
                ...(listed.reason ? { reason: listed.reason } : {}),
              },
            },
          }
        }

        /* ── 发布本机研究到网络（「寻找指导」）──────────────────────────────
         *
         * 用户的点法：在【研究工作 · 我的】里点**这一项**的「寻找指导」——
         * **只有这时**才把该项目的研究状态发到服务器（不是后台自动上传）。
         *
         * 顺序照 `docs/projects.md` §6：建项目 → 传状态 → 发布。
         * 文档明确警告：**不要发布没有状态的项目**（网络里会出现空卡片），
         * 所以这里把三件事当成一次操作，上传失败就绝不发布。
         */
        /* ── 发布前的上传计划（对话框的数据源）────────────────────────────
         *
         * 返回**体积核算 + 默认选择 + 记住的选择 + 用量/成本**，一次拿全 ——
         * 对话框打开即可显示"这次传什么、多少、要花几个 Token、服务器还剩多少空间"。
         *
         * ⚠️ 计划里包含 `excluded` 分类（机器产物），但**界面不显示它们**
         * （2026-09 用户要求：排除项直接不出现，不影响选择）。保留在数据里是为了
         * 对账（"全部 = 推荐 + 可选 + 排除"）与将来做"高级模式"。
         */
        case 'work/uploadPlan': {
          const id = asString(p.id)
          if (!id) return fail('bad-request', '缺少研究工作 id。')
          const listed = await collectLocalWorks()
          const source = listed.sources.get(id)
          if (!source) return fail('not-found', '找不到这个本机研究项目（或其研究状态读不出来）。')
          const plan: UploadPlan = buildUploadPlan(source.root)
          const record = publishedStore.get(source.root)
          // 记住的选择 ∪ 规则推荐（新文件自动并入，否则新增证据会静默漏传）
          const remembered = record?.selection ?? null
          const recommended = plan.categories
            .filter((c) => c.decision === 'recommended')
            .flatMap((c) => c.files.filter((f) => !f.relPath.endsWith('/')).map((f) => f.relPath))
          const exist = new Set([...recommended, ...plan.categories.filter((c) => c.decision === 'optional').flatMap((c) => c.files.map((f) => f.relPath))])
          const effective =
            remembered === null
              ? recommended
              : [...new Set([...remembered.filter((r) => exist.has(r)), ...recommended])]
          const diff = await diffAgainstUploaded(source.root, record)
          // "变化" = 已记录但内容变了 + 选择里从未上传过的（新增文件）
          const knownFiles = record?.files ?? {}
          const added = effective.filter((r) => !(r in knownFiles))
          const changedAll = [...new Set([...diff.changed, ...added])]
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          const usage = apiKey
            ? await fetchUsage(resolveServerUrl(config, env()).url, apiKey, netOptions())
            : null
          return {
            ok: true,
            value: {
              projectId: id,
              root: source.root,
              title: source.title,
              plan,
              /** 对话框的初始勾选。 */
              selection: effective,
              remembered: remembered !== null,
              /** 与"上次已上传"相比的变化（新增 + 内容变化）；空数组 = 无变化。 */
              changed: changedAll,
              unchangedCount: diff.unchanged.filter((r) => effective.includes(r)).length,
              usage,
            },
          }
        }

        case 'work/publish': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const id = asString(p.id)
          if (!id) return fail('bad-request', '缺少研究工作 id。')
          const listed = await collectLocalWorks()
          const source = listed.sources.get(id)
          if (!source) return fail('not-found', '找不到这个本机研究项目（或其研究状态读不出来）。')
          const base = resolveServerUrl(config, env()).url
          /**
           * 附件选择：界面在对话框里确认后传进来。
           *
           * - 显式给了 `selection`（含空数组）→ 就用它；
           * - 没给 → 沿用**记住的选择**；再没有 → 用规则推荐集（`work/uploadPlan` 的默认）。
           *   （「更新」路径不弹窗时走的是这条，所以不能退化成"什么都不传"。）
           */
          const selectionProvided = Array.isArray(p.selection)
          const remember = p.remember !== false
          try {
            const me = await fetchAccount(base, apiKey, netOptions())
            const { content, missing } = buildPublishContent({
              researchRoot: source.root,
              workspaceTitle: source.title,
              progress: source.progress,
              generatedAt: new Date().toISOString(),
            })
            const previous = publishedStore.get(source.root)
            // 只有同一台服务器 + 同一个账号才重用项目；否则新建
            // （服务器 GET /projects/{id} 是 owner-only，重用别人的 id 只会 404）
            const reusable = previous && previous.serverUrl === base && previous.accountId === me.id
            let projectId = reusable ? previous.projectId : ''
            let created = false
            const create = async (): Promise<string> => {
              const project = await createProject(
                base,
                apiKey,
                {
                  title: source.title,
                  description: content.summary ? content.summary : undefined,
                },
                netOptions(),
              )
              created = true
              return project.id
            }
            if (!projectId) projectId = await create()
            // 一次保存意图一个幂等键；因 409 重基后 payload 变了 → 换新键
            const saveState = async (baseVersion: number | null) =>
              uploadResearchState(
                base,
                apiKey,
                projectId,
                {
                  baseVersion,
                  content: content as unknown as Record<string, unknown>,
                  intentKey: crypto.randomUUID(),
                },
                netOptions(),
              )
            const saveStateWithRebase = async (version: number | null) => {
              try {
                return await saveState(version)
              } catch (e) {
                if (!(e instanceof ServerError) || e.code !== 'version-conflict') throw e
                // 409：拉最新版本，基于它**重新上传**（换新 key —— payload 已变）
                const latest =
                  e.currentVersion ?? (await readStateVersion(base, apiKey, projectId, netOptions()))
                return await saveState(latest)
              }
            }
            // 以**服务器**的当前版本为准（本地记录可能过期：另一个客户端也传过）
            let uploaded: { version: number; contentHash: string }
            try {
              uploaded = await saveStateWithRebase(
                await readStateVersion(base, apiKey, projectId, netOptions()),
              )
            } catch (e) {
              // 映射指向的项目已被服务器删除（本地记录不会自己知道）：忘掉它、新建项目重来一次
              if (!reusable || !(e instanceof ServerError) || e.code !== 'not-found') throw e
              publishedStore.remove(source.root)
              projectId = await create()
              uploaded = await saveStateWithRebase(
                await readStateVersion(base, apiKey, projectId, netOptions()),
              )
            }
            // ── 附件：状态传完再传（服务器要求 state_version 存在）──────────
            const plan = buildUploadPlan(source.root)
            const recommendedFiles = plan.categories
              .filter((c) => c.decision === 'recommended')
              .flatMap((c) => c.files.filter((f) => !f.relPath.endsWith('/')).map((f) => f.relPath))
            const optionalFiles = plan.categories
              .filter((c) => c.decision === 'optional')
              .flatMap((c) => c.files.map((f) => f.relPath))
            const selectable = new Set([...recommendedFiles, ...optionalFiles])
            const selected = selectionProvided
              ? (p.selection as unknown[]).filter((x): x is string => typeof x === 'string')
              : (previous?.selection ?? []).length > 0
                ? [...new Set([...(previous?.selection ?? []).filter((r) => selectable.has(r)), ...recommendedFiles])]
                : recommendedFiles
            // 增量：只传新增/变化的（服务器不去重，重复传会翻倍占空间）
            const previousFiles = previous?.files ?? {}
            const toUpload: string[] = []
            const digests: Record<string, string> = { ...previousFiles }
            for (const relPath of selected) {
              const abs = resolve(source.root, relPath)
              let digest: string
              try {
                digest = await fileDigest(abs)
              } catch {
                continue // 文件不存在/读不动：跳过，不阻塞发布
              }
              digests[relPath] = digest
              if (previousFiles[relPath] !== digest) toUpload.push(relPath)
            }
            const { batches, skipped } = planUploadBatches(source.root, toUpload)
            let uploadedFiles = 0
            let uploadedBytes = 0
            for (const batch of batches) {
              const payload: Array<{ relPath: string; bytes: Uint8Array }> = []
              for (const relPath of batch) {
                try {
                  const { readFile } = await import('node:fs/promises')
                  payload.push({ relPath, bytes: await readFile(resolve(source.root, relPath)) })
                } catch {
                  /* 读不到就跳过该文件 */
                }
              }
              if (payload.length === 0) continue
              const results = await uploadProjectFiles(base, apiKey, projectId, payload, {
                stateVersion: uploaded.version,
                ...netOptions(),
              })
              uploadedFiles += results.length
              uploadedBytes += results.reduce((n, r) => n + r.size, 0)
            }

            // 上传成功后才发布（顺序不能反：先发布会留下空卡片）。
            // 幂等键由 (项目, 版本) 决定：同一次发布的重试不会重复扣费。
            const { visibility, chargedTokens } = await publishProject(base, apiKey, projectId, {
              intentKey: `convfusion-dsh-publish-${projectId}-v${uploaded.version}`,
              ...netOptions(),
            })
            const now = new Date().toISOString()
            const record: PublishedRecord = {
              projectId,
              serverUrl: base,
              accountId: me.id,
              version: uploaded.version,
              contentHash: uploaded.contentHash,
              publishedAt: reusable ? previous?.publishedAt || now : now,
              updatedAt: now,
              // 已上传附件的指纹（增量上传的依据）
              files: digests,
              // 「记住这次选择」：下次不弹窗时沿用它（新文件仍会按规则并入）
              ...(remember ? { selection: selected } : {}),
            }
            publishedStore.set(source.root, record)
            return {
              ok: true,
              value: {
                published: {
                  projectId,
                  version: uploaded.version,
                  visibility,
                  created,
                  updatedAt: now,
                  /** 本次真实扣费（0 = 该项目此前已付费，重复发布免费）。 */
                  chargedTokens,
                },
                /** 本次附件上传统计（增量：`skippedExisting` = 内容未变、跳过的）。 */
                attachments: {
                  selected: selected.length,
                  uploaded: uploadedFiles,
                  uploadedBytes,
                  skippedExisting: selected.length - toUpload.length,
                  /** 超过服务器单文件上限（100 MB）而没能上传的。 */
                  oversize: skipped,
                },
                /** 本机没有的字段（界面据此如实说明"网络上只看得到哪几项"）。 */
                missing,
              },
            }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'work/list': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          try {
            const base = resolveServerUrl(config, env()).url
            // ⚠️ 不传 limit：列表条数与抽样策略由**服务器**决定（见 fetchWorkList 注释）
            const items: WorkItem[] = await fetchWorkList(base, apiKey, netOptions())
            // 顺带把命中的本地发布记录对齐到服务器的可见性
            syncRecordsFromWorkList(items)
            // 「这一项简报买过没有」服务器列表里没有，补本地记忆 →
            // 界面据此决定还要不要弹"要花 1 Token"的确认框
            return { ok: true, value: { items: await annotateOpenedBriefs(base, apiKey, items) } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'work/summary': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          try {
            const base = resolveServerUrl(config, env()).url
            const work: WorkItem = await fetchWorkSummary(base, apiKey, projectId, netOptions())
            return { ok: true, value: { work } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'work/brief': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          // ⚠️ intentKey 由界面持有：402 之后充值再用**同一个** key 重试，不会重复扣费。
          // 这里不做任何自动重试 —— 402 是业务事实，重试只会刷日志。
          const intentKey = asString(p.intentKey)
          if (!intentKey) return fail('bad-request', '缺少 intentKey（一次查看意图的幂等键）。')
          try {
            const base = resolveServerUrl(config, env()).url
            const brief: WorkBrief = await fetchWorkBrief(base, apiKey, projectId, intentKey, netOptions())
            // 成功读过 ⇒ 服务器已保证"同一项以后不再扣费"（`has_paid_brief`）。
            // 记下来，下次直接读、不再弹确认框。
            const accountId = await resolveAccountId(base, apiKey)
            if (accountId) deps.paidBriefStore?.mark(base, accountId, projectId)
            return { ok: true, value: { brief } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/fee-suggestion': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          try {
            const base = resolveServerUrl(config, env()).url
            const suggestion: FeeSuggestion = await fetchFeeSuggestion(base, apiKey, netOptions())
            return { ok: true, value: { suggestion } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/propose': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          const guidanceScope = asString(p.guidanceScope)
          if (!guidanceScope) return fail('bad-request', '指导范围不能为空。')
          const totalFee = asInt(p.totalFee)
          const depositAmount = asInt(p.depositAmount)
          const successPaymentAmount = asInt(p.successPaymentAmount)
          const condition = asRecordLike(p.successCondition)
          if (!totalFee || !depositAmount || !condition) {
            return fail('bad-request', '费用或成功条件不完整。')
          }
          if (depositAmount + successPaymentAmount !== totalFee) {
            return fail('bad-request', '押金 + 成功付款必须等于总费用。')
          }
          const type = asString(condition.type)
          if (!type) return fail('bad-request', '缺少成功条件类型。')
          try {
            const base = resolveServerUrl(config, env()).url
            const proposal: MentorshipProposal = await fetchPropose(base, apiKey, projectId, {
              guidanceScope,
              totalFee,
              depositAmount,
              successPaymentAmount,
              successCondition: { type, description: asString(condition.description) || null },
            }, netOptions())
            return { ok: true, value: { proposal } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/list': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          try {
            const base = resolveServerUrl(config, env()).url
            const proposals: MentorshipProposal[] = await fetchProposals(base, apiKey, netOptions())
            /*
             * 关系建立（ACCEPTED）之后，提案状态就**不再变化**了 —— 但用户要看的是
             * 指导进展（导师传了没有）。服务器没有专门的状态接口，而这个事实就在
             * 项目文件里（`review/` 下的条目数），读权限也已经放行给关系双方。
             *
             * 代价：每个 ACCEPTED 提案一次文件列表请求（数量 = 本人接受中的指导关系数，
             * 通常 1~3）。失败**不影响整个列表** —— 标成 null（未知），由界面保守处理。
             */
            const withReview = await Promise.all(
              proposals.map(async (p) => {
                if (p.status !== 'ACCEPTED') return p
                try {
                  const files = await fetchProjectFiles(base, apiKey, p.projectId, netOptions())
                  return { ...p, reviewFiles: files.filter((f) => f.relativePath.startsWith('review/')).length }
                } catch {
                  return { ...p, reviewFiles: null }
                }
              }),
            )
            return { ok: true, value: { proposals: withReview } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/accept': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const proposalId = asString(p.proposalId)
          if (!proposalId) return fail('bad-request', '缺少 proposalId。')
          // ⚠️ 幂等键由界面持有：402（押金不足）之后拿到 Token 再用**同一个** key 重试，
          // 服务器据此回放、不会重复冻结。这里不做自动重试。
          const intentKey = asString(p.intentKey)
          if (!intentKey) return fail('bad-request', '缺少 intentKey（一次接受意图的幂等键）。')
          try {
            const base = resolveServerUrl(config, env()).url
            const contract: MentorshipContract = await fetchAcceptProposal(
              base, apiKey, proposalId, intentKey, netOptions(),
            )
            return { ok: true, value: { contract } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/reject': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const proposalId = asString(p.proposalId)
          if (!proposalId) return fail('bad-request', '缺少 proposalId。')
          try {
            const base = resolveServerUrl(config, env()).url
            const proposal: MentorshipProposal = await fetchRejectProposal(
              base, apiKey, proposalId, netOptions(),
            )
            return { ok: true, value: { proposal } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/pickDirectory': {
          // 目录选择器是**可选**能力：没有就如实说"不可用"，界面退回手填路径。
          // `probe: true` 只问能力、不开窗 —— 界面要"先知道有没有选择器"才能决定
          // 显示【选择目录…】还是只有输入框，而开窗本身是有副作用的（会弹系统对话框）。
          if (p.probe === true) {
            if (!deps.pickDirectory) return { ok: true, value: { supported: false, path: null } }
            try {
              const probed = await deps.probeDirectoryPicker?.()
              return { ok: true, value: probed ?? { supported: false, path: null } }
            } catch (e) {
              return serverFail(e)
            }
          }
          if (!deps.pickDirectory) {
            return { ok: true, value: { supported: false, path: null } }
          }
          try {
            const picked = await deps.pickDirectory()
            return { ok: true, value: picked }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/downloadState': {
          /*
           * 【下载】对话框要的三样：可选工作区列表、预检（多少文件/多大）、
           * 以及**预计保存成什么文件名**（服务器命名 `<owner>-<title>.zip`）。
           * 合成一次调用：少一次往返，也少一处不一致。
           */
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          try {
            const base = resolveServerUrl(config, env()).url
            const files = await fetchProjectFiles(base, apiKey, projectId, netOptions())
            const listed = deps.listLocalWorkspaces ? await deps.listLocalWorkspaces() : null
            return {
              ok: true,
              value: {
                files: files.length,
                bytes: files.reduce((sum, f) => sum + f.size, 0),
                available: listed?.available ?? false,
                reason: listed?.reason ?? null,
                // 文件名只有**预检**能提前看到；真正的名字以服务器响应头为准
                expectedName: `${safeDirName(asString(p.prefix), 'workspace')}.zip`,
                items: (listed?.items ?? []).map((it) => ({
                  id: it.id,
                  title: it.title,
                  path: it.path,
                })),
              },
            }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/download': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          const workspaceId = asString(p.workspaceId)
          if (!workspaceId) return fail('bad-request', '请先选择要保存到的工作区。')
          /*
           * **只把 ZIP 存下来，其余交给用户**（2026-09 用户拍板）。
           *
           * 因此这里没有解压、没有 scope、没有"这个工作区里有没有研究"的判断：
           *   · 目标目录按**注册表 id 在宿主侧解析**（客户端递不进任意路径）；
           *   · 文件写在**工作区根目录**（用户材料，不进 `<工作区>/workspace/` 研究数据区）；
           *   · 同名**不覆盖**，自动加序号 → 所选工作区里原有的东西一个都不动，
           *     所以任何工作区都能选，不需要禁用。
           * 文件名用服务器给的（`<owner>-<title>.zip`）；服务器没给才用客户端传的前缀兜底。
           */
          const listed = deps.listLocalWorkspaces ? await deps.listLocalWorkspaces() : null
          const target = listed?.items.find((it) => it.id === workspaceId)
          if (!target) {
            return fail('not-found', '找不到这个工作区（可能已被删除）。刷新后重试。')
          }
          try {
            const base = resolveServerUrl(config, env()).url
            const { bytes, filename } = await fetchProjectArchive(base, apiKey, projectId, netOptions())
            const fallback = `${safeDirName(asString(p.prefix), 'workspace')}.zip`
            const saved = writeFileUnique(target.path, filename ?? fallback, bytes)
            return { ok: true, value: { dir: target.path, ...saved } }
          } catch (e) {
            return serverFail(e)
          }
        }

        case 'mentor/scanReview': {
          // 列出"导师自己的 review/ 目录里有什么"——上传是**按目录**走的，
          // 因为服务器要求 relative_paths 保留目录层次（review/figures/x.png 这类）
          const dir = asString(p.dir)
          if (!dir) return fail('bad-request', '请先选择工作区目录。')
          try {
            const scanned = scanReviewFiles(dir)
            return { ok: true, value: scanned }
          } catch (e) {
            return fail('bad-request', e instanceof Error ? e.message : String(e))
          }
        }

        case 'mentor/upload': {
          const config = deps.getConfig()
          const apiKey = resolveConvFusionApiKey(config, env())
          if (!apiKey) return fail('not-configured', '尚未登录 ConvFusion.com。')
          const projectId = asString(p.projectId)
          if (!projectId) return fail('bad-request', '缺少 projectId。')
          const dir = asString(p.dir)
          if (!dir) return fail('bad-request', '请先选择工作区目录。')
          const wanted = Array.isArray(p.paths) ? p.paths.map((x) => asString(x)).filter(Boolean) : []
          if (wanted.length === 0) return fail('bad-request', '没有选择要上传的文件。')
          try {
            // 只上传**扫描得到**的文件：不让界面递任意路径进来读盘
            const scanned = scanReviewFiles(dir)
            const allowed = new Set(scanned.files.map((f) => f.relPath))
            const picked = wanted.filter((rel) => allowed.has(rel))
            if (picked.length === 0) {
              return fail('bad-request', '选择的文件不在 review/ 目录下。')
            }
            const payload = picked.map((rel) => ({
              relPath: rel,
              bytes: readReviewFile(scanned.researchRoot, rel),
            }))
            const base = resolveServerUrl(config, env()).url
            const uploaded = await uploadReviewFiles(base, apiKey, projectId, payload, netOptions())
            return { ok: true, value: { uploaded } }
          } catch (e) {
            return serverFail(e)
          }
        }

        default:
          return fail('unknown-endpoint', `未知端点：${endpoint}`)
      }
    } catch (e) {
      return fail('internal', e instanceof Error ? e.message : String(e))
    }
  }
}



/* ════════════════════════════════════════════════════════════════════════
 * HTTP 路由（node:http 风格处理器）
 * ════════════════════════════════════════════════════════════════════════ */

/** 最小化的 node:http 请求/响应视图（避免为了类型而依赖 @types/node 之外的东西）。 */
interface RouteRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
}
interface RouteResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  writeHead(status: number, headers?: Record<string, string>): void
  /** 流式写（归档下载用）。真实对象是 `node:http` 的 ServerResponse。 */
  write(chunk: Uint8Array): void
  end(payload?: string | Uint8Array): void
}

export interface SettingsRouteDeps extends SettingsRpcDeps {
  /**
   * 信任/鉴权栅栏（`connection.requestRejection`）。
   * 返回非 undefined 表示拒绝，值为 HTTP 状态码。缺省 = 不做栅栏（仅测试用）。
   */
  reject?: (req: RouteRequest) => number | undefined
}

export type SettingsRouteHandler = (req: RouteRequest, res: RouteResponse) => Promise<void>

function sendJson(res: RouteResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** 从 URL pathname 取出渠道内的端点名（`/dsh-convfusion/a/b` → `a/b`）。 */
export function endpointFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(SETTINGS_ROUTE_PREFIX)) return undefined
  const rest = pathname.slice(SETTINGS_ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '')
  if (!rest || rest.includes('..')) return undefined
  return decodeURIComponent(rest)
}

async function readBody(req: RouteRequest, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error(`请求体超过 ${maxBytes} 字节上限`)
    chunks.push(Buffer.from(chunk))
  }
  if (total === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  const parsed = JSON.parse(text) as unknown
  // 信封 `{ payload }`（与客户端约定）；也容忍直接给 payload
  if (parsed && typeof parsed === 'object' && 'payload' in (parsed as Record<string, unknown>)) {
    return (parsed as Record<string, unknown>).payload
  }
  return parsed
}

/**
 * 建立 webServer 路由处理器。
 *
 * 端点表与 {@link createSettingsRpcHandler} 完全一致，只是外面多了一层 HTTP 信封。
 */
export function createSettingsRouteHandler(deps: SettingsRouteDeps): SettingsRouteHandler {
  const dispatch = createSettingsRpcHandler(deps)

  return async (req: RouteRequest, res: RouteResponse): Promise<void> => {
    const method = (req.method ?? 'GET').toUpperCase()
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname

    const endpoint = endpointFromPath(pathname)
    if (endpoint === undefined) {
      sendJson(res, 404, { ok: false, error: { code: 'not-found', message: '未知路径。' } })
      return
    }
    // Harness 的信任 / 鉴权栅栏：没有它就是一个本机可写的裸端点。
    // ⚠️ 必须在**任何**分支（含下面的 GET 下载）之前过一遍。
    if (deps.reject) {
      const rejection = deps.reject(req)
      if (rejection !== undefined) {
        sendJson(res, rejection, {
          ok: false,
          error: { code: 'rejected', message: rejection === 401 ? '未认证。' : '不受信任的来源。' },
        })
        return
      }
    }

    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '只接受 POST。' } })
      return
    }

    let payload: unknown
    try {
      payload = await readBody(req, SETTINGS_MAX_BODY_BYTES)
    } catch (e) {
      sendJson(res, 400, {
        ok: false,
        error: { code: 'bad-body', message: e instanceof Error ? e.message : String(e) },
      })
      return
    }

    const result = await dispatch(endpoint, payload)
    // 端点级失败仍是 200（信封里表达），4xx/5xx 只留给传输层问题 —— 客户端据此区分
    sendJson(res, 200, result)
  }
}
