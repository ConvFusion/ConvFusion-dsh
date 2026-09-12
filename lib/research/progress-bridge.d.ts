/**
 * ConvFusion 2.0 — 研究进展桥（每轮对话结束展示一次）
 *
 * ## 它做什么
 *
 * ```text
 * agent/pre-step（新一轮开始）→ 记下"本轮开始前"的快照
 * agent/turn-stopping（本轮结束）→ 采新快照 → 求差 → 作为原生 notice 追加进会话
 * ```
 *
 * ## 为什么这是一个合法的原生通道
 *
 * 追加的是**已知事件类型** `user/message`，来源声明为
 * `{ kind: 'plugin', plugin: 'convfusion', form: 'notice', summary }`：
 *
 *   - `form: 'notice'` 是 DSH 自己的语境形态（*"a one-off account of something that just
 *     happened; it supersedes nothing"*），会渲染为**收起的转写行**，展开可见正文；
 *   - `surfaceOp: 'append'` 是必需的 —— 人类转写正是由"append 来源的 surface 事件"构成的
 *     （替换型事件只进模型历史，不进人类转写）；
 *   - 因此**不新增任何自定义事件类型**（那会让会话日志不可恢复，见 v2-Stage0）。
 *
 * ## 三条产品约束
 *
 * 1. **不猜**：快照全部来自磁盘上的真实资产（`progress.ts`）；
 * 2. **不强制**：缺口只陈述，用户可忽略；
 * 3. **不打断**：只在 `turn-stopping` 追加一条记录，**不唤醒新一轮**（不用 `followup`）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type AutoContinuePolicy } from './advance.js';
/** 插件在会话里标识自己的名字。 */
export declare const PROGRESS_PLUGIN = "convfusion";
/** 会话的最小视图（只用到 append）。 */
interface SessionLike {
    append: (type: string, data: unknown, opts?: {
        surfaceOp: 'append';
    }) => unknown;
}
/**
 * 把一条进展以 **notice** 形式追加进会话。
 *
 * @returns 追加成功返回 true；会话不可用时返回 false（不抛错）
 */
export declare function appendProgressNotice(session: SessionLike | undefined, summary: string, text: string): boolean;
/**
 * 装上进展桥。
 *
 * @param ctx 插件上下文
 * @param resolveWorkspace 当前研究 workspace（每次求值）
 * @returns 卸载函数
 */
export declare function mountProgressBridge(ctx: Context, resolveWorkspace: () => string, skillContent?: (id: string) => string | undefined, policy?: AutoContinuePolicy): () => void;
export {};
//# sourceMappingURL=progress-bridge.d.ts.map