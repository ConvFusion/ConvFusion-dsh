/**
 * ConvFusion 2.0 — Plan System（Stage 3 核心）
 *
 * ## Plan 是什么（v2-Stage3 §2）
 *
 * ```text
 * Skill = Reusable Research Method            「这类问题我通常怎么研究？」
 * Plan  = Research-specific Execution Blueprint 「针对当前这项研究，这一次具体怎么做？」
 * ```
 *
 * 因此 `One Skill → Many Plans`：Skill 是长期方法资产，Plan 是针对**具体研究上下文**
 * 生成的执行资产（§7）。
 *
 * ## 四条硬边界
 *
 * 1. **Plan 不是 Workflow**（§3）：Plan 里当然能写"1. 2. 3."，那只是**本次任务的执行
 *    方案**；系统**绝不能**据此生成 Step Engine / State Machine / Workflow Runner。
 *    本模块的类型里没有可执行的 `steps[]`，也没有 `next`。
 * 2. **Plan 是持久化 Markdown 数据资产**（§4）：用户可读写、Agent 可读、Harness 可用、
 *    可版本控制。**不是运行时临时 Prompt。**
 * 3. **不建 Plan DSL**（§6 / §33）：frontmatter 只承担
 *    `Identity / Lifecycle / Provenance / Indexing / Versioning`。
 * 4. **Plan → Harness**（§12 / §33）：Plan 交给 **Harness 原生 Agent** 执行，
 *    不允许出现 `Plan → ConvFusion Agent → ConvFusion Tool Runtime`。
 *
 * ## 与前两阶段的关系
 *
 * - Stage 1 建立 `Plan → Harness` 的交接通道（`agent.followup` + plugin-sourced user message）；
 * - Stage 2 建立 Skill（研究方法）与 `ctx.skills`；
 * - Stage 3（本模块）把 Plan 从"一个 Markdown 文件的约定"提升为**一等研究资产**：
 *   生命周期、版本、Provenance、Library 检索、Expected Evidence 关联。
 */
/** Plan 生命周期（§10）。**不是** workflow 状态 —— 它只描述 Plan 自身的阶段。 */
export type PlanStatus = 'draft' | 'reviewed' | 'ready' | 'executing' | 'completed' | 'refined' | 'archived';
/** 全部生命周期状态。 */
export declare const PLAN_STATUSES: readonly PlanStatus[];
/** 执行策略（§11）：审核必需 / 自动执行。 */
export type PlanReviewPolicy = 'review-required' | 'auto-execute';
/** 一个 Plan 的完整内容。 */
export interface PlanDocument {
    /** id（文件名去 `.md`；能力/任务命名，**不是** stepN，见 §27）。 */
    id: string;
    /** 展示名（正文 `# Plan: X`，回退 frontmatter `name`，回退 id）。 */
    name: string;
    type: string;
    status: PlanStatus;
    version: string;
    /** 产生该 Plan 的 Skill（Provenance，§20）。 */
    sourceSkill?: string;
    /** 生成时引用的 Skill 版本（§19：Plan 要能追溯到 Skill 的哪个版本）。 */
    sourceSkillVersion?: string;
    /** 关联的 Paper（§15 / §32-I）。 */
    paper?: string;
    /** 生成时引用的 Research Context 摘要（§14）。 */
    researchContext?: string;
    createdAt?: string;
    updatedAt?: string;
    /** 执行策略（§11）。 */
    reviewPolicy?: PlanReviewPolicy;
    /** 全部章节（按文件顺序，含我们不认识的 —— 用户自加内容不丢）。 */
    sections: Array<{
        title: string;
        body: string;
    }>;
    /** 完整正文（不含 frontmatter）。 */
    body: string;
    path: string;
    relPath: string;
}
/** Plan 目录（§26：一级研究资产，**禁止** `plans/step1/plan.md` 这类层级）。 */
export declare const PLANS_DIR = "plans";
/**
 * Plan 历史快照目录（`plans/history/<id>/vNNN.md`）。
 *
 * 放在 `plans/` **内部**而不是与它平级：Plan 的版本历史属于 Plan 这个研究资产，
 * 不是工作区的顶层概念。`listPlanDocuments()` 只扫 `plans/` 下的**文件**，
 * 因此子目录不会被误当成 Plan。
 */
