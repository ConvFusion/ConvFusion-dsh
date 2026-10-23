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
 *
 * ## ⚠️ DSH 0.2.1 起：`header.cwd` ≠ 会话**当前**目录
 *
 * 0.2.1 新增了 `working_directory` 工具（`dsh-base` 默认就有），模型可以 `cd`。
 * 之后：
 *
 * ```text
 * SessionHeader.cwd            → 固定为「会话创建目录」（官方文档明确：immutable header retains the original project）
 * working-directory/change 事件 → 真正的当前目录，由 ctx.workingDirectory.get(session) 读
 * ```
 *
 * **本插件刻意继续用 `header.cwd` 作为研究根**（2026-10 决策，理由）：
 *
 * - 研究根是"这项研究放在哪"的**事实**，不该因为模型中途 `cd experiments` 就漂成
 *   `experiments/workspace` —— 那会把证据/论文写进子目录，且不可逆；
 * - 客户端（研究进展 Tab）也按会话 id 判研究项目，两边必须同一个根；
 * - `cd` 带来的真正风险是**模型按相对路径找文件**，那由 Research Context 给绝对路径解决
 *   （见 `context.ts` 的 `renderResearchContext`），与这里选哪个根无关。
 *
 * 所以：**不要**把这里改成 `workingDirectory.get()`。若将来要看"是否发生了漂移"，
 * 用结构读取（`ctx.get('workingDirectory')`，0.2.0 上为 undefined）只做**提示**，不换根。
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
/**
 * 会话 id → { 会话工作区, **研究根目录** }（新布局下研究根 = `<会话工作区>/workspace`）。
 *
 * 为什么单独有这个函数：`systemPrompt` 的 `section`/`context` 贡献者**每次组装**求值，
 * 而它们过去用的是入口注入的**全局**解析（依赖 `agent/pre-step` 同步的全局 cwd）。
 * 多个会话并行时那个全局值可能已被别的会话覆盖 —— 于是研究会话的上下文会注入到
 * 普通对话里（与"进度卡显示在所有对话里"同一类故障）。
 *
 * @returns 拿不到会话身份 / 会话没有 cwd 时返回 `undefined`：**不**退化成
 *          `process.cwd()`，由调用方决定兜底（通常退化为旧的全局解析）。
 */
export declare function researchTargetsForSession(ctx: ServiceLookupLike, sessionId: string | undefined): {
    session: string;
    root: string;
} | undefined;
//# sourceMappingURL=session-workspace.d.ts.map