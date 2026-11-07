/**
 * ConvFusion 2.0 — 决策辅助的注入提示（v0.7.0）
 *
 * 为什么是"注入段"而不是 `skills/` 里的一条技能：
 * 「什么时候调 DCRM、怎么报采纳」是**宿主行为**，随插件配置（开关）与那台服务器是否可用
 * 变化；而 `skills/` 是对所有用户成立的**研究方法**（见 `AGENTS.local.md` 的分层约定）。
 * 而且这一段要**每轮重新求值**（开关可以在会话中途被关掉），因此它挂在
 * `systemPrompt.context()` 的动态段上，而不是稳定段 `RESEARCH_GUIDE_TEXT` 里。
 *
 * 正文用英文（与其它注入段一致，模型侧更省 token），但**标签用中文**：
 * 用户看的是聊天区，`**DCRM 决策辅助**` 是这个功能唯一的可见锚点。
 */
/**
 * 渲染注入段。`enabled` 取自**本次上下文组装时**的配置（不是会话开始时的快照）——
 * 设置页关掉开关后，下一轮就按关闭口径说话。
 */
export declare function decisionAssistGuidance(enabled: boolean): string;
//# sourceMappingURL=decision-assist-guidance.d.ts.map