export declare const PLAN_HISTORY_DIR = "plans/history";
/** 受限 YAML frontmatter 解析（标量；保持轻量，不做嵌套）。 */
export declare function parsePlanFrontmatter(source: string): Record<string, string>;
/** 去掉 frontmatter。 */
export declare function stripPlanFrontmatter(source: string): string;
/**
 * 把正文切成 `# 标题` + `##` 章节（Plan 版）。
 *
 * 委托给共享的 {@link parseSections}：那里做了**围栏感知**。Plan 正文常含代码块，
 * 而代码块里的 `#` / `##`（Python 注释、YAML、shell）绝不能被当成 Markdown 结构。
 */
export declare function parsePlanSections(body: string): {
    title: string | null;
    sections: Array<{
        title: string;
        body: string;
    }>;
};
/** 解析一个 Plan Markdown 文件（不存在/损坏 → null）。 */
export declare function parsePlanDocument(absPath: string, relPath: string): PlanDocument | null;
/** 序列化 Plan（frontmatter + 正文）。 */
export declare function serializePlanDocument(input: {
    name: string;
    type: string;
    status: PlanStatus;
    version: string;
    sourceSkill?: string;
    sourceSkillVersion?: string;
    paper?: string;
    researchContext?: string;
    createdAt?: string;
    updatedAt?: string;
    reviewPolicy?: PlanReviewPolicy;
    sections: Array<{
        title: string;
        body: string;
    }>;
}): string;
/** 按标题取章节（宽松匹配；找不到 → `''`）。 */
export declare function planSection(doc: PlanDocument, ...names: string[]): string;
/** Objective —— 本次任务要达成什么。 */
export declare function planObjective(doc: PlanDocument): string;
/** Expected Evidence（§21 / §32-H）。 */
export declare function planExpectedEvidence(doc: PlanDocument): string;
/** Completion Criteria（§21：必须与 Expected Evidence 对应）。 */
export declare function planCompletionCriteria(doc: PlanDocument): string;
/** Execution Strategy（本次具体怎么做）。 */
export declare function planExecutionStrategy(doc: PlanDocument): string;
/** 替换或追加一个章节（用户编辑路径：只动该章节，其余原样保留）。 */
export declare function withSection(doc: PlanDocument, title: string, body: string): Array<{
    title: string;
    body: string;
}>;
/** 列出全部 Plan（最近更新在前）。 */
export declare function listPlanDocuments(workspace: string): PlanDocument[];
/** 读一个 Plan。 */
export declare function readPlan(workspace: string, id: string): PlanDocument | undefined;
export interface PlanQuery {
    search?: string;
    status?: readonly PlanStatus[];
    skill?: string;
    paper?: string;
    type?: string;
    /** 只看最近更新（取前 N）。 */
    recent?: number;
}
/** 纯函数过滤（便于测试与复用）。 */
export declare function filterPlans(docs: readonly PlanDocument[], query: PlanQuery): PlanDocument[];
export interface PlanWriteError {
    error: string;
}
export declare function isPlanWriteError(v: unknown): v is PlanWriteError;
/** 迁移是否合法（**数据校验**，不驱动流程）。 */
export declare function canTransition(from: PlanStatus, to: PlanStatus): boolean;
/** 非法迁移的可读原因。 */
export declare function transitionError(from: PlanStatus, to: PlanStatus): string;
/** Plan id 规范化（kebab-case）。 */
export declare function toPlanId(input: string): string;
/**
 * 是否旧 Step 风格命名（§27 明确不推荐/禁止）。
 *
 * 推荐 `literature-gap-analysis.md` / `experiment-design.md`；
 * 不推荐 `step1.md` / `module3-plan.md` / `discovery-step-plan.md`。
 */
export declare function isLegacyStylePlanId(id: string): boolean;
//# sourceMappingURL=plans.d.ts.map