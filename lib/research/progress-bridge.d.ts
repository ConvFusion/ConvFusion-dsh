/**
 * ConvFusion 2.0 — 研究进展桥（每轮对话结束报告一次）
 *
 * ## 它做什么
 *
 * ```text
 * agent/pre-step（新一轮开始）→ 记下"本轮开始前"的快照
 * agent/turn-stopping（本轮结束）→ 采新快照 → 求差 → 存成回合报告（内存）
 *                                          ↓
 *                        顶部「研究进展」按钮的面板读走 → 渲染"最近一轮变化"
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
 * ## 展示面（2026-09 二次改版，别再走回头路）
 *
 * ```text
 * ❌ conversation.chat.turnTail（链式槽位）—— selector 只拿得到 {turn, seq, openFile}，
 *    没有会话身份，只能靠进程级全局变量猜"当前是不是研究会话"，于是命中**所有**会话
 * ✅ conversation.session.header.utilities（session 作用域的 list 槽位）——
 *    组件拿得到自己会话的 sessionId，判定按会话正确（见 client/progress-panel.tsx）
 * ```
 *
 * 因此本文件只剩两件事：**算准**（只来自磁盘真实资产）并按会话 id 记下回合报告，
 * 供 `progress/workspace` 端点取"最近一轮变化"。面板的 A/C 段不依赖回合报告
 * （每次点开都由 `progress.ts` 从磁盘重算），所以没有任何"必须跑完一轮才看得到"的限制。
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