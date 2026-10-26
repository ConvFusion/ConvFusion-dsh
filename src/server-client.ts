/**
 * ConvFusion.com 客户端（**宿主侧**，Node）
 *
 * ## 为什么必须在宿主侧发请求
 *
 * 两条独立的原因，任意一条都足够：
 *
 * 1. **服务器未开 CORS**（`ConvFusion-server/docs/API.md` §1）。浏览器跨域请求会被
 *    直接拦掉；宿主（Node / `fetch`）不受同源策略约束。
 * 2. **凭据是 `role('secret')`**。API Key 只在宿主内存里出现；一旦让浏览器发这个请求，
 *    Key 就必须进浏览器 —— 那条路已经被否决（见 `config.ts` 的 `redactConfig`）。
 *
 * ## 鉴权事实（不要在这里发明概念）
 *
 * 服务器**没有口令登录 / 会话 / refresh token**。账号是邀请制，唯一凭据是
 * `Authorization: Bearer cf_live_<hex>`：
 *
 * ```text
 * 已有 Key  → GET  /api/v1/auth/me                     验证身份
 * 邀请码注册 → POST /api/v1/auth/invitations/accept     返回一次性明文 API Key
 * ```
 *
 * 因此本模块只做这两件事（外加 URL 归一与错误分类），不做 token 刷新、不做重试风暴。
 *
 * ## 错误分类为什么这么细
 *
 * `INTEGRATION.md` §2 的核心结论是：**不同错误要有不同的用户动作** ——
 * 401 换 Key、403 找管理员、429 等一会儿、网络错误重试。把它们一律压成
 * "登录失败"会让人无从下手，所以每个错误都带一个 `code`，由界面翻成中文动作。
 */

import { defaultServerUrl } from './config.js'
import { serverAddressKey } from './server-env.js'
import type { SideSyncCheck } from './research/sync-watermarks.js'
import { normalizeWorkspaceId } from './research/work-identity.js'

/** 服务器 API 前缀（`ConvFusion-server/app/core/config.py` 的 `API_PREFIX`）。 */
export const SERVER_API_PREFIX = '/api/v1'

/** 单次请求超时（毫秒）。服务器不可达时必须**很快**给出可显示的失败。 */
export const SERVER_TIMEOUT_MS = 8000

/** 一次网络请求的最小实现（便于离线测试注入假 fetch）。 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    /**
     * 请求体。`FormData` 用于附件上传（multipart）——那时**不能**自己设
     * `content-type`，边界串由运行时生成。
     */
    body?: string | FormData
    signal?: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  /**
   * 原始字节（附件下载用）。
   *
   * 声明成必然而不是可选：假 fetch 少实现一个方法应当**编译期**就报错，
   * 而不是等到用户点下载才在运行期炸（测试夹具已经跟着补上了）。
   */
  arrayBuffer(): Promise<ArrayBuffer>
  /** 响应头（可选）：下载要读服务器的 `Content-Disposition` 拿文件名。 */
  headers?: { get(name: string): string | null }
  /**
   * 正文流（**可选**）：归档/附件下载用它边收边写（进度可见、内存不膨胀）。
   *
   * 声明成可选而不是必然：假 fetch 与老运行时可能只有 `arrayBuffer()` ——
   * 那时退回一次性取回，行为不变（只是没有中途进度）。
   */
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null
}>

/** 服务器上的账号（`GET /api/v1/auth/me` 的响应，字段名已转 camelCase）。 */
export interface ServerAccount {
  id: string
  email: string
  displayName: string
  status: string
  /** `RESEARCHER` / `MENTOR` / `ADMIN`（可多个）。 */
  roles: string[]
}

/**
 * Token 余额（`GET /api/v1/tokens`）。
 *
 * ConvFusion.com 的 Token 是平台内的价值单位（Pitch Deck 第 9 页的第一个商业闭环：
 * 学生付费 → 导师收益 → 平台）。界面在登录后显示"还剩多少"，否则用户看到 402 时
 * 无从判断自己是没充值、还是被重复扣费了。
 */
export interface TokenBalance {
  /** 可用余额（= 两池之和，能花的）。 */
  available: number
  /** 冻结余额（如已接受提案的押金 —— 仍是用户的钱，只是锁住）。 */
  frozen: number
  /** 总额（可用 + 冻结）。 */
  total: number
  /**
   * **赠送额度**（服务器 `grant_balance`）—— 平台发的，只能买**自营服务**
   * （看简报 / 发布 / 买存储）。**不能付给导师、不能提现**。
   *
   * `null` = 服务器这一版不返回该字段（协议 28 之前）——**不是 0**。旧服务器把赠送与
   * 充值混在一个余额里，"这个账号没有赠送额度"与"服务器不会分开说"必须区分开。
   */
  grant: number | null
  /**
   * **资金池**（服务器 `funded_balance`）—— 充值 + 导师所得。**唯一**能付给导师、
   * 也是**唯一**可提现的部分；接受指导时冻结的押金走的就是它。
   *
   * `null` 的含义同 `grant`（旧服务器不分开说）。
   */
  funded: number | null
}

/**
 * 一项研究工作的**方向** —— 两个方向共用同一套项目 / 提案 / 合同结构，
 * 差别只在"谁拥有项目、谁发起、谁接受"（学生出钱两个方向都一样）。
 *
 * | 值 | 谁的项目 | 谁看 | 谁发起 | 谁接受 |
 * |---|---|---|---|---|
 * | `SEEK_MENTOR` | 学生 | 导师（【可指导】） | 导师出价 | 学生 |
 * | `SEEK_STUDENT` | 导师 | 学生（【可加入】） | 学生出价 | 导师 |
 *
 * ⚠️ **缺字段一律读作 `SEEK_MENTOR`**（旧服务器不返回 `direction`）：
 * 那正是"今天的行为"，退回它最保守 —— 不会把学生的研究当成导师的选题。
 */
export type ProjectDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT'

/** 两个方向的显式清单（界面按它遍历"这个工作区在两个方向上的发布状态"）。 */
export const PROJECT_DIRECTIONS: readonly ProjectDirection[] = ['SEEK_MENTOR', 'SEEK_STUDENT']

/** 解析方向字段；缺失 / 取值不在枚举里 → `SEEK_MENTOR`（旧服务器 = 今天的行为）。 */
export function parseDirection(raw: unknown): ProjectDirection {
  return asString(raw) === 'SEEK_STUDENT' ? 'SEEK_STUDENT' : 'SEEK_MENTOR'
}

/**
 * 一项**研究工作**（服务器上的 Research Project）的公开信息。
 *
 * 这是服务器**渐进披露**体系的第一层（免费，`GET /discovery/random`
 * 与 `GET /projects/{id}/summary`）：只说"这是什么"，
 * **不含** core idea / hypothesis / method（那些在第二层「简报」、第三层「完整状态」）。
 */
/**
 * 研究工作在公开发现列表里的**作者**（服务器的 `owner` 投影）。
 *
 * 只有身份与显示名 —— 见 {@link WorkItem.owner} 里"最小公开投影"的理由。
 */
export interface WorkOwner {
  id: string
  displayName: string
}

export interface WorkItem {
  projectId: string
  title: string
  researchFields: string[]
  /** 研究阶段（`IDEA` / `LITERATURE` / `EXPERIMENT` / …），可能为空。 */
  stage: string | null
  /** 进度 0–1。 */
  progress: number
  researchQuestion: string | null
  summary: string | null
  /** 与 owner 的关系（部分响应带）。 */
  updatedAt: string
  /**
   * **这项研究工作的名字**（服务器的 `work_name`）—— 列表**该显示的名字**。
   *
   * ⚠️ 与 {@link WorkItem.title} 的区别：`title` 是"这次发布的名字"（历史上是发布方的
   * 本机工作区名），`work_name` 是"这项研究工作的名字"（有论文用论文标题，否则用
   * 工作确定的主题）。看列表的人本机不一定有那份 workspace，所以名字只能由服务器给。
   *
   * `undefined` = 旧服务器还没有这个字段 → 界面退回 `title`。
   */
  workName?: string | null
  /**
   * 这项研究工作的**方向**（服务器 `direction`）：
   * `SEEK_MENTOR` = 学生出题求指导（【可指导】）；
   * `SEEK_STUDENT` = 导师出题招学生（【可加入】）。
   *
   * ⚠️ 旧服务器不返回该字段 → `SEEK_MENTOR`（= 今天的行为，见 {@link parseDirection}）。
   */
  direction: ProjectDirection
  /**
   * **这项研究属于谁**（服务器 `owner: { id, display_name }`）。
   *
   * 2026-10 服务器给 `/discovery/random` 加了这个字段：【可指导】列表要显示作者名，
   * 否则导师只看到一串标题，分不清是谁的研究。
   *
   * ⚠️ 只用**最小公开投影**（`id` + `display_name`）：这是公开发现列表，即使服务器
   * 将来在 `owner` 里塞了 profile，也不该被这个列表带出去（提案那条路径才有 profile，
   * 那是另一条授权链）。旧服务器不返回该字段 → `null`，界面不显示。
   */
  owner?: WorkOwner | null
  /**
   * **服务器的权威判据**：打开这一项的简报**还会不会再扣 Token**（`brief_paid`）。
   *
   * `true` = 不再扣（账本里有该 viewer 对该项目的 `BRIEF_VIEW` 支付记录，或项目属于自己）；
   * `false` = 首次打开会扣 `BRIEF_TOKEN_COST`（默认 1）。
   *
   * `null` = 响应里没有这个字段（旧版服务器）—— 只有这时才退回本地记忆 `briefOpened`；
   * 两者都拿不准就当"会扣费"（照常提醒，宁可多问一次）。
   */
  briefPaid?: boolean | null
  /**
   * **插件补的兜底**（不是服务器字段）：宿主本地记忆里这一项的简报已经买过。
   *
   * 只在服务器没有 `brief_paid` 时才需要它（`research/paid-briefs.ts`）；
   * 服务器给了权威值时以 `briefPaid` 为准。
   */
  briefOpened?: boolean
  /**
   * **发布方挂牌价**（服务器的 `asking_fee`，单位 Token）—— 发现列表的卡片上显示它。
   *
   * 含义由**这张卡片自己的方向**决定：`SEEK_STUDENT` 是导师的**开价**，
   * `SEEK_MENTOR` 是学生的**预算**。
   *
   * 三态（与服务端一致）：`number` = 有价；`null` = **没挂牌价**（不是 0，免费不支持）；
   * 字段缺失（旧服务器）= `undefined` → 界面**不显示**。
   */
  askingFee?: number | null
}

/**
 * 第二层：**简报**（`GET /projects/{id}/brief`）。
 *
 * ⚠️ 非 owner 每次访问**消耗 1 Token**，且用 `Idempotency-Key` 去重 ——
 * 同一次"查看意图"重试不会重复扣费（402 之后充值再试就是这个路径）。
 */
export interface WorkBrief {
  projectId: string
  title: string
  researchFields: string[]
  stage: string | null
  progress: number
  researchQuestion: string | null
  motivation: string | null
  coreIdea: string | null
  hypothesis: string | null
  methodOverview: string | null
  keyEvidence: string[]
  openProblems: string[]
  updatedAt: string
  /**
   * **这一次**调用花掉的 Token（服务器的 `charged_tokens`）。
   *
   * 服务器口径：自己的项目免费；否则**按 `(viewer, project)` 只收一次** ——
   * 已经买过时这里就是 0。界面据此给出**准确**回执（不再靠余额差值反推），
   * 并把"这一项已解锁"记进本地（下次不必再弹确认框）。
   *
   * `null` = 响应里没有这个字段（旧版服务器 / 异常响应）—— 界面这时退回
   * "按余额差值说话"，而不是当成 0 谎报"没扣费"。
   */
  chargedTokens: number | null
}

/**
 * 失败分类。
 *
 * 每个 code 对应界面上**一个不同的动作**，不是一个笼统的"失败"：
 *
 * | code | 含义 | 用户该做什么 |
 * |---|---|---|
 * | `invalid-key` | 401 Key 不存在/已撤销 | 换一份 Key，或重新用邀请码注册 |
 * | `account-inactive` | 403 账号被停用 | 联系管理员 |
 * | `invalid-invitation` | 400 邀请码无效/过期/邮箱不匹配 | 核对邀请码与邮箱 |
 * | `invitation-used` | 409 邀请码已被使用 | 直接改用 API Key 登录 |
 * | `email-taken` | 409 邮箱已注册 | 直接改用 API Key 登录 |
 * | `rate-limited` | 429 触发限流 | 等 `retryAfterSeconds` 再试 |
 * | `bad-request` | 400/422 参数或格式问题 | 看 message 改输入 |
 * | `bad-url` | 地址格式不对 | 改服务器地址 |
 * | `unreachable` | 网络错误 / 超时 | 确认服务器已启动、地址与端口正确 |
 * | `server-error` | 5xx | 稍后重试（服务端问题） |
 * | `bad-response` | 200 但响应不是预期形状 | 报 bug |
 * | `insufficient-tokens` | 402 Token 余额不足 | **不要重试**；拿到 Token 后用**同一次意图**重试 |
 * | `no-relationship` | 403 需要有效研究关系 | 先在【指导中】接受一条指导申请 |
 * | `not-found` | 404 不存在或不可见 | 刷新列表 |
 * | `idempotency-reused` | 409 同 Key 不同 payload | 客户端 bug（同一意图才能复用 Key） |
 * | `proposal-state` | 409 提案已不在可接受状态 / 项目已有生效关系 | 刷新列表（别人已处理，或已过期） |
 * | `path-reserved` | 403 导师越界写（只允许 `review/**`） | 把文件放进 `review/` 再传 |
 */
export type ServerErrorCode =
  | 'invalid-key'
  | 'account-inactive'
  | 'invalid-invitation'
  | 'invitation-used'
  | 'email-taken'
  | 'rate-limited'
  | 'bad-request'
  | 'bad-url'
  | 'unreachable'
  | 'server-error'
  | 'bad-response'
  | 'insufficient-tokens'
  | 'no-relationship'
  | 'not-found'
  | 'idempotency-reused'
  /** 409：研究状态乐观锁冲突（`details.current_version` 是服务端最新版本）。 */
  | 'version-conflict'
  /**
   * 409：指导提案的状态在用户操作期间变了 —— `PROPOSAL_INVALID_STATE`（已被处理 /
   * 已过期）或 `PROJECT_ALREADY_HAS_ACTIVE_MENTORSHIP`（项目已有生效关系）。
   * 两者都不是"输入有问题"，正确的动作是**刷新列表**再看。
   */
  | 'proposal-state'
  /** 403：导师写了 `review/` 之外（或别人的）路径 —— 结构上禁止改写研究事实。 */
  | 'path-reserved'

