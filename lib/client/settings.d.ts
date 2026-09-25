/**
 * ConvFusion 2.0 — 设置页本体（【设置】-【ConvFusion】-【本地研究方法】）
 *
 * ## v2 与 v0.1.5 的结构差异（重建依据见仓库根 `ConvFusion_setting.md`）
 *
 * ```text
 * v0.1.5   模块（8 个，Python 管线）→ 提示词节点（110 个）
 * v0.2     能力类别（taxonomy 的 9 个大类）→ 能力 / Skill（47 个）→ 可定制章节（6 个）
 * ```
 *
 * 所以 v0.1.5 的「① 模块 / ② 提示词」两个下拉，在 v2 里是
 * 「① 能力类别 / ② 能力」两个下拉 + 一个「③ 可定制章节」选择器。
 *
 * ## 术语（不要混用）
 *
 * | 词 | 指的是 |
 * |---|---|
 * | **能力 / Skill** | 库里的**一个**条目（`research-gap-analysis`）。它是可复用的方法片段 |
 * | **能力类别** | 能力的分类（文献 / 实验 / 分析…）。**不是**研究方法 |
 * | **能力库 / Skill Library** | 管理全部能力的地方（我们维护、只读） |
 * | **研究方法** | 用户把**多个能力**逐个定制之后**形成的那一整套做法** —— |
 * | | 它可以被分享给其他研究者使用。**一个 Skill 不等于一套研究方法。** |
 *
 * ## 两个数据源，不要混
 *
 * | 内容 | 通道 | 为什么 |
 * |---|---|---|
 * | 定制**文件名** | `settingsScope`（落 `settings.yaml`） | 它是配置，不是内容 |
 * | 定制**正文** | 同源 `POST /dsh-convfusion/<endpoint>`（落 `$DSH_HOME/convfusion/<file>.json`） | 用户拍板：设置文件绝不能因定制而变大 |
 *
 * ## 依赖约束
 *
 * 只 import `react` 与本 bundle 的本地模块。跨插件服务（`slots` / `settingsScope`）
 * 通过 cordis 的 inject face 拿到，并在这里**结构化镜像**其契约 ——
 * 不 value-import 任何 `@deepseek-ai/*` 包（bundle 里它们本来就是 external）。
 *
 * 数据面用**同源 `fetch`**（不是 Connection RPC）：宿主侧的 RPC 渠道对外部插件不可用，
 * 详见 `src/settings-rpc.ts` 文件头与 `scripts/probe-settings-rpc-route.mjs`。
 * 路由带 Harness 的信任/鉴权栅栏，等价于 RPC 渠道的安全级别。
 */
import { type Translate } from './i18n/index.js';
/**
 * settings scope 的快照。
 *
 * ⚠️ **刻意只读 `status`**：定制文件叫什么、放在哪，对用户不可见也不可配。
 * 这里保留 `value` 只会诱导后来者又把它渲染出来（那正是被要求删掉的东西）。
 */
