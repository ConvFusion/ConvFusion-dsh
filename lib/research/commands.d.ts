/**
 * ConvFusion 2.0 — `/research` 统一入口（Stage 1 建立，Stage 3/4 收敛）
 *
 * ## 只有一个命令
 *
 * ConvFusion **只有 `/research` 一个命令**。不存在 `/plan`、`/skills`、`/skill` 这类
 * 分管理命令。
 *
 * 原因不是"少做功能"，而是**命令面本身就是流程的伪装**：一旦有 `/plan review`、
 * `/plan approve`、`/skills fork`，用户就被引导去操作"系统的零件"，而不是做研究。
 * ConvFusion 的能力面是 **Research Context + Skill + Plan 资产 + 自然语言**，
 * 不是命令行 API。
 *
 * ## Plan 是**每个阶段的产物**，不是命令
 *
 * > 每个阶段都可以形成一个**可供用户优化并继续运行的 Plan**。
 *
 * 所以 Plan 的循环是：
 *
 * ```text
 * /research <推进研究>            ← 用户用自然语言推进
 *        ↓
 * Agent 产出/更新一个 Plan 资产    ← plans/<capability>.md，写清这一次怎么做
 *        ↓
 * 用户直接编辑那个 Markdown        ← 优化（不需要任何命令）
 *        ↓
 * /research <继续>                ← Agent 读回已优化的 Plan 并继续运行
 * ```
 *
 * **用户的"优化"发生在 Markdown 文件里** —— 这正是 Markdown-first
 * （Stage 3 §4：Plan 必须可以被用户直接阅读、直接修改）。
 * 需要人工把关时，Plan frontmatter 的 `status`（`draft → reviewed → ready`）
 * 就是控制点（Stage 3 §11），由用户或 Agent 改，而不是由一条命令改。
 *
 * ## `/research` 的两个行为
 *
 * ```text
 * /research                    显示当前研究状态（含各阶段产出的 Plan 及状态）
 * /research <自然语言推进>      把意图交给 Harness 原生 Agent，继续做这件事
 * ```
 *
 * 第二个路径**只做交接**：把"当前研究状态 + 已有 Plan + 用户意图"作为一条普通任务消息
 * 交给 `agent.followup()` —— 执行完全是 Harness 原生过程（Stage 1 §13 / §27）。
 * ConvFusion 不选模块、不排步骤、不跑 Agent。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 品牌展示。 */
export declare const RESEARCH_LABEL = "/research";
/**
 * 注册 `/research`（ConvFusion 的唯一命令）。
 *
 * @returns disposer 数组（命令运行时缺失时返回 `null`，不影响插件其余功能）。
 */
export declare function defineResearchCommand(ctx: Context, resolveCurrentWorkspace: () => string): (() => void)[] | null;
//# sourceMappingURL=commands.d.ts.map