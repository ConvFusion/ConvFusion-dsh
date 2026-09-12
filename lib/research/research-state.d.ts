/**
 * ConvFusion 2.0 — Research State（Stage 4 核心）
 *
 * ## Research State 是什么（§12 / §13）
 *
 * > **当前整个研究对象的可持续、可更新状态表示。**
 *
 * 它是**状态空间**（Problem / Knowledge / Innovation / Method / Experiment / Evidence …），
 * **不是** Workflow State Machine —— 维度可以一直存在、反复变化、被否定重提。
 * 因此本模块的类型里**没有** `currentStage` / `next` / `progress` 之类字段。
 *
 * ## 三条硬约束
 *
 * 1. **允许不完整**（§14）：科研不是线性完成。未涉及的维度**不出现**即可，
 *    绝不为了让文档"看起来完整"而编造内容。
 * 2. **不是 Harness Session 的聊天总结**（§16）：Session 记的是"一次 Agent 交互"，
 *    Research State 记的是"研究项目当前的科研理解"。两者只通过 provenance 引用相连。
 * 3. **不删除性覆盖**（§22 / §42 Historical Integrity）：每次 Apply 都先归档旧版本到
 *    `research/state-history/`，历史可回答"当时为什么这样判断"。
 *
 * ## State Update 的人工控制点（§20 / §21）
 *
 * Agent **不直接改**长期研究状态，而是提出 {@link StateUpdateProposal}，
 * 由用户 `Accept / Edit / Reject`。无论走哪条路，都保留
 * **who / when / based on what**（§21）。
 */
import { type MaturityDimension, type MaturityLevel, type ResearchStateDocument, type StateDimension, type StateUpdateProposal, type StateUpdateRecord } from './research-data.js';
/** 解析 Research State（不存在 → null）。 */
export declare function parseResearchState(absPath: string, relPath: string): ResearchStateDocument | null;
/** 序列化 Research State。 */
export declare function serializeResearchState(input: {
    version: string;
    dimensions: Partial<Record<StateDimension, string>>;
    maturity: Record<MaturityDimension, MaturityLevel>;
    createdAt?: string;
    updatedAt?: string;
    /** 不写进文件的提示（如未建立维度），仅用于返回值。 */
    extraSections?: Array<{
        title: string;
        body: string;
    }>;
}): string;
export interface StateWriteError {
    error: string;
}
export declare function isStateWriteError(v: unknown): v is StateWriteError;
/**
 * Research State 文件绝对路径（`./research-state.md`，工作区根目录）。
 *
 * §2：Research State 属于 Research Definition 层，与 `project.md` 并列；
 * 不放 `research/`（那是结构化资产：evidence / claims / decisions）。
 */
export declare function statePath(workspace: string): string;
/** 读 Research State（不存在 → null）。 */
export declare function loadResearchState(workspace: string): ResearchStateDocument | null;
/** 空成熟度（全部 `Unknown`）。 */
export declare function emptyMaturity(): Record<MaturityDimension, MaturityLevel>;
/**
 * 创建 Research State（§40-A Create）。
 *
 * §14：**初始状态允许几乎是空的** —— 这是正常的，不是一个待填的表格。
 */
export declare function createResearchState(workspace: string, input?: {
    dimensions?: Partial<Record<StateDimension, string>>;
    maturity?: Partial<Record<MaturityDimension, MaturityLevel>>;
}): ResearchStateDocument | StateWriteError;
/** 确保 Research State 存在（不存在则创建空状态）。 */
export declare function ensureResearchState(workspace: string): ResearchStateDocument | StateWriteError;
/** 归档当前版本到 `research/state-history/`（不删除性覆盖）。 */
export declare function archiveStateVersion(workspace: string, doc: ResearchStateDocument, note?: string): string | undefined;
/** 列出历史版本。 */
export declare function listStateVersions(workspace: string): Array<{
    version: string;
    path: string;
}>;
/** 读某个历史版本。 */
export declare function readStateVersion(workspace: string, version: string): string | undefined;
/**
 * 提出一次状态更新（§20：**Agent 不直接改长期状态**）。
 *
 * 提案是**数据**（JSON），不是文件改动 —— 只有 Apply 才会写 Research State。
 */
