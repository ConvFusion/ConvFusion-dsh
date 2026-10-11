/**
 * ConvFusion 2.0 — 会话 Tab「科V社区」的正文（`conversation.view` 的占用者）
 *
 * ## 它是什么
 *
 * 会话 tab 条（`对话 | 轨迹 | 研究进展 … | 科V社区`）里最右那一个 tab 的**正文**：
 * 把【设置】-【ConvFusion】-【ConvFusion.com】这一页整页显示在中央列里。
 * 内容不是复制的 —— 它直接渲染 `./settings.js` 里那一个 `CommunityTab`，
 * 与设置页**永远同一份实现**。
 *
 * ## 三条边界
 *
 * 1. **滚动自己给**：`conversation.view` 的容器（`.viewArea`）是
 *    `flex: 1; min-height: 0; display: flex` —— **没有 overflow**，而外层的
 *    `.centerCol` 是 `overflow: hidden`。所以这一页必须是自己的滚动容器，
 *    否则长内容会被裁掉且滚不动。
 * 2. **列宽自己给**：会话正文有一条可拖拽的内容宽度（`--dsh-chat-content-width`），
 *    但那是**对话**的排版；这一页是卡片列表，用固定的居中列宽（`maxWidth`）更稳，
 *    也避免窄窗口下卡片被压成一条。
 * 3. **不抢别人的状态**：`CommunityTab` 自给自足（自己读 `account/state`、自己联网
 *    验证），这里只给它一个容器；`initial` 传 `null` 只是省掉首屏闪烁。
 *
 * 显隐（只在研究工作区出现）不在这里 —— 它由 `./convfusion-tab.js` 的闸门决定
 * 注册与否（tab 的 roster 是**全局**的，没有按会话的显隐开关，见该文件说明）。
 *
 * ## 为什么这里多了 `inputActions`（2026-10 · 0.5.8）
 *
 * 【下载】完成后要问用户一句"把下载的这份和本地的**融合**起来" —— 那句话是一段提示词，
 * 要**填进当前会话的输入框**（不自动发送），用户看过再按发送。
 *
 * 填输入框的公共入口是 DSH 的 session 标准 props：`conversation.view` 是**会话作用域**槽位，
 * 框架会把 `inputActions`（`setDraft` / `insertText` / …）与 `useInput`（选择器 hook）
 * 一起送进来 —— 与 `sessionId`（我们早就在用）同一条通道，**不需要新依赖**。
 * 先例：`dsh-experimental-client-ui-voice-input` 这个独立插件就是用它往输入框插文本的。
 *
 * ⚠️ **设置页里没有这两个 props** —— 那正是"能不能填输入框"的天然开关：
 * 下载发生在设置页时只给「复制提示词」。不需要任何显式配置。
 */
import type { Translate } from './i18n/index.js';
interface ViewProps {
    /** DSH Slot 标准注入。 */
    t: Translate;
    /** DSH 的 session 标准 props：本视图所属的会话。 */
    sessionId?: string | undefined;
    /**
     * DSH 的 session 标准 props：**输入框动作**。
     *
     * 只用到 `setDraft`（整段替换）—— **绝不调用 `submit()`**：提示词只填不送。
     * 缺少（旧宿主 / 设置页）→ 不显示「填入输入框」，只留「复制提示词」。
     */
    inputActions?: {
        setDraft(text: string): void;
    } | undefined;
    /**
     * DSH 的 session 标准 props：输入框状态选择器 hook。
     *
     * 只问一个布尔（"输入框是不是空的"），所以**只在空↔非空翻转时**重渲染 —— 不是每次按键。
     */
    useInput?: ((selector: (state: {
        draft?: string;
    }) => boolean) => boolean) | undefined;
}
/** 会话 Tab「科V社区」的正文。 */
export declare function CommunityView({ t, sessionId, inputActions, useInput }: ViewProps): JSX.Element;
export {};
