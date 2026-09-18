/**
 * ConvFusion 2.0 — browser half（设置页 + 会话头部的研究进展按钮）
 *
 * 这个文件只做装配：
 *
 * ```text
 * settings.section                       ← 【设置】-【ConvFusion】（本体在 ./settings.js）
 * conversation.session.header.utilities  ← 顶部「研究进展」按钮（本体在 ./progress-panel.js）
 * ```
 *
 * ## 两个容易踩的坑（重建时必看，来自 v0.1.5 的实测记录）
 *
 * 1. `inject` 里的**每一个**服务都必须真实存在。任一缺失，整个客户端条目会停在
 *    `pending (waiting for service: X)` —— 界面不出现，且不会被当成错误报出来。
 *    数据面走同源 `fetch`，因此这里只需要渲染用的两个服务。
 * 2. `slots` / `settingsScope` 由 DSH 的客户端包提供，不 value-import 它们 ——
 *    它们本来就是 bundle 的 external，import 值只会在运行期炸。
 */
import logoUrl from '../../assets/favicon.svg';
import { type Translate } from './i18n/index.js';
import { loadSettingsState } from './settings.js';
import { applyNavIcon, installNavIcon } from './nav-icon.js';
import { ResearchProgressButton, readProgressValue, shortenPath } from './progress-panel.js';
/** 供离线测试直接调用（bundle 的 `apply`/`inject` 之外再导出这些）。 */
export { loadSettingsState, applyNavIcon, installNavIcon, logoUrl };
export { preferredCategory, preferredSection, preferredSkill } from './settings.js';
export { ResearchProgressButton, readProgressValue, shortenPath };
interface ScopeSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
    value: {
        customizationFile?: string;
        customizationDir?: string;
    } | undefined;
    writable: boolean;
}
interface SettingsScopeLike {
    getSnapshot(): ScopeSnapshot;
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
}
interface SlotRegisterOptions {
    name: string;
    id?: string;
    order?: number;
    label?: () => string;
    locale?: string;
    inject?: () => Record<string, unknown>;
    priority?: number;
    /**
     * chain 型槽位（如 `conversation.chat.turnTail`）的选择器：
     * 按升序尝试，**首个返回非 null** 的条目渲染，全为 null 则回落到拥有者的默认。
     *
     * ⚠️ **不要用它做"按会话判定"**：selector 只拿得到 owner props（例如 turnTail 的
     * `{turn, seq, openFile}`），**不含会话身份**；用它路由就得引入进程级全局变量，
     * 结果会命中所有会话（2026-09 实测故障，见 `progress-panel.tsx` 文件头）。
     * 按会话的显隐请用 **session 作用域的 list 槽位**（组件能拿到 `sessionId`）。
     */
    select?: (owner: unknown) => unknown | null;
}
interface SlotsService {
    inject(key: string, fn: () => unknown): unknown;
    register(options: SlotRegisterOptions, component: unknown): () => void;
}
interface ClientContext {
    slots: SlotsService;
    settingsScope: {
        bind(spec: {
            namespace: string;
        }): SettingsScopeLike;
    };
    locale: {
        register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
        bind(namespace: string): Translate;
    };
    effect(callback: () => void | (() => void), label?: string): void;
    /**
     * 读一个服务**不触发 inject 检查**（本插件目前不用可选服务，保留以便将来扩展）。
     *
     * ⚠️ 若要用可选服务，必须写成 `ctx.get('X')` 而**不是** `ctx.X`：
     * Cordis 的 get 代理会把「未 inject 的属性访问」直接抛成
     * `cannot get property "X" without inject`，而客户端条目 apply 抛错 = 整页加载失败
     * （2026-09-12 实际发生：DSH 里报 `Failed to load plugins / dsh-convfusion`）。
     */
    get(name: string): unknown;
}
/** 只有这些服务是硬依赖（缺一个，这一页就无从渲染）。 */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
