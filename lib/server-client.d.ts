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
/** 服务器 API 前缀（`ConvFusion-server/app/core/config.py` 的 `API_PREFIX`）。 */
export declare const SERVER_API_PREFIX = "/api/v1";
/** 单次请求超时（毫秒）。服务器不可达时必须**很快**给出可显示的失败。 */
export declare const SERVER_TIMEOUT_MS = 8000;
/** 一次网络请求的最小实现（便于离线测试注入假 fetch）。 */
export type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
/** 服务器上的账号（`GET /api/v1/auth/me` 的响应，字段名已转 camelCase）。 */
export interface ServerAccount {
    id: string;
    email: string;
    displayName: string;
    status: string;
    /** `RESEARCHER` / `MENTOR` / `ADMIN`（可多个）。 */
    roles: string[];
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
    available: number;
    /** 冻结余额（如已接受提案的押金 —— 仍是用户的钱，只是锁住）。 */
    frozen: number;
    /** 总额（可用 + 冻结）。 */
    total: number;
}
/**
 * 一项**研究工作**（服务器上的 Research Project）的公开信息。
 *
 * 这是服务器**渐进披露**体系的第一层（免费，`GET /discovery/random`
 * 与 `GET /projects/{id}/summary`）：只说"这是什么"，
 * **不含** core idea / hypothesis / method（那些在第二层「简报」、第三层「完整状态」）。
 */
export interface WorkItem {
    projectId: string;
    title: string;
    researchFields: string[];
    /** 研究阶段（`IDEA` / `LITERATURE` / `EXPERIMENT` / …），可能为空。 */
    stage: string | null;
    /** 进度 0–1。 */
    progress: number;
    researchQuestion: string | null;
    summary: string | null;
    /** 与 owner 的关系（部分响应带）。 */
    updatedAt: string;
}
/**
 * 第二层：**简报**（`GET /projects/{id}/brief`）。
 *
 * ⚠️ 非 owner 每次访问**消耗 1 Token**，且用 `Idempotency-Key` 去重 ——
 * 同一次"查看意图"重试不会重复扣费（402 之后充值再试就是这个路径）。
 */
export interface WorkBrief {
    projectId: string;
    title: string;
    researchFields: string[];
    stage: string | null;
    progress: number;
    researchQuestion: string | null;
    motivation: string | null;
    coreIdea: string | null;
    hypothesis: string | null;
    methodOverview: string | null;
    keyEvidence: string[];
    openProblems: string[];
    updatedAt: string;
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
 * | `no-relationship` | 403 需要有效研究关系 | 先建立导师关系（本轮不实现入口） |
 * | `not-found` | 404 不存在或不可见 | 刷新列表 |
 * | `idempotency-reused` | 409 同 Key 不同 payload | 客户端 bug（同一意图才能复用 Key） |
 */
export type ServerErrorCode = 'invalid-key' | 'account-inactive' | 'invalid-invitation' | 'invitation-used' | 'email-taken' | 'rate-limited' | 'bad-request' | 'bad-url' | 'unreachable' | 'server-error' | 'bad-response' | 'insufficient-tokens' | 'no-relationship' | 'not-found' | 'idempotency-reused';
/** 带分类的服务器错误。`message` **已经是可直接展示的中文**。 */
export declare class ServerError extends Error {
    readonly code: ServerErrorCode;
    /** HTTP 状态码（网络层失败时缺省）。 */
    readonly httpStatus?: number;
    /** 服务器自己的 `error.code`（如 `API_KEY_REVOKED`），仅用于诊断。 */
    readonly serverCode?: string;
    /** 429 的 `details.retry_after_seconds`。 */
    readonly retryAfterSeconds?: number;
    /** 402 的 `details.required`（本次需要多少 Token）。 */
    readonly requiredTokens?: number;
    /** 402 的 `details.available`（当前可用多少 Token）。 */
    readonly availableTokens?: number;
    constructor(code: ServerErrorCode, message: string, extra?: {
        httpStatus?: number;
        serverCode?: string;
        retryAfterSeconds?: number;
        requiredTokens?: number;
        availableTokens?: number;
    });
}
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
export declare function normalizeBaseUrl(raw: string): string;
/** 拼一个 API 路径（`/auth/me` → `http://host/api/v1/auth/me`）。 */
export declare function apiUrl(base: string, path: string): string;
/**
 * 归一用户粘贴的 API Key。
 *
 * 容忍 `Bearer ` 前缀与首尾空白（从 `.env` / 文档里复制时的常见形态），
 * 不做格式硬校验 —— 格式合法性由**服务器**裁决，我们只拦明显为空的情况。
 */
export declare function normalizeApiKey(raw: string): string;
export interface ServerRequestOptions {
    /** 网络实现（测试注入；缺省 = 全局 `fetch`）。 */
    fetchImpl?: FetchLike;
    /** 超时（毫秒）；缺省 {@link SERVER_TIMEOUT_MS}。 */
    timeoutMs?: number;
}
/**
 * 用一份 API Key 做身份自检（连通性 + Key 有效性 + 账号状态 + 角色）。
 *
 * 对应 `INTEGRATION.md` §3 ①：「建议作为插件启动时的第一个调用」。
 *
 * @throws {ServerError} `invalid-key` / `account-inactive` / `unreachable` / …
 */
export declare function fetchAccount(base: string, apiKey: string, options?: ServerRequestOptions): Promise<ServerAccount>;
/**
 * 凭邀请码注册：创建用户并**直接得到一份 API Key**（服务器只在这一次返回明文）。
 *
 * 注册成功后立刻用新 Key 做一次 `/auth/me`，因为
 * `POST /auth/invitations/accept` 的响应里**没有** `roles` —— 而角色决定
 * 界面上能做什么（`RESEARCHER` / `MENTOR` / `ADMIN`）。多一次调用换取完整身份，值。
 *
 * @throws {ServerError} `invalid-invitation` / `invitation-used` / `email-taken` / …
 */
export declare function acceptInvitation(base: string, input: {
    invitationCode: string;
    email: string;
    displayName: string;
}, options?: ServerRequestOptions): Promise<{
    account: ServerAccount;
    apiKey: string;
}>;
/**
 * 读 Token 余额（免费接口，不消耗 Token）。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export declare function fetchTokenBalance(base: string, apiKey: string, options?: ServerRequestOptions): Promise<TokenBalance>;
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
export declare function fetchWorkList(base: string, apiKey: string, options?: ServerRequestOptions): Promise<WorkItem[]>;
/**
 * 一项研究工作的**摘要**（第一层，免费）。
 *
 * @throws {ServerError} `not-found`（不存在 / 未公开 / 不可见）
 */
export declare function fetchWorkSummary(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions): Promise<WorkItem>;
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
export declare function fetchWorkBrief(base: string, apiKey: string, projectId: string, intentKey: string, options?: ServerRequestOptions): Promise<WorkBrief>;
//# sourceMappingURL=server-client.d.ts.map