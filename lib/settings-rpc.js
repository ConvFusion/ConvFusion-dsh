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
import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { CONVFUSION_API_KEY_ENV, OPENALEX_API_KEY_ENV, defaultServerUrl, } from './config.js';
import { HOST_PROTOCOL, HOST_PROTOCOL_FIELD } from './protocol.js';
import { CUSTOMIZABLE_SECTIONS, clearAllCustomizations, listCustomizationPoints, systemLibraryStatus, } from './research/skill-customization.js';
import { effectiveSkillContentById } from './research/library.js';
import { describeConvFusionKey, describeOpenAlexKey, redactConfig, resolveConvFusionApiKey, resolveCustomizationPath, resolveServerUrl, } from './config.js';
import { acceptInvitation, fetchAccount, fetchWorkBrief, fetchTokenBalance, fetchWorkList, fetchWorkSummary, normalizeApiKey, normalizeBaseUrl, ServerError, } from './server-client.js';
import { isResearchWorkspace, researchWorkspaceOf } from './research/workspace.js';
import { latestTurnReport } from './research/progress-bridge.js';
import { buildWorkspaceProgress, captureProgress } from './research/progress.js';
import { findTectonic, tectonicVersion, TECTONIC_ENV } from './research/latex-compile.js';
/**
 * 设置面的 HTTP 路由前缀（客户端必须用同一个）。
 *
 * 用 `dsh-` 前缀避免与 Harness 自己的路径空间冲突（同 `dsh-additive` 的做法）。
 */
export const SETTINGS_ROUTE_PREFIX = '/dsh-convfusion';
/** 请求体上限（状态是只读的，写请求也很小；4 MiB 足够且能挡住误用）。 */
export const SETTINGS_MAX_BODY_BYTES = 4 * 1024 * 1024;
function fail(code, message) {
    return { ok: false, error: { code, message, details: {} } };
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
export function normalizeWorkspaceEntities(entities) {
    const out = [];
    const seen = new Set();
    for (const entity of entities) {
        const path = typeof entity?.path === 'string' ? entity.path.trim() : '';
        if (!path)
            continue;
        const id = (typeof entity?.id === 'string' && entity.id.trim() ? entity.id : path).trim();
        if (seen.has(id) || seen.has(path))
            continue;
        seen.add(id);
        seen.add(path);
        out.push({
            id,
            title: typeof entity?.title === 'string' ? entity.title : '',
            path,
            updatedAt: typeof entity?.updatedAt === 'string' ? entity.updatedAt : '',
        });
    }
    return out;
}
/**
 * 组装登录状态（纯函数，可离线验证）。
 *
 * @param config 生效配置（**可含明文 Key** —— 本函数只读它的"有没有"，不把它放进结果）
 * @param env 环境变量（测试注入）
 * @param account 已验证的账号（未验证传 null）
 * @param options.fresh 忽略环境配置文件的进程内缓存（测试用）
 */
export function buildAccountState(config, env = process.env, account = null, options = {}) {
    const server = resolveServerUrl(config, env, options);
    const key = describeConvFusionKey(config, env);
    return {
        serverUrl: server.url,
        defaultServerUrl: defaultServerUrl(env),
        serverUrlSource: server.source,
        environment: server.environment,
        serverUrlMismatch: server.mismatched,
        keyConfigured: key.configured,
        keySource: key.source,
        apiKeyEnvVar: CONVFUSION_API_KEY_ENV,
        account,
        tokens: options.tokens ?? null,
    };
}
/**
 * 检测本地外部依赖。
 *
 * **每次调用都重新探测**（用户可能刚装完就回来看），且只做只读检查（`--version`）。
 */
export function describeLocalDependencies(env = process.env) {
    const override = (env[TECTONIC_ENV] ?? '').trim();
    const bin = findTectonic(env);
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
    };
}
/**
 * 组装整页状态（纯函数：给定 store 与配置即可算出，便于离线验证）。
 *
 * 分组在这里做，客户端只负责渲染 —— 设置页不该自己理解 Skill 的存储结构。
 */