/** 带分类的服务器错误。`message` **已经是可直接展示的中文**。 */
export class ServerError extends Error {
  readonly code: ServerErrorCode
  /** HTTP 状态码（网络层失败时缺省）。 */
  readonly httpStatus?: number
  /** 服务器自己的 `error.code`（如 `API_KEY_REVOKED`），仅用于诊断。 */
  readonly serverCode?: string
  /** 429 的 `details.retry_after_seconds`。 */
  readonly retryAfterSeconds?: number
  /** 402 的 `details.required`（本次需要多少 Token）。 */
  readonly requiredTokens?: number
  /** 402 的 `details.available`（当前可用多少 Token）。 */
  readonly availableTokens?: number
  /**
   * 402（**资金池专属**路径）的 `details.funded`：资金池当前有多少。
   *
   * 它出现就说明这次失败是"赠送额度不能付给导师"，而不是"一分钱都没有"——
   * 界面据此说清话（并提示找管理员发放），而不是笼统说余额不足。
   */
  readonly fundedTokens?: number
  /** 402（资金池专属路径）的 `details.grant`：同一次失败里赠送额度有多少。 */
  readonly grantTokens?: number
  /** 409 STATE_VERSION_CONFLICT 的 `details.current_version`（重基时用它）。 */
  readonly currentVersion?: number

