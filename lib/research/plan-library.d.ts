/**
 * ConvFusion 2.0 — Plan Library（Stage 3 写层）
 *
 * `plans.ts` 负责**单个 Plan 的 Markdown 事实**（解析 / 序列化 / 读取 / 生命周期校验）。
 * 本模块负责**库**这一层：
 *
 * ```text
 * Plan Library
 * ├── Create / Update / Save / Delete / Archive     （§32-A）
 * ├── Lifecycle 转换（draft → reviewed → ready → …）（§10 / §32-E）
 * ├── Versioning（历史版本不可被覆盖）              （§32-F）
 * ├── Skill → Plan（+ Research State + Paper + Intent）（§32-C）
 * ├── Plan → Evidence 关联（Expected Evidence）      （§32-H）
 * ├── Plan → Paper 关联                              （§32-I）
 * └── Library 检索（Search / Filter / Recent）       （§32-J）
 * ```
 *
 * ## 库状态：没有状态文件
 *
 * 早期版本把收藏 / 使用记录 / 演化历史写在 `<workspace>/plan-library.json`。那既不在
 * `v2-Workspace.md` §2 的结构里，也是多余的 —— §28 的 Active / Completed / Archived
 * 完全能由 `plans/*.md` 的 `status` **投影**得出（`loadPlanLibrary()` 就是这么做的）。
 * 因此本模块**不落任何状态文件**。
 *
 * ## 版本历史落在 Plan 资产自己内部
 *
 * 快照写 `plans/history/<id>/vNNN.md`（§19：历史版本不可被当前版本覆盖）。
 * 放在 `plans/` 内部而不是平级：版本历史属于 Plan 这个研究资产，不是工作区顶层概念。
 *
 * ⚠️ **Plan 版本化在真实运行路径上必须自动发生**：Agent 是用原生工具直接改
 * `plans/*.md` 的，插件截不到那次写入。所以 `syncPlanHistory()` 在每次进入研究
 * （`/research`）与每次 Plan handoff 前跑一遍：发现盘上内容与最后一份快照不同，
 * 就补一份快照。**不拦截写入，也能保证历史不被覆盖。**
 */
import type { PlanDocument, PlanQuery, PlanReviewPolicy, PlanStatus } from './plans.js';
/** Library 视图中的一个 Plan 条目。 */
export interface PlanEntry {
    document: PlanDocument;
    /** 已保存的历史快照数量（§19）。 */
    versionCount: number;
}
/** Library 视图（供命令 / UI / Handoff 使用）。 */
export interface PlanLibraryView {
    workspace: string;
    entries: PlanEntry[];
    counts: Record<PlanStatus, number> & {
        total: number;
    };
}
/** 构建 Library 视图（纯投影）。 */
export declare function loadPlanLibrary(workspace: string): PlanLibraryView;
/** 兼容 Stage 1/2 的轻量摘要（`/research` 的现状展示用）。 */
export interface PlanSummary {
    id: string;
    title: string;
    status?: string;
    path: string;
}
/** 列出 Plan 摘要（供 Research Context 与命令使用）。 */
export declare function listPlans(workspace: string): PlanSummary[];
/** 发现（Search / Filter / Recent）。 */
export declare function discoverPlans(workspace: string, query?: PlanQuery): PlanEntry[];
export interface PlanWriteError {
    error: string;
}
export declare function isPlanWriteError(v: unknown): v is PlanWriteError;
/** Plan 的默认章节骨架（§5 的弱结构；**按需裁剪**，不强制全填）。 */
export declare function planSectionsTemplate(input: {
    objective?: string;
    context?: string;
    questions?: string;
    strategy?: string;
    expectedEvidence?: string;
    expectedOutputs?: string;
    constraints?: string;
    completionCriteria?: string;
}): Array<{
    title: string;
    body: string;
}>;
export interface CreatePlanInput {
    name: string;
    /** 显式 id（可选）；默认由 name 派生。 */
    id?: string;
    type?: string;
    status?: PlanStatus;
    version?: string;
    sourceSkill?: string;
    sourceSkillVersion?: string;
    paper?: string;
    researchContext?: string;
    reviewPolicy?: PlanReviewPolicy;
    sections?: Array<{
        title: string;
        body: string;
    }>;
    objective?: string;
    strategy?: string;
    expectedEvidence?: string;
    completionCriteria?: string;
}
/**
 * 创建一个 Plan（§32-A Create / §32-C Skill → Plan）。
 *
 * 命名约束（§27）：默认由 name 派生 kebab-case id；若派生结果像 `step1` /
 * `module3-plan`，**拒绝**并提示改用能力/任务命名 —— 从文件系统层面摆脱旧结构。
 */
