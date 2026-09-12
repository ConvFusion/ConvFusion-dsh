/**
 * ConvFusion 2.0 — Evidence Store（Stage 4）
 *
 * ## Evidence 是什么（§3）
 *
 * ```text
 * Evidence = Traceable Research Fact
 * ```
 *
 * 它**不是**"程序输出的漂亮包装"（§2），而是**能够支持研究判断的可追溯证据资产**。
 * 因此每条 Evidence 必须能回答：用了什么数据/模型/基线/参数/环境？能否复现？
 * 与什么比较？支持哪个假设？
 *
 * ## 三条硬约束
 *
 * 1. **不删除性覆盖**（§9）：Evidence 被新结果取代时标 `superseded` 并建立
 *    `supersedes` / `supersededBy` 双向关系，**历史永久保留**。
 * 2. **不把执行输出直接当 Evidence**（§29）：Execution Output → Candidate Evidence →
 *    Evidence Extraction → Validation → Evidence。本模块提供的是**资产层**，
 *    抽取语义仍由 Agent/用户完成。
 * 3. **原始产物必须保留**（§30）：Evidence 只**引用** raw artifacts（`## Supporting Data`
 *    / provenance），绝不替代它们。
 *
 * ## 文件布局（§36）
 *
 * ```text
 * research/evidence/E001.md
 * ```
 */
import { type EvidenceDocument, type EvidenceLinkKind, type EvidenceProvenance, type EvidenceSource, type EvidenceStatus } from './research-data.js';
/** 解析一条 Evidence Markdown。 */
export declare function parseEvidenceDocument(absPath: string, relPath: string): EvidenceDocument | null;
/** 序列化一条 Evidence。 */
export declare function serializeEvidenceDocument(input: {
    id: string;
    name: string;
    type: string;
    sourceKind: EvidenceSource;
    status: EvidenceStatus;
    supports: readonly string[];
    contradicts: readonly string[];
    supersedes?: string;
    supersededBy?: string;
    provenance: EvidenceProvenance;
    createdAt?: string;
    updatedAt?: string;
    sections: Array<{
        title: string;
        body: string;
    }>;
}): string;
/** 列出全部 Evidence（按 id 排序）。 */
export declare function listEvidence(workspace: string): EvidenceDocument[];
/** 读一条 Evidence。 */
export declare function readEvidence(workspace: string, id: string): EvidenceDocument | undefined;
/** 下一个可用 Evidence id（§37 的连续编号）。 */
export declare function nextEvidenceId(workspace: string): string;
export interface EvidenceWriteError {
    error: string;
}
export declare function isEvidenceWriteError(v: unknown): v is EvidenceWriteError;
export interface CreateEvidenceInput {
    /** 显式 id（可选）；缺省自动取下一个 E 编号。 */
    id?: string;
    name: string;
    type?: string;
    sourceKind?: EvidenceSource;
    status?: EvidenceStatus;
    /** 该 Evidence 支持 / 反驳的 Claim id（§10）。 */
    supports?: readonly string[];
    contradicts?: readonly string[];
    plan?: string;
    paper?: string;
    sourceSkill?: string;
    citation?: string;
    source?: string;
    harnessSession?: string;
    rawArtifacts?: readonly string[];
    /** 正文章节（缺省套用 §6 的推荐结构）。 */
    sections?: Array<{
        title: string;
        body: string;
    }>;
    /** 一句话结论（写入 `## Claim`）。 */
    claim?: string;
    /** 结果（写入 `## Result`）。 */
    result?: string;
    /** 观察（写入 `## Observation`）。 */
    observation?: string;
}
/** §6 的推荐章节骨架（**推荐**，不是必需 —— 缺章节不报错）。 */
export declare function evidenceSectionsTemplate(input: CreateEvidenceInput): Array<{
    title: string;
    body: string;
}>;
/**
 * 创建一条 Evidence。
 *
 * ⚠️ 语义提醒（§29）：调用方应当**已经完成** Evidence Extraction ——
 * 本函数不把执行输出自动转成证据，只负责把整理好的证据落成资产。
 */
export declare function createEvidence(workspace: string, input: CreateEvidenceInput): EvidenceDocument | EvidenceWriteError;
/** 列出某条 Evidence 的历史快照。 */
export declare function listEvidenceHistory(workspace: string, id: string): string[];
/** 读取某个历史快照。 */
export declare function readEvidenceSnapshot(workspace: string, relPath: string): string | undefined;
/** 整体保存正文（编辑器路径）。 */
export declare function saveEvidenceBody(workspace: string, id: string, body: string): EvidenceDocument | EvidenceWriteError;
/** 替换单个章节。 */
export declare function updateEvidenceSection(workspace: string, id: string, title: string, body: string): EvidenceDocument | EvidenceWriteError;
/** 设置验证状态（§8 / §40-B Validate）。 */
export declare function setEvidenceStatus(workspace: string, id: string, status: EvidenceStatus): EvidenceDocument | EvidenceWriteError;
/**
 * 用新 Evidence 取代旧 Evidence（§9：**不删除性覆盖**）。
 *
 * 建立双向关系：新证据 `supersedes` 旧证据，旧证据标 `superseded` 并记 `supersededBy`。
 * 旧的**文件永久保留** —— 这样才能回答"为什么研究结论变了"。
 */
export declare function supersedeEvidence(workspace: string, oldId: string, newId: string, note?: string): {
    ok: true;
    old: string;
    next: string;
} | EvidenceWriteError;
/** 把 Evidence 关联到某个 Claim（§10 的 `supports` / `contradicts`）。 */
export declare function linkEvidenceToClaim(workspace: string, evidenceId: string, claimId: string, kind?: EvidenceLinkKind): EvidenceDocument | EvidenceWriteError;
/**
 * 删除一条 Evidence。
 *
 * ⚠️ 出于科研诚信，这里只允许删除**从未被任何 Claim 引用**的 Evidence（误录场景）。
 * 已被引用的证据应当 `supersede` 或标 `rejected`，**不是删除**（§9）。
 */
export declare function deleteEvidence(workspace: string, id: string, opts?: {
    claimIds?: readonly string[];
}): {
    ok: true;
    id: string;
} | EvidenceWriteError;
/** `## Claim` 章节内容（这条证据支持的具体判断）。 */
export declare function evidenceClaim(doc: EvidenceDocument): string;
/** `## Result` 内容。 */
export declare function evidenceResult(doc: EvidenceDocument): string;
/** `## Observation` 内容。 */
export declare function evidenceObservation(doc: EvidenceDocument): string;
/** `## Supporting Data` 内容（原始产物引用，§30）。 */
export declare function evidenceSupportingData(doc: EvidenceDocument): string;
/** 查出所有支持某 Claim 的 Evidence（§10 反向索引）。 */
export declare function evidenceForClaim(workspace: string, claimId: string): EvidenceDocument[];
/** 查出所有反驳某 Claim 的 Evidence。 */
export declare function contradictionsForClaim(workspace: string, claimId: string): EvidenceDocument[];
//# sourceMappingURL=evidence.d.ts.map