  constructor(
    code: ServerErrorCode,
    message: string,
    extra: {
      httpStatus?: number
      serverCode?: string
      retryAfterSeconds?: number
      requiredTokens?: number
      availableTokens?: number
      fundedTokens?: number
      grantTokens?: number
      currentVersion?: number
    } = {},
  ) {
    super(message)
    this.name = 'ServerError'
    this.code = code
    this.httpStatus = extra.httpStatus
    this.serverCode = extra.serverCode
    this.retryAfterSeconds = extra.retryAfterSeconds
    this.requiredTokens = extra.requiredTokens
    this.availableTokens = extra.availableTokens
    this.fundedTokens = extra.fundedTokens
    this.grantTokens = extra.grantTokens
    this.currentVersion = extra.currentVersion
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 地址归一
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 归一服务器地址。
 *
 * 用户会从各种地方复制地址（浏览器地址栏、`/docs` 页、`INTEGRATION.md`），
 * 所以这里把它们都收成同一个形态 —— **不含** `/api/v1`：
 *
 * ```text
 * http://localhost:8000/          → http://localhost:8000
 * http://localhost:8000/api       → http://localhost:8000     ← 任务书里给的就是这个
 * http://localhost:8000/api/v1    → http://localhost:8000
 * http://localhost:8000/docs#/    → http://localhost:8000
 * ```
 *
 * ⚠️ 空地址回落到**当前环境**的默认地址（开发 localhost / 生产 convfusion.apibrowser.com:4747），
 * 不是某个写死的地址 —— 见 `server-env.ts`。
 *
 * @throws {ServerError} `bad-url` —— 不是 http(s) 地址，或首尾有空白之外的问题
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return defaultServerUrl()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new ServerError('bad-url', `服务器地址不是合法 URL：${trimmed}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ServerError('bad-url', `服务器地址必须以 http:// 或 https:// 开头：${trimmed}`)
  }
  // 归一规则（丢文档页/前缀）集中在 `serverAddressKey` —— 配置解析（判断"当前地址是
  // 哪个预设"）也要用同一套，否则同一个服务器在两处会算出不同字符串，凭据就发错地方了。
  return serverAddressKey(trimmed)
}

function apiBase(base: string): string {
  return `${normalizeBaseUrl(base)}${SERVER_API_PREFIX}`
}

/** 拼一个 API 路径（`/auth/me` → `http://host/api/v1/auth/me`）。 */
export function apiUrl(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${normalizeBaseUrl(base)}${SERVER_API_PREFIX}${suffix}`
}

/**
 * 归一用户粘贴的 API Key。
 *
 * 容忍 `Bearer ` 前缀与首尾空白（从 `.env` / 文档里复制时的常见形态），
 * 不做格式硬校验 —— 格式合法性由**服务器**裁决，我们只拦明显为空的情况。
 */
export function normalizeApiKey(raw: string): string {
  return (raw ?? '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .trim()
}

/* ════════════════════════════════════════════════════════════════════════
 * 请求内核
 * ════════════════════════════════════════════════════════════════════════ */

export interface ServerRequestOptions {
  /** 网络实现（测试注入；缺省 = 全局 `fetch`）。 */
  fetchImpl?: FetchLike
  /** 超时（毫秒）；缺省 {@link SERVER_TIMEOUT_MS}。 */
  timeoutMs?: number
  /**
   * **这项工作在本机的身份** `workspace_id`（`ws_…`）——写请求一律带上，作为 `X-Workspace-Id` 头。
   *
   * 为什么：写操作（传状态 / 传附件 / 发布）都只按 `project_id` 定位项目，而本机的
   * "哪个工作对应哪个项目"是一张**本地映射**；映射一旦指错（用户会在同一个会话工作区里
   * 换进换出多项研究），写就会落到**别人的项目**上（覆盖，不可逆）。
   *
   * 带上身份之后，服务器可以**校验并拒绝**不匹配的写入（见
   * `dev-notes/v0.6.2-workspace-write-guard-api.md`）。服务器不认识这个头时忽略即可，
   * 插件行为不变（老服务器照旧工作）。
   */
  workspaceId?: string | null
}

/**
 * 项目文件空间的**两侧**（服务器 `?source=`）：一个项目里同一路径可以同时存在两份 ——
 * 学生自己那份（`owner`）与**导师回传的那份**（`mentor`），互不覆盖。
 *
 * 谁读哪一侧是有规矩的（v0.5.4 / 协议 v20）：
 *
 * | 动作 | 读哪一侧 | 为什么 |
 * |---|---|---|
 * | 导师**回传**前的增量比对 | `mentor` | 比的是"我这一侧已经有什么"（与学生那份无关） |
 * | 学生**回传**前的增量比对 | `owner` | 学生写的是自己那一侧 |
 * | 导师【下载】学生的工作区 | `owner`（默认） | 他要看的是学生推进到哪了 |
 * | 学生【下载】导师的交付 | `mentor` | 导师回传的是"他推进到的最新版"，解压即可接着做 |
 *
 * ⚠️ 省略 `source` = 服务器默认读 `owner`（"同步我的 workspace"口径）——
 * 这正是旧客户端（v0.5.3）在新服务器上不会出错、但也**看不到**导师那份的原因。
 */
export type FileSource = 'owner' | 'mentor'

/**
 * `?source=` 查询串：**只在读导师那一侧时显式加**（`owner` 是服务器默认，省略即可）。
 *
 * 为什么不写 `?source=owner`：旧服务器（v0.5.3 时代）还没有这个参数。多带一个它不认识的
 * 查询参数会被忽略 —— 而**导师那一侧**在旧服务器上恰好就是"唯一的那个文件空间"，
 * 所以显式 `?source=mentor` 被忽略后读到的正是导师上传的文件，增量比对照旧正确。
 * 反过来，`?source=owner` 被忽略也对，只是多余。
 */
function sourceQuery(source?: FileSource): string {
  return source === 'mentor' ? '?source=mentor' : ''
}

/**
 * 正文"卡死"判据：连续这么久**一个字节都没有**才算断，而不是给整段设总时长。
 *
 * 为什么不是总时长上限：这条链路的实测速率 ~118 KB/s，一个十几 MB 的工作区快照
 * 本来就要一两分钟 —— 用总时长卡会把"慢"误判成"死"。而 30 秒没有任何数据，
 * 在任何链路上都只能是断了。
 */
export const STALL_TIMEOUT_MS = 30_000

/**
 * 二进制下载的选项（归档 / 附件）。在 {@link ServerRequestOptions} 之上加"边收边给"。
 *
 * `onChunk` 一给，正文就**不再驻留内存**：调用方拿到一块写一块（写盘），
 * 因此进度是真的、内存不随文件大小增长。
 */
export interface BinaryStreamOptions extends ServerRequestOptions {
  /** 每收到一块就回调（**顺序**调用，调用方可以同步写盘）。 */
  onChunk?: (chunk: Uint8Array) => void
  /** 累计收到多少字节（进度用；每块一次）。 */
  onProgress?: (received: number) => void
  /** 无数据的容忍时长（毫秒）；缺省 {@link STALL_TIMEOUT_MS}。 */
  stallTimeoutMs?: number
}

function errorBodyMessage(body: unknown): {
  serverCode?: string
  message?: string
  retryAfterSeconds?: number
} {
  if (!body || typeof body !== 'object') return {}
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return {}
  const e = error as { code?: unknown; message?: unknown; details?: unknown }
  const details = (e.details && typeof e.details === 'object' ? e.details : {}) as Record<string, unknown>
  const retry = details.retry_after_seconds
  return {
    ...(typeof e.code === 'string' ? { serverCode: e.code } : {}),
    ...(typeof e.message === 'string' ? { message: e.message } : {}),
    ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}),
  }
}

/** 统一错误契约里的 `error.details`（402 的 required / available 就在这里）。 */
function errorBodyDetails(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return {}
  const details = (error as { details?: unknown }).details
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : {}
}

/**
 * 把 HTTP 失败翻成带**动作**的错误。
 *
 * 依据：`ConvFusion-server/docs/API.md` §2.4 / §3.2 的错误码表。
 */
function mapHttpError(status: number, body: unknown): ServerError {
  const { serverCode, message, retryAfterSeconds } = errorBodyMessage(body)
  const where = (fallback: string): string => (message ? `${fallback}（服务器：${message}）` : fallback)
  const withCode = { httpStatus: status, ...(serverCode ? { serverCode } : {}) }

  if (status === 401) {
    return new ServerError(
      'invalid-key',
      serverCode === 'API_KEY_REVOKED'
        ? '这个 API Key 已被撤销，请换一份有效的 Key。'
        : where('API Key 无效或不存在，请核对后重试。'),
      withCode,
    )
  }
  if (status === 402) {
    // ⚠️ 402 **不是**暂时性故障，它是"余额不足"这一业务事实：既不要自动重试，
    // 也不要把 Idempotency-Key 丢掉 —— 拿到 Token 后用**同一个 Key** 重试即可，
    // 服务端会回放上次的结果，不会重复扣费（见 INTEGRATION.md §5）。
    const details = errorBodyDetails(body)
    const required = typeof details.required === 'number' ? details.required : undefined
    const available = typeof details.available === 'number' ? details.available : undefined
    // 服务器只在**资金池专属**的扣费路径（付给导师 / 提现）给出 funded + grant，
    // 由此可以分辨两种 402："钱不够"与"有赠送额度但那一池不能付给导师"。
    const funded = typeof details.funded === 'number' ? details.funded : undefined
    const grant = typeof details.grant === 'number' ? details.grant : undefined
    const balance =
      required === undefined || available === undefined
        ? 'Token 余额不足。'
        : funded === undefined
          ? `Token 余额不足：本次需要 ${required} 个，当前可用 ${available} 个。`
          : // 赠送额度**只在服务器真给了这个数**时才提（拿不到就不编一个 0 出来）
            `资金池不足：本次需要 ${required} 个，资金池可用 ${funded} 个（` +
            (grant === undefined ? '' : `另有赠送额度 ${grant} 个，`) +
            '赠送额度不能付给导师、也不能提现）。'
    return new ServerError(
      'insufficient-tokens',
      // ⚠️ 不要在这条**用户可见**的文案里写 markdown（`**` 会原样显示成星号）。
      // 自助付费尚未开通（见 community.token.renewHint）→ 唯一动作是找管理员发放，
      // 这句话必须出现在**错误本身**里，界面直接展示 message 时也不会漏掉动作。
      `${balance}测试阶段请联系管理员发放 Token；` +
        '拿到后重试即可，不会重复扣费。',
      {
        ...withCode,
        ...(required === undefined ? {} : { requiredTokens: required }),
        ...(available === undefined ? {} : { availableTokens: available }),
        ...(funded === undefined ? {} : { fundedTokens: funded }),
        ...(grant === undefined ? {} : { grantTokens: grant }),
      },
    )
  }
  if (status === 403) {
    if (serverCode === 'FULL_STATE_ACCESS_REQUIRED') {
      return new ServerError(
        'no-relationship',
        '完整研究状态需要有效的导师关系；当前账号与该研究还没有关系。',
        withCode,
      )
    }
    // 导师越界写（非 review/ 路径）：**不是**"没权限"，而是"服务器只放开了 review/"。
    // ⚠️ 必须排在 account-inactive 兜底之前 —— 否则会被误报成"账号被停用"。
    if (serverCode === 'FILE_PATH_RESERVED') {
      return new ServerError(
        'path-reserved',
        `当前服务器只允许导师写 ${MENTOR_REVIEW_PREFIX}/ 目录下的文件；回传整份工作区需要服务器放开这条限制（其余路径由学生本人维护）。`,
        { ...withCode, serverCode },
      )
    }
    return new ServerError(
      'account-inactive',
      where('账号未激活或被停用，请联系 ConvFusion.com 管理员。'),
      withCode,
    )
  }
  if (status === 404) {
    // 私有项目对非 owner 会**伪装成不存在**（不泄漏存在性），所以文案不能断言"不存在"
    return new ServerError('not-found', '这项研究工作不存在，或尚未公开、对你不可见。', withCode)
  }
  if (status === 429) {
    const wait = retryAfterSeconds ?? 0
    const hint =
      wait >= 60 ? `请约 ${Math.ceil(wait / 60)} 分钟后再试。` : wait > 0 ? `请 ${wait} 秒后再试。` : '请稍后再试。'
    return new ServerError('rate-limited', `请求过于频繁。${hint}`, {
      ...withCode,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    })
  }
  if (status === 409) {
    if (serverCode === 'INVITATION_USED') {
      return new ServerError('invitation-used', '这个邀请码已经被使用过了；如果你已经注册，请改用 API Key 登录。', {
        ...withCode,
        serverCode,
      })
    }
    if (serverCode === 'CONFLICT') {
      return new ServerError('email-taken', '这个邮箱已经注册过了；请改用 API Key 登录。', {
        ...withCode,
        serverCode,
      })
    }
    if (serverCode === 'STATE_VERSION_CONFLICT') {
      const details = errorBodyDetails(body)
      const current = typeof details.current_version === 'number' ? details.current_version : undefined
      return new ServerError(
        'version-conflict',
        '研究状态已被更新（版本冲突）。请基于最新版本重试。',
        { ...withCode, ...(current === undefined ? {} : { currentVersion: current }) },
      )
    }
    if (serverCode === 'IDEMPOTENCY_KEY_REUSED') {
      return new ServerError(
        'idempotency-reused',
        '同一个请求标识被用于了不同的内容（客户端问题）。请重新发起这次查看。',
        withCode,
      )
    }
    // 指导提案的状态在操作期间变了：不是输入错误，而是"别人已经动过了"。
    // 单独分类，界面才能做出正确动作（刷新列表），而不是让用户去改表单。
    if (serverCode === 'PROPOSAL_INVALID_STATE') {
      return new ServerError(
        'proposal-state',
        '这条指导申请已经不在可接受的状态了（可能已被处理、或已过期）。列表已刷新。',
        { ...withCode, serverCode },
      )
    }
    if (serverCode === 'PROJECT_ALREADY_HAS_ACTIVE_MENTORSHIP') {
      return new ServerError(
        'proposal-state',
        '这个项目已经有生效的指导关系了。请刷新列表。',
        { ...withCode, serverCode },
      )
    }
  }
  if (status === 400 || status === 422) {
    if (serverCode === 'INVALID_INVITATION' || serverCode === 'INVITATION_EXPIRED') {
      return new ServerError(
        'invalid-invitation',
        serverCode === 'INVITATION_EXPIRED'
          ? '邀请码已过期，请向管理员索取新的邀请码。'
          : where('邀请码无效，或与填写的邮箱不匹配。'),
        { ...withCode, serverCode },
      )
    }
    return new ServerError('bad-request', where('请求被服务器拒绝，请检查填写的内容。'), withCode)
  }
  if (status >= 500) {
    return new ServerError('server-error', where('服务器内部错误，请稍后重试。'), withCode)
  }
  return new ServerError('bad-request', where(`请求失败（HTTP ${status}）。`), withCode)
}

/** 一次 JSON 请求：统一超时、统一错误映射。**不重试**（鉴权调用重试没有意义）。 */
async function requestJson(
  base: string,
  path: string,
  init: { method: string; body?: unknown; apiKey?: string; idempotencyKey?: string },
  options: ServerRequestOptions,
  label: string,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (typeof fetchImpl !== 'function') {
    throw new ServerError('unreachable', '当前运行环境没有可用的 fetch。')
  }
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? SERVER_TIMEOUT_MS
  const url = apiUrl(base, path)

  // ⚠️ 只 `abort()` 是不够的：abort 依赖传输层**真的**尊重 signal。所以同时 **race**
  // 一个超时 promise —— 即使底层请求永不 settle（网络栈卡住、假 fetch），调用方也一定
  // 会拿到一个可显示的失败，而不是永远转圈。这条教训在客户端加载器里已经吃过一次
  // （见 `src/client/settings.tsx` 的 `loadSettingsState`）。
  const timeoutError = new ServerError(
    'unreachable',
    `连接 ${base} 超时（${Math.round(timeoutMs / 1000)} 秒无响应）。请确认服务器已启动、地址与端口正确。`,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(timeoutError)
    }, timeoutMs)
  })

  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await Promise.race([
      fetchImpl(url, {
        method: init.method,
        headers: {
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.apiKey ? { authorization: `Bearer ${init.apiKey}` } : {}),
          // 幂等键：**同一次业务意图**重试必须复用（402 后充值再试就靠它不重复扣费）
          ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
          // 这项工作是谁：服务器据此拒绝"往别人的项目里写"（老服务器忽略该头）
          ...(options.workspaceId ? { 'x-workspace-id': options.workspaceId } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
      }),
      timeout,
    ])
  } catch (e) {
    if (e instanceof ServerError) throw e // 超时（上面那个 race 的拒绝）
    throw new ServerError(
      'unreachable',
      `无法连接 ${base}：${e instanceof Error ? e.message : String(e)}。请确认服务器已启动。`,
    )
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }

  if (!res.ok) {
    /*
     * 自检用的诊断（`CF_NET_DEBUG=1` 才输出）：把"哪个请求失败、服务器给了什么码"
     * 打出来。错误对象里只有映射后的 code+文案，没有路径 —— 排查 403/409 时
     * 光看文案无法判断是哪一条调用（2026-10 查写守卫/下载权限时踩过）。
     */
    if (process.env.CF_NET_DEBUG) {
      const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code
      console.error('[net] %s %s → %d %s', init.method, path, res.status, String(code ?? ''))
    }
    throw mapHttpError(res.status, body)
  }
  if (body === undefined) {
    throw new ServerError('bad-response', `${label}：服务器返回的不是 JSON。`)
  }
  return body
}

/**
 * **只问"这台服务器活着吗"**：`GET /api/v1/health`（存活探针，无需身份）。
 *
 * ⚠️ **一个字节的凭据都不带**。设置页用它给两个快捷按钮上色（通了=绿），而"服务器是否可达"
 * 本来就不需要身份；带 Key 就等于把凭据发到（用户可能手输的）任意地址上，那是白送。
 * 服务器那边 `/api/v1/health` 是公开探针（代理与 live 验证脚本都用它），所以这条路可行。
 *
 * 失败一律抛 {@link ServerError}，理由（超时 / 拒绝 / 4xx）由调用方决定怎么显示。
 */
export async function probeServerHealth(
  base: string,
  options: ServerRequestOptions = {},
): Promise<void> {
  await requestJson(base, '/health', { method: 'GET' }, options, '服务器连通性检查')
}

/* ════════════════════════════════════════════════════════════════════════
 * 两个业务动作
 * ════════════════════════════════════════════════════════════════════════ */

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 解析 `GET /auth/me` 的响应。 */
function parseAccount(body: unknown): ServerAccount {
  if (!body || typeof body !== 'object') {
    throw new ServerError('bad-response', '账号信息格式不正确（不是对象）。')
  }
  const b = body as Record<string, unknown>
  const id = asString(b.id)
  const email = asString(b.email)
  if (!id || !email) {
    throw new ServerError('bad-response', '账号信息缺少 id / email 字段。')
  }
  return {
    id,
    email,
    displayName: asString(b.display_name) || email.split('@')[0] || email,
    status: asString(b.status) || 'ACTIVE',
    roles: Array.isArray(b.roles) ? b.roles.filter((r): r is string => typeof r === 'string') : [],
  }
}

/**
 * 用一份 API Key 做身份自检（连通性 + Key 有效性 + 账号状态 + 角色）。
 *
 * 对应 `INTEGRATION.md` §3 ①：「建议作为插件启动时的第一个调用」。
 *
 * @throws {ServerError} `invalid-key` / `account-inactive` / `unreachable` / …
 */
export async function fetchAccount(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<ServerAccount> {
  const key = normalizeApiKey(apiKey)
  if (!key) throw new ServerError('bad-request', 'API Key 不能为空。')
  const body = await requestJson(base, '/auth/me', { method: 'GET', apiKey: key }, options, '身份验证')
  return parseAccount(body)
}

/**
 * 凭邀请码注册：创建用户并**直接得到一份 API Key**（服务器只在这一次返回明文）。
 *
 * 注册成功后立刻用新 Key 做一次 `/auth/me`，因为
 * `POST /auth/invitations/accept` 的响应里**没有** `roles` —— 而角色决定
 * 界面上能做什么（`RESEARCHER` / `MENTOR` / `ADMIN`）。多一次调用换取完整身份，值。
 *
 * @throws {ServerError} `invalid-invitation` / `invitation-used` / `email-taken` / …
 */
export async function acceptInvitation(
  base: string,
  input: { invitationCode: string; email: string; displayName: string },
  options: ServerRequestOptions = {},
): Promise<{ account: ServerAccount; apiKey: string }> {
  const invitationCode = input.invitationCode.trim()
  const email = input.email.trim()
  const displayName = input.displayName.trim()
  if (!invitationCode) throw new ServerError('bad-request', '邀请码不能为空。')
  if (!email) throw new ServerError('bad-request', '邮箱不能为空。')
  if (!displayName) throw new ServerError('bad-request', '显示名不能为空。')

  const body = await requestJson(
    base,
    '/auth/invitations/accept',
    {
      method: 'POST',
      body: { invitation_code: invitationCode, email, display_name: displayName },
    },
    options,
    '邀请码注册',
  )
  const b = (body ?? {}) as Record<string, unknown>
  const apiKey = normalizeApiKey(asString(b.api_key))
  if (!apiKey) {
    throw new ServerError('bad-response', '注册成功但服务器没有返回 API Key；请用 API Key 登录重试。')
  }
  const account = await fetchAccount(base, apiKey, options)
  return { account, apiKey }
}

/**
 * 读 Token 余额（免费接口，不消耗 Token）。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export async function fetchTokenBalance(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<TokenBalance> {
  const key = requireKey(apiKey)
  const body = await requestJson(base, '/tokens', { method: 'GET', apiKey: key }, options, 'Token 余额')
  const b = asObject(body, 'Token 余额')
  const available = asNumber(b.available_balance)
  const frozen = asNumber(b.frozen_balance)
  return {
    available,
    frozen,
    // 服务器会给 total；真缺了就自己加，但服务器给的值优先
    total: b.total_balance === undefined ? available + frozen : asNumber(b.total_balance),
    // ⚠️ 两池是**三态**：缺字段读作 null（旧服务器不分开说），不能读成 0 ——
    // 读成 0 会让界面把"能付导师"说成 0，把一个好好的账号拦在【接受】外面。
    grant: optionalNumber(b.grant_balance),
    funded: optionalNumber(b.funded_balance),
  }
}

/**
 * 续费申请的状态（与服务器 `RechargeRequestStatus` 对齐）。
 *
 * `PENDING` = 等管理员处理；`APPROVED` = 已批准并发放（账本里有一条 `GRANT`）；
 * `REJECTED` = 被拒。界面上要让用户看见"我申请的现在到哪一步了"。
 */
export type RechargeStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/**
 * 一条续费申请（`POST /api/v1/tokens/recharge-requests` 的返回，snake_case → camelCase）。
 *
 * ⚠️ 这只是**意向记录** —— `submit` 不改余额；只有管理员批准后才会真正发 Token
 * （那时 `grant_tx_id` 会指向账本里那条 `GRANT` 流水）。
 */
export interface RechargeRequest {
  id: string
  amount: number
  reason: string | null
  status: RechargeStatus
  /** 管理员审批时写的备注（批准 / 拒绝的理由）。 */
  note: string | null
  /** 批准这条申请的管理员（未审批时为 null）。 */
  reviewedBy: string | null
  reviewedAt: string | null
  /** 批准时发放 Token 写进账本的那条流水 id（未批准为 null）。 */
  grantTxId: string | null
  createdAt: string
  updatedAt: string
}

/** 解析一条续费申请（snake_case → camelCase）。 */
function parseRechargeRequest(raw: unknown): RechargeRequest {
  const b = asObject(raw, '续费申请')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '续费申请缺少 id 字段。')
  return {
    id,
    amount: asNumber(b.amount),
    reason: asString(b.reason) || null,
    status: (asString(b.status) || 'PENDING') as RechargeStatus,
    note: asString(b.note) || null,
    reviewedBy: asString(b.reviewed_by) || null,
    reviewedAt: asString(b.reviewed_at) || null,
    grantTxId: asString(b.grant_tx_id) || null,
    createdAt: asString(b.created_at),
    updatedAt: asString(b.updated_at),
  }
}

/**
 * 提交续费申请（`POST /api/v1/tokens/recharge-requests`）。
 *
 * 只记录意向，**不改余额** —— 真正发 Token 要等管理员批准。服务器 `submit` **不幂等**
 * （每次 POST 都新增一条 `PENDING`），所以防重复申请要靠调用方先 `fetchRechargeRequests`
 * 看有没有还没处理的，而不是靠重试。
 *
 * @throws {ServerError} `bad-request`（amount 非正整数）/ `invalid-key` / `unreachable` / …
 */
export async function submitRechargeRequest(
  base: string,
  apiKey: string,
  input: { amount: number; reason?: string },
  options: ServerRequestOptions = {},
): Promise<RechargeRequest> {
  const key = requireKey(apiKey)
  const amount = input.amount
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ServerError('bad-request', '申请数量必须是正整数。')
  }
  const reason = (input.reason ?? '').trim()
  const body = await requestJson(
    base,
    '/tokens/recharge-requests',
    {
      method: 'POST',
      apiKey: key,
      body: { amount, ...(reason ? { reason } : {}) },
    },
    options,
    '提交续费申请',
  )
  return parseRechargeRequest(body)
}

/**
 * 查看自己的续费申请记录（`GET /api/v1/tokens/recharge-requests`）。
 *
 * 只返回**本人**的申请（服务器按当前凭据的 user_id 过滤）。界面用它判断"是否已有一条
 * 待处理的申请"，从而阻止用户连点出多条 `PENDING`。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export async function fetchRechargeRequests(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<RechargeRequest[]> {
  const key = requireKey(apiKey)
  const body = await requestJson(
    base,
    '/tokens/recharge-requests',
    { method: 'GET', apiKey: key },
    options,
    '续费申请记录',
  )
  const b = asObject(body, '续费申请记录')
  const items = b.items
  if (!Array.isArray(items)) {
    throw new ServerError('bad-response', '续费申请记录缺少 items 字段。')
  }
  return items.map(parseRechargeRequest)
}

/**
 * 用量与配额（`GET /api/v1/usage`）。
 *
 * 发布前要同时回答两个问题：**这次要花多少 Token**、**还装得下多少字节**。
 * 服务器一次调用就都给出来（`services/quota.py` 的 `UsageService.snapshot`）。
 */
export interface ServerUsage {
  /** 下一个项目发布要花的 Token（1–3 个=1、4–6 个=2…，已付费项目重复发布免费）。 */
  nextPublishCost: number
  /** 已付费（曾经发布过）的项目数。 */
  paidProjects: number
  /** 项目层级（阶梯号）。 */
  tier: number
  storage: {
    usedBytes: number
    capacityBytes: number
    availableBytes: number
    /** 每 N 字节 1 Token（扩容单价的分母）。 */
    bytesPerToken: number
  }
}

/** 读用量与配额。**失败时返回 null**（调用方按"未知"展示，不阻塞发布）。 */
export async function fetchUsage(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<ServerUsage | null> {
  const key = requireKey(apiKey)
  try {
    const body = await requestJson(base, '/usage', { method: 'GET', apiKey: key }, options, '用量与配额')
    const root = asObject(body, '用量与配额')
    const projects = asObject(root.projects, '项目用量')
    const storage = asObject(root.storage, '存储用量')
    return {
      nextPublishCost: asNumber(projects.next_publish_cost, 0),
      paidProjects: asNumber(projects.paid_alive, 0),
      tier: asNumber(projects.tier, 1),
      storage: {
        usedBytes: asNumber(storage.used_bytes, 0),
        capacityBytes: asNumber(storage.capacity_bytes, 0),
        availableBytes: asNumber(storage.available_bytes, 0),
        bytesPerToken: asNumber(storage.bytes_per_token, 0),
      },
    }
  } catch {
    return null
  }
}

/**
 * **挂牌价参考**（`GET /mentorship/price-guide`）。
 *
 * 出题（`SEEK_STUDENT`）的导师用它决定自己开多少；数字**全部由服务器定价配置算出**
 * （`PaperPriceCalculator`），客户端不自带价目表 —— 写死价目的界面在平台调价那天会
 * **撒谎**，而且是没人会立刻发现的那种（服务器文档 `payment-system.md` §3.2.6）。
 *
 * 失败（旧服务器 404 / 网络抖动 / 后端降级）→ **返回 `null`**：界面退化成"直接填价格"，
 * 而不是让整个发布对话框打不开 —— 标价是**可选**信息，不该挡住发布。
 */
export async function fetchPriceGuide(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<PriceGuide | null> {
  try {
    const key = requireKey(apiKey)
    const body = await requestJson(base, '/mentorship/price-guide', { method: 'GET', apiKey: key }, options, '价目参考')
    const root = asObject(body, '价目参考')
    const tiers: PriceGuide['tiers'] = []
    const rawTiers = Array.isArray(root.tiers) ? root.tiers : []
    for (const raw of rawTiers) {
      const t = asObject(raw, '价目档位')
      const tokens = Math.trunc(asNumber(t.tokens, 0))
      const label = asString(t.label)
      if (tokens < 1 || !label) continue
      tiers.push({
        jcrLevel: Math.trunc(asNumber(t.jcr_level, 0)),
        ccfLevel: asString(t.ccf_level) || null,
        label,
        tokens,
      })
    }
    return {
      // 硬下限由服务器给（当前 1），这里不写死：平台若调整，界面跟着走
      minAllowed: Math.max(1, Math.trunc(asNumber(root.min_allowed, 1))),
      recommendedMin: Math.trunc(asNumber(root.recommended_min, 0)),
      recommendedMax: Math.trunc(asNumber(root.recommended_max, 0)),
      tokenValueFen: Math.trunc(asNumber(root.token_value_fen, 0)),
      tiers,
    }
  } catch {
    return null
  }
}

/**
 * 上传附件（`POST /projects/{id}/files`，multipart）。
 *
 * ⚠️ 三条服务器事实决定了这里的写法：
 *
 * 1. **不去重**：同一路径重复上传 = 新行 + 新字节。所以调用方必须先算好
 *    "哪些文件变了"（内容 sha256），这里只管把给定文件传上去。
 * 2. **一次 ≤20 个文件 / ≤200 MB**：批量切分由 `planUploadBatches` 负责。
 * 3. `relative_paths` 与 `files` **按下标对齐**，是服务器还原目录树的依据。
 *
 * @returns 服务器为每个文件返回的元数据（含 `size` 与 `sha256`，可用于更新本地指纹）
 */
export interface UploadedFile {
  id: string
  relativePath: string
  size: number
  sha256: string
}

/** 把一个相对路径规范化成"服务器将来会原样存下来"的形状（仅用于拼上传路径）。 */
function joinRelativePath(prefix: string, name: string): string {
  const clean = name.replace(/^[./\\]+/, '').replace(/\\/g, '/')
  return prefix ? `${prefix}/${clean}` : clean
}

/**
 * 往项目文件空间传一组文件（**共用底层**）。
 *
 * 抽出来的理由：发布（传自己的研究附件）与指导闭环（导师传指导产物）用的是
 * 同一个端点、同一套 multipart 形状与错误映射，抄两遍必然漂移。
 */
async function postProjectFiles(
  base: string,
  apiKey: string,
  projectId: string,
  files: ReadonlyArray<{ relPath: string; bytes: Uint8Array }>,
  options: { stateVersion?: number } & ServerRequestOptions,
  timeoutMessage: string,
): Promise<UploadedFile[]> {
  const { stateVersion, fetchImpl: fetchOption, timeoutMs, workspaceId } = options
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  if (files.length === 0) return []
  const fetchImpl = fetchOption ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (typeof fetchImpl !== 'function') throw new ServerError('unreachable', '当前运行环境没有可用的 fetch。')

  const form = new FormData()
  for (const f of files) {
    const name = f.relPath.slice(f.relPath.lastIndexOf('/') + 1)
    // ⚠️ 必须转成 `ArrayBuffer`：`Buffer`/`Uint8Array<ArrayBufferLike>` 在 TS 里
    // 不能直接当 `BlobPart`（`SharedArrayBuffer` 的可能性），运行期也会被拒。
    const view = f.bytes
    const buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    form.append('files', new Blob([buf]), name)
    form.append('relative_paths', f.relPath)
  }
  if (stateVersion !== undefined) form.append('state_version', String(stateVersion))

  const timeout = timeoutMs ?? SERVER_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(
        new ServerError('unreachable', `${timeoutMessage}到 ${base} 超时（${Math.round(timeout / 1000)} 秒）。`),
      )
    }, timeout)
  })
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await Promise.race([
      fetchImpl(`${apiBase(base)}/projects/${encodeURIComponent(id)}/files`, {
        method: 'POST',
        // ⚠️ 不设 content-type：multipart 的 boundary 由运行时生成
        headers: {
          authorization: `Bearer ${key}`,
          // 这项工作是谁：与 JSON 写请求同一个头（服务器据此拒绝"往别人的项目里写"）
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: form,
        signal: controller.signal,
      }),
      timeoutPromise,
    ])
  } catch (e) {
    if (e instanceof ServerError) throw e
    throw new ServerError(
      'unreachable',
      `${timeoutMessage}失败：${e instanceof Error ? e.message : String(e)}`,
    )
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  if (!res.ok) throw mapHttpError(res.status, body)
  if (!Array.isArray(body)) throw new ServerError('bad-response', '附件上传的响应不是数组。')
  return body.map((raw) => {
    const b = asObject(raw, '附件元数据')
    return {
      id: asString(b.id),
      relativePath: asString(b.relative_path),
      size: asNumber(b.size, 0),
      sha256: asString(b.sha256),
    }
  })
}

export async function uploadProjectFiles(
  base: string,
  apiKey: string,
  projectId: string,
  files: ReadonlyArray<{ relPath: string; bytes: Uint8Array }>,
  options: { stateVersion?: number } & ServerRequestOptions = {},
): Promise<UploadedFile[]> {
  return await postProjectFiles(base, apiKey, projectId, files, options, '上传附件')
}

/**
 * 导师的**保留前缀**（历史上的约定，服务器已不再强制）。
 *
 * | 谁 | 可写路径 |
 * |---|---|
 * | 项目 owner | 任意路径（写进 `owner` 侧） |
 * | 有效研究关系的另一方（导师） | 任意路径（写进 `mentor` 侧，见 {@link FileSource}） |
 *
 * ⚠️ 保留这个常量的唯一用途是**读旧服务器的报错**：v0.5.3 时代的服务器只允许导师写
 * `review/**`，越界给 `403 FILE_PATH_RESERVED`。那时整包回传会失败，界面必须**如实说**
 * "服务器需要放开这条限制"（不假装成功、也不偷偷只传 `review/`）。
 * 新服务器起该错误码不再产生。
 */
export const MENTOR_REVIEW_PREFIX = 'review'

/**
 * 导师回传"我这一份工作区"：把选中的文件按**原相对路径**传到项目文件空间。
 *
 * 与 {@link uploadProjectFiles}（owner 发布）走同一个端点与同一套 multipart 形状；
 * 分开命名是因为**两边落地不同**：服务器按"谁写的"把文件分到 `owner` / `mentor` 两侧
 * （{@link FileSource}）—— 导师回传的 `project.md` 与学生自己那份**同名而互不覆盖**。
 * 旧服务器上会拿到 403 `path-reserved`（"还不允许导师写 `review/` 之外的路径"）。
 *
 * 同一侧内按 `relative_path` 取最新一版；导师本地**删掉**的文件不会因此消失
 * （无删除语义，见 `dev-notes/v0.5.4-mentor-workspace-upload.md`）。
 *
 * @param files 相对**研究根**的路径（`project.md` / `papers/...` / `review/...`）
 */
export async function uploadWorkspaceFiles(
  base: string,
  apiKey: string,
  projectId: string,
  files: ReadonlyArray<{ relPath: string; bytes: Uint8Array }>,
  options: ServerRequestOptions = {},
): Promise<UploadedFile[]> {
  for (const f of files) {
    // 早于服务器一步拦住：路径不能是绝对路径 / 带 `..`（服务器也会再净化一次）
    const rel = (f.relPath ?? '').trim()
    if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) {
      throw new ServerError('bad-request', `回传路径不合法：${f.relPath}`)
    }
  }
  return await postProjectFiles(base, apiKey, projectId, files, options, '回传研究进展')
}

/** 项目文件空间里的一个文件（`GET /projects/{id}/files` 的条目）。 */
export interface RemoteProjectFile {
  id: string
  relativePath: string
  size: number
  /**
   * 服务器存的**内容摘要**（`FileResponse.sha256`）。
   *
   * 导师整包回传靠它做**增量**：本地算同一个摘要，和服务器最新的这一版一致就跳过 ——
   * 服务器不去重（同路径再传 = 新行 + 新字节，配额照涨），而导师回传的多数文件
   * 本来就没动过。旧服务器不给这个字段时为空串（调用方据此**保守地全传**）。
   */
  sha256: string
}

/**
 * 列出项目工作区的**全部**文件。
 *
 * 读权限 = owner 或**活跃研究关系方**（服务器 `FileService._readable_project`），
 * 所以导师不需要额外授权就能同步学生的工作区。
 *
 * ⚠️ 同一路径会有**多行历史**（文件不可变、不覆盖）。导师回传做增量时要用
 * "每路径最后一版"，所以这里保留数组原样（服务器按 `created_at asc` 返回，
 * 后者覆盖前者）—— 需要最新视图的调用方自己折叠。
 */
export async function fetchProjectFiles(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions & { source?: FileSource } = {},
): Promise<RemoteProjectFile[]> {
  return (await fetchProjectFilesWithIdentity(base, apiKey, projectId, options)).files
}

/**
 * 文件列表**加上这一侧的身份**（`workspace_id`）。
 *
 * 【下载】要回答"目标工作区里已有的 `workspace/` 是不是同一项研究"，判据就是它：
 * 服务器给"一项研究工作"一个全局唯一、跨项目生命周期不变的标识
 * （`ws_<32 hex>`；规格见 `dev-notes/v3-Workspace-Identity-API.md`）。
 *
 * ⚠️ 字段**在不在**决定行为，不按服务器版本号判断：
 * 老服务器不返回它 → `workspaceId = null` → 插件按"**无法校验**"处理（**不阻塞**下载）。
 * 形状非法（不是 `ws_…`）同样当"没给"——宁可少一道保护，也不要拿一个可疑的值去
 * 判定"这项研究是另一个"而误禁用户。
 *
 * 位置是**响应体顶层**（项目/工作区级属性），**不是** `items` 里的文件级字段。
 */
export async function fetchProjectFilesWithIdentity(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions & { source?: FileSource } = {},
): Promise<{ files: RemoteProjectFile[]; workspaceId: string | null }> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/files${sourceQuery(options.source)}`,
    { method: 'GET', apiKey: key },
    options,
    '项目文件列表',
  )
  const record = asRecord(body)
  const items = record?.items
  if (!Array.isArray(items)) {
    throw new ServerError('bad-response', '项目文件列表缺少 items 字段。')
  }
  const workspaceId = normalizeWorkspaceId(record?.workspace_id)
  const files = items.map((raw) => {
    const b = asRecord(raw) ?? {}
    const fileId = asString(b.id)
    const relativePath = asString(b.relative_path)
    if (!fileId || !relativePath) {
      throw new ServerError('bad-response', '项目文件条目缺少 id / relative_path。')
    }
    return { id: fileId, relativePath, size: asNumber(b.size), sha256: asString(b.sha256) }
  })
  return { files, workspaceId }
}

/**
 * 一个返回**原始字节**的 GET（不是 JSON，所以不能走 `requestJson`）。
 *
 * ⚠️ 失败时仍然要拿到服务器的**结构化错误**（403 未授权 / 404 不存在），
 * 否则界面只能显示"下载失败"，用户不知道是该去建立关系还是刷新列表。
 *
 * 两个阶段各有各的超时：**响应头**用 `timeoutMs`（服务器还在打包，超过就该说超时），
 * **正文**用 `stallTimeoutMs` 的卡死判据（见 {@link readBody}）。
 */
async function fetchBinary(
  base: string,
  path: string,
  apiKey: string,
  options: BinaryStreamOptions,
  label: string,
): Promise<{
  bytes: Uint8Array
  contentDisposition: string | null
  fileCount: number | null
  /** 归档水位（`X-Source-Updated-At`；不是归档的请求为 `null`）。 */
  sourceUpdatedAt: string | null
  /** 研究工作标识（`X-Workspace-Id`；老服务器 / 非归档请求为 `null`）。 */
  workspaceId: string | null
  received: number
}> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (typeof fetchImpl !== 'function') throw new ServerError('unreachable', '当前运行环境没有可用的 fetch。')
  const timeoutMs = options.timeoutMs ?? SERVER_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ServerError('unreachable', `${label}超时（${Math.round(timeoutMs / 1000)} 秒）。`))
    }, timeoutMs)
  })
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await Promise.race([
      fetchImpl(apiUrl(base, path), {
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }),
      timeout,
    ])
  } catch (e) {
    if (e instanceof ServerError) throw e
    throw new ServerError('unreachable', `${label}失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = undefined
    }
    throw mapHttpError(res.status, body)
  }
  const contentDisposition = res.headers?.get('content-disposition') ?? null
  const fileCount = asNumberOrNull(res.headers?.get('x-file-count'))
  /*
   * 这一版的水位（服务器 `GET /files/archive` 的 `X-Source-Updated-At`）。
   *
   * ⚠️ **只信归档自己报的**：下载前后列表里的 `workspace_updated_at` 可能与 ZIP 错位 ——
   * 取早了多提示一次（能接受），取晚了**会漏文件**（学生在下载途中又传了）。
   * 老服务器没这个头 → `null` → 调用方不存水位（宁可保持"未知"，不写个错的）。
   */
  const sourceUpdatedAt = res.headers?.get('x-source-updated-at') ?? null
  /*
   * 这一版归档属于**哪一项研究**（服务器 `GET /files/archive` 的 `X-Workspace-Id`）。
   *
   * 与 `GET /files` 响应体顶层的 `workspace_id` 是**同一个值**（服务器两侧一致），
   * 所以"预检时比对的目标"和"落盘后记下的身份"不会错位。老服务器没有这个头 → `null`
   * → 不写身份（保持"未知"比写一个错的强）。
   */
  const workspaceId = normalizeWorkspaceId(res.headers?.get('x-workspace-id'))
  const received = await readBody(res, options, label, controller)
  return {
    bytes: received.bytes,
    contentDisposition,
    fileCount,
    sourceUpdatedAt,
    workspaceId,
    received: received.total,
  }
}

