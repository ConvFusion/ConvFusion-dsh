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
import type { SkillCustomizationStore } from './research/skill-customization.js';
import type { PaidBriefStore } from './research/paid-briefs.js';
import type { Config } from './config.js';
import { type SecretField } from './config.js';
import { type FetchLike, type TokenBalance } from './server-client.js';
import type { ProgressCountRow } from './research/progress.js';
import { type PublishedStore } from './research/published-store.js';
/**
 * 设置面的 HTTP 路由前缀（客户端必须用同一个）。
 *
 * 用 `dsh-` 前缀避免与 Harness 自己的路径空间冲突（同 `dsh-additive` 的做法）。
 */
export declare const SETTINGS_ROUTE_PREFIX = "/dsh-convfusion";
/** 请求体上限（状态是只读的，写请求也很小；4 MiB 足够且能挡住误用）。 */
export declare const SETTINGS_MAX_BODY_BYTES: number;
/** 统一信封（Connection 的 `ConnectionRpcResult`）。 */
export type SettingsRpcResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
/** 一个可定制章节在设置页里的形态。 */
export interface SettingsSection {
    /** 章节标题（`Research Method` 等）。 */
    section: string;
    /** 系统原文（只读展示 —— 让用户看得见自己在覆盖什么）。 */
    base: string;
    /** 是否已被用户覆盖。 */
    overridden: boolean;
    /** 用户当前的覆盖文本（未覆盖时缺省）。 */
    userText?: string;
}
/** 一个研究方法 Skill 在设置页里的形态。 */
export interface SettingsSkill {
    /** Skill id。 */
    skillId: string;
    /** 显示名。 */
    skillName: string;
    /** 唯一编号（`CxxPyy`）—— 界面展示与排序用。 */
    code?: string;
    /** 中文名 —— 界面展示用。 */
    label?: string;
    sections: SettingsSection[];
    /** 该 Skill 已覆盖的章节数。 */
    overriddenCount: number;
}
/** 一个类别（设置页的一级分组）在设置页里的形态。 */
export interface SettingsCategory {
    categoryId: string;
    categoryName: string;
    /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
    code?: string;
    /** 类别中文名（如「文献」）。 */
    label?: string;
    skills: SettingsSkill[];
    /** 该类别下已覆盖的可定制项数量。 */
    overriddenCount: number;
    /** 该类别下的可定制项总数。 */
    pointCount: number;
}
/** 文献检索凭据的**可用性**（只有布尔与来源，**没有密钥**）。 */
export interface RetrievalKeyStatus {
    configured: boolean;
    source: 'settings' | 'env' | 'none';
    /** 提供 Key 的环境变量名（仅提示，不是值）。 */
    envVar: string;
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
export declare function normalizeWorkspaceEntities(entities: ReadonlyArray<{
    id?: unknown;
    title?: unknown;
    path?: unknown;
    updatedAt?: unknown;
}>): Array<{
    id: string;
    title: string;
    path: string;
    updatedAt: string;
}>;
/**
 * **本机**的一项研究工作（【研究工作 · 我的】的一行）。
 *
 * 与 {@link WorkItem} 的区别：那个是**服务器上**别人公开的研究工作，这个是
 * **本机工作区**里的研究项目 —— 数据全部来自磁盘，不需要登录、不发网络请求。
 */
export interface LocalWorkItem {
    /** 工作区注册表 id（稳定；路径可能被重命名）。 */
    id: string;
    /** 显示名（注册表标题，缺省用研究根目录名）。 */
    title: string;
    /** 会话工作区路径（用户的工作区）。 */
    path: string;
    /** 研究根目录（`<会话工作区>/workspace`，旧布局下可能是会话工作区本身）。 */
    researchRoot: string;
    /** 注册表里的目录已消失。 */
    missingDir: boolean;
    /**
     * 研究阶段：稳定 `id` + 宿主给的原始 `label`。
     *
     * ⚠️ 展示名**由客户端按 locale 翻译**（上游约定：宿主只给稳定 code/数值），
     * 客户端用 `translateOr(t, \`progress.stage.${id}\`, label)`，与「研究进展」面板同款。
     */
    stage: {
        id: string;
        label: string;
    } | null;
    /** 成熟度均值（0..1），与「研究进展」面板同一个数。 */
    overall: number;
    /** 可数资产（证据 / 主张 / 计划 …）：稳定 key + 计数 + 结构化 detail，与进展面板同一份口径。 */
    counts: ProgressCountRow[];
    /** 是否已有论文正文。 */
    paper: boolean;
    /** 当前推进判定（clear / ambiguous / blocked / unknown）。 */
    clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown';
    /** 注册表最近一次变更时刻（ISO）。 */
    updatedAt: string;
    /**
     * 是否**在网络上可见**（`visibility = PUBLISHED`）。
     *
     * ⚠️ 判据是**服务器**（`GET /projects/{id}`），不是本地映射：本地记录只说明"我传过"，
     * 服务器删项目或取消发布时它不会自己更新。核对不通（离线/未登录）时退回本地记录，
     * 因为"读不到"不等于"服务器上没有"。
     */
    published: {
        projectId: string;
        version: number;
        updatedAt: string;
        /** 记录属于哪台服务器（与当前生效地址不一致时界面要提示）。 */
        serverUrl: string;
        /** 记录属于哪个账号。 */
        accountId: string;
    } | null;
}
/** 服务器上的账号（`GET /api/v1/auth/me`）。**不含任何凭据。** */
export interface AccountWire {
    id: string;
    email: string;
    displayName: string;
    status: string;
    /** `RESEARCHER` / `MENTOR` / `ADMIN`（可多个）。 */
    roles: string[];
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
    serverUrl: string;
    /** 当前环境的**默认**地址（界面占位符 / 提示用）。 */
    defaultServerUrl: string;
    /** 这个地址是哪来的：设置文档 / 环境变量 / 环境配置文件 / 内置兜底。 */
    serverUrlSource: 'settings' | 'env' | 'config' | 'default';
    /**
     * 当前环境（开发 / 生产）。
     *
     * ⚠️ **地址随环境而变**：开发是 `http://localhost:8000`、生产是
     * `https://convfusion.com`（见 `src/server-env.ts`）。界面必须说清现在连的是哪一边，
     * 否则"在本机测通了"和"线上能用"会被混为一谈。
     */
    environment: 'development' | 'production';
    /** 地址与环境互相矛盾（生产却指向本机 / 开发却指向线上）。 */
    serverUrlMismatch: boolean;
    /** 是否已有可用凭据（**只报可用性，不回传凭据**）。 */
    keyConfigured: boolean;
    keySource: 'settings' | 'env' | 'none';
    /** 凭据的环境变量名（仅提示）。 */
    apiKeyEnvVar: string;
    /** 已认证账号；未验证或未登录时为 null。 */
    account: AccountWire | null;
    /**
     * Token 余额（登录后显示；未验证时为 null）。
     *
     * ⚠️ **尽力而为**：余额接口单独失败（网络抖动）不会让登录失败 —— 那种时候这里是 null，
     * 界面不显示余额，用户点「重新验证」即可。**绝不**把拿不到余额显示成 0。
     */
    tokens: TokenBalance | null;
}
/**
 * 组装登录状态（纯函数，可离线验证）。
 *
 * @param config 生效配置（**可含明文 Key** —— 本函数只读它的"有没有"，不把它放进结果）
 * @param env 环境变量（测试注入）
 * @param account 已验证的账号（未验证传 null）
 * @param options.fresh 忽略环境配置文件的进程内缓存（测试用）
 */
export declare function buildAccountState(config: Config, env?: NodeJS.ProcessEnv, account?: AccountWire | null, options?: {
    fresh?: boolean;
    tokens?: TokenBalance | null;
}): AccountState;
/**
 * 一个**本地外部依赖**的可用性（目前只有 tectonic —— 它不在 Node 生态里，用户可能没装）。
 *
 * 论文写到最后要出 LaTeX/PDF，编译由 tectonic 完成；它不是 npm 依赖，装没装只有本机能查。
 * 因此设置页需要能看到"有没有 / 在哪 / 什么版本 / 没装怎么办"。
 */
export interface LocalDependencyStatus {
    /** 依赖名（展示用）。 */
    name: string;
    /** 是否可用。 */
    available: boolean;
    /** 可执行文件绝对路径（可用时）。 */
    path?: string;
    /** 版本字符串（可用时）。 */
    version?: string;
    /** 是否由环境变量覆盖指定。 */
    viaEnv: boolean;
    /** 覆盖用的环境变量名。 */
    envVar: string;
    /** 稳定用途码；展示文字由浏览器 locale 决定。 */
    purposeCode: string;
}
/** 本机外部依赖的检测结果。 */
export interface LocalDependencyReport {
    tectonic: LocalDependencyStatus;
}
/**
 * 检测本地外部依赖。
 *
 * **每次调用都重新探测**（用户可能刚装完就回来看），且只做只读检查（`--version`）。
 */
export declare function describeLocalDependencies(env?: NodeJS.ProcessEnv): LocalDependencyReport;
/** 【本地研究方法】整页状态。 */
export interface SettingsState {
    /** 宿主协议版本；与客户端内联值不一致 = 宿主未重启。 */
    protocol: number;
    /**
     * 生效配置（文件名的权威来源仍是 settings 文档）。
     *
     * ⚠️ **已剔除 secret**（见 {@link redactConfig}）：这个对象会经 HTTP 返回浏览器。
     */
    config: Omit<Config, SecretField>;
    /** 定制文件的解析结果（展示"定制存在哪里"）。 */
    file: {
        path: string;
        exists: boolean;
        /** 已覆盖的 Skill 数。 */
        skillCount: number;
        /** 已覆盖的"Skill × 章节"数。 */
        entryCount: number;
    };
    /** 系统 Skill Library（包内只读资产）。 */
    library: {
        root: string;
        skillCount: number;
    };
    /** 允许定制的章节白名单（UI 用它解释"为什么只有这些能改"）。 */
    customizableSections: readonly string[];
    categories: SettingsCategory[];
    /**
     * OpenAlex Key 是否可用。
     *
     * ⚠️ 这里**刻意只给可用性**：密钥本身是 `role('secret')` 字段，
     * 远端读取会被 `redactSecrets` 摘掉，界面也从不持有明文。
     */
    retrieval: RetrievalKeyStatus;
    /** 【ConvFusion.com】的登录状态（服务器地址 + 是否有凭据 + 已验证的账号）。 */
    account: AccountState;
    /** 本地外部依赖（tectonic 等）的可用性 —— 【系统设置】页展示。 */
    dependencies: LocalDependencyReport;
}
/**
 * 组装整页状态（纯函数：给定 store 与配置即可算出，便于离线验证）。
 *
 * 分组在这里做，客户端只负责渲染 —— 设置页不该自己理解 Skill 的存储结构。
 */
export declare function buildSettingsState(config: Config, store: SkillCustomizationStore, resolvePath?: (c: Config) => string, probeDependencies?: () => LocalDependencyReport, env?: NodeJS.ProcessEnv): SettingsState;
/** 设置面依赖（由插件入口注入，便于离线测试）。 */
export interface SettingsRpcDeps {
    /** 当前生效配置（每次调用重新取，文件改名后立即生效）。 */
    getConfig: () => Config;
    /** 定制存储（其路径解析同样跟随最新配置）。 */
    store: SkillCustomizationStore;
    /** 覆盖路径解析（测试用；缺省按配置解析）。 */
    resolvePath?: (config: Config) => string;
    /**
     * 会话 id → 该会话的工作区（**权威来源**：`ctx.sessions.get(id).header.cwd`）。
     *
     * 进度报告必须按**会话自己的工作区**判定"这是不是一个研究项目"，
     * 而不是按插件进程的启动目录 —— 否则会把另一个项目的上下文/进展显示到本会话
     * （2026-09 实测发生）。
     */
    resolveSessionWorkspace?: (sessionId: string) => string | undefined;
    /**
     * 把配置补丁写回 **settings 用户层**（保存 API Key / 服务器地址）。
     *
     * 由插件入口接到 `settingsScope.update()`。缺省 = 设置存储不可用 —— 这时登录必须
     * **明确失败**（`storage-unavailable`），而不是"看着登录成功、重启后没了"。
     */
    setConfig?: (patch: Partial<Config>) => Promise<void>;
    /**
     * 连接 ConvFusion.com 用的网络实现（测试注入假 fetch）。
     *
     * ⚠️ 插件自身**从不**在浏览器侧发这些请求：服务器未开 CORS，且凭据是 secret。
     * 见 `server-client.ts` 文件头。
     */
    fetchImpl?: FetchLike;
    /** 环境变量（测试注入；缺省 `process.env`）。 */
    env?: NodeJS.ProcessEnv;
    /**
     * 「这一项简报已经买过」的本地记录（`paid-briefs.ts`）。
     *
     * 服务器只在 `/brief` 的响应里给 `charged_tokens`，列表/摘要**不含**这个状态，
     * 所以"点之前要不要提醒"只能靠这份本地记忆。缺省 = 没有记忆（每次都提醒，
     * 行为保守但不静默扣费）。
     */
    paidBriefStore?: PaidBriefStore;
    /** 服务器请求超时（测试用小值）。 */
    serverTimeoutMs?: number;
    /**
     * 「本机研究工作 ↔ 服务器项目」的映射存储。
     *
     * 缺省 = 内存表（重启即失，只用于精简环境/测试）——真正的落盘由插件入口注入。
     */
    publishedStore?: PublishedStore;
    /**
     * 本机**工作区注册表**里的条目（DSH `ctx.workspaceRegistry.list()` 的投影）。
     *
     * 用于【研究工作 · 我的】：只列**含有效 research workspace** 的工作区
     * （过滤与进度计算在本文件里做，入口只负责把注册表读出来）。
     * 缺省 = 这台机器上没有工作区注册表（列表为空，不报错）。
     */
    listLocalWorkspaces?: () => Promise<{
        /** DSH 是否真的提供了工作区注册表（false = 精简 profile / 服务缺失）。 */
        available: boolean;
        /** 不可用时的原因（直接给界面看，用于区分"没数据"和"读不到"）。 */
        reason?: string;
        items: Array<{
            id: string;
            title: string;
            path: string;
            updatedAt: string;
        }>;
    }>;
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
 *
 * ⚠️ **凭据纪律**（改动这里前先读 `server-client.ts` 文件头）：
 * 服务器地址与 API Key 只出现在**宿主**与**服务器**之间；本渠道的任何返回值都不得
 * 包含 `cf_live_…`。`account/*` 一律返回 {@link AccountState}（只有可用性 + 账号信息）。
 */
export declare function createSettingsRpcHandler(deps: SettingsRpcDeps): (endpoint: string, payload: unknown) => Promise<SettingsRpcResult>;
/** 最小化的 node:http 请求/响应视图（避免为了类型而依赖 @types/node 之外的东西）。 */
interface RouteRequest {
    method?: string | undefined;
    url?: string | undefined;
    headers: Record<string, string | string[] | undefined>;
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}
interface RouteResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    writeHead(status: number, headers?: Record<string, string>): void;
    end(payload?: string): void;
}
export interface SettingsRouteDeps extends SettingsRpcDeps {
    /**
     * 信任/鉴权栅栏（`connection.requestRejection`）。
     * 返回非 undefined 表示拒绝，值为 HTTP 状态码。缺省 = 不做栅栏（仅测试用）。
     */
    reject?: (req: RouteRequest) => number | undefined;
}
export type SettingsRouteHandler = (req: RouteRequest, res: RouteResponse) => Promise<void>;
/** 从 URL pathname 取出渠道内的端点名（`/dsh-convfusion/a/b` → `a/b`）。 */
export declare function endpointFromPath(pathname: string): string | undefined;
/**
 * 建立 webServer 路由处理器。
 *
 * 端点表与 {@link createSettingsRpcHandler} 完全一致，只是外面多了一层 HTTP 信封。
 */
export declare function createSettingsRouteHandler(deps: SettingsRouteDeps): SettingsRouteHandler;
export {};
//# sourceMappingURL=settings-rpc.d.ts.map