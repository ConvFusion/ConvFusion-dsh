/**
 * dsh-convfusion — host half（ConvFusion 2.0 / Stage 1: Harness Runtime）
 *
 * ## 这一版是什么
 *
 * ConvFusion 2.0 是**推倒重来**：不再有 Module / Step / 固定流水线 / 子 Agent 编排 /
 * 自造会话事件 / 自绘原生 UI（v2-Stage0 §6.3、v2-Stage1 §12 / §27）。
 *
 * 本插件现在的唯一职责，是让 Harness 成为 ConvFusion 的**原生 Agent Runtime**
 * （v2-Stage1 §1：Extend Harness, do not wrap Harness）：
 *
 * ```text
 * Research Context   →  ctx.systemPrompt.context()     动态、按需、逐步求值
 * Research Guide     →  ctx.systemPrompt.section()     稳定说明（不含流程）
 * Skills             →  ctx.skills.registerProvider()  白拿 Harness 原生 skill 通道
 * Runtime Observation→  ctx.on('agent/*' | 'tools/*')  只观察，不接管
 * Plan-as-input      →  agent.followup(user message)   原生交接
 * ```
 *
 * Agent Loop / Tool Registry / Session / 流式 / Coding **全部由 Harness 原生提供**，
 * 本插件一行都不实现、也不包装。
 *
 * ## 明确不做（v2-Stage1 §26）
 *
 * 不建 Agent Loop、Workflow Engine、Coding Agent、Tool Registry、Session 系统、
 * 严格 DSL。Skill Library（Stage 2）、Plan System（Stage 3）、Evidence（Stage 4）、
 * Paper Evolution（Stage 5）属后续阶段。
 *
 * ## 已知外部约束（影响设计，勿忘）
 *
 * 外部插件**不能**持久化自定义 session 事件类型：`Session.append` 无法设置
 * `ignorable`，而持久化读取路径会拒绝未知类型（会话将不可恢复）。
 * 因此本插件**只使用** Harness 已有的 `user/message`（经 `agent.followup`）与
 * `system/message`（经 system prompt 段）通道；观测状态只留在**内存**。
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type Config as ConfigShape } from './config.js';
import { ResearchContextService } from './research/context.js';
import { type ResearchEventBridge } from './research/runtime-events.js';
export declare const name = "dsh-convfusion";
export { Config };
/**
 * 依赖声明。
 *
 * 只声明**必需**服务 `tools`；其余（`commands` / `skills` / `agent-loop`）在 apply
 * 内做能力探测后降级。这样本插件在精简 profile（headless、无 web、无 commands）下
 * 也能加载而不崩 —— 这是 v2-Stage1 §13「不破坏 Harness 原生体验」的前提：
 * 一个插件不应让整个 profile 起不来。
 */
/**
 * 依赖声明。
 *
 * ⚠️ **必须列出所有会被访问的服务**。Cordis 的规则是：*未 inject 的服务不可访问*，
 * 直接属性访问会抛 `cannot get property "X" without inject`，而插件加载是
 * **全有或全无**的 —— 一个未声明的服务会让整个 profile 起不来（2026-09-12 实际发生）。
 *
 * 因此这里声明了插件真正用到的三个服务：
 *   - `tools`        注册研究资产工具；
 *   - `systemPrompt` Research Context / Research Guide 的注入点（Stage 1 核心）；
 *   - `skills`       Skill Library 的注册点（Stage 2 核心）。
 *
 * 三者都是本插件功能的核心依赖；缺少它们时插件没有意义，故不做"可降级"处理。
 * 而**可选**能力（`commands`、agent 事件）用 `ctx.inject(...)` / `ctx.on(...)`
 * 按需挂载，不在此列。
 */
export declare const inject: string[];
/** 运行时句柄（供设置页 / 调试读取；**不**参与 Agent 决策）。 */
export interface ConvFusionRuntime {
    /** Research Context 服务：当前注入文本、workspace。 */
    research: ResearchContextService;
    /** Harness 原生运行时的观测桥（内存环形缓冲）。 */
    events: ResearchEventBridge;
    /** 生效配置（设置面板读取）。 */
    config: ConfigShape;
    /** 用户定制文件的绝对路径（设置面板展示"定制存在哪里"）。 */
    customizationPath: string;
    /** 用户定制存储（设置面板读写）。 */
    customizationStore: import('./research/skill-customization.js').SkillCustomizationStore;
    /** 系统 Skill Library 状态（包内资产，只读）。 */
    systemLibrary: {
        root: string;
        skillCount: number;
    };
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        convfusion: ConvFusionRuntime;
    }
}
export declare function apply(ctx: Context, rawConfig?: Partial<ConfigShape>): void;
//# sourceMappingURL=index.d.ts.map