/** `X-File-Count` 这类头：非数字/缺失都当"没给"，不是 0。 */
function asNumberOrNull(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** 人读的字节数（只在错误文案里用；界面那份在客户端）。 */
function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

/**
 * 读**正文**：有无新数据的**卡死超时**（stall），不是总时长上限。
 *
 * ## 为什么必须有这一段
 *
 * 2026-09 用户报【指导中】下载一直「读取中…」。根因之一是超时**只盖住了响应头**：
 * `fetch` 一拿到响应头 `Promise.race` 就结束、计时器被清掉，之后
 * `res.arrayBuffer()` 读正文**完全没有超时** —— 正文不来了就永远挂着。
 *
 * 判据用"**多久没有新数据**"而不是"总共花了多久"：这条链路实测 ~118 KB/s，
 * 一个 13.6 MB 的工作区快照**本来就要两分钟**，慢不等于死；而连续
 * {@link STALL_TIMEOUT_MS} 一个字节都没有，才是真的断了。
 *
 * @param onChunk 给了它就**边收边交出去**（调用方写盘），否则在内存里攒成整包
 */
async function readBody(
  res: Awaited<ReturnType<FetchLike>>,
  options: BinaryStreamOptions,
  label: string,
  controller: AbortController,
): Promise<{ bytes: Uint8Array; total: number }> {
  const stallMs = options.stallTimeoutMs ?? STALL_TIMEOUT_MS
  const onChunk = options.onChunk
  const onProgress = options.onProgress
  const chunks: Uint8Array[] = []
  let total = 0

  let stalled = false
  /**
   * 给一个 await 套上"卡死判据"：**每次等新数据都重新计时**，超时就抛。
   *
   * ⚠️ 不能只靠 `controller.abort()`：abort 会让**真实** fetch 的待决 `read()` 抛错，
   * 但那是运行时行为，不是我们这段逻辑的保证（测试里的假流就不会理它）。
   * 所以这里与一个会 reject 的计时器 race —— 到点必定收手，同时 abort 释放连接。
   *
   * `stall.catch(() => {})`：数据先到时这次 reject 没人接，不接会变成
   * unhandled rejection（Node 直接报错）。
   */
  const withStall = async <T>(p: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stall = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        stalled = true
        controller.abort()
        reject(
          new ServerError(
            'unreachable',
            `${label}中断：${Math.round(stallMs / 1000)} 秒没有收到数据（已收 ${humanBytes(total)}）—— 网络不稳或服务器中断，请重试。`,
          ),
        )
      }, stallMs)
    })
    stall.catch(() => {})
    try {
      return await Promise.race([p, stall])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  const take = (chunk: Uint8Array): void => {
    total += chunk.byteLength
    if (onChunk) onChunk(chunk)
    else chunks.push(chunk)
    onProgress?.(total)
  }

  try {
    const reader = res.body?.getReader?.()
    if (reader) {
      for (;;) {
        const { done, value } = await withStall(reader.read())
        if (done) break
        if (value && value.byteLength > 0) take(value)
      }
    } else {
      // 没有正文流（假 fetch / 老运行时）：退回一次性取回，此时 stall 是整段的上限
      const buf = new Uint8Array(await withStall(res.arrayBuffer()))
      if (buf.byteLength > 0) take(buf)
    }
  } catch (e) {
    if (stalled) {
      throw new ServerError(
        'unreachable',
        `${label}中断：${Math.round(stallMs / 1000)} 秒没有收到数据（已收 ${humanBytes(total)}）—— 网络不稳或服务器中断，请重试。`,
      )
    }
    throw new ServerError('unreachable', `${label}失败：${e instanceof Error ? e.message : String(e)}`)
  }
  if (onChunk) return { bytes: new Uint8Array(0), total }
  const merged = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    merged.set(c, at)
    at += c.byteLength
  }
  return { bytes: merged, total }
}

