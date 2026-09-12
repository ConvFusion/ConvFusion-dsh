/**
 * ConvFusion 2.0 — Plan → Harness Handoff（Stage 1 接口，Stage 3 完整化）
 *
 * ## 它实现哪些条款
 *
 * - v2-Stage1 §18 / §25F：`Plan → Harness` 的原生交接通道（Plan-as-input）
 * - v2-Stage3 §12 / §13 / §32-G：**Ready Plan → Native Harness**
 * - v2-Stage3 §33：**禁止** `Plan → ConvFusion Agent → ConvFusion Tool Runtime`
 *
 * ## 为什么用 Harness 原生通道
 *
 * 已核实 Harness 处理"外部内容成为任务"的原生模式（`dsh-schedule` / `dsh-tool-jobs`
 * 用的就是这一条）：
 *
 * ```ts
 * agent.followup(createUserMessage({
 *   content: [{ type: 'text', text }],
 *   source: { kind: 'plugin', plugin: 'convfusion' },
 * }))
 * ```
 *
 * 好处正是 v2 要的：
 *   - Plan 成为**普通的用户 turn** → Harness 原生 Agent Loop 接管；
 *     原生事件、原生流式、原生工具/编码过程全部照旧（Stage 1 §13 / §27）；
 *   - 内容走**已知的 surface 事件通道**（`user/message`），不会像自造事件类型那样
 *     让会话日志不可恢复（外部插件无法在 `Session.append` 上设置 `ignorable`）；
 *   - ConvFusion **不接管执行**，只负责"把 Plan 作为任务上下文交出去"。
 *
 * ## 交接前置条件（§10 / §11）
 *
 * 只有 `ready` / `refined` 的 Plan 才允许交接 —— `draft` 还没人看过，
 * `executing` 已经在跑，`completed` / `archived` 不该再跑。
 * 唯一的例外是 frontmatter 显式声明 `review_policy: auto-execute`（§11 允许自动执行），
 * 此时 `draft` 也可直接交接。
 */
import type { PlanDocument, PlanStatus } from './plans.js';
/** 一次交接的载荷。 */
export interface PlanHandoff {
    planId: string;
    path: string;
    status: PlanStatus;
    /** 交接给模型的文本（含 Plan 正文与执行约束）。 */
    text: string;
}
export interface PlanHandoffError {
    error: string;
    /** 可选的候选项，便于调用方提示用户。 */
    available?: Array<{
        id: string;
        name: string;
        status: PlanStatus;
        relPath: string;
    }>;
}
/**
 * 读取一个 Plan 并构造交接文本（**纯函数**，除读盘外无副作用）。
 *
 * @param workspace 研究 workspace
 * @param planId    计划 id（文件名去 `.md`）
 * @param options.force 跳过状态校验（供 `--force` 显式使用，审计留给调用方）
 */
export declare function loadPlanHandoff(workspace: string, planId?: string, options?: {
    force?: boolean;
}): PlanHandoff | PlanHandoffError;
/**
 * 构造交接文本。
 *
 * 设计要点（Stage 1 §8 / Stage 3 §13）：
 *   - **不**把它包成"巨大的 system prompt" —— 它是一条普通任务消息；
 *   - 明确说明"这是已评审的计划"，并要求用**原生**能力执行；
 *   - 明确边界：ConvFusion 不接管执行，模型自己决定步骤、工具、验证方式；
 *   - 把 Expected Evidence / Completion Criteria 单独提示出来（§21），
 *     让模型知道"做到什么算完成"，而不是我们替它编排步骤。
 */
export declare function buildHandoffText(doc: PlanDocument): string;
/** 只依赖 Harness 的 `Agent.followup` 这一个原生方法。 */
export interface FollowupCapableAgent {
    followup(message: unknown): void;
}
/**
 * 构造 Plan 的 user 消息。
 *
 * source 取 Harness 认可的 `{ kind:'plugin', plugin:'convfusion' }` —— 内容因此
 * 走**已知的 surface 事件通道**（`user/message`），**绝不**自造会话事件类型。
 */
export declare function createPlanMessage(text: string): unknown;
/** 把一个 Plan 交接给**当前** Harness Agent。 */
export declare function handoffPlanToAgent(agent: FollowupCapableAgent, text: string): void;
/** 供插件入口复用：解析会话 workspace 后的 Plan 交接。 */
export declare function handoffPlan(workspace: string, agent: FollowupCapableAgent, planId?: string): {
    ok: true;
    planId: string;
} | PlanHandoffError;
//# sourceMappingURL=plan.d.ts.map