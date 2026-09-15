/**
 * ConvFusion 2.0 — Research Context Service（Stage 1 核心）
 *
 * ## 它实现 v2-Stage1 的哪一条
 *
 * §5  Research Context = Harness 当前 Agent 对科研项目的**最小有效上下文**
 * §6  Research Context 必须是 **Agent Runtime 的动态上下文**，不是固定启动参数
 * §8  Research Context 必须能进入 Agent 的**上下文构建过程**，且**按需选择**、不无条件全量注入
 *
 * ## 为什么用 `systemPrompt.context()` 而不是自己拼 prompt
 *
 * Harness 的 `@deepseek-ai/dsh-system-prompt` 已经提供了这正是需要的机制（已核实其
 * 类型声明）：`SystemPrompt.context({name, order, text})` 注册的是
 * **"Dynamic model context materialized as a durable user-role snapshot"**，
 * 每次组装模型输入时求值 —— 即**动态**（§6）、**进入上下文构建**（§8）。
 *
 * 而且它的 `text` 可以是 `(assemblyContext) => string`：**每次组装时重新求值**，
 * 所以 Research Context 能随会话/用户反馈实时变化（§6）。
 *
 * 这是 **Extend Harness, do not wrap Harness**（§1）的直接体现：
 * 我们不是"构造一个巨大的 system prompt 塞给 Harness"，而是**注册一个上下文贡献者**，
 * 由 Harness 自己的组装管线在正确的时机、正确的顺序纳入。
 *
 * ## 我们不做什么
 *
 * - 不创建 Agent / 不驱动 LLM / 不建第二套事件流（§12 / §27）；
 * - 不把整个 workspace 无脑拼进去（§5 明确禁止）；
 * - 不判断"下一步该跑哪个模块"（§10 Skill Selection 必须是 agentic）。
 *
 * 本服务只做一件事：**如实、精简地告诉 Agent「这个研究项目现在是什么样子」**。
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { ResearchContext } from './data.js';
/**
 * 我们的 Prompt Context 排序位。
 *
 * Harness 在 `dsh-system-prompt` 里为若干位置保留了官方 order（如
 * SANDBOX_POLICY=110 / APPROVAL_POLICY=115 / SUBAGENT_DELEGATION=120）。
 * ConvFusion 的科研上下文应在这些**运行时政策之后**、模型真正开始推理之前出现，
 * 因此取 200 —— 不占用官方保留位，也不与它们争夺语义。
 */
export declare const RESEARCH_CONTEXT_ORDER = 200;
/**
 * 稳定指令段的排序位。
 *
 * 这里放的是"ConvFusion 是什么、研究模式怎么工作"的**不变说明**（不随项目变化），
 * 属于系统级指引，放在 persona 前缀之后、工具说明之前（工具说明从 1000 起）。
 * 取 400。
 */
export declare const RESEARCH_GUIDE_ORDER = 400;
/** 注入段名（Harness 要求唯一；重复注册会抛错）。 */
export declare const RESEARCH_CONTEXT_NAME = "convfusion:research-context";
export declare const RESEARCH_GUIDE_NAME = "convfusion:research-guide";
/**
 * 科研模式指引（**稳定段**，不随 workspace 变化）。
 *
 * 刻意写得很短且不规定流程：v2 的核心是"能力驱动、由 Agent 决定下一步"，
 * 因此这里只说明**身份与边界**，绝不写"先做 A 再做 B"（那是 workflow，§12 禁止）。
 */