interface ScopeSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
}
interface SettingsScopeLike {
    getSnapshot(): ScopeSnapshot;
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
}
interface RpcResult {
    ok: boolean;
    value?: unknown;
    error?: {
        code?: string;
        message?: string;
    };
}
/** 设置面的 HTTP 路由前缀（与宿主 `settings-rpc.ts` 的常量一致）。 */
export declare const SETTINGS_ROUTE_PREFIX = "/dsh-convfusion";
/** 一次端点调用；可替换，便于离线测试。 */
export type SettingsSend = (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<RpcResult>;
export interface ConvFusionSettingsProps {
    scope: SettingsScopeLike;
    /** DSH Slot 标准注入：跟随全局语言并在切换时重渲染。 */
    t: Translate;
    /** 传输实现（缺省 = 浏览器同源 fetch）。 */
    send?: SettingsSend | undefined;
}
interface HostSection {
    section: string;
    base: string;
    overridden: boolean;
    userText?: string;
}
interface HostSkill {
    skillId: string;
    skillName: string;
    /** 唯一编号（`CxxPyy`）。 */
    code?: string;
    /** 中文名。 */
    label?: string;
    sections: HostSection[];
    overriddenCount: number;
}
interface HostCategory {
    categoryId: string;
    categoryName: string;
    /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
    code?: string;
    /** 类别中文名。 */
    label?: string;
    skills: HostSkill[];
    overriddenCount: number;
    pointCount: number;
}
/**
 * 设置页真正用到的状态。
 *
 * 宿主还会多返回 `config` / `file`（定制文件路径、是否存在、覆盖数）供诊断与测试用，
 * 但**界面一个都不读** —— 所以这里也不声明，免得被顺手拿来渲染。
 */
interface HostState {
    /** 宿主协议版本；与 bundle 内联值不一致 = 宿主半边没重启。 */
    protocol?: number;
    /** 插件版本（package.json 单一来源；旧宿主没有 → 不显示版本徽章）。 */
    version?: string;
    library: {
        root: string;
        skillCount: number;
    };
    customizableSections: string[];
    categories: HostCategory[];
    /** 只看可用性，**没有密钥**（密钥是 secret 字段，不回传浏览器）。 */
    retrieval: {
        configured: boolean;
        source: 'settings' | 'env' | 'none';
        envVar: string;
    };
    /** 【ConvFusion.com】的登录状态（服务器地址 + 有无凭据 + 已验证账号）。**不含凭据。** */
    account?: HostAccountState;
    /** 本地外部依赖（tectonic）——【系统设置】页的"配置检查"。 */
    dependencies?: {
        tectonic: HostDependency;
    };
}
/**
 * 服务器上的账号（宿主 `AccountWire` 的镜像）。**没有任何凭据字段。**
 *
 * ConvFusion.com 没有口令登录：账号是邀请制，凭据是一份 `cf_live_…` API Key，
 * 它**只存在于宿主**。浏览器这一侧从头到尾拿不到明文。
 */
interface HostAccount {
    id: string;
    email: string;
    displayName: string;
    status: string;
    roles: string[];
}
/** 【ConvFusion.com】的登录状态（宿主 `AccountState` 的镜像）。 */
interface HostAccountState {
    serverUrl: string;
    defaultServerUrl: string;
    serverUrlSource: 'settings' | 'env' | 'config' | 'default';
    /**
     * 两个环境的地址（开发 / 生产），给地址框右边那两个**快捷图标按钮**用。
     *
     * 由宿主解析（配置文件 > 内置兜底）→ 客户端**不写死任何域名**。旧宿主没有这个字段时
     * 按钮**不显示**（拿不到 ≠ 没有，但不假装有）。
     */
    serverPresets?: {
        development: string;
        production: string;
    };
    /**
     * 当前环境（开发 / 生产）。
     *
     * ⚠️ **地址随环境而变**（开发 = 本机服务器，生产 = 线上）。界面必须把这件事说出来：
     * "在我电脑上登录成功"与"线上能用"是两件事，混在一起会得出错误结论。
     */
    environment?: 'development' | 'production';
    /** 地址与环境矛盾（生产却指向本机 / 开发却指向线上）。 */
    serverUrlMismatch?: boolean;
    keyConfigured: boolean;
    keySource: 'settings' | 'env' | 'none';
    apiKeyEnvVar: string;
    /** 只有在**联网验证过**之后才非空。 */
    account: HostAccount | null;
    /**
     * Token 余额（联网验证过才有）。
     *
     * 宿主是**尽力而为**地取它：拿不到就是 null（界面不显示数字，而不是显示 0）。
     */
    tokens?: {
        available: number;
        frozen: number;
        total: number;
    } | null;
}
/** 一个本地外部依赖的检测结果（与 host 的 LocalDependencyStatus 对应）。 */
interface HostDependency {
    name: string;
    available: boolean;
    path?: string;
    version?: string;
    viaEnv: boolean;
    envVar: string;
    purposeCode: string;
}
/** 能力下优先选已有定制的章节；都没有定制 → 第一个。 */
export declare function preferredSection(sections: HostSection[] | undefined): string;
/** 类别下优先选已有定制的能力；都没有定制 → 第一个。 */
export declare function preferredSkill(skills: HostSkill[] | undefined): HostSkill | undefined;
/** 类别列表里优先选已有定制的类别；都没有定制 → 第一个。 */
export declare function preferredCategory(categories: HostCategory[] | undefined): HostCategory | undefined;
export type SettingsLoad = {
    kind: 'ok';
    state: HostState;
} | {
    kind: 'error';
    message: string;
};
/** 状态读取的超时（毫秒）。挂起的请求也必须变成一条可见的错误，而不是空白页。 */
export declare const SETTINGS_LOAD_TIMEOUT_MS = 15000;
/**
 * 默认传输：浏览器同源 `fetch` 到宿主注册的前缀路由。
 *
 * 始终带上凭据（同源下即 cookie），这样 Harness 的鉴权栅栏能认出这个请求。
 */
export declare const fetchSettingsSend: SettingsSend;
/**
 * 从宿主读取整页状态；**永不抛异常**（异常会变成 `{ kind: 'error' }`）。
 *
 * @param send 传输实现（缺省 {@link fetchSettingsSend}）
 * @param options.timeoutMs 超时（测试用；缺省 {@link SETTINGS_LOAD_TIMEOUT_MS}）
 */
export declare function loadSettingsState(send?: SettingsSend, options?: {
    timeoutMs?: number;
}, t?: Translate): Promise<SettingsLoad>;
export declare function ConvFusionProjectSettings({ scope, t, send, }: ConvFusionSettingsProps): JSX.Element;
export default ConvFusionProjectSettings;