export declare function createPlan(workspace: string, input: CreatePlanInput): PlanDocument | PlanWriteError;
/** 整体保存正文（编辑器保存路径，§32-D）。**不改** frontmatter。 */
export declare function savePlanBody(workspace: string, id: string, body: string): PlanDocument | PlanWriteError;
/** 更新元数据（名称 / 类型 / 版本 / 策略 / 关联），正文保持不变。 */
export declare function updatePlanMeta(workspace: string, id: string, patch: {
    name?: string;
    type?: string;
    version?: string;
    paper?: string;
    sourceSkill?: string;
    sourceSkillVersion?: string;
    reviewPolicy?: PlanReviewPolicy;
}): PlanDocument | PlanWriteError;
/** 替换单个章节（§32-D：用户可直接改 Objective / Context / … 中的任意一节）。 */
export declare function updatePlanSection(workspace: string, id: string, title: string, body: string): PlanDocument | PlanWriteError;
/** 删除一个 Plan（同时清理其版本快照）。 */
export declare function deletePlan(workspace: string, id: string): {
    ok: true;
    id: string;
} | PlanWriteError;
/**
 * 迁移 Plan 状态（**校验即可**，不驱动流程）。
 *
 * §11 的执行策略在这里体现为数据：`review_policy: auto-execute` 的 Plan
 * 允许从 `draft` 直接进 `ready`（调用方据此免去人工 approve 步骤），
 * 但**不改变**"状态只能按允许集合迁移"这一约束。
 */
export declare function setPlanStatus(workspace: string, id: string, status: PlanStatus): PlanDocument | PlanWriteError;
/** §32-E：用户已检查 → `reviewed`。 */
export declare function reviewPlan(workspace: string, id: string): PlanDocument | PlanWriteError;
/** §32-E：用户明确允许执行 → `ready`。 */
export declare function approvePlan(workspace: string, id: string): PlanDocument | PlanWriteError;
/** 标记为执行中（交接给 Harness 后调用）。 */
export declare function markPlanExecuting(workspace: string, id: string): PlanDocument | PlanWriteError;
/** 标记完成。 */
export declare function completePlan(workspace: string, id: string): PlanDocument | PlanWriteError;
/** 归档（不再作为当前任务）。 */
export declare function archivePlan(workspace: string, id: string): PlanDocument | PlanWriteError;
/** 递增语义版本：`1.0` → `1.1` → `2.0`。 */
export declare function bumpPlanVersion(version: string, kind?: 'minor' | 'major'): string;
/** 剥离归档注释，用于幂等比较。 */
export declare function stripPlanArchiveHeader(source: string): string;
/**
 * 快照当前的 Plan 内容（§19：历史版本不可被当前版本覆盖）。
 *
 * 快照名用**单调序号** `vNNN.md`，而不是 Plan 自己的 `version`：Agent 直接编辑
 * `plans/*.md` 时通常不会改 frontmatter 的 `version`，用版本号当文件名就会反复覆盖同一份
 * 快照 —— 那正好违反"历史不可被覆盖"。序号单调则永不重名。Plan 的语义版本仍记在
 * 快照文件自己的 frontmatter 里（`plan_version`）。
 *
 * @returns 快照相对路径；内容与最后一份快照相同则返回 `undefined`（幂等）
 */
export declare function archivePlanVersion(workspace: string, doc: PlanDocument, note?: string): string | undefined;
/**
 * 同步 Plan 历史：**盘上内容变了就补一份快照**。
 *
 * 这是让 §19 在真实运行路径上成立的关键 —— Agent 用原生工具直接改 `plans/*.md`，
 * 插件截不到那次写入，所以改为在"进入研究"与"Plan handoff"这两个必经点上对账。
 *
 * @returns 本次新产生的快照（相对路径），无变化时为空数组
 */