/** 从 `Content-Disposition` 里取文件名（优先 RFC 5987 的 `filename*`，其次 `filename=`）。 */
function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(value)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* 编码坏了就退回普通 filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value)
  return plain?.[1]?.trim() || null
}

/**
 * 下载项目工作区的 **ZIP 快照**（`GET /projects/{id}/files/archive`），
 * **边收边写进 `sink`**（不驻留内存、界面能看见进度）。
 *
 * ⚠️ 只把 ZIP 取回来落盘，**不解压**（2026-09 用户拍板）。文件名用服务器给的
 * （`<owner>-<title>[-mentor].zip`）—— 服务器才是命名的权威，插件不自造。
 *
 * `options.source` 选**哪一侧**的快照（见 {@link FileSource}）：导师下学生的工作区走默认
 * `owner`；学生取导师回传的那份走 `mentor`（服务器给的文件名带 `-mentor` 后缀）。
 *
 * 为什么要 `sink` 而不是返回 `Uint8Array`：这个快照实测 13.6 MB / 475 个文件，
 * 在 ~118 KB/s 的链路上要**两分钟**。收完再写等于这两分钟里磁盘上什么都没有
 * （用户 2026-09 报的「一直读取中」）；而且整包驻留内存随工作区规模膨胀。
 *
 * @param sink 写盘目标（宿主侧是 {@link openDownloadPart} 的 `.part` 文件）
 * @returns `received` 实际字节数、`filename` 服务器给的文件名、`fileCount` 服务器声明的条目数、
 *   `sourceUpdatedAt` 这一版的**水位**（`X-Source-Updated-At`，老服务器为 `null`）
 */
export async function fetchProjectArchive(
  base: string,
  apiKey: string,
  projectId: string,
  sink: { write(chunk: Uint8Array): void },
  options: BinaryStreamOptions & { source?: FileSource } = {},
): Promise<{
  received: number
  filename: string | null
  fileCount: number | null
  sourceUpdatedAt: string | null
  workspaceId: string | null
}> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const { contentDisposition, fileCount, sourceUpdatedAt, workspaceId, received } = await fetchBinary(
    base,
    `/projects/${encodeURIComponent(id)}/files/archive${sourceQuery(options.source)}`,
    key,
    { ...options, onChunk: (chunk) => sink.write(chunk) },
    '下载工作区快照',
  )
  return {
    received,
    filename: filenameFromDisposition(contentDisposition),
    fileCount,
    sourceUpdatedAt,
    workspaceId,
  }
}

/**
 * 下载一个文件的**原始字节**（不是 JSON，所以不能走 `requestJson`）。
 *
 * ⚠️ 失败时仍然要拿到服务器的**结构化错误**（403 未授权 / 404 不存在），
 * 否则界面只能显示"下载失败"，用户不知道是该去建立关系还是刷新列表。
 */
export async function fetchProjectFileBytes(
  base: string,
  apiKey: string,
  projectId: string,
  fileId: string,
  options: ServerRequestOptions = {},
): Promise<Uint8Array> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  const fid = (fileId ?? '').trim()
  if (!id || !fid) throw new ServerError('bad-request', '缺少 projectId / fileId。')
  const { bytes } = await fetchBinary(
    base,
    `/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(fid)}`,
    key,
    options,
    '下载文件',
  )
  return bytes
}

/* ════════════════════════════════════════════════════════════════════════
 * 发布自己的研究（Create → Upload → Publish）
 *
 * 对应 `ConvFusion-server/docs/projects.md`：
 *
 * ```text
 * ① POST /projects                     建项目（恒为 PRIVATE，不自动建 State）
 * ② POST /projects/{id}/state          首传 base_version=null → v1（后续必须等于当前版本）
 * ③ POST /projects/{id}/publish        visibility = PUBLISHED（幂等）
 * ```
 *
 * ⚠️ 文档明确警告：**不要发布没有状态的项目**（会在网络里产生空卡片），
 * 所以本模块把「上传 → 发布」当成一次操作，调用方不该只调 publish。
 * ⚠️ 已发布项目再上传状态，发现页**自动**反映最新版本 —— 不需要重新发布。
 * ════════════════════════════════════════════════════════════════════════ */

/** 服务器上的 Research Project（元数据）。 */
export interface ServerProject {
  id: string
  title: string
  description: string | null
  status: string
  visibility: string
  /** 这项研究工作的方向（见 {@link ProjectDirection}）。 */
  direction: ProjectDirection
  /**
   * **这项研究工作的名字**（服务器按内容解析：`work_name` → `research_question`
   * → `summary` → `title`，见 `dev-notes/v0.6.0-work-name-api.md`）。
   *
   * `null` = 服务器明确说不可知；`undefined` = **旧服务器还没有这个字段** →
   * 界面退回 `title`（不编造）。
   */
  workName?: string | null
  /**
   * **这项研究工作的标识** `workspace_id`（服务器给，`ws_<32 hex>`）。
   *
   * 它是"一项研究工作"的**全局唯一、跨项目生命周期不变**的身份（改题、改描述、
   * 项目被删后重建、重新发布都不变）—— 所以它是本机区分"这是哪一项研究"的**唯一**判据，
   * 不是主题（会变）也不是 `project_id`（一次发布一个）。
   *
   * - 有值 → 服务器认同的身份；
   * - `null` → 服务器**明确说没有**（老项目可能确实没有）；
   * - `undefined` → **旧服务器还没有这个字段** → 按"无法判定"处理（不阻塞，也不编造）。
   */
  workspaceId?: string | null
  /**
   * **挂牌价**（服务器 `asking_fee`，单位 Token）。
   *
   * 导师出题（`SEEK_STUDENT`）= 导师的挂牌价；学生发题（`SEEK_MENTOR`）= 学生的预算。
   * 它**不是成交价**：成交价仍写在提案的 `total_fee` 上（服务器文档
   * `payment-system.md` §3.2.5）。
   *
   * - `number` → 服务器上的挂牌价；
   * - `null` → **没挂牌价**（与 0 是两回事：免费不支持，最低 1）；
   * - `undefined` → **旧服务器没有这个字段**（不编造）。
   */
  askingFee?: number | null
  updatedAt: string
}

/**
 * **价目参考**（服务器 `GET /mentorship/price-guide` 的镜像）。
 *
 * 只有"该报多少"这一件事，不含任何计费逻辑 —— 计费与阶梯价都在服务器。
 */
export interface PriceGuide {
  /** 硬下限（当前 1：**免费不支持**）。 */
  minAllowed: number
  recommendedMin: number
  recommendedMax: number
  /** 1 Token 合多少分（当前 1000 = ¥10），界面用来显示"≈ ¥x,xxx"。 */
  tokenValueFen: number
  /** 全档价目（服务器的 `tiers`，按等级**降序**给）。 */
  tiers: Array<{ jcrLevel: number; ccfLevel: string | null; label: string; tokens: number }>
}

/** 上传研究状态的入参（`content` 是服务器的内容 Envelope，见 API.md §9.1）。 */
export interface UploadStateInput {
  /** `null` = 首传；否则必须等于服务端当前版本号。 */
  baseVersion: number | null
  content: Record<string, unknown>
  /** 一次「保存意图」一个 key；重试复用，payload 变了必须换新 key。 */
  intentKey: string
}

function parseProject(raw: unknown): ServerProject {
  const b = asObject(raw, '研究项目')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '研究项目缺少 id 字段。')
  return {
    id,
    title: asString(b.title),
    description: asString(b.description) || null,
    status: asString(b.status) || 'ACTIVE',
    visibility: asString(b.visibility) || 'PRIVATE',
    direction: parseDirection(b.direction),
    workName: parseTriText(b.work_name),
    ...(b.workspace_id === undefined
      ? {}
      : { workspaceId: normalizeWorkspaceId(b.workspace_id) }),
    // 挂牌价三态：缺字段（旧服务器）→ undefined；显式 null → null（没挂牌价）
    ...(b.asking_fee === undefined
      ? {}
      : { askingFee: b.asking_fee === null ? null : asNumber(b.asking_fee, 0) || null }),
    updatedAt: asString(b.updated_at),
  }
}

/**
 * 建项目（恒为 PRIVATE；此时还没有 State）。
 *
 * `direction`（可选）决定这项研究工作**属于哪个方向的市场**：不传 = `SEEK_MENTOR`
 * （学生发布求指导，即今天的行为）。导师出题传 `SEEK_STUDENT`，见
 * `dev-notes/v0.6.0-mentor-topic-mode.md` §2 R1。
 */
