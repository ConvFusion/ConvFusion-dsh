/**
 * ConvFusion 2.0 — Paper 数据模型（Stage 5）
 *
 * ## Paper 不是 Markdown 文件（§2）
 *
 * ```text
 * Paper = Research Communication Entity
 *       + Scientific Claims
 *       + Evidence References
 *       + Research State Projection
 *       + Evolution History
 * ```
 *
 * **Paper 包含 Manuscript，但 Paper ≠ Manuscript。** 因此本模型的类型里，
 * `manuscript` 只是若干组成部分之一；Claims / Evidence Map / Gaps / Evolution 与它平级。
 *
 * ## Paper 与 Research State 的关系（§3，本阶段最重要的设计）
 *
 * ```text
 * Research State ──projection──▶ Paper
 * ```
 *
 * Research State 说"研究知道什么、相信什么、证明了什么"；Paper 说"这些成果如何构成
 * 一篇有科学逻辑的论文"。**不是 `Paper = Research State`** —— 因此本模块只**引用**
 * Research State（`researchStateVersion`）而不复制它。
 *
 * ## 两条硬边界
 *
 * 1. **Markdown-first，不是 Paper DSL**（§5）：所有 Paper 资产是 Markdown；
 *    frontmatter 只承担 identity / lifecycle / provenance。
 * 2. **Agent 生成的内容不能自动成为事实**（§32）：因此内容分为 manuscript（要发表的文本）
 *    与 claims（可追溯到 evidence 的科学主张）两层，且修订必须先经
 *    {@link RevisionProposal} 再由用户处置。
 */
/**
 * Paper 根目录。
 *
 * ⚠️ §28 明确：不要创建 `paper-module/`、`step1/` 这类旧结构。
 * 一个 Paper 一个目录，目录内是**资产类型**，没有阶段层级。
 */
export declare const PAPERS_DIR = "papers";
/** 默认 Paper id（最小可用 Paper 只需 paper.md，§5）。 */
export declare const DEFAULT_PAPER_ID = "paper-main";
/** Paper 目录内的文件（**按需产生**，不要求全部存在）。 */
export declare const PAPER_FILES: {
    /** 正文（最小 Paper 只需要它）。 */
    readonly manuscript: "paper.md";
    readonly metadata: "metadata.md";
    /** 演化历史（人类可读的事件叙述）。 */
    readonly evolution: "evolution.md";
    /** Claim → Evidence 映射。 */
    readonly claims: "claims.md";
    /** Evidence → Section 映射。 */
    readonly evidence: "evidence.md";
    /** 研究缺口。 */
    readonly gaps: "gaps.md";
    /** 修订提案（每个提案一个文件）。 */
    readonly proposalsDir: "proposals";
    /** 版本快照。 */
    readonly historyDir: "history";
};
/** Paper 生命周期状态。`evolving` 是常态 —— Paper 不被"写完"（§27）。 */
export type PaperStatus = 'draft' | 'evolving' | 'frozen' | 'archived' | 'submitted';
export declare const PAPER_STATUSES: readonly PaperStatus[];
/**
 * Paper 元数据（§6）。
 *
 * 刻意保持轻量：**不要在这一阶段加入复杂投稿管理系统**。
 */
export interface PaperMetadata {
    /** Paper id（如 `PAPER001`）。 */
    id: string;
    title?: string;
    status: PaperStatus;
    /** 论文版本号（如 `0.4`）。 */
    version: string;
    /** 关联研究项目（通常 `current`）。 */
    researchProject?: string;
    /**
     * 引用 Research State 的版本号（§3：Paper 是投影，不是副本）。
     *
     * 记录它才能回答"这个判断当时基于哪一版研究状态"（§22）。
     */
    researchStateVersion?: string;
    authors?: string;
    targetVenue?: string;
    researchDomain?: string;
    createdAt?: string;
    updatedAt?: string;
}
/** Paper 的完整投影（各文件**按需**存在，缺文件不是错误）。 */
export interface PaperDocument {
    id: string;
    /** 目录绝对路径。 */
    dir: string;
    /** 相对 workspace 的目录路径。 */
    relDir: string;
    metadata: PaperMetadata;
    /** 正文全文（Markdown，不含 frontmatter）。 */
    manuscript: string;
    /** 正文章节（`##` 切分），用于 section 引用与影响分析。 */
    sections: Array<{
        title: string;
        body: string;
    }>;
    /** 哪些文件实际存在（`paper.md` 之外都是按需）。 */
    present: {
        manuscript: boolean;
        metadata: boolean;
        evolution: boolean;
        claims: boolean;
        evidence: boolean;
        gaps: boolean;
    };
}
/**
 * 一个 Paper 内的 Claim 条目。
 *
 * **不是新 DSL**（§8）：它是"研究关系的持久化表达" ——
 * 论文里某句主张、由哪些证据支撑、出现在哪些章节。
 */
export interface PaperClaimEntry {
    /** Claim id（与 `research/claims/C001.md` 对应）。 */
    id: string;
    statement: string;
    status: string;
    /** 支撑证据 id。 */
    evidence: string[];
    /** 反驳证据 id。 */
    contradictions: string[];
    /** 该 Claim 在正文中出现的章节（§8 `Paper Sections`）。 */
    sections: string[];
}
/** Evidence → 论文的使用位置（§9）。 */
export interface PaperEvidenceEntry {
    /** Evidence id。 */
    id: string;
    /** 它支持的 Claim。 */
    supports: string[];
    /** 它反驳的 Claim。 */
    contradicts: string[];
    /** 正文中引用它的章节。 */
    sections: string[];
}
/** Gap 类型（§14 示例 + 规则检查可发现的类型）。 */
export type PaperGapType = 'experimental-validation' | 'missing-ablation' | 'unsupported-claim' | 'contested-claim' | 'missing-evidence' | 'evidence-without-artifact' | 'missing-section' | 'thin-section' | 'unreferenced-evidence' | 'outdated-related-work' | 'reproducibility';
export type GapPriority = 'high' | 'medium' | 'low';
/**
 * 一个研究缺口。
 *
 * §15 的关键约束：**Gap 不能直接触发执行**，只能落到
 * `Gap → Capability Recommendation → Skill → Plan → User Review → Harness`。
 */