export function buildSettingsState(config, store, resolvePath = resolveCustomizationPath, probeDependencies = describeLocalDependencies, env = process.env) {
    const customizations = store.load();
    const path = resolvePath(config);
    const categories = listCustomizationPoints('', customizations).map((cat) => {
        const bySkill = new Map();
        for (const point of cat.points) {
            const skill = bySkill.get(point.skillId) ?? {
                skillId: point.skillId,
                skillName: point.skillName,
                ...(point.skillCode ? { code: point.skillCode } : {}),
                ...(point.skillLabel ? { label: point.skillLabel } : {}),
                sections: [],
                overriddenCount: 0,
            };
            skill.sections.push({
                section: point.section,
                base: point.base,
                overridden: point.overridden,
                ...(point.userText ? { userText: point.userText } : {}),
            });
            if (point.overridden)
                skill.overriddenCount += 1;
            bySkill.set(point.skillId, skill);
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
        };
    });
    const entryCount = Object.values(customizations).reduce((n, sections) => n + Object.keys(sections).length, 0);
    // 存在性检查要容错：路径可能指向尚未创建的目录
    let exists = false;
    try {
        exists = existsSync(path);
    }
    catch {
        exists = false;
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
    };
}
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
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
 * | `work/list` | `{}` | 研究网络里已公开的研究工作（需登录；条数由服务器定） |
 * | `work/summary` | `{ projectId }` | 一项研究工作的摘要（免费） |
 * | `work/brief` | `{ projectId, intentKey }` | 一项研究工作的简报（非 owner 花 1 Token） |
 *
 * ⚠️ **凭据纪律**（改动这里前先读 `server-client.ts` 文件头）：
 * 服务器地址与 API Key 只出现在**宿主**与**服务器**之间；本渠道的任何返回值都不得
 * 包含 `cf_live_…`。`account/*` 一律返回 {@link AccountState}（只有可用性 + 账号信息）。
 */
