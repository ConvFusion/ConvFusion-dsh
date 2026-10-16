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
import type { SideSyncCheck } from './research/sync-watermarks.js';
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
    /** 响应头（可选）：下载要读服务器的 `Content-Disposition` 拿文件名。 */
    headers?: {
        get(name: string): string | null;
    };
    /**
     * 正文流（**可选**）：归档/附件下载用它边收边写（进度可见、内存不膨胀）。
     *
     * 声明成可选而不是必然：假 fetch 与老运行时可能只有 `arrayBuffer()` ——
     * 那时退回一次性取回，行为不变（只是没有中途进度）。
     */
    body?: {
        getReader(): {
            read(): Promise<{
                done: boolean;
                value?: Uint8Array;
            }>;
        };
    } | null;
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
    /** 可用余额（= 两池之和，能花的）。 */
    available: number;
    /** 冻结余额（如已接受提案的押金 —— 仍是用户的钱，只是锁住）。 */
    frozen: number;
    /** 总额（可用 + 冻结）。 */
    total: number;
    /**
     * **赠送额度**（服务器 `grant_balance`）—— 平台发的，只能买**自营服务**
     * （看简报 / 发布 / 买存储）。**不能付给导师、不能提现**。
     *
     * `null` = 服务器这一版不返回该字段（协议 28 之前）——**不是 0**。旧服务器把赠送与
     * 充值混在一个余额里，"这个账号没有赠送额度"与"服务器不会分开说"必须区分开。
     */
    grant: number | null;
    /**
     * **资金池**（服务器 `funded_balance`）—— 充值 + 导师所得。**唯一**能付给导师、
     * 也是**唯一**可提现的部分；接受指导时冻结的押金走的就是它。
     *
     * `null` 的含义同 `grant`（旧服务器不分开说）。
     */
    funded: number | null;
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
export type ProjectDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT';
/** 两个方向的显式清单（界面按它遍历"这个工作区在两个方向上的发布状态"）。 */
export declare const PROJECT_DIRECTIONS: readonly ProjectDirection[];
/** 解析方向字段；缺失 / 取值不在枚举里 → `SEEK_MENTOR`（旧服务器 = 今天的行为）。 */
export declare function parseDirection(raw: unknown): ProjectDirection;
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
    id: string;
    displayName: string;
}
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
     * **这项研究工作的名字**（服务器的 `work_name`）—— 列表**该显示的名字**。
     *
     * ⚠️ 与 {@link WorkItem.title} 的区别：`title` 是"这次发布的名字"（历史上是发布方的
     * 本机工作区名），`work_name` 是"这项研究工作的名字"（有论文用论文标题，否则用
     * 工作确定的主题）。看列表的人本机不一定有那份 workspace，所以名字只能由服务器给。
     *
     * `undefined` = 旧服务器还没有这个字段 → 界面退回 `title`。
     */
    workName?: string | null;
    /**
     * 这项研究工作的**方向**（服务器 `direction`）：
     * `SEEK_MENTOR` = 学生出题求指导（【可指导】）；
     * `SEEK_STUDENT` = 导师出题招学生（【可加入】）。
     *
     * ⚠️ 旧服务器不返回该字段 → `SEEK_MENTOR`（= 今天的行为，见 {@link parseDirection}）。
     */
    direction: ProjectDirection;
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
    owner?: WorkOwner | null;
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
    /**
     * 402（**资金池专属**路径）的 `details.funded`：资金池当前有多少。
     *
     * 它出现就说明这次失败是"赠送额度不能付给导师"，而不是"一分钱都没有"——
     * 界面据此说清话（并提示找管理员发放），而不是笼统说余额不足。
     */
    readonly fundedTokens?: number;
    /** 402（资金池专属路径）的 `details.grant`：同一次失败里赠送额度有多少。 */
    readonly grantTokens?: number;
    /** 409 STATE_VERSION_CONFLICT 的 `details.current_version`（重基时用它）。 */
    readonly currentVersion?: number;
    constructor(code: ServerErrorCode, message: string, extra?: {
        httpStatus?: number;
        serverCode?: string;
        retryAfterSeconds?: number;
        requiredTokens?: number;
        availableTokens?: number;
        fundedTokens?: number;
        grantTokens?: number;
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
 * ⚠️ 空地址回落到**当前环境**的默认地址（开发 localhost / 生产 convfusion.apibrowser.com:4747），
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
    workspaceId?: string | null;
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
export type FileSource = 'owner' | 'mentor';
/**
 * 正文"卡死"判据：连续这么久**一个字节都没有**才算断，而不是给整段设总时长。
 *
 * 为什么不是总时长上限：这条链路的实测速率 ~118 KB/s，一个十几 MB 的工作区快照
 * 本来就要一两分钟 —— 用总时长卡会把"慢"误判成"死"。而 30 秒没有任何数据，
 * 在任何链路上都只能是断了。
 */
export declare const STALL_TIMEOUT_MS = 30000;
/**
 * 二进制下载的选项（归档 / 附件）。在 {@link ServerRequestOptions} 之上加"边收边给"。
 *
 * `onChunk` 一给，正文就**不再驻留内存**：调用方拿到一块写一块（写盘），
 * 因此进度是真的、内存不随文件大小增长。
 */
export interface BinaryStreamOptions extends ServerRequestOptions {
    /** 每收到一块就回调（**顺序**调用，调用方可以同步写盘）。 */
    onChunk?: (chunk: Uint8Array) => void;
    /** 累计收到多少字节（进度用；每块一次）。 */
    onProgress?: (received: number) => void;
    /** 无数据的容忍时长（毫秒）；缺省 {@link STALL_TIMEOUT_MS}。 */
    stallTimeoutMs?: number;
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
export declare function probeServerHealth(base: string, options?: ServerRequestOptions): Promise<void>;
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
 * 续费申请的状态（与服务器 `RechargeRequestStatus` 对齐）。
 *
 * `PENDING` = 等管理员处理；`APPROVED` = 已批准并发放（账本里有一条 `GRANT`）；
 * `REJECTED` = 被拒。界面上要让用户看见"我申请的现在到哪一步了"。
 */
export type RechargeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
/**
 * 一条续费申请（`POST /api/v1/tokens/recharge-requests` 的返回，snake_case → camelCase）。
 *
 * ⚠️ 这只是**意向记录** —— `submit` 不改余额；只有管理员批准后才会真正发 Token
 * （那时 `grant_tx_id` 会指向账本里那条 `GRANT` 流水）。
 */
export interface RechargeRequest {
    id: string;
    amount: number;
    reason: string | null;
    status: RechargeStatus;
    /** 管理员审批时写的备注（批准 / 拒绝的理由）。 */
    note: string | null;
    /** 批准这条申请的管理员（未审批时为 null）。 */
    reviewedBy: string | null;
    reviewedAt: string | null;
    /** 批准时发放 Token 写进账本的那条流水 id（未批准为 null）。 */
    grantTxId: string | null;
    createdAt: string;
    updatedAt: string;
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
export declare function submitRechargeRequest(base: string, apiKey: string, input: {
    amount: number;
    reason?: string;
}, options?: ServerRequestOptions): Promise<RechargeRequest>;
/**
 * 查看自己的续费申请记录（`GET /api/v1/tokens/recharge-requests`）。
 *
 * 只返回**本人**的申请（服务器按当前凭据的 user_id 过滤）。界面用它判断"是否已有一条
 * 待处理的申请"，从而阻止用户连点出多条 `PENDING`。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export declare function fetchRechargeRequests(base: string, apiKey: string, options?: ServerRequestOptions): Promise<RechargeRequest[]>;
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
export declare const MENTOR_REVIEW_PREFIX = "review";
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
export declare function uploadWorkspaceFiles(base: string, apiKey: string, projectId: string, files: ReadonlyArray<{
    relPath: string;
    bytes: Uint8Array;
}>, options?: ServerRequestOptions): Promise<UploadedFile[]>;
/** 项目文件空间里的一个文件（`GET /projects/{id}/files` 的条目）。 */
export interface RemoteProjectFile {
    id: string;
    relativePath: string;
    size: number;
    /**
     * 服务器存的**内容摘要**（`FileResponse.sha256`）。
     *
     * 导师整包回传靠它做**增量**：本地算同一个摘要，和服务器最新的这一版一致就跳过 ——
     * 服务器不去重（同路径再传 = 新行 + 新字节，配额照涨），而导师回传的多数文件
     * 本来就没动过。旧服务器不给这个字段时为空串（调用方据此**保守地全传**）。
     */
    sha256: string;
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
export declare function fetchProjectFiles(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions & {
    source?: FileSource;
}): Promise<RemoteProjectFile[]>;
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
export declare function fetchProjectFilesWithIdentity(base: string, apiKey: string, projectId: string, options?: ServerRequestOptions & {
    source?: FileSource;
}): Promise<{
    files: RemoteProjectFile[];
    workspaceId: string | null;
}>;
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
export declare function fetchProjectArchive(base: string, apiKey: string, projectId: string, sink: {
    write(chunk: Uint8Array): void;
}, options?: BinaryStreamOptions & {
    source?: FileSource;
}): Promise<{
    received: number;
    filename: string | null;
    fileCount: number | null;
    sourceUpdatedAt: string | null;
    workspaceId: string | null;
}>;
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
    /** 这项研究工作的方向（见 {@link ProjectDirection}）。 */
    direction: ProjectDirection;
    /**
     * **这项研究工作的名字**（服务器按内容解析：`work_name` → `research_question`
     * → `summary` → `title`，见 `dev-notes/v0.6.0-work-name-api.md`）。
     *
     * `null` = 服务器明确说不可知；`undefined` = **旧服务器还没有这个字段** →
     * 界面退回 `title`（不编造）。
     */
    workName?: string | null;
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
    workspaceId?: string | null;
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
/**
 * 建项目（恒为 PRIVATE；此时还没有 State）。
 *
 * `direction`（可选）决定这项研究工作**属于哪个方向的市场**：不传 = `SEEK_MENTOR`
 * （学生发布求指导，即今天的行为）。导师出题传 `SEEK_STUDENT`，见
 * `dev-notes/v0.6.0-mentor-topic-mode.md` §2 R1。
 */
export declare function createProject(base: string, apiKey: string, input: {
    title: string;
    description?: string;
    direction?: ProjectDirection;
    workspaceId?: string;
}, options?: ServerRequestOptions): Promise<ServerProject>;
/**
 * 改项目（`PUT /projects/{id}`，owner-only）。
 *
 * 本插件只用它改**标题**：研究工作的名字会在论文起名 / 主题演进后变化，而项目的
 * 标题只在建项目时写过一次 —— 不改的话，网络里那个名字就永远停在第一次发布的样子。
 *
 * ⚠️ 服务器**不接受**在这里改 `direction`（创建后不可改）：同一份工作区在两个方向是
 * 两个项目，改方向等于把项目在两个市场之间偷偷搬家。
 */
export declare function updateProject(base: string, apiKey: string, projectId: string, input: {
    title?: string;
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
export declare function fetchWorkList(base: string, apiKey: string, options?: ServerRequestOptions, 
/**
 * 要**哪个方向**的列表（服务器 `?direction=`）：
 * `SEEK_MENTOR` = 【可指导】（学生发布的研究工作，导师看）；
 * `SEEK_STUDENT` = 【可加入】（导师发布的选题，学生看）。
 *
 * 省略该参数 → 服务器默认 `SEEK_MENTOR`（= 今天的行为），旧服务器忽略它。
 */
direction?: ProjectDirection): Promise<WorkItem[]>;
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
    profile?: MentorProfile | null;
}
export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
/** 一条指导提案（`mentorship_proposals`）。 */
export interface MentorshipProposal {
    id: string;
    projectId: string;
    /**
     * 这个项目属于哪个方向（服务器的 `direction`，见 {@link ProjectDirection}）。
     *
     * 界面**必须**靠它决定三件事，不能靠"我是谁的角色"：谁能接受、
     * 我上传落在哪一侧、进展文案怎么称呼。旧服务器缺字段 → `SEEK_MENTOR`。
     */
    direction: ProjectDirection;
    /**
     * **谁发起了这次提案**（服务器的 `proposed_by_id`）。
     *
     * `null` = 旧服务器不返回 → 界面退回按方向推断
     * （`SEEK_MENTOR` → 导师发起；`SEEK_STUDENT` → 学生发起）。
     */
    proposedById: string | null;
    /** 项目标题（后端 enrich 后才有；旧服务器 → null，界面显示"未命名项目"）。 */
    projectTitle: string | null;
    /**
     * **这项研究工作的名字**（服务器的 `work_name`，与 {@link projectTitle} 并列返回）。
     *
     * 与发现列表同一个字段、同一个来源（见 {@link WorkItem.workName}）：列表该显示的
     * 是它，`project_title` 只作旧服务器的兜底。
     */
    workName?: string | null;
    mentor: ProposalParty | null;
    researcher: ProposalParty | null;
    guidanceScope: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    successCondition: MentorshipSuccessCondition;
    status: ProposalStatus;
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
    reviewFiles?: number | null;
    /**
     * **owner 那一侧**当前的文件数（服务器 `workspace_files`，`DISTINCT relative_path`）。
     *
     * 三态（与 `reviewFiles` 同一套纪律）：`undefined` = 响应里没有这个字段（旧服务器）、
     * `null` = 不可知（无读权限 / 项目软删除）、`n` = 明确知道。
     * 它与 {@link workspaceUpdatedAt} 合起来是"**owner 侧**变了吗"的两条互补判据 ——
     * **时间戳看不到删除**（删文件不会让 `MAX(created_at)` 前进），文件数看得到。
     */
    workspaceFiles?: number | null;
    /**
     * **owner 那一侧**最后一次**上传文件**的时间（服务器 `workspace_updated_at`，ISO-8601）。
     *
     * 与 `workspaceFiles` 同三态。只覆盖**文件**：研究状态的变动不进这个时间戳
     * （状态自己的信号是 `GET /full` 的 `version` / `content_hash`）。
     */
    workspaceUpdatedAt?: string | null;
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
    counterpartUpdatedAt?: string | null;
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
        owner: SideSyncCheck | null;
        mentor: SideSyncCheck | null;
    } | null;
    /**
     * **旧形状**（协议 < 25）：只有 owner 侧这一个判读结果，界面为兼容继续认它。
     *
     * ⚠️ 只在 `syncBySide` 缺失（旧宿主）时才读 —— 两份都在时以 `syncBySide` 为准。
     */
    sync?: SideSyncCheck | null;
    expiresAt: string;
    createdAt: string;
}
/** 费用建议（`GET /mentorship-proposals/fee-suggestion`）。 */
export interface FeeSuggestion {
    suggestedFee: number;
    suggestedDeposit: number;
    suggestedSuccessPayment: number;
}
/** 论文类成功条件：价格 = 等级，因此**必须**给出等级。 */
export declare const PAPER_CONDITION_TYPES: readonly ["PAPER_ACCEPTED", "PAPER_PUBLISHED"];
/** 这个成功条件是不是按论文等级定价的（服务器 `PAPER_CONDITION_TYPES`）。 */
export declare function isPaperCondition(type: string | null | undefined): boolean;
/** 计价体系：`JCR` 分区 1–4 与 `CCF` 类别 A/B/C。 */
export type PaperLevelSystem = 'JCR' | 'CCF';
/** 一个等级（体系 + 取值）—— 提案里落成 `jcr_level` 或 `ccf_level`。 */
export interface PaperLevel {
    system: PaperLevelSystem;
    /** JCR：`1`–`4`；CCF：`'A'`/`'B'`/`'C'`。 */
    level: number | string;
}
/** JCR 分区（1 = 最高）。 */
export declare const JCR_LEVELS: readonly number[];
/** CCF 类别（A = 最高）。 */
export declare const CCF_LEVELS: readonly string[];
/** 归一 JCR 分区（1–4 的整数；别的一律 `null`）。 */
export declare function asJcrLevel(v: unknown): number | null;
/** 归一 CCF 类别（大小写不敏感 → 大写 `A`/`B`/`C`；别的一律 `null`）。 */
export declare function asCcfLevel(v: unknown): string | null;
/**
 * 从成功条件里读出**它声明的等级**（没有 → `null`）。
 *
 * 与服务器的读取顺序一致（`PaperPriceCalculator.level_of`）：先看 `jcr_level`，
 * 再看 `ccf_level`。两种都给时以 JCR 为准 —— 服务器也是这么定价的，界面不能另说一套。
 */
export declare function successConditionLevel(condition: {
    jcrLevel?: number | null;
    ccfLevel?: string | null;
} | null | undefined): PaperLevel | null;
/**
 * 成功条件的完整形态（提案 / 合同共用）。
 *
 * `jcrLevel` / `ccfLevel` 是**论文类条件的价格依据**；非论文类条件两者都是 `null`
 * （那是正常的，不是缺数据）。
 */
export interface MentorshipSuccessCondition {
    type: string;
    description: string | null;
    jcrLevel: number | null;
    ccfLevel: string | null;
}
/** 成功条件类型（服务器枚举，界面据此给中文标签）。 */
export declare const SUCCESS_CONDITION_TYPES: readonly ["PAPER_ACCEPTED", "PAPER_PUBLISHED", "RESEARCH_COMPLETED", "PATENT_GRANTED", "TECHNICAL_OUTCOME", "MUTUAL_COMPLETION"];
/** 接受提案返回的**合同**（`mentorship_contracts`）。 */
export interface MentorshipContract {
    id: string;
    researcherId: string;
    mentorId: string;
    projectId: string;
    /** 合同所属的方向（见 {@link ProjectDirection}；旧服务器缺字段 → `SEEK_MENTOR`）。 */
    direction: ProjectDirection;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    guidanceScope: string;
    successCondition: MentorshipSuccessCondition;
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
export declare function fetchFeeSuggestion(base: string, apiKey: string, options?: ServerRequestOptions, level?: PaperLevel | null): Promise<FeeSuggestion>;
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
    guidanceScope: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    successCondition: {
        type: string;
        description: string | null;
        /** 论文等级（JCR 分区）；非论文类条件留空。 */
        jcrLevel?: number | null;
        /** 论文等级（CCF 类别）；给了 jcrLevel 就不必给这个（服务器以 JCR 为准）。 */
        ccfLevel?: string | null;
    };
}
export declare function fetchPropose(base: string, apiKey: string, projectId: string, input: ProposeInput, options?: ServerRequestOptions): Promise<MentorshipProposal>;
/** 我涉及的提案（作为导师 = 我发起的；作为研究者 = 我收到的）。 */
export declare function fetchProposals(base: string, apiKey: string, options?: ServerRequestOptions): Promise<MentorshipProposal[]>;
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
export declare function fetchAcceptProposal(base: string, apiKey: string, proposalId: string, intentKey: string, options?: ServerRequestOptions): Promise<MentorshipContract>;
/** 拒绝指导提案（收到提案的一方：方向 A 是学生，方向 B 是导师）。 */
export declare function fetchRejectProposal(base: string, apiKey: string, proposalId: string, options?: ServerRequestOptions): Promise<MentorshipProposal>;
//# sourceMappingURL=server-client.d.ts.map