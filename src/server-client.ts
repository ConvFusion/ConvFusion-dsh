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
  /**
   * 响应头。**可选**：只有要读 `Content-Disposition` 的下载路径需要它，
   * 其余端点不看头，假 fetch 不必实现。
   */
  headers?: { get(name: string): string | null }
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
  /** 可用余额（能花的）。 */
  available: number
  /** 冻结余额（如已接受提案的押金 —— 仍是用户的钱，只是锁住）。 */
  frozen: number
  /** 总额（可用 + 冻结）。 */
  total: number
}

/**
 * 一项**研究工作**（服务器上的 Research Project）的公开信息。
 *
 * 这是服务器**渐进披露**体系的第一层（免费，`GET /discovery/random`
 * 与 `GET /projects/{id}/summary`）：只说"这是什么"，
 * **不含** core idea / hypothesis / method（那些在第二层「简报」、第三层「完整状态」）。
 */
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
 * ⚠️ 空地址回落到**当前环境**的默认地址（开发 localhost / 生产 convfusion.com），
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
  // 丢掉文档页/前缀，只留 origin + 真实路径前缀
  let path = url.pathname.replace(/\/+$/, '')
  path = path.replace(/\/api\/v1$/, '').replace(/\/api$/, '').replace(/\/docs$/, '')
  path = path.replace(/\/+$/, '')
  return `${url.origin}${path}`
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
    const balance =
      required === undefined || available === undefined
        ? 'Token 余额不足。'
        : `Token 余额不足：本次需要 ${required} 个，当前可用 ${available} 个。`
    return new ServerError(
      'insufficient-tokens',
      // ⚠️ 不要在这条**用户可见**的文案里写 markdown（`**` 会原样显示成星号）
      `${balance}拿到 Token 后，用同一次查看重试即可，不会重复扣费。`,
      {
        ...withCode,
        ...(required === undefined ? {} : { requiredTokens: required }),
        ...(available === undefined ? {} : { availableTokens: available }),
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
    // 导师越界写（非 review/ 路径）：**不是**"没权限"，而是"只能写 review/"。
    // ⚠️ 必须排在 account-inactive 兜底之前 —— 否则会被误报成"账号被停用"。
    if (serverCode === 'FILE_PATH_RESERVED') {
      return new ServerError(
        'path-reserved',
        `导师只能把文件写到 ${MENTOR_REVIEW_PREFIX}/ 目录下，其他路径不能改（研究事实由学生自己维护）。`,
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

  if (!res.ok) throw mapHttpError(res.status, body)
  if (body === undefined) {
    throw new ServerError('bad-response', `${label}：服务器返回的不是 JSON。`)
  }
  return body
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
  }
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
  const { stateVersion, fetchImpl: fetchOption, timeoutMs } = options
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
        headers: { authorization: `Bearer ${key}` },
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
 * 导师可写的**保留前缀**（服务器强制，`docs/API.md` §13.1）。
 *
 * | 谁 | 可写路径 |
 * |---|---|
 * | 项目 owner | 任意路径 |
 * | 有效研究关系的另一方（导师） | **仅 `review/**`**，其他 → `403 FILE_PATH_RESERVED` |
 *
 * 结构上禁止导师改写研究事实（`project.md` / `research-state.md` 写不进去），
 * 学生侧 `/files`、`/files/tree`、`/files/archive` 都能看到 `review/`，无需新接口。
 */
export const MENTOR_REVIEW_PREFIX = 'review'

/**
 * 回传指导结果：把本地 `workspace/review/` 下的文件**按原相对路径**上传。
 *
 * 服务器只允许关系方写 `review/**`；越界会得到 `403 FILE_PATH_RESERVED`
 * （映射成 `path-reserved`，界面据此说"导师只能写 review/"，**不是**没权限）。
 *
 * @param relPaths 与 `files` 一一对应的 `review/...` 相对路径（保留目录层次）。
 */
export async function uploadReviewFiles(
  base: string,
  apiKey: string,
  projectId: string,
  files: ReadonlyArray<{ relPath: string; bytes: Uint8Array }>,
  options: ServerRequestOptions = {},
): Promise<UploadedFile[]> {
  for (const f of files) {
    // 早于服务器一步拦住：既省一次往返，也让"导师只能写 review/"在客户端就成立
    if (!f.relPath.startsWith(`${MENTOR_REVIEW_PREFIX}/`)) {
      throw new ServerError(
        'bad-request',
        `导师只能上传 ${MENTOR_REVIEW_PREFIX}/ 目录下的文件（收到 ${f.relPath}）。`,
      )
    }
  }
  return await postProjectFiles(base, apiKey, projectId, files, options, '上传指导结果')
}

/** 项目文件空间里的一个文件（`GET /projects/{id}/files` 的条目）。 */
export interface RemoteProjectFile {
  id: string
  relativePath: string
  size: number
}

/**
 * 列出项目工作区的**全部**文件。
 *
 * 读权限 = owner 或**活跃研究关系方**（服务器 `FileService._readable_project`），
 * 所以导师不需要额外授权就能同步学生的工作区。
 */
export async function fetchProjectFiles(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions = {},
): Promise<RemoteProjectFile[]> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  const body = await requestJson(
    base,
    `/projects/${encodeURIComponent(id)}/files`,
    { method: 'GET', apiKey: key },
    options,
    '项目文件列表',
  )
  const items = asRecord(body)?.items
  if (!Array.isArray(items)) {
    throw new ServerError('bad-response', '项目文件列表缺少 items 字段。')
  }
  return items.map((raw) => {
    const b = asRecord(raw) ?? {}
    const fileId = asString(b.id)
    const relativePath = asString(b.relative_path)
    if (!fileId || !relativePath) {
      throw new ServerError('bad-response', '项目文件条目缺少 id / relative_path。')
    }
    return { id: fileId, relativePath, size: asNumber(b.size) }
  })
}

/**
 * 一个返回**原始字节**的 GET（不是 JSON，所以不能走 `requestJson`）。
 *
 * ⚠️ 失败时仍然要拿到服务器的**结构化错误**（403 未授权 / 404 不存在），
 * 否则界面只能显示"下载失败"，用户不知道是该去建立关系还是刷新列表。
 */
async function fetchBinary(
  base: string,
  path: string,
  apiKey: string,
  options: ServerRequestOptions,
  label: string,
): Promise<{ bytes: Uint8Array; contentDisposition: string | null }> {
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
  // 文件名由**服务器**决定（`<owner>-<project>.zip`）——代理只透传，不自造
  const contentDisposition = res.headers?.get('content-disposition') ?? null
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentDisposition }
}

/**
 * 下载项目工作区的 **ZIP 快照**（`GET /projects/{id}/files/archive`）。
 *
 * 为什么用归档而不是逐文件：指导闭环要的是"和学生研究工作区内容一致的一份副本"，
 * 一个请求拿到整棵树最省事；逐文件会在几十个文件上放大往返与失败面。
 *
 * 服务端行为：同一路径只导出**最新一次上传**（工作区快照，不重复），
 * 条目名是 workspace 相对路径（含目录层次）。
 */
export async function fetchProjectArchive(
  base: string,
  apiKey: string,
  projectId: string,
  options: ServerRequestOptions = {},
): Promise<{ bytes: Uint8Array; contentDisposition: string | null }> {
  const key = requireKey(apiKey)
  const id = (projectId ?? '').trim()
  if (!id) throw new ServerError('bad-request', '缺少 projectId。')
  return await fetchBinary(
    base,
    `/projects/${encodeURIComponent(id)}/files/archive`,
    key,
    options,
    '下载工作区快照',
  )
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
  updatedAt: string
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
    updatedAt: asString(b.updated_at),
  }
}

