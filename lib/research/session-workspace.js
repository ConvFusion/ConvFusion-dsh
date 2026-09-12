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
import { isAbsolute, resolve } from 'node:path';
/**
 * 取会话存储。
 *
 * 用 `ctx.get('sessions')` 而**不是** `ctx.sessions`：后者要求先 `inject`，
 * 未注入时的属性访问会抛错；而这里希望"拿不到就退化为旧行为"，不该抛。
 */
export function sessionStoreOf(ctx) {
    try {
        const store = ctx.get('sessions');
        if (store && typeof store.get === 'function')
            return store;
    }
    catch {
        /* 取不到服务不是错误：调用方退化为其它来源 */
    }
    return undefined;
}
/**
 * 会话 id → 该会话的工作区绝对路径。
 *
 * @returns 拿不到会话或会话没有 cwd 时返回 `undefined`（**不**退化成 `process.cwd()`，
 *          调用方负责决定兜底策略，避免又把"服务进程启动目录"当研究会话）
 */
export function resolveSessionWorkspace(ctx, sessionId) {
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!id)
        return undefined;
    try {
        const cwd = sessionStoreOf(ctx)?.get(id)?.header?.cwd;
        if (typeof cwd === 'string' && cwd.trim())
            return isAbsolute(cwd) ? resolve(cwd) : resolve(process.cwd(), cwd);
    }
    catch {
        /* 解析失败不阻断任何主流程 */
    }
    return undefined;
}
//# sourceMappingURL=session-workspace.js.map