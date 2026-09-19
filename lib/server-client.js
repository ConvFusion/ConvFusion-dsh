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
import { defaultServerUrl } from './config.js';
/** 服务器 API 前缀（`ConvFusion-server/app/core/config.py` 的 `API_PREFIX`）。 */
export const SERVER_API_PREFIX = '/api/v1';
/** 单次请求超时（毫秒）。服务器不可达时必须**很快**给出可显示的失败。 */
export const SERVER_TIMEOUT_MS = 8000;
/** 带分类的服务器错误。`message` **已经是可直接展示的中文**。 */
export class ServerError extends Error {
    code;
    /** HTTP 状态码（网络层失败时缺省）。 */
    httpStatus;
    /** 服务器自己的 `error.code`（如 `API_KEY_REVOKED`），仅用于诊断。 */
    serverCode;
    /** 429 的 `details.retry_after_seconds`。 */
    retryAfterSeconds;
    /** 402 的 `details.required`（本次需要多少 Token）。 */
    requiredTokens;
    /** 402 的 `details.available`（当前可用多少 Token）。 */
    availableTokens;
    /** 409 STATE_VERSION_CONFLICT 的 `details.current_version`（重基时用它）。 */
    currentVersion;
    constructor(code, message, extra = {}) {
        super(message);
        this.name = 'ServerError';
        this.code = code;
        this.httpStatus = extra.httpStatus;
        this.serverCode = extra.serverCode;
        this.retryAfterSeconds = extra.retryAfterSeconds;
        this.requiredTokens = extra.requiredTokens;
        this.availableTokens = extra.availableTokens;
        this.currentVersion = extra.currentVersion;
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
export function normalizeBaseUrl(raw) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed)
        return defaultServerUrl();
    let url;
    try {
        url = new URL(trimmed);
    }
    catch {
        throw new ServerError('bad-url', `服务器地址不是合法 URL：${trimmed}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ServerError('bad-url', `服务器地址必须以 http:// 或 https:// 开头：${trimmed}`);
    }
    // 丢掉文档页/前缀，只留 origin + 真实路径前缀
    let path = url.pathname.replace(/\/+$/, '');
    path = path.replace(/\/api\/v1$/, '').replace(/\/api$/, '').replace(/\/docs$/, '');
    path = path.replace(/\/+$/, '');
    return `${url.origin}${path}`;
}
function apiBase(base) {
    return `${normalizeBaseUrl(base)}${SERVER_API_PREFIX}`;
}
/** 拼一个 API 路径（`/auth/me` → `http://host/api/v1/auth/me`）。 */
export function apiUrl(base, path) {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${normalizeBaseUrl(base)}${SERVER_API_PREFIX}${suffix}`;
}
/**
 * 归一用户粘贴的 API Key。
 *
 * 容忍 `Bearer ` 前缀与首尾空白（从 `.env` / 文档里复制时的常见形态），
 * 不做格式硬校验 —— 格式合法性由**服务器**裁决，我们只拦明显为空的情况。
 */
export function normalizeApiKey(raw) {
    return (raw ?? '')
        .trim()
        .replace(/^Bearer\s+/i, '')
        .trim();
}
function errorBodyMessage(body) {
    if (!body || typeof body !== 'object')
        return {};
    const error = body.error;
    if (!error || typeof error !== 'object')
        return {};
    const e = error;
    const details = (e.details && typeof e.details === 'object' ? e.details : {});
    const retry = details.retry_after_seconds;
    return {
        ...(typeof e.code === 'string' ? { serverCode: e.code } : {}),
        ...(typeof e.message === 'string' ? { message: e.message } : {}),
        ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}),
    };
}
/** 统一错误契约里的 `error.details`（402 的 required / available 就在这里）。 */
function errorBodyDetails(body) {
    if (!body || typeof body !== 'object')
        return {};
    const error = body.error;
    if (!error || typeof error !== 'object')
        return {};
    const details = error.details;
    return details && typeof details === 'object' ? details : {};
}
/**
 * 把 HTTP 失败翻成带**动作**的错误。
 *
 * 依据：`ConvFusion-server/docs/API.md` §2.4 / §3.2 的错误码表。
 */
function mapHttpError(status, body) {
    const { serverCode, message, retryAfterSeconds } = errorBodyMessage(body);
    const where = (fallback) => (message ? `${fallback}（服务器：${message}）` : fallback);
    const withCode = { httpStatus: status, ...(serverCode ? { serverCode } : {}) };
    if (status === 401) {
        return new ServerError('invalid-key', serverCode === 'API_KEY_REVOKED'
            ? '这个 API Key 已被撤销，请换一份有效的 Key。'
            : where('API Key 无效或不存在，请核对后重试。'), withCode);
    }
    if (status === 402) {
        // ⚠️ 402 **不是**暂时性故障，它是"余额不足"这一业务事实：既不要自动重试，
        // 也不要把 Idempotency-Key 丢掉 —— 拿到 Token 后用**同一个 Key** 重试即可，
        // 服务端会回放上次的结果，不会重复扣费（见 INTEGRATION.md §5）。
        const details = errorBodyDetails(body);
        const required = typeof details.required === 'number' ? details.required : undefined;
        const available = typeof details.available === 'number' ? details.available : undefined;
        const balance = required === undefined || available === undefined
            ? 'Token 余额不足。'
            : `Token 余额不足：本次需要 ${required} 个，当前可用 ${available} 个。`;
        return new ServerError('insufficient-tokens', 
        // ⚠️ 不要在这条**用户可见**的文案里写 markdown（`**` 会原样显示成星号）
        `${balance}拿到 Token 后，用同一次查看重试即可，不会重复扣费。`, {
            ...withCode,
            ...(required === undefined ? {} : { requiredTokens: required }),
            ...(available === undefined ? {} : { availableTokens: available }),
        });
    }
    if (status === 403) {
        if (serverCode === 'FULL_STATE_ACCESS_REQUIRED') {
            return new ServerError('no-relationship', '完整研究状态需要有效的导师关系；当前账号与该研究还没有关系。', withCode);
        }
        return new ServerError('account-inactive', where('账号未激活或被停用，请联系 ConvFusion.com 管理员。'), withCode);
    }
    if (status === 404) {
        // 私有项目对非 owner 会**伪装成不存在**（不泄漏存在性），所以文案不能断言"不存在"
        return new ServerError('not-found', '这项研究工作不存在，或尚未公开、对你不可见。', withCode);
    }
    if (status === 429) {
        const wait = retryAfterSeconds ?? 0;
        const hint = wait >= 60 ? `请约 ${Math.ceil(wait / 60)} 分钟后再试。` : wait > 0 ? `请 ${wait} 秒后再试。` : '请稍后再试。';
        return new ServerError('rate-limited', `请求过于频繁。${hint}`, {
            ...withCode,
            ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        });
    }
    if (status === 409) {
        if (serverCode === 'INVITATION_USED') {
            return new ServerError('invitation-used', '这个邀请码已经被使用过了；如果你已经注册，请改用 API Key 登录。', {
                ...withCode,
                serverCode,
            });
        }
        if (serverCode === 'CONFLICT') {
            return new ServerError('email-taken', '这个邮箱已经注册过了；请改用 API Key 登录。', {
                ...withCode,
                serverCode,
            });
        }
        if (serverCode === 'STATE_VERSION_CONFLICT') {
            const details = errorBodyDetails(body);
            const current = typeof details.current_version === 'number' ? details.current_version : undefined;
            return new ServerError('version-conflict', '研究状态已被更新（版本冲突）。请基于最新版本重试。', { ...withCode, ...(current === undefined ? {} : { currentVersion: current }) });
        }
        if (serverCode === 'IDEMPOTENCY_KEY_REUSED') {
            return new ServerError('idempotency-reused', '同一个请求标识被用于了不同的内容（客户端问题）。请重新发起这次查看。', withCode);
        }
    }
    if (status === 400 || status === 422) {
        if (serverCode === 'INVALID_INVITATION' || serverCode === 'INVITATION_EXPIRED') {
            return new ServerError('invalid-invitation', serverCode === 'INVITATION_EXPIRED'
                ? '邀请码已过期，请向管理员索取新的邀请码。'
                : where('邀请码无效，或与填写的邮箱不匹配。'), { ...withCode, serverCode });
        }
        return new ServerError('bad-request', where('请求被服务器拒绝，请检查填写的内容。'), withCode);
    }
    if (status >= 500) {
        return new ServerError('server-error', where('服务器内部错误，请稍后重试。'), withCode);
    }
    return new ServerError('bad-request', where(`请求失败（HTTP ${status}）。`), withCode);
}
/** 一次 JSON 请求：统一超时、统一错误映射。**不重试**（鉴权调用重试没有意义）。 */
async function requestJson(base, path, init, options, label) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new ServerError('unreachable', '当前运行环境没有可用的 fetch。');
    }
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? SERVER_TIMEOUT_MS;
    const url = apiUrl(base, path);
    // ⚠️ 只 `abort()` 是不够的：abort 依赖传输层**真的**尊重 signal。所以同时 **race**
    // 一个超时 promise —— 即使底层请求永不 settle（网络栈卡住、假 fetch），调用方也一定
    // 会拿到一个可显示的失败，而不是永远转圈。这条教训在客户端加载器里已经吃过一次
    // （见 `src/client/settings.tsx` 的 `loadSettingsState`）。
    const timeoutError = new ServerError('unreachable', `连接 ${base} 超时（${Math.round(timeoutMs / 1000)} 秒无响应）。请确认服务器已启动、地址与端口正确。`);
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
        }, timeoutMs);
    });
    let res;
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
        ]);
    }
    catch (e) {
        if (e instanceof ServerError)
            throw e; // 超时（上面那个 race 的拒绝）
        throw new ServerError('unreachable', `无法连接 ${base}：${e instanceof Error ? e.message : String(e)}。请确认服务器已启动。`);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
    let body;
    try {
        body = await res.json();
    }
    catch {
        body = undefined;
    }
    if (!res.ok)
        throw mapHttpError(res.status, body);
    if (body === undefined) {
        throw new ServerError('bad-response', `${label}：服务器返回的不是 JSON。`);
    }
    return body;
}
/* ════════════════════════════════════════════════════════════════════════
 * 两个业务动作
 * ════════════════════════════════════════════════════════════════════════ */
function asString(v) {
    return typeof v === 'string' ? v : '';
}
/** 解析 `GET /auth/me` 的响应。 */
function parseAccount(body) {
    if (!body || typeof body !== 'object') {
        throw new ServerError('bad-response', '账号信息格式不正确（不是对象）。');
    }
    const b = body;
    const id = asString(b.id);
    const email = asString(b.email);
    if (!id || !email) {
        throw new ServerError('bad-response', '账号信息缺少 id / email 字段。');
    }
    return {
        id,
        email,
        displayName: asString(b.display_name) || email.split('@')[0] || email,
        status: asString(b.status) || 'ACTIVE',
        roles: Array.isArray(b.roles) ? b.roles.filter((r) => typeof r === 'string') : [],
    };
}
/**
 * 用一份 API Key 做身份自检（连通性 + Key 有效性 + 账号状态 + 角色）。
 *
 * 对应 `INTEGRATION.md` §3 ①：「建议作为插件启动时的第一个调用」。
 *
 * @throws {ServerError} `invalid-key` / `account-inactive` / `unreachable` / …
 */
export async function fetchAccount(base, apiKey, options = {}) {
    const key = normalizeApiKey(apiKey);
    if (!key)
        throw new ServerError('bad-request', 'API Key 不能为空。');
    const body = await requestJson(base, '/auth/me', { method: 'GET', apiKey: key }, options, '身份验证');
    return parseAccount(body);
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
export async function acceptInvitation(base, input, options = {}) {
    const invitationCode = input.invitationCode.trim();
    const email = input.email.trim();
    const displayName = input.displayName.trim();
    if (!invitationCode)
        throw new ServerError('bad-request', '邀请码不能为空。');
    if (!email)
        throw new ServerError('bad-request', '邮箱不能为空。');
    if (!displayName)
        throw new ServerError('bad-request', '显示名不能为空。');
    const body = await requestJson(base, '/auth/invitations/accept', {
        method: 'POST',
        body: { invitation_code: invitationCode, email, display_name: displayName },
    }, options, '邀请码注册');
    const b = (body ?? {});
    const apiKey = normalizeApiKey(asString(b.api_key));
    if (!apiKey) {
        throw new ServerError('bad-response', '注册成功但服务器没有返回 API Key；请用 API Key 登录重试。');
    }
    const account = await fetchAccount(base, apiKey, options);
    return { account, apiKey };
}
/**
 * 读 Token 余额（免费接口，不消耗 Token）。
 *
 * @throws {ServerError} `invalid-key` / `unreachable` / …
 */
export async function fetchTokenBalance(base, apiKey, options = {}) {
    const key = requireKey(apiKey);
    const body = await requestJson(base, '/tokens', { method: 'GET', apiKey: key }, options, 'Token 余额');
    const b = asObject(body, 'Token 余额');
    const available = asNumber(b.available_balance);
    const frozen = asNumber(b.frozen_balance);
    return {
        available,
        frozen,
        // 服务器会给 total；真缺了就自己加，但服务器给的值优先
        total: b.total_balance === undefined ? available + frozen : asNumber(b.total_balance),
    };
}
/** 读用量与配额。**失败时返回 null**（调用方按"未知"展示，不阻塞发布）。 */
export async function fetchUsage(base, apiKey, options = {}) {
    const key = requireKey(apiKey);
    try {
        const body = await requestJson(base, '/usage', { method: 'GET', apiKey: key }, options, '用量与配额');
        const root = asObject(body, '用量与配额');
        const projects = asObject(root.projects, '项目用量');
        const storage = asObject(root.storage, '存储用量');
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
        };
    }
    catch {
        return null;
    }
}
export async function uploadProjectFiles(base, apiKey, projectId, files, options = {}) {
    const { stateVersion, fetchImpl: fetchOption, timeoutMs } = options;
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少 projectId。');
    if (files.length === 0)
        return [];
    const fetchImpl = fetchOption ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        throw new ServerError('unreachable', '当前运行环境没有可用的 fetch。');
    const form = new FormData();
    for (const f of files) {
        const name = f.relPath.slice(f.relPath.lastIndexOf('/') + 1);
        // ⚠️ 必须转成 `ArrayBuffer`：`Buffer`/`Uint8Array<ArrayBufferLike>` 在 TS 里
        // 不能直接当 `BlobPart`（`SharedArrayBuffer` 的可能性），运行期也会被拒。
        const view = f.bytes;
        const buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        form.append('files', new Blob([buf]), name);
        form.append('relative_paths', f.relPath);
    }
    if (stateVersion !== undefined)
        form.append('state_version', String(stateVersion));
    const timeout = timeoutMs ?? SERVER_TIMEOUT_MS;
    const controller = new AbortController();
    let timer;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new ServerError('unreachable', `上传附件到 ${base} 超时（${Math.round(timeout / 1000)} 秒）。`));
        }, timeout);
    });
    let res;
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
        ]);
    }
    catch (e) {
        if (e instanceof ServerError)
            throw e;
        throw new ServerError('unreachable', `上传附件失败：${e instanceof Error ? e.message : String(e)}`);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
    let body;
    try {
        body = await res.json();
    }
    catch {
        body = undefined;
    }
    if (!res.ok)
        throw mapHttpError(res.status, body);
    if (!Array.isArray(body))
        throw new ServerError('bad-response', '附件上传的响应不是数组。');
    return body.map((raw) => {
        const b = asObject(raw, '附件元数据');
        return {
            id: asString(b.id),
            relativePath: asString(b.relative_path),
            size: asNumber(b.size, 0),
            sha256: asString(b.sha256),
        };
    });
}
function parseProject(raw) {
    const b = asObject(raw, '研究项目');
    const id = asString(b.id);
    if (!id)
        throw new ServerError('bad-response', '研究项目缺少 id 字段。');
    return {
        id,
        title: asString(b.title),
        description: asString(b.description) || null,
        status: asString(b.status) || 'ACTIVE',
        visibility: asString(b.visibility) || 'PRIVATE',
        updatedAt: asString(b.updated_at),
    };
}
/** 建项目（恒为 PRIVATE；此时还没有 State）。 */
export async function createProject(base, apiKey, input, options = {}) {
    const key = requireKey(apiKey);
    const title = (input.title ?? '').trim();
    if (!title)
        throw new ServerError('bad-request', '项目标题不能为空。');
    const body = await requestJson(base, '/projects', {
        method: 'POST',
        apiKey: key,
        body: { title, ...(input.description ? { description: input.description } : {}) },
    }, options, '建项目');
    return parseProject(body);
}
/** 读一台自己的项目（owner-only；非 owner 或已删除 → 404 `not-found`）。 */
export async function fetchProject(base, apiKey, projectId, options = {}) {
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少 projectId。');
    const body = await requestJson(base, `/projects/${encodeURIComponent(id)}`, { method: 'GET', apiKey: key }, options, '读取项目');
    return parseProject(body);
}
/** 读当前研究状态的版本号；项目还没有状态时返回 `null`（服务器 404）。 */
export async function readStateVersion(base, apiKey, projectId, options = {}) {
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少 projectId。');
    try {
        const body = await requestJson(base, `/projects/${encodeURIComponent(id)}/state`, { method: 'GET', apiKey: key }, options, '读取研究状态');
        const version = asObject(body, '研究状态').version;
        return typeof version === 'number' ? version : null;
    }
    catch (e) {
        // 还没有状态 → 服务器 404；这不是错误，而是"该用 base_version=null 首传"
        if (e instanceof ServerError && e.code === 'not-found')
            return null;
        throw e;
    }
}
/**
 * 上传研究状态（新建一个不可变版本）。
 *
 * @returns 新版本号与内容哈希（哈希可用于判断"内容没变，不必再传"）
 * @throws {ServerError} `version-conflict`（含 `currentVersion`，据此重基再传）
 */
export async function uploadResearchState(base, apiKey, projectId, input, options = {}) {
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少 projectId。');
    const intentKey = (input.intentKey ?? '').trim();
    if (!intentKey)
        throw new ServerError('bad-request', '缺少幂等键（intentKey）。');
    const body = await requestJson(base, `/projects/${encodeURIComponent(id)}/state`, {
        method: 'POST',
        apiKey: key,
        idempotencyKey: intentKey,
        body: { base_version: input.baseVersion, content: input.content },
    }, options, '上传研究状态');
    const b = asObject(body, '研究状态');
    const version = typeof b.version === 'number' ? b.version : null;
    if (version === null)
        throw new ServerError('bad-response', '上传研究状态后没有返回版本号。');
    return { version, contentHash: asString(b.content_hash) };
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
export async function publishProject(base, apiKey, projectId, options = {}) {
    const { intentKey, ...net } = options;
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少 projectId。');
    const body = await requestJson(base, `/projects/${encodeURIComponent(id)}/publish`, { method: 'POST', apiKey: key, ...(intentKey ? { idempotencyKey: intentKey } : {}) }, net, '发布项目');
    const parsed = asObject(body, '发布结果');
    return {
        visibility: asString(parsed.visibility) || 'PUBLISHED',
        chargedTokens: typeof parsed.charged_tokens === 'number' ? parsed.charged_tokens : 0,
    };
}
/* ════════════════════════════════════════════════════════════════════════
 * 研究工作（Research Project）—— 服务器渐进披露的第一、二层
 *
 * 服务器的分享对象是**研究项目**（不是"研究方法模板"）：一层是免费的"这是什么"，
 * 二层是花 Token 的"大致怎么做"，三层（完整状态）需要导师关系。
 * 本模块只做前两层；第三层要关系，不在本轮范围。
 * ════════════════════════════════════════════════════════════════════════ */
function asNumber(v, fallback = 0) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function asStringArray(v) {
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
function asObject(v, label) {
    if (!v || typeof v !== 'object') {
        throw new ServerError('bad-response', `${label}的响应格式不正确（不是对象）。`);
    }
    return v;
}
/** 解析一项研究工作（游离于列表 / 摘要的公共字段）。 */
function parseWorkItem(raw) {
    const b = asObject(raw, '研究工作');
    const projectId = asString(b.project_id) || asString(b.id);
    const title = asString(b.title);
    if (!projectId || !title) {
        throw new ServerError('bad-response', '研究工作缺少 project_id / title 字段。');
    }
    const stage = asString(b.stage);
    return {
        projectId,
        title,
        researchFields: asStringArray(b.research_fields),
        stage: stage || null,
        progress: asNumber(b.progress),
        researchQuestion: asString(b.research_question) || null,
        summary: asString(b.summary) || null,
        updatedAt: asString(b.updated_at),
    };
}
/** 解析简报（第二层）。 */
function parseWorkBrief(raw) {
    const b = asObject(raw, '简报');
    const base = parseWorkItem(raw);
    return {
        ...base,
        motivation: asString(b.motivation) || null,
        coreIdea: asString(b.core_idea) || null,
        hypothesis: asString(b.hypothesis) || null,
        methodOverview: asString(b.method_overview) || null,
        keyEvidence: asStringArray(b.key_evidence),
        openProblems: asStringArray(b.open_problems),
    };
}
function requireKey(apiKey) {
    const key = normalizeApiKey(apiKey);
    if (!key)
        throw new ServerError('bad-request', 'API Key 不能为空。');
    return key;
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
export async function fetchWorkList(base, apiKey, options = {}) {
    const key = requireKey(apiKey);
    const body = await requestJson(base, '/discovery/random', { method: 'GET', apiKey: key }, options, '研究工作列表');
    const items = asObject(body, '研究工作列表').items;
    if (!Array.isArray(items)) {
        throw new ServerError('bad-response', '研究工作列表缺少 items 字段。');
    }
    return items.map(parseWorkItem);
}
/**
 * 一项研究工作的**摘要**（第一层，免费）。
 *
 * @throws {ServerError} `not-found`（不存在 / 未公开 / 不可见）
 */
export async function fetchWorkSummary(base, apiKey, projectId, options = {}) {
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少研究工作 id。');
    const body = await requestJson(base, `/projects/${encodeURIComponent(id)}/summary`, { method: 'GET', apiKey: key }, options, '研究工作摘要');
    return parseWorkItem(body);
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
export async function fetchWorkBrief(base, apiKey, projectId, intentKey, options = {}) {
    const key = requireKey(apiKey);
    const id = (projectId ?? '').trim();
    if (!id)
        throw new ServerError('bad-request', '缺少研究工作 id。');
    const intent = (intentKey ?? '').trim();
    if (!intent)
        throw new ServerError('bad-request', '缺少幂等键（intentKey）。');
    const body = await requestJson(base, `/projects/${encodeURIComponent(id)}/brief`, { method: 'GET', apiKey: key, idempotencyKey: intent }, options, '研究工作简报');
    return parseWorkBrief(body);
}
//# sourceMappingURL=server-client.js.map