export async function createProject(
  base: string,
  apiKey: string,
  input: {
    title: string
    description?: string
    direction?: ProjectDirection
    workspaceId?: string
    /**
     * **挂牌价**（Token）。只在明确给了数字时才发 —— 服务器把它做成"信息"而非成交价，
     * 且 `null` 在服务层会被跳过（改价时传 null **不会**清空，见 `payment-system.md` §3.2.5）。
     */
    askingFee?: number | null
  },
  options: ServerRequestOptions = {},
): Promise<ServerProject> {
  const key = requireKey(apiKey)
  const title = (input.title ?? '').trim()
  if (!title) throw new ServerError('bad-request', '项目标题不能为空。')
  const body = await requestJson(
    base,
    '/projects',
    {
      method: 'POST',
      apiKey: key,
      body: {
        title,
        ...(input.description ? { description: input.description } : {}),
        // ⚠️ 只在明确给了方向时才发这个字段：默认方向由服务器拥有，
        // 客户端抄一份默认值只会在平台改默认时悄悄漂移。
        ...(input.direction ? { direction: input.direction } : {}),
        /*
         * 本机已经知道这项研究的身份（之前发布过 / 下载时记下过）→ 沿用，
         * 否则同一项研究重新发布会被服务器当成**另一项研究**（新 id），
         * 而"另一项研究"在下一次下载判定里意味着"禁止写进这个工作区"。
         */
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
        // 与方向同理：没标价就不发这个字段（服务器侧 `NULL` = 没挂牌价）
        ...(typeof input.askingFee === 'number' ? { asking_fee: input.askingFee } : {}),
      },
    },
    options,
    '建项目',
  )
  return parseProject(body)
}

/**
 * 改项目（`PUT /projects/{id}`，owner-only）。
 *
 * 本插件只用它改**标题**：研究工作的名字会在论文起名 / 主题演进后变化，而项目的
 * 标题只在建项目时写过一次 —— 不改的话，网络里那个名字就永远停在第一次发布的样子。
 *
 * ⚠️ 服务器**不接受**在这里改 `direction`（创建后不可改）：同一份工作区在两个方向是
 * 两个项目，改方向等于把项目在两个市场之间偷偷搬家。
 */
export async function updateProject(
  base: string,
  apiKey: string,
  projectId: string,
  input: { title?: string; askingFee?: number | null },
  options: ServerRequestOptions = {},
): Promise<ServerProject> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const title = (input.title ?? '').trim()
  if (!title) throw new ServerError('bad-request', '标题不能为空。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      apiKey: key,
      body: {
        title,
        /*
         * 挂牌价：只在明确给了数字时才发。
         *
         * ⚠️ 传 `null` **不会清空**（服务层跳过 `None`，与 title/description/status 的既有语义
         * 一致，见 `payment-system.md` §3.2.5 的"改价的限制"）——所以这里根本不发 null，
         * 免得界面上出现"以为能撤掉挂牌价"的假象。
         */
        ...(typeof input.askingFee === 'number' ? { asking_fee: input.askingFee } : {}),
      },
    },
    options,
    '改项目',
  )
  return parseProject(body)
}

/** 读一台自己的项目（owner-only；非 owner 或已删除 → 404 `not-found`）。 */
/**
 * **我的项目列表**（`GET /projects`，owner-only）。
 *
 * 这是【我的】列表的**服务器那一半数据源**（另一半是本机扫描到的研究根）。
 * 界面按 `workspace_id` 把两半**合并**（2026-10 用户要求）：
 *
 * ```text
 * 本地 + 服务器（同一项研究，work_id 相同） → 一行，显示【更新研究工作】
 * 只在服务器（本机没打开这项工作）           → 一行（说明"本机当前未打开"）
 * 只在本机（还没发布）                       → 一行，显示两条发布通道
 * ```
 *
 * 为什么必须从服务器取：本机记录只存在这台机器上 —— 换机器、或本机记录被删之后，
 * "我之前发布过哪些研究工作"就只剩服务器知道。列表依赖 work_id 而不是文件夹位置。
 */
export async function fetchProjects(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<ServerProject[]> {
  const key = requireKey(apiKey)
  const body = await requestJson(base, '/projects', { method: 'GET', apiKey: key }, options, '读取我的项目')
  // 服务器返回**裸数组**；容错一下 `{items: […]}` 的形状（不改语义，只是别整页失败）
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown } | undefined)?.items)
      ? ((body as { items: unknown[] }).items as unknown[])
      : []
  const out: ServerProject[] = []
  for (const raw of list) {
    try {
      out.push(parseProject(raw))
    } catch {
      /* 单条坏数据不该让整页列表失败 */
    }
  }
  return out
}

export async function fetchProject(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions = {},
): Promise<ServerProject> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}`,
    { method: 'GET', apiKey: key },
    options,
    '读取项目',
  )
  return parseProject(body)
}

/** 读当前研究状态的版本号；项目还没有状态时返回 `null`（服务器 404）。 */
export async function readStateVersion(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions = {},
): Promise<number | null> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  try {
    const body = await requestJson(
      base,
      `/projects/${encodeURIComponent(id)}/state`,
      { method: 'GET', apiKey: key },
      options,
      '读取研究状态',
    )
    const version = asObject(body, '研究状态').version
    return typeof version === 'number' ? version : null
  } catch (e) {
    // 还没有状态 → 服务器 404；这不是错误，而是"该用 base_version=null 首传"
    if (e instanceof ServerError && e.code === 'not-found') return null
    throw e
  }
}

/**
 * 上传研究状态（新建一个不可变版本）。
 *
 * @returns 新版本号与内容哈希（哈希可用于判断"内容没变，不必再传"）
 * @throws {ServerError} `version-conflict`（含 `currentVersion`，据此重基再传）
 */
export async function uploadResearchState(
  base: string,
  apiKey: string,
  projectId: string,
  input: UploadStateInput,
  options: ServerRequestOptions = {},
): Promise<{ version: number; contentHash: string }> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const intentKey = (input.intentKey ?? '').trim()
  if (!intentKey) throw new ServerError('bad-request', '缺少幂等键（intentKey）。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/state`,
    {
      method: 'POST',
      apiKey: key,
      idempotencyKey: intentKey,
      body: { base_version: input.baseVersion, content: input.content },
    },
    options,
    '上传研究状态',
  )
  const b = asObject(body, '研究状态')
  const version = typeof b.version === 'number' ? b.version : null
  if (version === null) throw new ServerError('bad-response', '上传研究状态后没有返回版本号。')
  return { version, contentHash: asString(b.content_hash) }
}

/**
 * 发布项目。
 *
 * ⚠️ **发布是要花钱的**：服务器对每个项目**收一次** Token，按"已付费项目数"阶梯计价
 * （第 1–3 个各 1 Token、第 4–6 个各 2 …，见 `PROJECT_TIER_BASE_COST` / `PROJECTS_PER_TIER`），
 * 已付费的项目**重复发布免费**。响应里的 `charged_tokens` 就是本次真实扣费。
 *
 * 因此必须带 `Idempotency-Key`（服务器文档明确要求）：同一次发布意图重试时复用同一个键，
 * 响应丢失后的重试不会造成第二笔扣费。
 *
 * @returns `visibility` 与本次扣费（`chargedTokens`，0 = 该项目此前已付费）
 */
export async function publishProject(
  base: string,
  apiKey: string,
  projectId: string,
  options: { intentKey?: string } & ServerRequestOptions = {},
): Promise<{ visibility: string; chargedTokens: number }> {
  const { intentKey, ...net } = options
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/publish`,
    { method: 'POST', apiKey: key, ...(intentKey ? { idempotencyKey: intentKey } : {}) },
    net,
    '发布项目',
  )
  const parsed = asObject(body, '发布结果')
  return {
    visibility: asString(parsed.visibility) || 'PUBLISHED',
    chargedTokens: typeof parsed.charged_tokens === 'number' ? parsed.charged_tokens : 0,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 研究工作（Research Project）—— 服务器渐进披露的第一、二层
 *
 * 服务器的分享对象是**研究项目**（不是"研究方法模板"）：一层是免费的"这是什么"，
 * 二层是花 Token 的"大致怎么做"，三层（完整状态）需要导师关系。
 * 本模块只做前两层；第三层要关系，不在本轮范围。
 * ════════════════════════════════════════════════════════════════════════ */

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * **三态**数字：字段不是有限数就回 `null`（= 服务器没给），**不是 0**。
 *
 * 只用在"缺字段与 0 是两个结论"的地方（Token 两池：读成 0 会把账号误判成付不起）。
 */
function optionalNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asObject(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object') {
    throw new ServerError('bad-response', `${label}的响应格式不正确（不是对象）。`)
  }
  return v as Record<string, unknown>
}

/** 解析一项研究工作（游离于列表 / 摘要的公共字段）。 */
function parseWorkItem(raw: unknown): WorkItem {
  const b = asObject(raw, '研究工作')
  const projectId = asString(b.project_id) || asString(b.id)
  const title = asString(b.title)
  if (!projectId || !title) {
    throw new ServerError('bad-response', '研究工作缺少 project_id / title 字段。')
  }
  const stage = asString(b.stage)
  return {
    projectId,
    title,
    researchFields: asStringArray(b.research_fields),
    stage: stage || null,
    progress: asNumber(b.progress),
    researchQuestion: asString(b.research_question) || null,
    summary: asString(b.summary) || null,
    updatedAt: asString(b.updated_at),
    direction: parseDirection(b.direction),
    workName: parseTriText(b.work_name),
    // `brief_paid`：打开这项简报还会不会再扣 Token（服务器按支付记录 / owner 判定）。
    // 只有真的是布尔才采信；字段缺失或类型不对 → null（= 不知道，界面会照常提醒）。
    briefPaid: typeof b.brief_paid === 'boolean' ? b.brief_paid : null,
    owner: parseWorkOwner(b.owner),
    // 挂牌价三态：缺字段（旧服务器）→ 不带这个键；显式 null → null（没挂牌价）
    ...(b.asking_fee === undefined ? {} : { askingFee: parseTriFee(b.asking_fee) }),
  }
}

/**
 * 解析公开发现列表里的作者（服务器 `owner`）。
 *
 * 缺失 / 结构不对 → `null`（**不猜、不编**：旧服务器没有这个字段，界面就不显示作者）。
 * `display_name` 为空时回退成 id 短前缀 —— 与提案那条路径同一套回退，至少能区分"是谁"。
 */
function parseWorkOwner(raw: unknown): WorkOwner | null {
  const b = asRecord(raw)
  const id = b ? asString(b.id) : ''
  if (!id) return null
  const displayName = b ? asString(b.display_name) : ''
  return { id, displayName: displayName || id.slice(0, 8) }
}

/** 解析简报（第二层）。 */
function parseWorkBrief(raw: unknown): WorkBrief {
  const b = asObject(raw, '简报')
  const base = parseWorkItem(raw)
  return {
    ...base,
    motivation: asString(b.motivation) || null,
    coreIdea: asString(b.core_idea) || null,
    hypothesis: asString(b.hypothesis) || null,
    methodOverview: asString(b.method_overview) || null,
    keyEvidence: asStringArray(b.key_evidence),
    openProblems: asStringArray(b.open_problems),
    // `charged_tokens`：本次调用花掉的 Token（0 = 自己的项目 / 已经买过）。
    // 字段缺失/不是数字 → null（界面据此退回"按余额差值"），不谎报 0。
    chargedTokens:
      typeof b.charged_tokens === 'number' && Number.isFinite(b.charged_tokens) && b.charged_tokens >= 0
        ? b.charged_tokens
        : null,
  }
}

function requireKey(apiKey: string): string {
  const key = normalizeApiKey(apiKey)
  if (!key) throw new ServerError('bad-request', 'API Key 不能为空。')
  return key
}

/**
 * 研究工作列表（**发现网络**：已公开的项目，随机抽取）。
 *
 * 对应 `INTEGRATION.md` §10 的 ⑤「能看到别人的研究」。免费，无需 Token。
 *
 * ⚠️ **列表条数与抽样策略完全由服务器决定**（`discovery` 的 `DEFAULT_LIMIT` / 随机抽样），
 * 插件**不传 `limit`、不做本地夹取**（2026-09 用户拍板）。理由是可验证的：把服务端的
 * 策略抄一份到客户端，只会在两边悄悄漂移 —— 服务器改成 20 条或改成按领域抽样时，
 * 插件这边看上去"没坏"，行为却已经和产品不一致。要改抽样，改服务器。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export async function fetchWorkList(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
  /**
   * 要**哪个方向**的列表（服务器 `?direction=`）：
   * `SEEK_MENTOR` = 【可指导】（学生发布的研究工作，导师看）；
   * `SEEK_STUDENT` = 【可加入】（导师发布的选题，学生看）。
   *
   * 省略该参数 → 服务器默认 `SEEK_MENTOR`（= 今天的行为），旧服务器忽略它。
   */
  direction?: ProjectDirection,
): Promise<WorkItem[]> {
  const key = requireKey(apiKey)
  const query = direction ? `?direction=${encodeURIComponent(direction)}` : ''
  const body = await requestJson(
    base,
    `/discovery/random${query}`,
    { method: 'GET', apiKey: key },
    options,
    '研究工作列表',
  )
  const items = asObject(body, '研究工作列表').items
  if (!Array.isArray(items)) {
    throw new ServerError('bad-response', '研究工作列表缺少 items 字段。')
  }
  return items.map(parseWorkItem)
}

/**
 * 一项研究工作的**摘要**（第一层，免费）。
 *
 * @throws {ServerError} `not-found`（不存在 / 未公开 / 不可见）
 */
export async function fetchWorkSummary(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions = {},
): Promise<WorkItem> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少研究工作 id。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/summary`,
    { method: 'GET', apiKey: key },
    options,
    '研究工作摘要',
  )
  return parseWorkItem(body)
}

/**
 * 一项研究工作的**简报**（第二层，非 owner 消耗 1 Token）。
 *
 * ⚠️ `intentKey` 是**一次查看意图**的标识：
 *
 * ```text
 * 首次查看        → 一个 intentKey
 * 因 402 失败     → 同一个 intentKey（充值后重试**不重复扣费**）
 * 网络/5xx 重试   → 同一个 intentKey
 * 换一项研究再看   → **新的** intentKey（否则 409 IDEMPOTENCY_KEY_REUSED）
 * ```
 *
 * @throws {ServerError} `insufficient-tokens`（402，**不要自动重试**）/ `not-found` / …
 */
