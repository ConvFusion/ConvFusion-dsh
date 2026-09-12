/**
 * ConvFusion 2.0 — 会话工作区解析（**权威来源**）
 *
 * ## 为什么需要这个模块
 *
 * 插件曾把"当前工作区"记在一个由 `agent/pre-step` 持续同步的模块变量里，初值是
 * `process.cwd()` —— 那是 **DSH 服务进程**的启动目录，**与会话无关**。一旦同步没生效
 * （例如载荷里取不到会话 cwd），全部研究能力就会按 DSH 的启动目录工作：
 * 在**插件开发仓库**的会话里注入了另一个研究项目的上下文、并显示它的进展报告
 * （2026-09 实测发生，见会话日志里的 `convfusion:research-context`）。
 *
 * 权威来源是**会话自己**：
 *
 * ```text
 * ctx.sessions.get(sessionId).header.cwd
 * ```
 *
 * `SessionHeader.cwd` 的定义就是 *"Absolute working directory the session was created in"*，
 * 由会话存储填写，不受插件进程启动目录影响。
 */
/** 会话存储的最小视图（只用到按 id 查询）。 */
export interface SessionStoreLike {
    get(id: string): {
        header?: {
            cwd?: string;
        };
    } | undefined;
}
/** 插件上下文的最小视图（只用到按名取服务）。 */
export interface ServiceLookupLike {
    get(name: string): unknown;
}
/**
 * 取会话存储。
 *
 * 用 `ctx.get('sessions')` 而**不是** `ctx.sessions`：后者要求先 `inject`，
 * 未注入时的属性访问会抛错；而这里希望"拿不到就退化为旧行为"，不该抛。
 */
export declare function sessionStoreOf(ctx: ServiceLookupLike): SessionStoreLike | undefined;
/**
 * 会话 id → 该会话的工作区绝对路径。
 *
 * @returns 拿不到会话或会话没有 cwd 时返回 `undefined`（**不**退化成 `process.cwd()`，
 *          调用方负责决定兜底策略，避免又把"服务进程启动目录"当研究会话）
 */
export declare function resolveSessionWorkspace(ctx: ServiceLookupLike, sessionId: string | undefined): string | undefined;
//# sourceMappingURL=session-workspace.d.ts.map