export declare const RESEARCH_GUIDE_TEXT: string;
/** 组装 Research Context 所需的运行时输入。 */
export interface ResearchContextSource {
    /** 当前**研究根目录**（ConvFusion 数据文件所在目录；绝对路径）。 */
    workspace: string;
    /**
     * 会话工作区（新布局下研究根目录 = `<会话工作区>/workspace`）。
     * 用于计算研究根目录的展示前缀 —— Agent 用原生工具读文件时按**会话工作区**解析路径。
     */
    sessionWorkspace?: string;
    /** 当前用户输入，用于"相关选择"（§8：按任务动态选择，不无条件全量注入）。 */
    userInput?: string;
    /**
     * 取某个能力**生效正文**（含用户定制）。
     *
     * 过程定义（`research-process`）是一个可定制能力，所以"当前阶段"必须按**用户定制后**的
     * 内容判定 —— 否则用户在设置里改了过程，选择逻辑却还按默认过程走。
     */
    skillContent?: (id: string) => string | undefined;
}
/** 收集当前研究状态（纯读盘；每次组装都重新求值以确保动态性）。 */
export declare function collectResearchContext(source: ResearchContextSource): ResearchContext;
/**
 * 把 Research Context 渲染成 Markdown 文本。
 *
 * 设计约束（§5 / §8）：
 * - **无研究项目 → 返回空串**（不注入噪音；该会话就退化成普通 Harness 助手）；
 * - **不无条件全量注入**：Paper 正文只在没有具体任务、或用户提到论文时给出节选；
 *   Plan / Skill 列表给出标题级信息，相关项才给细节；
 * - **不规定流程**：不输出"下一步应该做 X"，只陈述现状与可用能力。
 */
export declare function renderResearchContext(ctx: ResearchContext, userInput?: string): string;
/** 解析当前会话 workspace 的钩子（由插件入口注入，避免本模块依赖会话内部结构）。 */
export type WorkspaceResolver = () => string;
/**
 * Research Context 服务：把研究状态注册为 Harness 的**动态上下文贡献者**。
 *
 * 生命周期：`apply()` 时调用 {@link mount}，注册两个贡献：
 *   - `section`  → 科研模式指引（稳定，不含流程）；
 *   - `context`  → 研究现状快照（动态，每次组装重新读盘）。
 *
 * 两者返回 Cordis disposer；插件卸载时自动清理（不残留全局 prompt 污染）。
 */
export declare class ResearchContextService extends Service {
    private readonly resolveWorkspace;
    /** 会话工作区（≠ 研究根目录；新布局下研究根 = `<会话工作区>/workspace`）。 */
    private readonly resolveSessionWorkspace?;
    /**
     * 取能力**生效正文**（含用户定制）。
     *
     * 过程定义（`research-process`）本身是可定制能力，因此"当前阶段"必须按用户定制后的
     * 内容判定 —— 用户在【设置】里规定了自己的研究过程，选择逻辑就得跟着变。
     */
    private readonly skillContent;
    /** 最近一次渲染的上下文（供 UI / 调试读取；§20 要求 Research Context 用户可见）。 */
    private lastRendered;
    private lastWorkspace;
    constructor(ctx: Context, resolveWorkspace: WorkspaceResolver, skillContent?: (id: string) => string | undefined, resolveSessionWorkspace?: WorkspaceResolver);
    /** 最近一次注入给模型的 Research Context 文本（`''` = 当前会话不是研究项目）。 */
    get current(): string;
    /** 最近一次解析出的 workspace 路径。 */
    get workspace(): string;
    /**
     * 本次**组装所属会话**的研究根目录 + 会话工作区。
     *
     * ⚠️ 这里必须按会话解析，而不是用入口注入的全局解析（`resolveWorkspace`）：
     * provider 是每次组装求值的，而全局解析依赖 `agent/pre-step` 同步的一个全局 cwd ——
     * 多个会话并行时它可能已被别的会话覆盖，于是研究会话的上下文会注入到**普通对话**里
     * （与进度卡"显示在所有对话里"同一类故障，2026-09 实测）。
     *
     * 权威来源是 `context.agent.id`（= SessionId）→ 会话存储里的 `header.cwd`
     * （见 `session-workspace.ts`）。拿不到会话身份（诊断组装、子 Agent 尚未注册）时
     * **退化**为旧的全局解析，保持可用性 —— 但绝不把"插件进程启动目录"当研究会话。
     */
    private targetsFor;
    /**
     * 注册到 Harness 的 system prompt 组装管线。
     *
     * 返回 disposer 数组，由调用方（插件入口）按 Cordis effect 语义管理。
     */
    mount(): Array<() => void>;
}
//# sourceMappingURL=context.d.ts.map