export async function fetchWorkBrief(
  base: string,
  apiKey: string,
  projectId: string,
  intentKey: string,
  options: ServerRequestOptions = {},
): Promise<WorkBrief> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少研究工作 id。')
  const intent = (intentKey ?? '').trim()
  if (!intent) throw new ServerError('bad-request', '缺少幂等键（intentKey）。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/brief`,
    { method: 'GET', apiKey: key, idempotencyKey: intent },
    options,
    '研究工作简报',
  )
  return parseWorkBrief(body)
}

/* ════════════════════════════════════════════════════════════════════════
 * 指导关系（Mentorship）
 * ════════════════════════════════════════════════════════════════════════ */

/** 导师简介（`research_profiles` 的投影；后端 enrich 后才有，可能缺失）。 */
export interface MentorProfile {
  institution: string | null
  department: string | null
  bio: string | null
  researchFields: string[]
  researchInterests: string[]
  researchExpertise: string[]
}

/** 提案里的当事一方（导师 / 研究者）。`displayName` 缺失时回退为 id 短前缀。 */
export interface ProposalParty {
  id: string
  displayName: string
  /**
   * 研究简介（`research_profiles` 投影）。**三态，不许合并**：
   *
   * - 一个对象 —— 投影了，且对方填了；
   * - `null` —— **投影了**，但对方还没建研究档案；
   * - `undefined`（键都不在）—— 服务器**不给你看这一方的资料**。
   *
   * ⚠️ 为什么必须分开（服务器 `docs/API.md` §12.2）：profile 按"谁要判断谁"投影 ——
   * 方向 A 只给 `mentor.profile`、方向 B 只给 `researcher.profile`，**没被投影的那一方
   * 是整块省略 `profile` 键**。"不给你看"与"对方没填"在界面上是两件事：
   * 前者不该出现资料入口，后者该出现并如实说"尚未填写"。
   */
  profile?: MentorProfile | null
}

export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

/** 一条指导提案（`mentorship_proposals`）。 */
export interface MentorshipProposal {
  id: string
  projectId: string
  /**
   * 这个项目属于哪个方向（服务器的 `direction`，见 {@link ProjectDirection}）。
   *
   * 界面**必须**靠它决定三件事，不能靠"我是谁的角色"：谁能接受、
   * 我上传落在哪一侧、进展文案怎么称呼。旧服务器缺字段 → `SEEK_MENTOR`。
   */
  direction: ProjectDirection
  /**
   * **谁发起了这次提案**（服务器的 `proposed_by_id`）。
   *
   * `null` = 旧服务器不返回 → 界面退回按方向推断
   * （`SEEK_MENTOR` → 导师发起；`SEEK_STUDENT` → 学生发起）。
   */
  proposedById: string | null
  /** 项目标题（后端 enrich 后才有；旧服务器 → null，界面显示"未命名项目"）。 */
  projectTitle: string | null
  /**
   * **这项研究工作的名字**（服务器的 `work_name`，与 {@link projectTitle} 并列返回）。
   *
   * 与发现列表同一个字段、同一个来源（见 {@link WorkItem.workName}）：列表该显示的
   * 是它，`project_title` 只作旧服务器的兜底。
   */
  workName?: string | null
  /**
   * **发布方的挂牌价**（服务器的 `asking_fee`，单位 Token）—— 与这份提案的 `totalFee`
   * **并排显示**："开价 800 / 出价 100" 的差距正是议价信息。
   *
   * 含义由 `direction` 决定：`SEEK_STUDENT` = 导师开价；`SEEK_MENTOR` = 学生预算。
   *
   * 三态：`number` 有价；`null` 没挂牌价（不是 0）；字段缺失（旧服务器）= `undefined` → 不显示。
   *
   * ⚠️ **合同 / 关系视图不带它**（服务器刻意的决定）：那里 `total_fee` 是**历史事实**
   * （签约时写死），而 `asking_fee` 是**可变的当前标价**——"合同 500、挂牌 950"只会让人
   * 分不清该付哪个数。提案是活的谈判，所以显示；合同是已签的事实，所以不显示。
   */
  askingFee?: number | null
  mentor: ProposalParty | null
  researcher: ProposalParty | null
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  successCondition: MentorshipSuccessCondition
  status: ProposalStatus
  /**
   * 指导进展（服务器 `review_files`）：**非 owner 那一侧**去重后的文件数
   * （`review/` 笔记与整份工作区一视同仁）。方向 A 下那是导师的指导产物，
   * 方向 B 下那是**学生的交付**（项目 owner 是导师）。
   *
   * 三态，**不许合并**（与 `brief_paid` 一脉相承的纪律）：
   * - `n`（含 `0`）—— 服务器明确知道（读权限在，数了就是这么多）；
   * - `null` —— **不可知**：查看者对该项目没有读权限，或项目已软删除；
   * - `undefined` —— 这个响应里**没有**这个字段（**旧服务器**，`review_files` 落地之前）。
   *
   * `null` 与 `undefined` 的处分不同：前者是"服务器说不知道"（不必再去问），
   * 后者是"服务器这一版还不会说"（宿主退回逐项目读 `/files` 自己数，见 `mentor/list`）。
   *
   * ⚠️ 它**不等于** `GET /projects/{id}/files` 里 `review/` 前缀的**行数**：
   * `file_metadata` 不可变不覆盖，同一路径重复上传会留下多行历史，服务器按
   * `DISTINCT relative_path` 计数（一次修订不是一份意见）。
   */
  reviewFiles?: number | null
  /**
   * **owner 那一侧**当前的文件数（服务器 `workspace_files`，`DISTINCT relative_path`）。
   *
   * 三态（与 `reviewFiles` 同一套纪律）：`undefined` = 响应里没有这个字段（旧服务器）、
   * `null` = 不可知（无读权限 / 项目软删除）、`n` = 明确知道。
   * 它与 {@link workspaceUpdatedAt} 合起来是"**owner 侧**变了吗"的两条互补判据 ——
   * **时间戳看不到删除**（删文件不会让 `MAX(created_at)` 前进），文件数看得到。
   */
  workspaceFiles?: number | null
  /**
   * **owner 那一侧**最后一次**上传文件**的时间（服务器 `workspace_updated_at`，ISO-8601）。
   *
   * 与 `workspaceFiles` 同三态。只覆盖**文件**：研究状态的变动不进这个时间戳
   * （状态自己的信号是 `GET /full` 的 `version` / `content_hash`）。
   */
  workspaceUpdatedAt?: string | null
  /**
   * **非 owner 那一侧**最后一次变化的时间（服务器 `counterpart_updated_at`，ISO-8601）。
   *
   * 与 {@link workspaceUpdatedAt} 同三态、同一套语义，只是**另一侧**：
   * `workspaceUpdatedAt` 跟 owner 侧（与 `workspaceFiles` 配对），
   * 它跟 `reviewFiles` 那一侧。
   *
   * ⚠️ 为什么必须有它（服务器 `docs/API.md` §12.2）：`workspace_updated_at` 只跟踪
   * **owner 侧**。方向 A 的 owner 是学生，所以导师靠它发现"学生又更新了"；但
   * **方向 B 的 owner 是导师**，那个字段只会报导师自己传的东西 —— 导师看不到学生的交付。
   * 这一对（`counterpartUpdatedAt` + `reviewFiles`）就是那一侧的水位与计数。
   */
  counterpartUpdatedAt?: string | null
  /**
   * **宿主算好的**判读结果，**按侧**给（`null` = 这台机器记不住下载过什么 → 无从判断）。
   *
   * 不是服务器字段 —— 宿主拿它与**本地存的水位**（上一次归档响应的
   * `X-Source-Updated-At` / `X-File-Count`，见 `research/sync-watermarks.ts`）按侧比对后填进来。
   *
   * ⚠️ 为什么是**两侧都要**（v0.6.0）：界面知道自己要下载哪一侧（`otherSide`），
   * 而**方向决定那是哪一侧** —— 方向 A 的导师下 `owner` 侧，方向 B 的导师下 `mentor` 侧。
   * 宿主不知道"我"是谁（为此多发一次 `fetchAccount` 正是刚消掉的那个 N），
   * 所以两侧都算好，由界面取自己那一份。
   */
  syncBySide?: {
    owner: SideSyncCheck | null
    mentor: SideSyncCheck | null
  } | null
  /**
   * **旧形状**（协议 < 25）：只有 owner 侧这一个判读结果，界面为兼容继续认它。
   *
   * ⚠️ 只在 `syncBySide` 缺失（旧宿主）时才读 —— 两份都在时以 `syncBySide` 为准。
   */
  sync?: SideSyncCheck | null
  expiresAt: string
  createdAt: string
}

/** 费用建议（`GET /mentorship-proposals/fee-suggestion`）。 */
export interface FeeSuggestion {
  suggestedFee: number
  suggestedDeposit: number
  suggestedSuccessPayment: number
}

/* ────────────────────────────────────────────────────────────────────────
 * 论文等级定价（v0.6.3 §3.2.4；服务器 PaperPriceCalculator）
 *
 * 平台的定价基础是**发表等级**：`PAPER_ACCEPTED` / `PAPER_PUBLISHED` 这两类成功
 * 条件的**价格就是等级**，所以它们**必须**写出等级（不写 → 服务器 400
 * `INVALID_PROPOSAL`）。其余条件（`MUTUAL_COMPLETION` 等）按约定总额定价，没有等级。
 *
 * 服务器接受两种写法且价格等价（服务器 `config.py`）：
 *
 * ```text
 * JCR 1区 = CCF-A = 1000    JCR 2区 = 800
 * JCR 3区 = CCF-B =  600    JCR 4区 = CCF-C = 500
 * ```
 *
 * ⚠️ **价格不在客户端**：等级 → 金额由服务器 `fee-suggestion?jcr_level=|ccf_level=`
 * 算，客户端只传等级。抄一份价目表到这里，平台调价时界面就会显示旧价钱。
 * ──────────────────────────────────────────────────────────────────────── */

/** 论文类成功条件：价格 = 等级，因此**必须**给出等级。 */
export const PAPER_CONDITION_TYPES = ['PAPER_ACCEPTED', 'PAPER_PUBLISHED'] as const

/** 这个成功条件是不是按论文等级定价的（服务器 `PAPER_CONDITION_TYPES`）。 */
export function isPaperCondition(type: string | null | undefined): boolean {
  return (PAPER_CONDITION_TYPES as readonly string[]).includes(type ?? '')
}

/** 计价体系：`JCR` 分区 1–4 与 `CCF` 类别 A/B/C。 */
export type PaperLevelSystem = 'JCR' | 'CCF'

/** 一个等级（体系 + 取值）—— 提案里落成 `jcr_level` 或 `ccf_level`。 */
export interface PaperLevel {
  system: PaperLevelSystem
  /** JCR：`1`–`4`；CCF：`'A'`/`'B'`/`'C'`。 */
  level: number | string
}

/** JCR 分区（1 = 最高）。 */
export const JCR_LEVELS: readonly number[] = [1, 2, 3, 4]

/** CCF 类别（A = 最高）。 */
export const CCF_LEVELS: readonly string[] = ['A', 'B', 'C']

/** 归一 JCR 分区（1–4 的整数；别的一律 `null`）。 */
export function asJcrLevel(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.NaN
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null
}

/** 归一 CCF 类别（大小写不敏感 → 大写 `A`/`B`/`C`；别的一律 `null`）。 */
export function asCcfLevel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toUpperCase()
  return (CCF_LEVELS as readonly string[]).includes(s) ? s : null
}

/**
 * 从成功条件里读出**它声明的等级**（没有 → `null`）。
 *
 * 与服务器的读取顺序一致（`PaperPriceCalculator.level_of`）：先看 `jcr_level`，
 * 再看 `ccf_level`。两种都给时以 JCR 为准 —— 服务器也是这么定价的，界面不能另说一套。
 */
export function successConditionLevel(condition: {
  jcrLevel?: number | null
  ccfLevel?: string | null
} | null | undefined): PaperLevel | null {
  const jcr = asJcrLevel(condition?.jcrLevel)
  if (jcr !== null) return { system: 'JCR', level: jcr }
  const ccf = asCcfLevel(condition?.ccfLevel)
  if (ccf !== null) return { system: 'CCF', level: ccf }
  return null
}

/**
 * 成功条件的完整形态（提案 / 合同共用）。
 *
 * `jcrLevel` / `ccfLevel` 是**论文类条件的价格依据**；非论文类条件两者都是 `null`
 * （那是正常的，不是缺数据）。
 */
export interface MentorshipSuccessCondition {
  type: string
  description: string | null
  jcrLevel: number | null
  ccfLevel: string | null
}

/** 成功条件类型（服务器枚举，界面据此给中文标签）。 */
export const SUCCESS_CONDITION_TYPES = [
  'PAPER_ACCEPTED',
  'PAPER_PUBLISHED',
  'RESEARCH_COMPLETED',
  'PATENT_GRANTED',
  'TECHNICAL_OUTCOME',
  'MUTUAL_COMPLETION',
] as const

/** 接受提案返回的**合同**（`mentorship_contracts`）。 */
export interface MentorshipContract {
  id: string
  researcherId: string
  mentorId: string
  projectId: string
  /** 合同所属的方向（见 {@link ProjectDirection}；旧服务器缺字段 → `SEEK_MENTOR`）。 */
  direction: ProjectDirection
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  guidanceScope: string
  successCondition: MentorshipSuccessCondition
  status: string
  createdAt: string
  acceptedAt: string | null
  startedAt: string | null
  completedAt: string | null
  settledAt: string | null
}

/** 项目与导师的研究关系（`research_relationships`）。 */
export interface ResearchRelationship {
  id: string
  projectId: string
  researcherId: string
  mentorId: string
  contractId: string
  status: string
  createdAt: string
  startedAt: string | null
  endedAt: string | null
}

/** 容错的对象读取（非对象 → null，不抛）。 */
function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function parseProfile(raw: unknown): MentorProfile | null {
  const b = asRecord(raw)
  if (!b) return null
  return {
    institution: asString(b.institution) || null,
    department: asString(b.department) || null,
    bio: asString(b.bio) || null,
    researchFields: asStringArray(b.research_fields),
    researchInterests: asStringArray(b.research_interests),
    researchExpertise: asStringArray(b.research_expertise),
  }
}

