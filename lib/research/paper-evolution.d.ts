/**
 * ConvFusion 2.0 — Paper Evolution 与 Maturity（Stage 5 核心）
 *
 * ## Paper Evolution 是什么（§10）
 *
 * 不是"修改论文"，而是一条**受控的演化链**：
 *
 * ```text
 * Research Change（新 Evidence / Claim / Research State / 用户要求）
 *       ↓
 * Paper Impact Analysis（哪些 Claim / 章节受影响）
 *       ↓
 * Revision Proposal（§11）
 *       ↓
 * User Review（Accept / Edit / Reject）
 *       ↓
 * Paper Revision
 *       ↓
 * Paper Version（§12 不删除性覆盖）
 * ```
 *
 * ## 两条硬约束
 *
 * 1. **修订必须经提案**（§11 / §32）：Agent 不直接改论文。这不是流程洁癖 ——
 *    §32 的理由是"Agent 生成的内容不能自动成为事实"，因此改正文前必须有人看过。
 * 2. **修订保留历史**（§12）：每次应用提案都先归档当前正文，并记录一条
 *    Evolution Event（§29），所以 `why did the conclusion change?` 永远可答。
 */
import { type EvolutionTrigger, type PaperMaturity, type PaperMaturityDimension, type RevisionProposal } from './paper-data.js';
/** 提案序列化（Markdown；§11 的结构）。 */
export declare function serializeProposal(p: RevisionProposal): string;
/** 解析一个提案文件。 */
export declare function parseProposal(source: string, fallbackId: string): RevisionProposal | null;
/** 列出全部提案。 */
export declare function listProposals(workspace: string, paperId: string): RevisionProposal[];
/** 读一个提案。 */
export declare function readProposal(workspace: string, paperId: string, proposalId: string): RevisionProposal | undefined;
/** 下一个提案编号。 */
export declare function nextProposalId(existing: readonly RevisionProposal[]): string;
/**
 * 提出一次修订（Task 7 `create`）。
 *
 * §32：**Agent 生成的内容不能自动成为事实** —— 因此这里只落成提案，
 * 正文不变，等用户处置。
 */
export declare function proposeRevision(workspace: string, paperId: string, input: {
    reason: string;
    proposedChanges: string;
    affectedClaims?: readonly string[];
    affectedSections?: readonly string[];
    supportingEvidence?: readonly string[];
    relatedResearchState?: string;
    risk?: string;
    trigger?: EvolutionTrigger;
    proposedBy?: 'agent' | 'user';
}): RevisionProposal | {
    error: string;
};
/** 一处变化的影响面。 */
export interface ImpactAnalysis {
    /** 触发来源（§30）。 */
    trigger: EvolutionTrigger;
    /** 触发对象（evidence id / claim id / state version / 用户请求）。 */
    cause: string;
    /** 受影响的 Claim（含其状态）。 */
    claims: Array<{
        id: string;
        statement: string;
        status: string;
        viaEvidence?: string;
    }>;
    /** 受影响的章节。 */
    sections: string[];
    /** 受影响 Paper 的建议修订方向（不是自动改动）。 */
    recommendation: string;
}
/**
 * 分析"新增证据/状态变化"会影响论文哪里（§24 / §10）。
 *
 * 纯只读分析：不改任何东西，输出的是"哪些 Claim 与章节会受影响"，
 * 交给 {@link proposeRevision} 形成提案。
 */
export declare function analyzeEvidenceImpact(workspace: string, paperId: string, evidenceId: string): ImpactAnalysis | {
    error: string;
};
/** 分析"某个 Claim 状态变化"的影响。 */
export declare function analyzeClaimImpact(workspace: string, paperId: string, claimId: string): ImpactAnalysis | {
    error: string;
};
export interface ApplyRevisionResult {
    proposal: RevisionProposal;
    fromVersion: string;
    toVersion: string;
    /** 新版本是否与旧版本内容不同。 */
    changed: boolean;
}
/**
 * 应用一次修订（Accept / Edit）。
 *
 * 顺序（重要，保证 §12 不删除性覆盖）：
 *   1. 归档当前正文到 `history/v<from>.md`
 *   2. 递增版本
 *   3. 写回修订后的正文
 *   4. 记录 Evolution Event（§29）
 *   5. 提案置为 accepted/edited 并保留处置记录
 *
 * @param finalText 最终正文（`accept` 时用 `proposedChanges`，`edit` 时用用户改过的文本）
 */
export declare function applyRevision(workspace: string, paperId: string, proposalId: string, options?: {
    action: 'accepted' | 'edited';
    finalText?: string;
    by?: 'user' | 'agent';
    note?: string;
    trigger?: EvolutionTrigger;
}): ApplyRevisionResult | {
    error: string;
};
/** 拒绝一次提案（§11 reject）。 */
export declare function rejectRevision(workspace: string, paperId: string, proposalId: string, note?: string): RevisionProposal | {
    error: string;
};
/** 读成熟度（不存在 → 全部 Unknown 并给出原因）。 */
export declare function readPaperMaturity(workspace: string, paperId: string): Record<PaperMaturityDimension, PaperMaturity>;
/** 写成熟度。 */
export declare function writePaperMaturity(workspace: string, paperId: string, maturity: Record<PaperMaturityDimension, PaperMaturity>): string;
/**
 * 从实际资产**推导**成熟度建议（§16 / Task 11）。
 *
 * ⚠️ 判据全部可核查（章节是否有实质内容、Claim 是否有证据、Gap 数量与优先级），
 * **不用百分比假装精度**。返回值是**建议**，由用户/Agent 决定是否写入。
 */
export declare function suggestPaperMaturity(workspace: string, paperId: string): Record<PaperMaturityDimension, PaperMaturity>;
/** 供状态摘要使用的成熟度总览。 */
export declare function maturityOverview(maturity: Record<PaperMaturityDimension, PaperMaturity>): {
    established: PaperMaturityDimension[];
    emerging: PaperMaturityDimension[];
    missing: PaperMaturityDimension[];
};
/** Paper 演化状态摘要（"这篇论文现在怎么样"）。 */
export interface PaperStatusSummary {
    paperId: string;
    title: string;
    status: string;
    version: string;
    sections: {
        total: number;
        substantive: number;
    };
    claims: {
        total: number;
        withEvidence: number;
        withoutEvidence: number;
    };
    evidence: {
        usedInManuscript: number;
        total: number;
    };
    gaps: {
        open: number;
        high: number;
    };
    openProposals: number;
    evolutionEvents: number;
    maturity: {
        established: PaperMaturityDimension[];
        emerging: PaperMaturityDimension[];
        missing: PaperMaturityDimension[];
    };
}
/** 汇总 Paper 状态（纯只读）。 */
export declare function paperStatusSummary(workspace: string, paperId: string): PaperStatusSummary | undefined;
/** 清理一个提案（用于测试/误建）。 */
export declare function deleteProposal(workspace: string, paperId: string, proposalId: string): boolean;
//# sourceMappingURL=paper-evolution.d.ts.map