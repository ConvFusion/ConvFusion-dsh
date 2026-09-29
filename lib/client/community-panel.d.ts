/**
 * ConvFusion 2.0 — 顶部「ConvFusion.com」按钮（+ 展开浮层）
 *
 * ## 它是什么
 *
 * 会话头部工具区里的第二个按钮：点开即显示【设置】-【ConvFusion】-【ConvFusion.com】
 * 这一页的**全部内容**。内容不是复制的 —— 它直接渲染 `./settings.js` 里那一个
 * `CommunityTab`，因此两处**永远同一份实现**：改一处，设置页与顶部浮层同时生效。
 *
 * ```text
 * conversation.session.header.utilities
 *   ├─ id: convfusion-progress   order 20  ← 研究进展（仅研究工作区，见 progress-panel.tsx）
 *   └─ id: convfusion-community  order 21  ← 本文件（任何会话都有）
 * ```
 *
 * ## 三条边界
 *
 * 1. **不抄内容、不抄状态**：`CommunityTab` 自给自足（自己读 `account/state`、
 *    自己联网验证），这里只给它一个容器；宿主状态传 `null` 只是省掉首屏闪烁。
 * 2. **不抢别人的槽位**：`list` 槽位是追加式，官方条目照常显示；
 *    浮层是本组件自己画的，不开模态、不拦截对话。
 * 3. **失败即静默**：定位/事件任何异常都不该影响会话页 —— 浮层拿不到位就隐藏，
 *    绝不留下一个"点不开的按钮"。
 *
 * ## 为什么是浮层而不是"打开设置页并跳到这一页"
 *
 * DSH 没有公开"打开设置面板并导航到某个 section"的客户端服务
 * （`settings.launcher` 的 `openSettings()` 是**单选槽位**、已被官方账号启动器占走），
 * 所以外部插件只能自己承载这一页的内容。浮层用 `position: fixed`：header 一类的祖先
 * 常有 `overflow: hidden`，`absolute` 会被裁掉。
 */
import type { Translate } from './i18n/index.js';
interface ButtonProps {
    /** DSH Slot 标准注入（本按钮不按会话判定，保留以对齐槽位契约）。 */
    sessionId?: string;
    /** DSH Slot 标准注入。 */
    t: Translate;
}
/**
 * 会话头部的「ConvFusion.com」按钮。
 *
 * 与进展按钮不同，它**不按工作区判定**：账号与研究网络在任何会话里都可能要用到。
 */
export declare function ConvFusionComButton({ t }: ButtonProps): JSX.Element;
export {};
