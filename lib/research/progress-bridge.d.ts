/**
 * ConvFusion 2.0 — 研究进展桥（每轮对话结束报告一次）
 *
 * ## 它做什么
 *
 * ```text
 * agent/pre-step（新一轮开始）→ 记下"本轮开始前"的快照
 * agent/turn-stopping（本轮结束）→ 采新快照 → 求差 → 存成回合报告（内存）
 *                                          ↓
 *                        界面 RPC 读走 → 客户端在对话流尾部渲染进度卡
 * ```
 *
 * ## 为什么报告不再进会话日志（2026-09 用户拍板）
 *
 * 曾经把报告作为 `user/message`（`{kind:'plugin', plugin:'convfusion', form:'notice'}`）
 * 追加进会话。但 DSH 把**所有** plugin 来源的消息渲染成"上下文注入"折叠行
 * （`ContextMessageNodeView`，按 `kind: 'context'` 路由），form 取什么值都不改变观感；
 * 而能进入对话表面的事件类型只有 4 种（`system/message` / `user/message` /
 * `assistant/message` / `tool/result`），**无法自定义**事件类型来另开一种渲染。
 *
 * 所以按 `v2-Progress.md` 的要求（对话结束后、在**对话流**里显示研究进展），
 * 展示完全交给客户端：`conversation.chat.turnTail`（回合尾部、按 selector 命中渲染）。
 * 宿主只负责**算准**并把结构化报告交给界面 RPC —— 计算仍然只来自磁盘上的真实资产。
 *
 * ## 两条产品约束
 *
 * 1. **不猜**：快照全部来自磁盘上的真实资产（`progress.ts`）；
 * 2. **不打断**：`turn-stopping` 只记录报告；自动推进另走 `followup` 闸门。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type TurnProgressReport } from './progress.js';
import { type AutoContinuePolicy } from './advance.js';
/** 插件在会话里标识自己的名字。 */
export declare const PROGRESS_PLUGIN = "convfusion";
/** 记住某个会话最近一次的回合报告。 */
export declare function rememberTurnReport(sessionId: string | undefined, report: TurnProgressReport): void;
/** 读某个会话最近一次的回合报告（没有则 undefined）。 */
export declare function latestTurnReport(sessionId: string | undefined): TurnProgressReport | undefined;
/**
 * 装上进展桥。
 *
 * @param ctx 插件上下文
 * @param resolveWorkspace 当前研究 workspace（每次求值）
 * @returns 卸载函数
 */
export declare function mountProgressBridge(ctx: Context, resolveWorkspace: () => string, skillContent?: (id: string) => string | undefined, policy?: AutoContinuePolicy): () => void;
//# sourceMappingURL=progress-bridge.d.ts.map