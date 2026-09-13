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
import { existsSync } from 'node:fs';
import { OPENALEX_API_KEY_ENV } from './config.js';
import { HOST_PROTOCOL, HOST_PROTOCOL_FIELD } from './protocol.js';
import { CUSTOMIZABLE_SECTIONS, clearAllCustomizations, listCustomizationPoints, systemLibraryStatus, } from './research/skill-customization.js';
import { describeOpenAlexKey, redactConfig, resolveCustomizationPath } from './config.js';
import { isResearchWorkspace, researchWorkspaceOf } from './research/workspace.js';
import { latestTurnReport } from './research/progress-bridge.js';
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
            purpose: '把论文的 LaTeX 源码编译成 PDF（研究论文最终交付格式）。',
        },
    };
}
/**
 * 组装整页状态（纯函数：给定 store 与配置即可算出，便于离线验证）。
 *
 * 分组在这里做，客户端只负责渲染 —— 设置页不该自己理解 Skill 的存储结构。
 */
export function buildSettingsState(config, store, resolvePath = resolveCustomizationPath, probeDependencies = describeLocalDependencies) {
    const customizations = store.load();
    const path = resolvePath(config);
    const categories = listCustomizationPoints('', customizations).map((cat) => {
        const bySkill = new Map();
        for (const point of cat.points) {
            const skill = bySkill.get(point.skillId) ?? {
                skillId: point.skillId,
                skillName: point.skillName,
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
            skills: [...bySkill.values()].sort((a, b) => a.skillName.localeCompare(b.skillName)),
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
 */
export function createSettingsRpcHandler(deps) {
    const state = () => buildSettingsState(deps.getConfig(), deps.store, deps.resolvePath ?? resolveCustomizationPath);
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
                /* ── 研究进展（对话流尾部的进度卡）─────────────────────────────────
                 *
                 * `v2-Progress.md`：对话结束后、在**对话流**里显示本轮研究进展。
                 * 报告由宿主在 `agent/turn-stopping` 算好（只来自磁盘真实资产），
                 * 客户端在 `conversation.chat.turnTail` 渲染 —— 这里只负责把数据交出去，
                 * 并按**会话自己的工作区**判定要不要显示。
                 */
                case 'progress/session': {
                    const sessionId = asString(p.sessionId);
                    const workspace = deps.resolveSessionWorkspace?.(sessionId);
                    return {
                        ok: true,
                        value: {
                            sessionId,
                            workspace: workspace ?? null,
                            research: workspace ? isResearchWorkspace(researchWorkspaceOf(workspace)) : false,
                        },
                    };
                }
                case 'progress/latest': {
                    const sessionId = asString(p.sessionId);
                    const workspace = deps.resolveSessionWorkspace?.(sessionId);
                    const research = workspace ? isResearchWorkspace(researchWorkspaceOf(workspace)) : false;
                    return {
                        ok: true,
                        value: {
                            sessionId,
                            workspace: workspace ?? null,
                            research,
                            report: research ? (latestTurnReport(sessionId) ?? null) : null,
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