/** 建项目（恒为 PRIVATE；此时还没有 State）。 */
export async function createProject(
  base: string,
  apiKey: string,
  input: { title: string; description?: string },
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
      body: { title, ...(input.description ? { description: input.description } : {}) },
    },
    options,
    '建项目',
  )
  return parseProject(body)
}

/** 读一台自己的项目（owner-only；非 owner 或已删除 → 404 `not-found`）。 */
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
    // `brief_paid`：打开这项简报还会不会再扣 Token（服务器按支付记录 / owner 判定）。
    // 只有真的是布尔才采信；字段缺失或类型不对 → null（= 不知道，界面会照常提醒）。
    briefPaid: typeof b.brief_paid === 'boolean' ? b.brief_paid : null,
  }
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
): Promise<WorkItem[]> {
  const key = requireKey(apiKey)
  const body = await requestJson(
    base,
    '/discovery/random',
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
  profile?: MentorProfile | null
}

export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

/** 一条指导提案（`mentorship_proposals`）。 */
export interface MentorshipProposal {
  id: string
  projectId: string
  /** 项目标题（后端 enrich 后才有；旧服务器 → null，界面显示"未命名项目"）。 */
  projectTitle: string | null
  mentor: ProposalParty | null
  researcher: ProposalParty | null
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  successCondition: { type: string; description: string | null }
  status: ProposalStatus
  expiresAt: string
  createdAt: string
}

/** 费用建议（`GET /mentorship-proposals/fee-suggestion`）。 */
export interface FeeSuggestion {
  suggestedFee: number
  suggestedDeposit: number
  suggestedSuccessPayment: number
}

/** 成功条件类型（服务器枚举，界面据此给中文标签；第一版重点用 MUTUAL_COMPLETION）。 */
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
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  guidanceScope: string
  successCondition: { type: string; description: string | null }
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
    profile: b ? parseProfile(b.profile) : null,
  }
}

function parseSuccessCondition(raw: unknown): { type: string; description: string | null } {
  const b = asRecord(raw)
  return { type: asString(b?.type) || 'MUTUAL_COMPLETION', description: asString(b?.description) || null }
}

function parseProposal(raw: unknown): MentorshipProposal {
  const b = asRecord(raw)
  if (!b) throw new ServerError('bad-response', '指导提案：响应格式不对。')
  const id = asString(b.id)
  if (!id) throw new ServerError('bad-response', '指导提案缺少 id。')
  return {
    id,
    projectId: asString(b.project_id),
    projectTitle: asString(b.project_title) || null,
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

/** 费用建议（默认 100 / 20 / 80，导师可改）。 */
export async function fetchFeeSuggestion(
  base: string,
  apiKey: string,
  options: ServerRequestOptions = {},
): Promise<FeeSuggestion> {
  const key = requireKey(apiKey)
  const body = await requestJson(
    base,
    '/mentorship-proposals/fee-suggestion',
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

/** 发起指导提案（免费，不扣 Token）。 */
export interface ProposeInput {
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  successCondition: { type: string; description: string | null }
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
 * 接受指导提案（研究者）→ **冻结押金**，创建合同与关系。
 *
 * ⚠️ `intentKey` 是**一次接受意图**的幂等键（同 work/brief）：
 * 402（押金不足）之后拿到 Token 再试必须复用同一个 key，服务器据此回放、不重复冻结。
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

/** 拒绝指导提案（研究者）。 */
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

