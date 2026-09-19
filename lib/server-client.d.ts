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
    /**
     * 请求体。`FormData` 用于附件上传（multipart）——那时**不能**自己设
     * `content-type`，边界串由运行时生成。
     */
    body?: string | FormData;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    /**
     * 原始字节（附件下载用）。
     *
     * 声明成必然而不是可选：假 fetch 少实现一个方法应当**编译期**就报错，
     * 而不是等到用户点下载才在运行期炸（测试夹具已经跟着补上了）。
     */
    arrayBuffer(): Promise<ArrayBuffer>;
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
    /**
     * **服务器的权威判据**：打开这一项的简报**还会不会再扣 Token**（`brief_paid`）。
     *
     * `true` = 不再扣（账本里有该 viewer 对该项目的 `BRIEF_VIEW` 支付记录，或项目属于自己）；
     * `false` = 首次打开会扣 `BRIEF_TOKEN_COST`（默认 1）。
     *
     * `null` = 响应里没有这个字段（旧版服务器）—— 只有这时才退回本地记忆 `briefOpened`；
     * 两者都拿不准就当"会扣费"（照常提醒，宁可多问一次）。
     */
    briefPaid?: boolean | null;
    /**
     * **插件补的兜底**（不是服务器字段）：宿主本地记忆里这一项的简报已经买过。
     *
     * 只在服务器没有 `brief_paid` 时才需要它（`research/paid-briefs.ts`）；
     * 服务器给了权威值时以 `briefPaid` 为准。
     */
    briefOpened?: boolean;
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
    chargedTokens: number | null;
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
export type ServerErrorCode = 'invalid-key' | 'account-inactive' | 'invalid-invitation' | 'invitation-used' | 'email-taken' | 'rate-limited' | 'bad-request' | 'bad-url' | 'unreachable' | 'server-error' | 'bad-response' | 'insufficient-tokens' | 'no-relationship' | 'not-found' | 'idempotency-reused'
/** 409：研究状态乐观锁冲突（`details.current_version` 是服务端最新版本）。 */
 | 'version-conflict'
/**
 * 409：指导提案的状态在用户操作期间变了 —— `PROPOSAL_INVALID_STATE`（已被处理 /
 * 已过期）或 `PROJECT_ALREADY_HAS_ACTIVE_MENTORSHIP`（项目已有生效关系）。
 * 两者都不是"输入有问题"，正确的动作是**刷新列表**再看。
 */
 | 'proposal-state'
