/**
 * ConvFusion 2.0 — Harness Runtime 事件桥（Stage 1）
 *
 * ## 它实现 v2-Stage1 的哪一条
 *
 * §14 ConvFusion 应该 **Observe + enrich + react**，而不是取代 Harness Runtime
 * §25E 能够观察 Harness 原生 Agent / Turn / Step / Tool / Message 事件，
 *      并把**科研相关**事件反馈给 ConvFusion
 *
 * ## 关键约束：这不是第二套事件流，也不是第二套 UI（§12 / §27）
 *
 * 本模块**只观察**：订阅 Harness 自己发出的 `agent/*` 事件，转换成 ConvFusion
 * 内部的科研活动记录，供 Stage 4（Evidence / Research State）消费。
 *
 * 它**不**：
 *   - 向会话日志写 UI 事件（旧实现的 `convfusion/node`、`convfusion/<module>-run` 已删除）；
 *   - 复制 / 伪造 native 事件；
 *   - 渲染任何东西 —— Harness 的原生 UI 自己渲染（§13）。
 *
 * 已核实的 Harness 原生事件（`@deepseek-ai/dsh-agent` runtime-types）：
 *
 *   agent/created · agent/disposed · agent/status
 *   agent/session-start
 *   agent/pre-step        （waterfall：含 agent/messages/turn/step）
 *   agent/request         （waterfall：模型调用配置）
 *   agent/request-error   （waterfall）
 *   agent/assistant-stream（emit：start/chunk/end 帧）
 *   agent/turn-stopping   （serial：turn 即将收尾）
 *   agent/error
 *
 * Stage 1 只建立**可靠的事件桥接机制**（§15），Event → Evidence 的语义化留给 Stage 4。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * ConvFusion 视角的科研活动类型。
 *
 * 刻意保持**粗粒度**：Stage 1 只证明"能稳定观察到运行时"，语义细分属 Stage 4。
 */
export type ResearchActivityKind = 'turn-started' | 'turn-stopping' | 'step-started' | 'model-request' | 'model-stream' | 'model-error' | 'agent-status' | 'agent-error';
/** 一条科研活动记录（内存环形缓冲；**不落盘、不进会话日志**）。 */
export interface ResearchActivity {
    kind: ResearchActivityKind;
    /** 发生时刻（ISO 8601）。 */
    at: string;
    /** 会话 id（用于把活动归属到某个 Harness Session）。 */
    sessionId?: string;
    /** turn / step 序号（Harness 原生语义：一个 turn 含多个 step）。 */
    turn?: number;
    step?: number;
    /** 人类可读摘要（用于 UI 展示与调试；不含模型私有内容）。 */
    detail?: string;
}
/** 事件桥配置。 */
export interface EventBridgeOptions {
    /** 保留的最近活动条数（默认 200）。 */
    capacity?: number;
    /** 是否记录模型流式帧（默认 false —— 帧量大，Stage 1 不需要）。 */
    recordStreamFrames?: boolean;
}
/** 只读的活动查询接口（Stage 4 会在此基础上做 Evidence 抽取）。 */
export interface ResearchEventBridge {
    /** 最近的科研活动（时间正序）。 */
    recent(limit?: number): ResearchActivity[];
    /** 按会话过滤。 */
    forSession(sessionId: string, limit?: number): ResearchActivity[];
    /** 累计计数（按 kind），用于健康检查与调试。 */
    counts(): Record<string, number>;
    /** 清空缓冲（测试 / 新研究开始时调用）。 */
    clear(): void;
}
/**
 * 挂载事件桥：订阅 Harness 原生 agent 事件并记录为科研活动。
 *
 * @returns `{ bridge, dispose }` —— dispose 由插件入口按 Cordis effect 管理。
 */
export declare function mountEventBridge(ctx: Context, options?: EventBridgeOptions): {
    bridge: ResearchEventBridge;
    dispose: () => void;
};
//# sourceMappingURL=runtime-events.d.ts.map