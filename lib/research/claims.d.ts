/**
 * ConvFusion 2.0 — Claim 与 Decision（Stage 4）
 *
 * ## 为什么 Claim 要成为研究对象（§11）
 *
 * Paper 的核心论断**不应该**是"Agent 生成的一段话"，而应该是：
 *
 * ```text
 * Claim C1
 *   ↓ 由哪些 Evidence 支持
 * E012 E015 E019
 * ```
 *
 * 这样 Paper 里的每一句关键论断都能追溯到证据，而不是追溯到某次对话。
 * 第一版**不建**复杂逻辑推理系统（§10）：只需要
 * `Evidence --supports--> Claim` 与 `Evidence --contradicts--> Claim`。
 *
 * ## 为什么 Decision 要落盘（§23）
 *
 * "用数据集 A / 否定方法 B / 放弃假设 H2"这些判断**不应该只存在聊天记录里**。
 * 它们要能回答"这个 Paper 在当时为什么做出这个决定？"（§22）。
 *
 * ## 双向一致性
 *
 * Evidence 侧存 `supports: [C001]`，Claim 侧存 `evidence: [E012]` —— 两份引用必须一致。
 * 本模块提供 {@link reconcileClaimEvidence} 做**只读校验**并报告不一致，
 * 避免"证据说支持 C1，但 C1 不认领这条证据"这种漂移。
 */
import { type ClaimDocument, type ClaimStatus, type DecisionDocument } from './research-data.js';
export interface IdWriteError {
    error: string;
}
export declare function isIdWriteError(v: unknown): v is IdWriteError;
/** 解析一个 Claim Markdown。 */
export declare function parseClaimDocument(absPath: string, relPath: string): ClaimDocument | null;
/** 序列化一个 Claim。 */
export declare function serializeClaimDocument(input: {
    id: string;
    /** 短标题（缺省从 statement 派生）。 */
    name?: string;
    statement: string;
    status: ClaimStatus;
    evidence: readonly string[];
    contradictions: readonly string[];
    requiredEvidence?: string;
    paper?: string;
    createdAt?: string;
    updatedAt?: string;
    sections?: Array<{
        title: string;
        body: string;
    }>;
}): string;
/** 列出全部 Claim。 */
export declare function listClaims(workspace: string): ClaimDocument[];
/** 读一个 Claim。 */
export declare function readClaim(workspace: string, id: string): ClaimDocument | undefined;
/** 创建 Claim（§40-C）。 */
export declare function createClaim(workspace: string, input: {
    id?: string;
    /** 短标题（缺省从 statement 派生；用于列表展示）。 */
    name?: string;
    statement: string;
    status?: ClaimStatus;
    evidence?: readonly string[];
    requiredEvidence?: string;
    paper?: string;
}): ClaimDocument | IdWriteError;
/** 设置 Claim 状态（§11 `Status`）。 */
export declare function setClaimStatus(workspace: string, id: string, status: ClaimStatus): ClaimDocument | IdWriteError;
/**
 * 从 Evidence 侧**重算** Claim 的状态与证据列表（§18 结构化索引的用途之一）。
 *
 * 规则（保守，不越权做科学判断）：
 *   - 有 `verified` 证据且无矛盾证据 → `verified`
 *   - 有 `supported`/`verified` 证据但存在矛盾证据 → `unverified`（有争议，需人判断）
 *   - 全部证据都是 `rejected` → `rejected`
 *   - 有 `superseded` 证据则忽略之（§8/§9：已被取代的证据不再作为依据）
 *   - 无有效证据 → 保持 `unverified`
 */
export declare function reconcileClaimEvidence(workspace: string, id: string): ClaimDocument | IdWriteError;
/** 一致性报告：Evidence 与 Claim 两侧的引用是否对齐。 */
export interface ClaimEvidenceConsistency {
    claimId: string;
    /** Evidence 声称支持但 Claim 未认领。 */
    missingFromClaim: string[];
    /** Claim 认领但 Evidence 不再声称支持（或不存在）。 */
    missingFromEvidence: string[];
    consistent: boolean;
}
/**
 * 只读一致性校验（不自动修复 —— 修复涉及科学判断，交给人或显式 `reconcile`）。
 */
export declare function checkClaimEvidenceConsistency(workspace: string, claimId: string): ClaimEvidenceConsistency;
/** 删除 Claim（同时从相关 Evidence 上解除引用）。 */
export declare function deleteClaim(workspace: string, id: string): {
    ok: true;
    id: string;
} | IdWriteError;
/** 解析一个 Decision Markdown。 */
export declare function parseDecisionDocument(absPath: string, relPath: string): DecisionDocument | null;
/** 序列化一个 Decision（§23 的推荐结构）。 */
export declare function serializeDecisionDocument(input: {
    id: string;
    /** 短标题（缺省从 decision 派生）。 */
    name?: string;
    decision: string;
    reason: string;
    evidence: readonly string[];
    alternatives?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
}): string;
/** 列出全部 Decision。 */
export declare function listDecisions(workspace: string): DecisionDocument[];
/** 读一个 Decision。 */
export declare function readDecision(workspace: string, id: string): DecisionDocument | undefined;
/** 创建 Decision。
 *
 * ⚠️ 研究决策应当**有依据**：若既没有 evidence 也没有 reason，我们仍然允许创建
 * （有时决定就是"先试试"），但会在 reason 里留下提示，避免它悄悄变成无据判断。
 */
export declare function createDecision(workspace: string, input: {
    id?: string;
    /** 短标题（缺省从 decision 派生；用于列表展示）。 */
    name?: string;
    decision: string;
    reason?: string;
    evidence?: readonly string[];
    alternatives?: string;
    status?: string;
}): DecisionDocument | IdWriteError;
/** 更新 Decision 状态（`decided` → `revisiting` → `reversed` 等）。 */
export declare function setDecisionStatus(workspace: string, id: string, status: string): DecisionDocument | IdWriteError;
/** 删除 Decision。 */
export declare function deleteDecision(workspace: string, id: string): {
    ok: true;
    id: string;
} | IdWriteError;
/**
 * 完整 provenance 链（§28 / §42）：
 *
 * ```text
 * Skill → Plan → Harness Session → Raw Artifact → Evidence → Claim → Research State
 * ```
 */
export interface ProvenanceChain {
    /** 入口资产（任一起点）。 */
    from: string;
    /** 链上的每一跳。 */
    hops: Array<{
        kind: 'skill' | 'plan' | 'session' | 'artifact' | 'evidence' | 'claim' | 'decision' | 'state';
        ref: string;
        /** 该跳的说明（如"支持" / "由 Plan 产出"）。 */
        relation: string;
    }>;
    /** 是否完整追溯到原始产物（§30 的关键判据）。 */
    reachesRawArtifact: boolean;
}
/**
 * 从一条 Evidence 开始向上追溯（Evidence → Plan/Session/Artifact 与 → Claim）。
 *
 * 这是**只读**遍历：链上的资料都在各自文件里，本函数只做引用拼接，不复制内容。
 */
export declare function traceEvidenceProvenance(workspace: string, evidenceId: string): ProvenanceChain | undefined;
/** 从 Claim 开始向下汇总（Claim → Evidence → raw artifacts）。 */
export declare function traceClaimProvenance(workspace: string, claimId: string): ProvenanceChain | undefined;
//# sourceMappingURL=claims.d.ts.map