export declare function proposeStateUpdate(workspace: string, input: {
    changes: Partial<Record<StateDimension, string | null>>;
    maturityChanges?: Partial<Record<MaturityDimension, MaturityLevel>>;
    rationale: string;
    evidence?: readonly string[];
    plan?: string;
    harnessSession?: string;
    actor?: 'agent' | 'user';
    confidence?: MaturityLevel;
    id?: string;
}): StateUpdateProposal;
/**
 * 列出**待处置**的提案。
 *
 * ⚠️ 必须排除 `applied.json`（处置记录，内容是数组）—— 早先按 `.json` 通配会把它
 * 当成一个提案，导致"已处置"的提案永远数不完。
 */
export declare function listStateProposals(workspace: string): StateUpdateProposal[];
/** 读一个提案。 */
export declare function readStateProposal(workspace: string, id: string): StateUpdateProposal | undefined;
/** 读取处置历史（who / when / based on what）。 */
export declare function listStateUpdateLog(workspace: string): StateUpdateRecord[];
/** 版本递增（整数语义：v1 → v2）。 */
export declare function bumpStateVersion(version: string): string;
/**
 * 应用一次状态更新（§21 `Execution → Proposal → User Review → Apply`）。
 *
 * @param action `accepted`（原样应用）/ `edited`（应用用户改过的 changes）/ `rejected`（不应用）
 */
export declare function applyStateUpdate(workspace: string, proposal: StateUpdateProposal, options: {
    action: 'accepted' | 'edited' | 'rejected';
    /** `edited` 时用户改过的实际变更。 */
    editedChanges?: Partial<Record<StateDimension, string | null>>;
    by?: 'user' | 'agent';
}): ResearchStateDocument | StateWriteError;
/**
 * 从实际存在的资产**推导**成熟度建议。
 *
 * ⚠️ 这是**建议**，不是自动写入：成熟度是对研究的定性判断，
 * 最终由用户/Agent 决定（因此返回 `suggested` 而不直接改状态）。
 *
 * 判据全部是"某类资产是否存在及其状态"，可解释、可核查 —— 不用百分比假装精度（§35）。
 */
export interface MaturitySuggestion {
    dimension: MaturityDimension;
    suggested: MaturityLevel;
    /** 为什么是这个层级（可核查的事实）。 */
    basis: string;
}
/** 推导六个维度的成熟度建议。 */
export declare function suggestMaturity(workspace: string): MaturitySuggestion[];
/** 把成熟度建议写回 Research State（需显式调用 —— 不自动应用）。 */
export declare function applyMaturitySuggestions(workspace: string, suggestions: readonly MaturitySuggestion[]): ResearchStateDocument | StateWriteError;
/** Open Questions（§24 / §40-G）—— 后续 Skill / Plan 推荐的重要输入。 */
export declare function openQuestions(workspace: string): string[];
/** Risks（§13 维度之一）。 */
export declare function risks(workspace: string): string[];
/**
 * 结构化索引（§18：`Index = System Retrieval Representation`）。
 *
 * ⚠️ 索引**不取代** Markdown Research State（§18 原则）。它只是给系统做检索/推荐用的
 * 派生视图，随时可以从 Markdown 重建 —— 因此本函数返回**计算结果**，
 * 是否落盘由调用方决定（{@link writeResearchIndex}）。
 */
export interface ResearchIndex {
    /** 生成时刻。 */
    generatedAt: string;
    stateVersion: string;
    /** 维度 → 是否有实质内容（不做内容复制，避免成为第二事实来源）。 */
    dimensions: Record<string, boolean>;
    maturity: Record<MaturityDimension, MaturityLevel>;
    claims: Array<{
        id: string;
        status: string;
        evidence: string[];
        contradictions: string[];
    }>;
    evidence: Array<{
        id: string;
        status: string;
        sourceKind: string;
        supports: string[];
        contradicts: string[];
    }>;
    openQuestions: string[];
    /** 未被任何证据支撑的 Claim（Paper 最该补的地方）。 */
    unsupportedClaims: string[];
    /** 有矛盾证据的 Claim（Paper 最该讨论的地方）。 */
    contestedClaims: string[];
    /** 没有原始产物引用的 Evidence（§30：provenance 不完整）。 */
    evidenceWithoutRawArtifact: string[];
}
/** 构建索引（纯计算）。 */
export declare function buildResearchIndex(workspace: string): ResearchIndex;
/** 把索引写到 `research/index.json`（派生视图，可随时重建）。 */
export declare function writeResearchIndex(workspace: string): ResearchIndex;
//# sourceMappingURL=research-state.d.ts.map