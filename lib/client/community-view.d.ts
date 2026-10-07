/**
 * ConvFusion 2.0 — 会话 Tab「科V社区」的正文（`conversation.view` 的占用者）
 *
 * ## 它是什么
 *
 * 会话 tab 条（`对话 | 轨迹 | 科V社区`）里最右那一个 tab 的**正文**：把
 * 【设置】-【ConvFusion】-【ConvFusion.com】这一页整页显示在中央列里。
 * 内容不是复制的 —— 它直接渲染 `./settings.js` 里那一个 `CommunityTab`，
 * 与设置页、与顶部浮层**永远同一份实现**。
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
 */
import type { Translate } from './i18n/index.js';
interface ViewProps {
    /** DSH Slot 标准注入。 */
    t: Translate;
}
/** 会话 Tab「科V社区」的正文。 */
export declare function CommunityView({ t }: ViewProps): JSX.Element;
export {};