function parseParty(raw: unknown, fallbackId?: unknown): ProposalParty | null {
  const b = asRecord(raw)
  const id = (b ? asString(b.id) : '') || asString(fallbackId)
  if (!id) return null
  const displayName = b ? asString(b.display_name) : ''
  return {
    id,
    // 后端还没 enrich 身份字段时回退成短 id，界面仍然有东西可显示、可区分
    displayName: displayName || id.slice(0, 8),
    /*
     * ⚠️ 只在**键存在**时才给 `profile`：`undefined`（键不在）= 服务器不给你看这一方的
     * 资料；`null` = 投影了但对方没填。合并成 `null` 会让界面在"不该有入口"的那一侧
     * 也显示【导师】/【学生】按钮（点开只能说"尚未填写"）。
     */
    ...(b && 'profile' in b ? { profile: parseProfile(b.profile) } : {}),
  }
}

/**
 * 成功条件（含**论文等级**）：`jcr_level` / `ccf_level` 是价格依据，必须原样带出来。
 *
 * 丢掉它们会让界面无法回答"这份提案按什么等级定价"—— 而等级正是费用能不能被信任的
 * 依据（等级改了价钱就该跟着变）。非论文类条件两者都是 `null`，不是缺数据。
 */
function parseSuccessCondition(raw: unknown): MentorshipSuccessCondition {
  const b = asRecord(raw)
  return {
    type: asString(b?.type) || 'MUTUAL_COMPLETION',
    description: asString(b?.description) || null,
    jcrLevel: asJcrLevel(b?.jcr_level),
    ccfLevel: asCcfLevel(b?.ccf_level),
  }
}

/**
 * **计数类三态**解析（`review_files` / `workspace_files` 共用）——
 * 不许把"没有这个字段"读成"有 0 个"。
 *
 * `asNumber` 那一类容错读取在这里是**有害**的：它会把缺失与 0 合成同一个值，
 * 而这两件事在界面上是两个结论（"服务器说没有" vs "服务器这一版不会说"）。
 * 所以这里只认可显式给出的整数或显式 `null`，其余一律退成 `undefined`（未知）。
 *
 * 三态的**处分**也不同：`null` = 服务器说不知道（不必再去问）；
 * `undefined` = 服务器这一版还不会说（宿主退回旧路径，或当作"无从判断"）。
 */
function parseTriCount(raw: unknown): number | null | undefined {
  if (raw === null) return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.trunc(raw)
  return undefined
}

/**
 * **自由文本类三态**解析（`work_name`）：显式 `null` → 服务器说不可知；
 * 非空字符串 → 原样；**字段缺失** → `undefined`（旧服务器，界面退回 `title`）。
 *
 * 与计数/时间戳同一套纪律：`null` 与 `undefined` 的处分不同，不许合并。
 * 空串按"字段缺失"处理（空名字没有意义，不该渲染成空行）。
 */
function parseTriText(raw: unknown): string | null | undefined {
  if (raw === null) return null
  const text = asString(raw)
  return text ? text : undefined
}

/**
 * **挂牌价三态**解析（`asking_fee`）。
 *
 * `null`（服务器说"没挂牌价"）→ `null`；正整数 → 数字；其它（缺失/0/负数/非数字）→ `null`。
 * 0 一定是脏数据（服务器的 CHECK 是 `>= 1`），按"没有"处理比渲染成"免费"安全。
 */
function parseTriFee(raw: unknown): number | null {
  if (raw === null) return null
  const n = asNumber(raw, 0)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** **时间戳类三态**解析（`workspace_updated_at`）：显式 null → 未知；ISO 字符串 → 原样。 */
function parseTriIso(raw: unknown): string | null | undefined {
  if (raw === null) return null
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return undefined
}

function parseProposal(raw: unknown): MentorshipProposal {
  const b = asRecord(raw)
  if (!b) throw new ServerError('bad-response', '指导提案：响应格式不对。')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '指导提案缺少 id。')
  return {
    id,
    projectId: asString(b.project_id),
    direction: parseDirection(b.direction),
    // `proposed_by_id`：谁发起的。缺失（旧服务器）→ null，界面按方向推断。
    proposedById: asString(b.proposed_by_id) || null,
    projectTitle: asString(b.project_title) || null,
    workName: parseTriText(b.work_name),
    ...(b.asking_fee === undefined ? {} : { askingFee: parseTriFee(b.asking_fee) }),
    // 后端 enrich 之后 `mentor` / `researcher` 是内嵌对象；没 enrich 时退回顶层
    // `mentor_id` / `researcher_id`（UUID），界面用短 id 显示 —— 至少能分出"哪边是我"。
    mentor: parseParty(b.mentor, b.mentor_id),
    researcher: parseParty(b.researcher, b.researcher_id),
    guidanceScope: asString(b.guidance_scope),
    totalFee: asNumber(b.total_fee),
    depositAmount: asNumber(b.deposit_amount),
    successPaymentAmount: asNumber(b.success_payment_amount),
    successCondition: parseSuccessCondition(b.success_condition),
    status: (asString(b.status) || 'PROPOSED') as ProposalStatus,
    reviewFiles: parseTriCount(b.review_files),
    workspaceFiles: parseTriCount(b.workspace_files),
    workspaceUpdatedAt: parseTriIso(b.workspace_updated_at),
    counterpartUpdatedAt: parseTriIso(b.counterpart_updated_at),
    expiresAt: asString(b.expires_at),
    createdAt: asString(b.created_at),
  }
}

function parseContract(raw: unknown): MentorshipContract {
  const b = asRecord(raw)
  if (!b) throw new ServerError('bad-response', '指导合同：响应格式不对。')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '指导合同缺少 id。')
  return {
    id,
    researcherId: asString(b.researcher_id),
    mentorId: asString(b.mentor_id),
    projectId: asString(b.project_id),
    direction: parseDirection(b.direction),
    totalFee: asNumber(b.total_fee),
    depositAmount: asNumber(b.deposit_amount),
    successPaymentAmount: asNumber(b.success_payment_amount),
    guidanceScope: asString(b.guidance_scope),
    successCondition: parseSuccessCondition(b.success_condition),
    status: asString(b.status) || 'ACCEPTED',
    createdAt: asString(b.created_at),
    acceptedAt: asString(b.accepted_at) || null,
    startedAt: asString(b.started_at) || null,
    completedAt: asString(b.completed_at) || null,
    settledAt: asString(b.settled_at) || null,
  }
}

function parseRelationship(raw: unknown): ResearchRelationship {
  const b = asRecord(raw)
  if (!b) throw new ServerError('bad-response', '研究关系：响应格式不对。')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '研究关系缺少 id。')
  return {
    id,
    projectId: asString(b.project_id),
    researcherId: asString(b.researcher_id),
    mentorId: asString(b.mentor_id),
    contractId: asString(b.contract_id),
    status: asString(b.status) || 'ACTIVE',
    createdAt: asString(b.created_at),
    startedAt: asString(b.started_at) || null,
    endedAt: asString(b.ended_at) || null,
  }
}

/**
 * 费用建议（`GET /mentorship-proposals/fee-suggestion`）。
 *
 * `level` 决定按**哪个发表等级**定价：`{ system: 'JCR', level: 2 }` →
 * `?jcr_level=2`，`{ system: 'CCF', level: 'B' }` → `?ccf_level=B`。
 * 不给等级时服务器回**兜底价**（`DEFAULT_MENTORSHIP_FEE`，100 / 20 / 80）——
 * 那是非论文类条件（`MUTUAL_COMPLETION` 等）的价钱，**不是**论文类条件的默认价。
 *
 * 金额一律由服务器算：客户端只传等级，不抄价目表（平台调价时界面不会撒谎）。
 *
 * @throws {ServerError} `bad-request`（等级不合法）/ `invalid-key` / `unreachable` / …
 */
export async function fetchFeeSuggestion(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
  level?: PaperLevel | null,
): Promise<FeeSuggestion> {
  const key = requireKey(apiKey)
  const jcr = asJcrLevel(level?.system === 'JCR' ? level.level : null)
  const ccf = asCcfLevel(level?.system === 'CCF' ? level.level : null)
  if (level && jcr === null && ccf === null) {
    throw new ServerError('bad-request', '论文等级不合法：JCR 只能填 1–4，CCF 只能填 A/B/C。')
  }
  const query = jcr !== null ? `?jcr_level=${jcr}` : ccf !== null ? `?ccf_level=${ccf}` : ''
  const body = await requestJson(
    base,
    `/mentorship-proposals/fee-suggestion${query}`,
    { method: 'GET', apiKey: key },
    options,
    '指导费用建议',
  )
  const b = asRecord(body)
  if (!b) throw new ServerError('bad-response', '指导费用建议：响应格式不对。')
  return {
    suggestedFee: asNumber(b.suggested_fee),
    suggestedDeposit: asNumber(b.suggested_deposit),
    suggestedSuccessPayment: asNumber(b.suggested_success_payment),
  }
}

/**
 * 发起指导提案（免费，不扣 Token）。
 *
 * **两个方向共用这一个端点**，由**项目自己的方向**决定谁写在哪一边：
 *
 * | 项目方向 | 调用者 | 服务端写入 |
 * |---|---|---|
 * | `SEEK_MENTOR` | 导师（`MENTOR`/`ADMIN`） | `mentor_id = 我`，`researcher_id = owner` |
 * | `SEEK_STUDENT` | 学生（`RESEARCHER`/`ADMIN`） | `researcher_id = 我`，`mentor_id = owner` |
 *
 * 所以客户端**不传方向**（传了也是冗余信息，可能与项目本身矛盾）；角色校验在服务端。
 * 方向 B 下服务端会在这一步预检学生余额（不足 → 402），因为接受方是导师，
 * 押金不足要让**出价的人**当场知道。
 *
 * ⚠️ **论文类条件（`PAPER_ACCEPTED` / `PAPER_PUBLISHED`）必须带等级**：服务器把它读成
 * `success_condition.jcr_level` / `ccf_level`，缺失直接 400 `INVALID_PROPOSAL`
 * （"等级就是价格"，没有等级这份提案的价钱无法被重新推导出来）。界面负责先拦一次，
 * 这里不做第二套校验 —— 规则只有服务器一个来源。
 */
export interface ProposeInput {
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  successCondition: {
    type: string
    description: string | null
    /** 论文等级（JCR 分区）；非论文类条件留空。 */
    jcrLevel?: number | null
    /** 论文等级（CCF 类别）；给了 jcrLevel 就不必给这个（服务器以 JCR 为准）。 */
    ccfLevel?: string | null
  }
}

export async function fetchPropose(
  base: string,
  apiKey: string,
  projectId: string,
  input: ProposeInput,
  options: ServerRequestOptions = {},
): Promise<MentorshipProposal> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少研究工作 id。')
  const scope = (input.guidanceScope ?? '').trim()
  if (!scope) throw new ServerError('bad-request', '指导范围不能为空。')
  // 等级只发**一个**：服务器以 JCR 优先，客户端不把"另一个也顺手发过去"变成隐患。
  const jcr = asJcrLevel(input.successCondition.jcrLevel)
  const ccf = asCcfLevel(input.successCondition.ccfLevel)
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/mentorship-proposals`,
    {
      method: 'POST',
      apiKey: key,
      body: {
        guidance_scope: scope,
        total_fee: input.totalFee,
        deposit_amount: input.depositAmount,
        success_payment_amount: input.successPaymentAmount,
        success_condition: {
          type: input.successCondition.type,
          description: input.successCondition.description ?? null,
          ...(jcr !== null ? { jcr_level: jcr } : ccf !== null ? { ccf_level: ccf } : {}),
        },
      },
    },
    options,
    '指导提案',
  )
  return parseProposal(body)
}

/** 我涉及的提案（作为导师 = 我发起的；作为研究者 = 我收到的）。 */
export async function fetchProposals(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<MentorshipProposal[]> {
  const key = requireKey(apiKey)
  const body = await requestJson(
    base,
    '/mentorship-proposals',
    { method: 'GET', apiKey: key },
    options,
    '指导提案列表',
  )
  // ⚠️ 服务器这里是**裸数组**（FastAPI `response_model=list[...]`），不是 `{ items: [...] }`
  // ——与 `/discovery/random` 的形状不同，别照抄。
  if (!Array.isArray(body)) {
    throw new ServerError('bad-response', '指导提案列表：响应应为数组。')
  }
  return body.map(parseProposal)
}

/**
 * 接受指导提案 → **冻结押金**，创建合同与关系。
 *
 * 能接受的是**未发起的那一方**（服务端按 `proposed_by_id` 判，不是按角色）：
 * 方向 A 由学生接受、方向 B 由导师接受；**两个方向都从 `researcher_id`
 * （= 学生）的账户冻结押金** —— 论文主体是学生，学生出钱。
 *
 * ⚠️ `intentKey` 是**一次接受意图**的幂等键（同 work/brief）：
 * 402（押金不足）之后拿到 Token 再试必须复用同一个 key，服务器据此回放、不重复冻结。
 * 方向 B 下 402 说的是**学生**余额不足，界面要如实那样说（不是"你余额不足"）。
 */
export async function fetchAcceptProposal(
  base: string,
  apiKey: string,
  proposalId: string,
  intentKey: string,
  options: ServerRequestOptions = {},
): Promise<MentorshipContract> {
  const key = requireKey(apiKey)
  const id = (proposalId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少提案 id。')
  const intent = (intentKey ?? '').trim()
  if (!intent) throw new ServerError('bad-request', '缺少幂等键（接受指导的一次性意图）。')
  const body = await requestJson(
    base,
    `/mentorship-proposals/${encodeURIComponent(id)}/accept`,
    { method: 'POST', apiKey: key, idempotencyKey: intent },
    options,
    '接受指导',
  )
  return parseContract(body)
}

/** 拒绝指导提案（收到提案的一方：方向 A 是学生，方向 B 是导师）。 */
export async function fetchRejectProposal(
  base: string,
  apiKey: string,
  proposalId: string,
  options: ServerRequestOptions = {},
): Promise<MentorshipProposal> {
  const key = requireKey(apiKey)
  const id = (proposalId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少提案 id。')
  const body = await requestJson(
    base,
    `/mentorship-proposals/${encodeURIComponent(id)}/reject`,
    { method: 'POST', apiKey: key },
    options,
    '拒绝指导',
  )
  return parseProposal(body)
}