export function createSettingsRpcHandler(deps) {
    const env = () => deps.env ?? process.env;
    const state = () => buildSettingsState(deps.getConfig(), deps.store, deps.resolvePath ?? resolveCustomizationPath, describeLocalDependencies, env());
    /** 服务器请求参数（统一注入 fetch / 超时 / 环境变量）。 */
    const netOptions = () => ({
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.serverTimeoutMs === undefined ? {} : { timeoutMs: deps.serverTimeoutMs }),
    });
    /**
     * 把凭据（以及可选的服务器地址）写回设置，并返回**写完之后**的登录状态。
     *
     * ⚠️ 不能写回后再 `getConfig()` 读一遍：`settingsScope.update()` 是异步提交，
     * `watch` 也是异步触发的 —— 立刻重读会拿到旧值，界面会显示"未登录"，看起来像失败。
     * 所以这里用 patch 与旧配置**显式合并**出返回值。
     */
    const persist = async (patch, account, tokens = null) => {
        if (!deps.setConfig) {
            return fail('storage-unavailable', '设置存储当前不可用，无法保存 ConvFusion.com 凭据。请检查 DSH 的设置服务是否正常。');
        }
        try {
            await deps.setConfig(patch);
        }
        catch (e) {
            return fail('storage-unavailable', `保存凭据失败：${e instanceof Error ? e.message : String(e)}`);
        }
        const merged = { ...deps.getConfig(), ...patch };
        return { ok: true, value: buildAccountState(merged, env(), account, { tokens }) };
    };
    /**
     * 读余额，**尽力而为**：失败返回 null（不抛出）。
     *
     * 余额是登录成功的"附加信息"：把它做成硬依赖，会让一次网络抖动把已经成功的登录
     * 变成失败（用户看到的是"登录失败"，实际凭据已经验证通过并落盘）——
     * 那是最容易让人误判的形态。拿不到就不显示，用户点「重新验证」即可。
     */
    const tryBalance = async (base, apiKey) => {
        try {
            return await fetchTokenBalance(base, apiKey, netOptions());
        }
        catch {
            return null;
        }
    };
    /** 把 `ServerError` 变成设置面的失败信封（code 原样带出，界面据此给动作）。 */
    const serverFail = (e) => {
        if (e instanceof ServerError)
            return fail(e.code, e.message);
        return fail('internal', e instanceof Error ? e.message : String(e));
    };
    /**
     * 定这次登录/注册要连哪台服务器。
     *
     * 请求里给了地址就用它（用户在界面上改过），否则用**当前生效**的地址 ——
     * 即 `resolveServerUrl` 的完整优先级（设置文档 > 环境变量 > 环境配置文件 > 内置兜底）。
     * 不能退化成"内置兜底"：那会让"没填地址"在生产环境里指向开发机。
     *
     * @throws {ServerError} `bad-url`
     */
    const requestBase = (raw) => {
        const given = typeof raw === 'string' ? raw.trim() : '';
        if (given)
            return normalizeBaseUrl(given);
        return normalizeBaseUrl(resolveServerUrl(deps.getConfig(), env()).url);
    };
    return async (endpoint, payload) => {
        const p = (payload ?? {});
        try {
            switch (endpoint) {
                case 'state':
                    return { ok: true, value: state() };
                /**
                 * 重新探测本地外部依赖。
                 *
                 * 用户可能刚装完 tectonic 就回到设置页 —— 整页 `state` 重载较重，
                 * 这里只返回依赖检测结果，供"重新检查"按钮就地刷新。
                 */
                case 'dependencies/check':
                    return { ok: true, value: describeLocalDependencies() };
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
                    const sessionId = asString(p.sessionId);
                    const sessionWorkspace = deps.resolveSessionWorkspace?.(sessionId);
                    // 研究根目录（新布局 = 会话工作区下的 `workspace/`，见 workspace.ts）
                    const root = sessionWorkspace ? researchWorkspaceOf(sessionWorkspace) : undefined;
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
                        };
                    }
                    // 过程判定要读**生效**的能力正文（用户可在设置里定制 `research-process`）
                    const skillContent = (id) => effectiveSkillContentById(id, deps.store);
                    const snapshot = captureProgress(root, skillContent);
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
                    };
                }
                case 'customization/save': {
                    const skillId = asString(p.skillId);
                    const section = asString(p.section);
                    if (!skillId || !section)
                        return fail('bad-request', 'skillId 与 section 都不能为空。');
                    if (!CUSTOMIZABLE_SECTIONS.includes(section)) {
                        // 白名单之外的章节不允许覆盖：Skill 的结构是可靠性基础
                        return fail('not-customizable', `\`${section}\` 不是允许定制的章节。`);
                    }
                    const text = typeof p.text === 'string' ? p.text : '';
                    deps.store.set(skillId, section, text);
                    return { ok: true, value: state() };
                }
                case 'customization/reset': {
                    const skillId = asString(p.skillId);
                    const section = asString(p.section);
                    if (!skillId || !section)
                        return fail('bad-request', 'skillId 与 section 都不能为空。');
                    deps.store.set(skillId, section, '');
                    return { ok: true, value: state() };
                }
                case 'customization/resetSkill': {
                    const skillId = asString(p.skillId);
                    if (!skillId)
                        return fail('bad-request', 'skillId 不能为空。');
                    clearAllCustomizations(deps.store, skillId);
                    return { ok: true, value: state() };
                }
                case 'customization/resetAll': {
                    clearAllCustomizations(deps.store);
                    return { ok: true, value: state() };
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
                    return { ok: true, value: buildAccountState(deps.getConfig(), env(), null) };
                case 'account/login': {
                    const apiKey = normalizeApiKey(asString(p.apiKey));
                    if (!apiKey)
                        return fail('bad-request', '请填写 ConvFusion.com 的 API Key（cf_live_…）。');
                    // 地址先归一（用户可能粘贴带 /api 或 /docs 的地址）；非法地址在联网前就报错
                    let base;
                    try {
                        base = requestBase(p.serverUrl);
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                    try {
                        const account = await fetchAccount(base, apiKey, netOptions());
                        // 余额与身份一起拿到（失败不影响登录成功）
                        const tokens = await tryBalance(base, apiKey);
                        // 只有验证通过才落盘 —— 失败绝不留下一份坏凭据
                        return await persist({ convfusionApiKey: apiKey, serverUrl: base }, account, tokens);
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'account/register': {
                    const invitationCode = asString(p.invitationCode);
                    const email = asString(p.email);
                    const displayName = asString(p.displayName);
                    if (!invitationCode)
                        return fail('bad-request', '请填写邀请码（cf_inv_…）。');
                    if (!email)
                        return fail('bad-request', '请填写邮箱（必须与邀请码指定的邮箱一致）。');
                    if (!displayName)
                        return fail('bad-request', '请填写显示名。');
                    let base;
                    try {
                        base = requestBase(p.serverUrl);
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                    try {
                        // 注册成功即拿到一次性明文 Key → 直接存下来，用户不需要再复制粘贴一次
                        const { account, apiKey } = await acceptInvitation(base, { invitationCode, email, displayName }, netOptions());
                        // 新账号余额为 0，但仍然要问一次服务器（不要自己假定）
                        const tokens = await tryBalance(base, apiKey);
                        return await persist({ convfusionApiKey: apiKey, serverUrl: base }, account, tokens);
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'account/verify': {
                    const config = deps.getConfig();
                    const apiKey = resolveConvFusionApiKey(config, env());
                    if (!apiKey)
                        return fail('not-configured', '尚未登录 ConvFusion.com。');
                    const base = resolveServerUrl(config, env()).url;
                    try {
                        const account = await fetchAccount(base, apiKey, netOptions());
                        const tokens = await tryBalance(base, apiKey);
                        return { ok: true, value: buildAccountState(config, env(), account, { tokens }) };
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'account/tokens': {
                    // 单独刷新余额：读完简报（扣 1 Token）之后界面用它把数字改对
                    const config = deps.getConfig();
                    const apiKey = resolveConvFusionApiKey(config, env());
                    if (!apiKey)
                        return fail('not-configured', '尚未登录 ConvFusion.com。');
                    const base = resolveServerUrl(config, env()).url;
                    try {
                        const tokens = await fetchTokenBalance(base, apiKey, netOptions());
                        return { ok: true, value: { tokens } };
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'account/logout': {
                    // 只清凭据，保留服务器地址（下次登录还要用）
                    return await persist({ convfusionApiKey: '' }, null);
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
                case 'work/mine': {
                    /**
                     * ⚠️ 三种"空列表"必须能区分（踩过：都显示成"本机还没有研究项目"）：
                     *
                     * ```text
                     * registry.available=false  → 这台 DSH 没提供工作区注册表（读不到，不是没有）
                     * registry.available=true   且 items 为空 → 真的没有研究项目
                     * 端点本身不存在（旧宿主）    → ok:false / unknown-endpoint，界面提示需重启
                     * ```
                     */
                    const listed = deps.listLocalWorkspaces
                        ? await deps.listLocalWorkspaces()
                        : { available: false, reason: '宿主未提供工作区注册表读取接口', items: [] };
                    const skillContent = (id) => effectiveSkillContentById(id, deps.store);
                    const items = [];
                    for (const w of listed.items) {
                        /**
                         * 目录真身 + 是否存在。
                         *
                         * ⚠️ 用 `realpath` 而不是直接用注册表里的字符串：注册表存的是**登记时的路径**，
                         * 它可能是符号链接。Additive 的 `inspectWorkspaceDir`（instructions-store.ts）
                         * 就是这个语义 —— 列表显示登记值，**实际读写走真身**。我们读研究数据也走真身，
                         * 否则符号链接下的 `workspace/` 会找不到。
                         */
                        let canonical = resolve(w.path);
                        let isDir = false;
                        try {
                            canonical = realpathSync(w.path);
                            isDir = statSync(canonical).isDirectory();
                        }
                        catch {
                            isDir = false;
                        }
                        const missingDir = !isDir;
                        const root = researchWorkspaceOf(canonical);
                        // 只列**有效**研究项目：目录不在、或没有 project.md / research-state.md 的都跳过
                        if (missingDir || !isResearchWorkspace(root))
                            continue;
                        // 进度与「研究进展」面板同源同口径；单个工作区读失败不影响其余
                        let stage = null;
                        let overall = 0;
                        let counts = [];
                        let paper = false;
                        let clarity = 'unknown';
                        try {
                            const snapshot = captureProgress(root, skillContent);
                            const progress = buildWorkspaceProgress(snapshot);
                            // 原样透传上游的结构（阶段对象 / ProgressCountRow），翻译留给客户端
                            stage = progress.progress.stage;
                            overall = progress.overall;
                            counts = progress.counts;
                            paper = progress.paper;
                            clarity = progress.need.clarity;
                        }
                        catch {
                            /* 读不动就当"未知"，不把这个工作区从列表里抹掉 */
                        }
                        items.push({
                            id: w.id,
                            // 缺省标题用**会话工作区**的目录名（`.../proj-b`），不是研究根
                            // —— 研究根永远叫 `workspace`，拿它当标题等于每个项目同名
                            title: w.title.trim() || basename(canonical),
                            // path 保留注册表里的**登记值**；researchRoot 是真身路径上的研究根
                            path: w.path,
                            researchRoot: root,
                            missingDir,
                            stage,
                            overall,
                            counts,
                            paper,
                            clarity,
                            updatedAt: w.updatedAt,
                        });
                    }
                    return {
                        ok: true,
                        value: {
                            items,
                            registry: {
                                available: listed.available,
                                ...(listed.reason ? { reason: listed.reason } : {}),
                            },
                        },
                    };
                }
                case 'work/list': {
                    const config = deps.getConfig();
                    const apiKey = resolveConvFusionApiKey(config, env());
                    if (!apiKey)
                        return fail('not-configured', '尚未登录 ConvFusion.com。');
                    try {
                        const base = resolveServerUrl(config, env()).url;
                        // ⚠️ 不传 limit：列表条数与抽样策略由**服务器**决定（见 fetchWorkList 注释）
                        const items = await fetchWorkList(base, apiKey, netOptions());
                        return { ok: true, value: { items } };
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'work/summary': {
                    const config = deps.getConfig();
                    const apiKey = resolveConvFusionApiKey(config, env());
                    if (!apiKey)
                        return fail('not-configured', '尚未登录 ConvFusion.com。');
                    const projectId = asString(p.projectId);
                    if (!projectId)
                        return fail('bad-request', '缺少 projectId。');
                    try {
                        const base = resolveServerUrl(config, env()).url;
                        const work = await fetchWorkSummary(base, apiKey, projectId, netOptions());
                        return { ok: true, value: { work } };
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                case 'work/brief': {
                    const config = deps.getConfig();
                    const apiKey = resolveConvFusionApiKey(config, env());
                    if (!apiKey)
                        return fail('not-configured', '尚未登录 ConvFusion.com。');
                    const projectId = asString(p.projectId);
                    if (!projectId)
                        return fail('bad-request', '缺少 projectId。');
                    // ⚠️ intentKey 由界面持有：402 之后充值再用**同一个** key 重试，不会重复扣费。
                    // 这里不做任何自动重试 —— 402 是业务事实，重试只会刷日志。
                    const intentKey = asString(p.intentKey);
                    if (!intentKey)
                        return fail('bad-request', '缺少 intentKey（一次查看意图的幂等键）。');
                    try {
                        const base = resolveServerUrl(config, env()).url;
                        const brief = await fetchWorkBrief(base, apiKey, projectId, intentKey, netOptions());
                        return { ok: true, value: { brief } };
                    }
                    catch (e) {
                        return serverFail(e);
                    }
                }
                default:
                    return fail('unknown-endpoint', `未知端点：${endpoint}`);
            }
        }
        catch (e) {
            return fail('internal', e instanceof Error ? e.message : String(e));
        }
    };
}
function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(Buffer.byteLength(payload)),
        'cache-control': 'no-store',
    });
    res.end(payload);
}
/** 从 URL pathname 取出渠道内的端点名（`/dsh-convfusion/a/b` → `a/b`）。 */
export function endpointFromPath(pathname) {
    if (!pathname.startsWith(SETTINGS_ROUTE_PREFIX))
        return undefined;
    const rest = pathname.slice(SETTINGS_ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '');
    if (!rest || rest.includes('..'))
        return undefined;
    return decodeURIComponent(rest);
}
async function readBody(req, maxBytes) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > maxBytes)
            throw new Error(`请求体超过 ${maxBytes} 字节上限`);
        chunks.push(Buffer.from(chunk));
    }
    if (total === 0)
        return {};
    const text = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(text);
    // 信封 `{ payload }`（与客户端约定）；也容忍直接给 payload
    if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
        return parsed.payload;
    }
    return parsed;
}
/**
 * 建立 webServer 路由处理器。
 *
 * 端点表与 {@link createSettingsRpcHandler} 完全一致，只是外面多了一层 HTTP 信封。
 */
export function createSettingsRouteHandler(deps) {
    const dispatch = createSettingsRpcHandler(deps);
    return async (req, res) => {
        const method = (req.method ?? 'GET').toUpperCase();
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
        const endpoint = endpointFromPath(pathname);
        if (endpoint === undefined) {
            sendJson(res, 404, { ok: false, error: { code: 'not-found', message: '未知路径。' } });
            return;
        }
        if (method !== 'POST') {
            sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '只接受 POST。' } });
            return;
        }
        // Harness 的信任 / 鉴权栅栏：没有它就是一个本机可写的裸端点
        if (deps.reject) {
            const rejection = deps.reject(req);
            if (rejection !== undefined) {
                sendJson(res, rejection, {
                    ok: false,
                    error: { code: 'rejected', message: rejection === 401 ? '未认证。' : '不受信任的来源。' },
                });
                return;
            }
        }
        let payload;
        try {
            payload = await readBody(req, SETTINGS_MAX_BODY_BYTES);
        }
        catch (e) {
            sendJson(res, 400, {
                ok: false,
                error: { code: 'bad-body', message: e instanceof Error ? e.message : String(e) },
            });
            return;
        }
        const result = await dispatch(endpoint, payload);
        // 端点级失败仍是 200（信封里表达），4xx/5xx 只留给传输层问题 —— 客户端据此区分
        sendJson(res, 200, result);
    };
}
//# sourceMappingURL=settings-rpc.js.map