/** 403：导师写了 `review/` 之外（或别人的）路径 —— 结构上禁止改写研究事实。 */
 | 'path-reserved';
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
    /** 409 STATE_VERSION_CONFLICT 的 `details.current_version`（重基时用它）。 */
    readonly currentVersion?: number;
    constructor(code: ServerErrorCode, message: string, extra?: {
        httpStatus?: number;
        serverCode?: string;
        retryAfterSeconds?: number;
        requiredTokens?: number;
        availableTokens?: number;
        currentVersion?: number;
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
 * 用量与配额（`GET /api/v1/usage`）。
 *
 * 发布前要同时回答两个问题：**这次要花多少 Token**、**还装得下多少字节**。
 * 服务器一次调用就都给出来（`services/quota.py` 的 `UsageService.snapshot`）。
 */
export interface ServerUsage {
    /** 下一个项目发布要花的 Token（1–3 个=1、4–6 个=2…，已付费项目重复发布免费）。 */
    nextPublishCost: number;
    /** 已付费（曾经发布过）的项目数。 */
    paidProjects: number;
    /** 项目层级（阶梯号）。 */
    tier: number;
    storage: {
        usedBytes: number;
        capacityBytes: number;
        availableBytes: number;
        /** 每 N 字节 1 Token（扩容单价的分母）。 */
        bytesPerToken: number;
    };
}
/** 读用量与配额。**失败时返回 null**（调用方按"未知"展示，不阻塞发布）。 */
export declare function fetchUsage(base: string, apiKey: string, options?: ServerRequestOptions): Promise<ServerUsage | null>;
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
    id: string;
    relativePath: string;
    size: number;
    sha256: string;
}
export declare function uploadProjectFiles(base: string, apiKey: string, projectId: string, files: ReadonlyArray<{
    relPath: string;
    bytes: Uint8Array;
}>, options?: {
    stateVersion?: number;
} & ServerRequestOptions): Promise<UploadedFile[]>;
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
export declare const MENTOR_REVIEW_PREFIX = "review";
/**
 * 回传指导结果：把本地 `workspace/review/` 下的文件**按原相对路径**上传。
 *
 * 服务器只允许关系方写 `review/**`；越界会得到 `403 FILE_PATH_RESERVED`
 * （映射成 `path-reserved`，界面据此说"导师只能写 review/"，**不是**没权限）。
 *
 * @param relPaths 与 `files` 一一对应的 `review/...` 相对路径（保留目录层次）。
 */
export declare function uploadReviewFiles(base: string, apiKey: string, projectId: string, files: ReadonlyArray<{
    relPath: string;
    bytes: Uint8Array;
}>, options?: ServerRequestOptions): Promise<UploadedFile[]>;
/** 项目文件空间里的一个文件（`GET /projects/{id}/files` 的条目）。 */
export interface RemoteProjectFile {
    id: string;
    relativePath: string;
    size: number;
}
/**
 * 列出项目工作区的**全部**文件。
 *
 * 读权限 = owner 或**活跃研究关系方**（服务器 `FileService._readable_project`），
 * 所以导师不需要额外授权就能同步学生的工作区。
 */
export declare function fetchProjectFiles(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions): Promise<RemoteProjectFile[]>;
/**
 * 下载项目工作区的 **ZIP 快照**（`GET /projects/{id}/files/archive`）。
 *
 * 为什么用归档而不是逐文件：指导闭环要的是"和学生研究工作区内容一致的一份副本"，
 * 一个请求拿到整棵树最省事；逐文件会在几十个文件上放大往返与失败面。
 *
 * 服务端行为：同一路径只导出**最新一次上传**（工作区快照，不重复），
 * 条目名是 workspace 相对路径（含目录层次）。
 */
export declare function fetchProjectArchive(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions): Promise<Uint8Array>;
/**
 * 下载一个文件的**原始字节**（不是 JSON，所以不能走 `requestJson`）。
 *
 * ⚠️ 失败时仍然要拿到服务器的**结构化错误**（403 未授权 / 404 不存在），
 * 否则界面只能显示"下载失败"，用户不知道是该去建立关系还是刷新列表。
 */
export declare function fetchProjectFileBytes(base: string, apiKey: string, projectId: string, fileId: string, options?: ServerRequestOptions): Promise<Uint8Array>;
/** 服务器上的 Research Project（元数据）。 */
export interface ServerProject {
    id: string;
    title: string;
    description: string | null;
    status: string;
    visibility: string;
    updatedAt: string;
}
/** 上传研究状态的入参（`content` 是服务器的内容 Envelope，见 API.md §9.1）。 */
export interface UploadStateInput {
    /** `null` = 首传；否则必须等于服务端当前版本号。 */
    baseVersion: number | null;
    content: Record<string, unknown>;
    /** 一次「保存意图」一个 key；重试复用，payload 变了必须换新 key。 */
    intentKey: string;
}
/** 建项目（恒为 PRIVATE；此时还没有 State）。 */
export declare function createProject(base: string, apiKey: string, input: {
    title: string;
    description?: string;
}, options?: ServerRequestOptions): Promise<ServerProject>;
/** 读一台自己的项目（owner-only；非 owner 或已删除 → 404 `not-found`）。 */
export declare function fetchProject(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions): Promise<ServerProject>;
/** 读当前研究状态的版本号；项目还没有状态时返回 `null`（服务器 404）。 */
export declare function readStateVersion(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions): Promise<number | null>;
/**
 * 上传研究状态（新建一个不可变版本）。
 *
 * @returns 新版本号与内容哈希（哈希可用于判断"内容没变，不必再传"）
 * @throws {ServerError} `version-conflict`（含 `currentVersion`，据此重基再传）
 */
export declare function uploadResearchState(base: string, apiKey: string, projectId: string, input: UploadStateInput, options?: ServerRequestOptions): Promise<{
    version: number;
    contentHash: string;
}>;
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
export declare function publishProject(base: string, apiKey: string, projectId: string, options?: {
    intentKey?: string;
} & ServerRequestOptions): Promise<{
    visibility: string;
    chargedTokens: number;
}>;
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
/** 导师简介（`research_profiles` 的投影；后端 enrich 后才有，可能缺失）。 */
export interface MentorProfile {
    institution: string | null;
    department: string | null;
    bio: string | null;
    researchFields: string[];
    researchInterests: string[];
    researchExpertise: string[];
}
/** 提案里的当事一方（导师 / 研究者）。`displayName` 缺失时回退为 id 短前缀。 */
export interface ProposalParty {
    id: string;
    displayName: string;
    profile?: MentorProfile | null;
}
export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
/** 一条指导提案（`mentorship_proposals`）。 */
export interface MentorshipProposal {
    id: string;
    projectId: string;
    /** 项目标题（后端 enrich 后才有；旧服务器 → null，界面显示"未命名项目"）。 */
    projectTitle: string | null;
    mentor: ProposalParty | null;
    researcher: ProposalParty | null;
    guidanceScope: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    successCondition: {
        type: string;
        description: string | null;
    };
    status: ProposalStatus;
    expiresAt: string;
    createdAt: string;
}
/** 费用建议（`GET /mentorship-proposals/fee-suggestion`）。 */
export interface FeeSuggestion {
    suggestedFee: number;
    suggestedDeposit: number;
    suggestedSuccessPayment: number;
}
/** 成功条件类型（服务器枚举，界面据此给中文标签；第一版重点用 MUTUAL_COMPLETION）。 */
export declare const SUCCESS_CONDITION_TYPES: readonly ["PAPER_ACCEPTED", "PAPER_PUBLISHED", "RESEARCH_COMPLETED", "PATENT_GRANTED", "TECHNICAL_OUTCOME", "MUTUAL_COMPLETION"];
/** 接受提案返回的**合同**（`mentorship_contracts`）。 */
export interface MentorshipContract {
    id: string;
    researcherId: string;
    mentorId: string;
    projectId: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    guidanceScope: string;
    successCondition: {
        type: string;
        description: string | null;
    };
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    settledAt: string | null;
}
/** 项目与导师的研究关系（`research_relationships`）。 */
export interface ResearchRelationship {
    id: string;
    projectId: string;
    researcherId: string;
    mentorId: string;
    contractId: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
}
/** 费用建议（默认 100 / 20 / 80，导师可改）。 */
export declare function fetchFeeSuggestion(base: string, apiKey: string, options?: ServerRequestOptions): Promise<FeeSuggestion>;
/** 发起指导提案（免费，不扣 Token）。 */
export interface ProposeInput {
    guidanceScope: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    successCondition: {
        type: string;
        description: string | null;
    };
}
export declare function fetchPropose(base: string, apiKey: string, projectId: string, input: ProposeInput, options?: ServerRequestOptions): Promise<MentorshipProposal>;
/** 我涉及的提案（作为导师 = 我发起的；作为研究者 = 我收到的）。 */
export declare function fetchProposals(base: string, apiKey: string, options?: ServerRequestOptions): Promise<MentorshipProposal[]>;
/**
 * 接受指导提案（研究者）→ **冻结押金**，创建合同与关系。
 *
 * ⚠️ `intentKey` 是**一次接受意图**的幂等键（同 work/brief）：
 * 402（押金不足）之后拿到 Token 再试必须复用同一个 key，服务器据此回放、不重复冻结。
 */
export declare function fetchAcceptProposal(base: string, apiKey: string, proposalId: string, intentKey: string, options?: ServerRequestOptions): Promise<MentorshipContract>;
/** 拒绝指导提案（研究者）。 */
export declare function fetchRejectProposal(base: string, apiKey: string, proposalId: string, options?: ServerRequestOptions): Promise<MentorshipProposal>;
//# sourceMappingURL=server-client.d.ts.map