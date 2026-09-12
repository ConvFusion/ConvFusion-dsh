/**
 * ConvFusion 2.0 — 设置导航里的图标（壳层 DOM 补丁）
 *
 * ## 为什么需要"补丁"这种东西
 *
 * DSH 设置壳的导航图标是**硬编码**的（`dsh-client-ui-settings-general` 的 `navIcon(id)`）：
 *
 * ```js
 * function navIcon(id) {
 *   if (id === "models") return <IconDataOutline16 …/>
 *   if (id === "agent-presets") return <IconAgentPresetOutline16 …/>
 *   if (id === "plugins") return <IconPersonalizationOutline16 …/>
 *   return <IconSettingsOutline16 …/>          // ← 其他所有 section 都是通用齿轮
 * }
 * ```
 *
 * 而且导航投影只读注册项的 `id` / `order` / `label` 三个字段：
 *
 * ```js
 * rows = ctx.slots.entries("settings.section").map((e) => ({
 *   id: e.options.id ?? "", order: e.options.order ?? 0,
 *   label: resolveSlotLabel(e.options.label) ?? "",
 * }))
 * ```
 *
 * 所以**任何外部插件都无法通过公开的 slot 契约提供导航图标**。要让"ConvFusion"
 * 旁边显示自己的图标，只剩一条路：导航渲染出来后，把那一行里的 `<svg>` 换成我们的图。
 *
 * ## 这个补丁的边界（重要）
 *
 * - **只碰标签文本恰好是 `ConvFusion` 的那一个按钮**，别的一律不动；
 * - **幂等**：替换过的按钮打标记，重复运行不会叠加；
 * - **失败即静默**：纯装饰，任何异常都不该影响设置页功能（外壳改版后自然失效）；
 * - **可随时删除**：一旦 DSH 在 slot 注册项里支持 `icon`，删掉这个文件与它的调用即可。
 *
 * 之所以敢这么做：同一个生态里的 `dsh-additive` 也对会话输入框做 DOM 捕获
 * （还为此记录了 React 18 的 value-setter 兼容写法），属于既有做法。
 */
/** 标记属性：既用于幂等，也便于人工确认"这一处是补丁换的"。 */
export declare const NAV_ICON_MARK = "data-convfusion-nav-icon";
/** 导航行的标签文本（与 `client/index.tsx` 里 `label: () => 'ConvFusion'` 一致）。 */
export declare const NAV_SECTION_LABEL = "ConvFusion";
/** 我们只依赖用到的那几个 DOM 能力（这样离线测试可以喂一个极小的假 DOM）。 */
export interface MinimalElement {
    textContent: string | null;
    parentNode: MinimalElement | null;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    querySelector(selector: string): MinimalElement | null;
    replaceChild(newNode: MinimalElement, oldNode: MinimalElement): MinimalElement;
}
export interface MinimalDocument {
    createElement(tag: string): MinimalElement;
    querySelectorAll(selector: string): ArrayLike<MinimalElement>;
}
/**
 * 把"ConvFusion"那一行的图标换成品牌图。
 *
 * @returns 本次真正替换的数量（0 = 导航还没渲染，或已经被换过）
 */
export declare function applyNavIcon(doc: MinimalDocument, logoUrl: string): number;
/**
 * 装上补丁：先跑一次，再用 MutationObserver 跟进（设置面板每次打开都会重建导航）。
 *
 * @returns 卸载函数；环境不支持 DOM 时返回一个空函数（不抛错）
 */
export declare function installNavIcon(logoUrl: string): () => void;