export declare function syncPlanHistory(workspace: string): string[];
/** 列出全部 Plan 的同步结果（供 `/research` 提示"本次记录了哪些版本"）。 */
export declare function syncPlanHistoryDetailed(workspace: string): Array<{
    id: string;
    snapshot: string;
}>;
/** 读一个 Plan 的历史版本（`version` 是快照序号，如 `001`）。 */
export declare function readPlanVersion(workspace: string, id: string, version: string): string | undefined;
/** 一个 Plan 的历史版本条目。 */
export interface PlanVersionEntry {
    /** 快照序号（如 `001`）—— 即 `readPlanVersion()` 的入参。 */
    version: string;
    /** 快照产生时 Plan 自己的语义版本（取自快照 frontmatter）。 */
    planVersion?: string;
    /** 快照对应的 Plan id。 */
    id: string;
    path: string;
}
/** 列出一个 Plan 的历史版本（按序号升序）。 */
export declare function listPlanVersions(workspace: string, id: string): PlanVersionEntry[];
/**
 * 修订 Plan：**归档当前版本 → 递增版本 → 落盘新内容**（§32-F 的标准路径）。
 *
 * 与 Stage 2 的 `reviseSkill` 同款闭环。
 */
export declare function revisePlan(workspace: string, id: string, input: {
    body?: string;
    note?: string;
    bump?: 'minor' | 'major';
}): PlanDocument | PlanWriteError;
/**
 * 建立一个 Plan 的 **Expected Evidence** 声明。
 *
 * Stage 3 只负责"声明与保存"；完整的 Evidence 管理（真实证据、linkage、assess）属 Stage 4。
 * 因此本函数的输出是**期望**，不是证据本身 —— 不要把它当成 Evidence System。
 */
export declare function setPlanExpectedEvidence(workspace: string, id: string, evidence: string): PlanDocument | PlanWriteError;
/** 关联 Plan 与当前 Paper（§32-I）。完整 Paper Evolution 属 Stage 5。 */
export declare function linkPlanToPaper(workspace: string, id: string, paper: string): PlanDocument | PlanWriteError;
/**
 * 读取一个 Plan 的**关联信息**（Provenance，§20）。
 *
 * 供 Stage 4/5 建立 Plan ↔ Evidence ↔ Paper 的反向索引；本阶段只做只读汇总。
 */
export interface PlanProvenance {
    planId: string;
    sourceSkill?: string;
    sourceSkillVersion?: string;
    paper?: string;
    researchContext?: string;
    version: string;
    status: PlanStatus;
    /** 全部历史快照（`plans/history/<id>/`，权威）。 */
    versions: PlanVersionEntry[];
    /** 是否有 Expected Evidence 声明。 */
    hasExpectedEvidence: boolean;
    /** 是否有 Completion Criteria。 */
    hasCompletionCriteria: boolean;
}
/** 汇总一个 Plan 的 provenance（只读）。 */
export declare function planProvenance(workspace: string, id: string): PlanProvenance | undefined;
/**
 * Skill + Research Context + User Intent → Plan 的**请求描述**。
 *
 * Stage 3 只定义这个接口并把它交给 Harness：
 * **我们不替模型生成 Plan 内容**（那会变成"Skill 直接生成最终 Prompt"，§8 禁止）。
 * 正确的链路是：
 *
 * ```text
 * Skill（研究方法，Stage 2）
 *   ↓  我们把 Skill 正文 + 研究上下文 + 用户意图 作为**任务上下文**交给 Harness
 * Harness Agent（原生推理）
 *   ↓  它写出 Plan，并用原生的 write 工具落到 plans/*.md
 * Plan.md（Markdown 数据资产）
 * ```
 *
 * 但为了让 Plan 的元数据（`source_skill` / `paper` / `research_context`）可靠，
 * 我们提供一个**草稿骨架**：模型只需填内容，命名与 provenance 由我们保证。
 */
export interface PlanGenerationRequest {
    /** 使用的 Skill（id，来自 Stage 2 Skill Library）。 */
    skillId: string;
    /** 期望的 Plan id（能力/任务命名；缺省由 skillId 派生）。 */
    planId?: string;
    /** 用户意图（本次要做什么）。 */
    intent: string;
    /** 关联 Paper（可选）。 */
    paper?: string;
    /** 研究上下文摘要（可选；通常来自 Research Context）。 */
    researchContext?: string;
}
/** 构造交给 Harness 的 "生成 Plan" 任务文本。 */
export declare function buildPlanGenerationText(workspace: string, request: PlanGenerationRequest, skill: {
    id: string;
    name: string;
    version?: string;
    method?: string;
    expectedOutput?: string;
}): {
    text: string;
    suggestedId: string;
    suggestedPath: string;
};
//# sourceMappingURL=plan-library.d.ts.map