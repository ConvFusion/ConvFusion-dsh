/**
 * ConvFusion 2.0 — 对话流里的研究进展卡（`v2-Progress.md`）
 *
 * ## 为什么是"客户端卡片"而不是"会话消息"
 *
 * 曾经把报告作为 plugin 来源的 `user/message` 追加进会话，但 DSH 把**所有** plugin
 * 来源的消息渲染成"上下文注入"折叠行（`ContextMessageNodeView`，按 `kind:'context'`
 * 路由），form 取什么值都不改变观感；而能进入对话表面的事件类型只有 4 种，**无法
 * 自定义**。因此"对话结束后、在对话流里显示研究进展"只能落在客户端：
 *
 * ```text
 * conversation.chat.turnTail（chain：回合尾部、selector 命中才渲染）
 *        ↑ 只显示研究会话
 * 宿主 RPC /dsh-convfusion/progress/latest（数据只来自磁盘真实资产）
 * ```
 *
 * ## 三个必须守住的边界
 *
 * 1. **只显示在研究会话**：`turnTail` 是"首个命中者渲染"的链式槽，官方 `deliverables`
 *    （本轮产出文件行）也在链上。selector 只在本会话的工作区是研究项目时命中，
 *    其余回合返回 null —— 让 `deliverables` 照常显示（用户 2026-09 拍板：研究会话里
 *    进度卡优先）。
 * 2. **判定依据是会话自己的工作区**：由宿主用 `ctx.sessions.get(id).header.cwd` 解析
 *    （RPC 返回），不依赖插件进程的启动目录。
 * 3. **不发明数据**：卡片只渲染宿主算好的报告；拿不到就什么都不显示。
 */
/** 仅供离线测试：重置模块状态。 */
export declare function resetProgressCardState(active?: string): void;
/**
 * `turnTail` 的 selector：只认"当前会话是研究工作区"。
 *
 * ⚠️ 未知时**返回 null**（不抢 `deliverables` 的位置）——宁可少显示一次，
 * 也不能在没有研究进展的地方挡住官方组件。
 */
export declare function selectResearchTurn(): {
    sessionId: string;
} | null;
interface WarmProps {
    sessionId?: string;
}
/**
 * 研究会话预热：把"这个会话的工作区是不是研究项目"问清并缓存。
 *
 * 挂在 `conversation.input.dock`（**list = 追加式**，不抢任何官方组件）上，
 * 随会话视图挂载 —— 早于任何回合结束，所以进度卡的 selector 届时已有依据。
 */
export declare function ResearchProgressWarmer({ sessionId }: WarmProps): null;
interface CardProps {
    sessionId?: string;
    /** 回合位置（由 owner 提供；用于"这一轮"的变化）。 */
    turn?: {
        turn?: number;
    };
    /** 回合结束序号（变化即重新取数）。 */
    seq?: number;
}
/**
 * 回合尾部的"本轮研究进展"卡。
 *
 * 拿不到报告（非研究工作区 / 尚未产生报告）时渲染 `null`：
 * 这个槽位是链式的，但我们只在研究会话里命中，所以不会把官方组件的位置占空。
 */
export declare function ResearchProgressCard({ sessionId, turn, seq }: CardProps): JSX.Element | null;
export {};