export interface PaperGap {
    /** `G001` 形式。 */
    id: string;
    type: PaperGapType;
    description: string;
    /** 相关 Claim / Section。 */
    relatedClaim?: string;
    relatedSection?: string;
    /**
     * 建议的能力（**推荐，不是执行**）。
     *
     * 值是 Skill id（Stage 2 系统库），由 {@link recommendSkillsForGap} 按类型匹配。
     */
    suggestedSkill?: string;
    priority: GapPriority;
    /** 该 Gap 是由规则检查发现（可复核）还是 agent 建议（需人判断）。 */
    detectedBy: 'rule' | 'agent' | 'user';
    createdAt: string;
    /** 已解决时记录解决方式。 */
    resolved?: {
        at: string;
        by: string;
        note?: string;
    };
}
export type ProposalStatus = 'proposed' | 'accepted' | 'edited' | 'rejected';
/** 修订提案的状态（§11 / Task 7）。 */
export interface RevisionProposal {
    id: string;
    /** 为什么改。 */
    reason: string;
    /** 受影响的 Claim（§11 `Affected Claims`）。 */
    affectedClaims: string[];
    /** 受影响的章节（§11 `Affected Sections`）。 */
    affectedSections: string[];
    /** 拟议改动（Markdown 文本）。 */
    proposedChanges: string;
    /** 依据的证据（§11 `Supporting Evidence`）。 */
    supportingEvidence: string[];
    /** 相关 Research State 版本（§11 `Related Research State`）。 */
    relatedResearchState?: string;
    /** 风险（§11 `Risk`）。 */
    risk?: string;
    /** 触发来源（§30 的 trigger 之一）。 */
    trigger?: string;
    status: ProposalStatus;
    /** 谁提的。 */
    proposedBy: 'agent' | 'user';
    createdAt: string;
    /** 处置记录（§21 保留 who / when / based on what）。 */
    resolved?: {
        at: string;
        by: 'user' | 'agent';
        fromVersion: string;
        toVersion: string;
        note?: string;
    };
}
/** 演化触发源（§30）。 */
export type EvolutionTrigger = 'evidence-added' | 'new-claim' | 'claim-status-changed' | 'research-state-changed' | 'new-decision' | 'experiment-completed' | 'user-revision-request' | 'literature-update' | 'gap-detected' | 'plan-completed' | 'manual';
/**
 * 一次 Paper 演化事件（§29）。
 *
 * ⚠️ §29：YAML/结构化形式只作**机器索引**；人类可读的说明仍在 `evolution.md`。
 * 因此本类型是索引条目，`evolution.md` 是对应叙述。
 */
export interface EvolutionEvent {
    /** `EV012` 形式。 */
    id: string;
    fromVersion: string;
    toVersion: string;
    trigger: EvolutionTrigger;
    researchStateVersion?: string;
    plan?: string;
    evidence: string[];
    claims: string[];
    sections: string[];
    /** 处置动作。 */
    action: 'accepted' | 'edited' | 'rejected' | 'recorded';
    author: 'user' | 'agent';
    timestamp: string;
    /** 一句话摘要（`evolution.md` 里还有完整叙述）。 */
    summary?: string;
}
/**
 * Paper 成熟度维度（§16 示例 + Task 11 清单）。
 *
 * §16 明确**不要**把它设计成"进度百分比"或"步骤完成度" ——
 * 它回答的是"这篇论文当前研究成熟到什么程度"。
 */
export type PaperMaturityDimension = 'Problem' | 'Literature' | 'Innovation' | 'Method' | 'Experiment' | 'Evidence' | 'Claims' | 'Writing' | 'Reproducibility';
export declare const PAPER_MATURITY_DIMENSIONS: readonly PaperMaturityDimension[];
/** 成熟度层级（与 Stage 4 的 Research State 成熟度同一套词汇）。 */
export type PaperMaturityLevel = 'Unknown' | 'Weak' | 'Emerging' | 'Strong' | 'Established';
export declare const PAPER_MATURITY_LEVELS: readonly PaperMaturityLevel[];
/** 一个维度的成熟度（§16 / Task 11：至少支持 status / reason / evidence）。 */
export interface PaperMaturity {
    status: PaperMaturityLevel;
    reason: string;
    /** 依据的资产（Evidence id / claim id / section 名）。 */
    evidence: string[];
}
/** 版本快照条目（`history/` 目录）。 */
export interface PaperVersionEntry {
    version: string;
    path: string;
    /** 该版本的演化原因（来自对应的 Evolution Event）。 */
    reason?: string;
    at?: string;
}
/**
 * 论文必需的核心章节（§7 的推荐结构）。
 *
 * 用于"缺章节"规则检查。**不做强制** —— 不同 venue 的章节结构不同，
 * 因此只作为检查依据，不阻断任何操作。
 */
export declare const REQUIRED_PAPER_SECTIONS: readonly string[];
/** 章节名归一（去掉编号，`## 3. Method` → `Method`）。 */
export declare function normalizeSectionName(title: string): string;
//# sourceMappingURL=paper-data.d.ts.map