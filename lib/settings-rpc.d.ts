/**
 * ConvFusion 2.0 — 设置面 RPC（渠道 `/convfusion`）
 *
 * ## 它服务谁
 *
 * 【设置】-【ConvFusion】-【本地设置】（浏览器半边）通过**自己的同源 HTTP 路由**
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
import type { Config } from './config.js';
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
    sections: SettingsSection[];
    /** 该 Skill 已覆盖的章节数。 */
    overriddenCount: number;
}
/** 一个类别（设置页的一级分组）在设置页里的形态。 */
export interface SettingsCategory {
    categoryId: string;
    categoryName: string;
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
/** 【本地设置】整页状态。 */
export interface SettingsState {
    /** 宿主协议版本；与客户端内联值不一致 = 宿主未重启。 */
    protocol: number;
    /**
     * 生效配置（文件名的权威来源仍是 settings 文档）。
     *
     * ⚠️ **已剔除 secret**（见 {@link redactConfig}）：这个对象会经 HTTP 返回浏览器。
     */
    config: Omit<Config, 'openalexApiKey'>;
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
}
/**
 * 组装整页状态（纯函数：给定 store 与配置即可算出，便于离线验证）。
 *
 * 分组在这里做，客户端只负责渲染 —— 设置页不该自己理解 Skill 的存储结构。
 */
export declare function buildSettingsState(config: Config, store: SkillCustomizationStore, resolvePath?: (c: Config) => string): SettingsState;
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
}
/**
 * 建立一个端点分发器。
 *
 * 端点表（客户端约定，改名即破坏设置页）：
 *
 * | endpoint | payload | 说明 |
 * |---|---|---|
 * | `state` | `{}` | 整页状态（类别 → Skill → 章节） |
 * | `customization/save` | `{ skillId, section, text }` | 写入覆盖（空文本 = 清除） |
 * | `customization/reset` | `{ skillId, section }` | 清除一个章节的覆盖 |
 * | `customization/resetSkill` | `{ skillId }` | 清除一个 Skill 的全部覆盖 |
 * | `customization/resetAll` | `{}` | 清除全部定制（回到全系统原文） |
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