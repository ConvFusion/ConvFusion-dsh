/**
 * ConvFusion 2.0 — Research State + Evidence 数据模型（Stage 4）
 *
 * ## 两个新核心对象（§1）
 *
 * ```text
 * Evidence       = 可被追溯、验证、引用的研究事实/结果/观察/材料
 * Research State = 当前研究在 Problem/Knowledge/Innovation/Method/Experiment/Evidence
 *                  等维度上的整体状态
 * ```
 *
 * **`Evidence ≠ Research State`**：前者是研究事实，后者是这些事实与判断构成的整体状态。
 *
 * ## 三条不可违反的边界
 *
 * 1. **不删除性覆盖**（§9 / §22 / §42 Historical Integrity）：Evidence 与 Research State
 *    的历史版本**不允许被无痕覆盖**。被新结果取代的 Evidence 标 `Superseded` 并保留
 *    `supersedes` / `supersededBy` 关系，**不是删掉**。
 * 2. **不是 Workflow State Machine**（§13）：Research State 的维度是**状态空间**，
 *    不是"跑到第几步"。因此类型里**没有** `currentStage` / `next` / `progress` 之类字段。
 * 3. **允许不完整**（§14）：科研不是线性完成。因此所有状态字段都必须能表达
 *    `Unknown / Incomplete / Uncertain / Conflicting`，而不是被迫填一个"完成值"。
 *
 * ## 与 Harness 的关系（§16 / §42 Native Harness）
 *
 * Research State **不是** Harness Session 的聊天总结。Session 是"一次 Agent 交互"，
 * Research State 是"研究项目当前的科研理解"。真实执行仍全部走 Harness 原生 Runtime，
 * 本模块不实现任何 Agent Runtime。
 */
/**
 * 研究资产 ID 方案。
 *
 * ```text
 * E001 E002 …   Evidence
 * C001 C002 …   Claim
 * D001 D002 …   Decision
 * P001 P002 …   Plan（Stage 3 的 Plan 用能力命名，这里是**索引编号**）
 * ```
 *
 * 零填充 3 位、单字母前缀 —— 短、可读、在 Markdown 里可直接引用（§32 Evidence 与引用）。
 */
export declare const ID_PREFIX: {
    readonly evidence: "E";
    readonly claim: "C";
    readonly decision: "D";
    readonly plan: "P";
};
export type ResearchAssetKind = keyof typeof ID_PREFIX;
/** 生成一个带编号的 id，如 `E007`。 */
export declare function makeResearchId(kind: ResearchAssetKind, n: number): string;
/** 解析 id → `{ kind, n }`；非法返回 `undefined`。 */
export declare function parseResearchId(id: string): {
    kind: ResearchAssetKind;
    n: number;
} | undefined;
/**
 * Evidence 来源（§7）。统一模型，不同来源。
 *
 * `literature` 必须保留 source/citation/location（§7.1 明确：**避免**"Agent 总结了"成为唯一来源）。
 */
export type EvidenceSource = 'literature' | 'experiment' | 'computation' | 'observation' | 'dataset' | 'implementation' | 'analysis' | 'user-judgment' | 'external';
export declare const EVIDENCE_SOURCES: readonly EvidenceSource[];
/**
 * 验证状态（§8）。
 *
 * 刻意**不是** true/false 二分 —— 科研证据的可信度是渐进的。
 */
export type EvidenceStatus = 'unverified' | 'supported' | 'verified' | 'rejected' | 'superseded';
export declare const EVIDENCE_STATUSES: readonly EvidenceStatus[];
/**
 * Evidence 与 Claim 的关系（§10）。
 *
 * 第一版**不建**复杂逻辑推理系统，只需要允许 `supports` / `contradicts` 两种关系。
 */
export type EvidenceLinkKind = 'supports' | 'contradicts';
/** Evidence 的 provenance 链（§28 / §40-E）。 */
export interface EvidenceProvenance {
    /** 来自哪个 Plan（Stage 3 资产）。 */
    plan?: string;
    /** 来自哪次 Harness Session（只记 id/引用，不复制 Session 内容）。 */
    harnessSession?: string;
    /** 原始执行产物（§30：**必须保留**，Evidence 只引用不替换）。 */
    rawArtifacts: string[];
    /** 来源 Skill（若可追溯）。 */
    sourceSkill?: string;
    /** 文献引用（§32）。 */
    citation?: string;
    /** 外部来源位置。 */
    source?: string;
    /** 关联的 Paper。 */
    paper?: string;
}
/** 一条 Evidence（Markdown 资产，§5 / §6）。 */
export interface EvidenceDocument {
    /** 稳定 id，如 `E001`（§37）。 */
    id: string;
    /** 展示名（正文 `# Evidence: X`）。 */
    name: string;
    /** 类型（`experiment-evidence` / `literature-evidence` / …）。 */
    type: string;
    /** 来源分类（§7）。 */
    sourceKind: EvidenceSource;
    /** 验证状态（§8）。 */
    status: EvidenceStatus;
    /**
     * 该 Evidence **支持或反驳**的 Claim id 列表（§10）。
     *
     * 存两类关系而不是单一列表：矛盾证据同样重要 —— 它可能是 Paper 里最该写的东西。
     */
    supports: string[];
    contradicts: string[];
    /** 取代了哪条旧 Evidence（§9）。 */
    supersedes?: string;
    /** 被哪条新 Evidence 取代（§9；由 system 在 supersede 时回填）。 */
    supersededBy?: string;
    provenance: EvidenceProvenance;
    createdAt?: string;
    updatedAt?: string;
    /** 全部 Markdown 章节（含 `## Claim` / `## Result` / `## Validation` …）。 */
    sections: Array<{
        title: string;
        body: string;
    }>;
    body: string;
    path: string;
    relPath: string;
}
/**
 * Claim 状态。
 *
 * 与 Evidence 状态同词汇（§11 的示例用 `Supported` / `Unverified`），
 * 便于"Claim 的状态由其 Evidence 汇总"这条直觉成立。
 */
export type ClaimStatus = 'unverified' | 'supported' | 'verified' | 'rejected' | 'superseded';
export declare const CLAIM_STATUSES: readonly ClaimStatus[];
/** 一个轻量研究论断（§11：Claim 也应该是研究对象）。 */
export interface ClaimDocument {
    id: string;
    /** 论断内容（`## Statement`）。 */
    statement: string;
    status: ClaimStatus;
    /** 关联的 Evidence id（支持）。 */
    evidence: string[];
    /** 反驳该论断的 Evidence id。 */
    contradictions: string[];
    /** 还需要什么证据才能成立（§11 `Required Evidence`）。 */
    requiredEvidence?: string;
    /** 关联 Paper。 */
    paper?: string;
    createdAt?: string;
    updatedAt?: string;
    sections: Array<{
        title: string;
        body: string;
    }>;
    body: string;
    path: string;
    relPath: string;
}
/**
 * Decision —— 研究过程中产生的判断（§23）。
 *
 * "Use Dataset A / Reject Method B / Abandon Hypothesis H2" 这些**不应该只存在聊天记录里**。
 */
export interface DecisionDocument {
    id: string;
    /** 决策内容（`## Decision`）。 */
    decision: string;
    /** 理由（`## Reason`）。 */
    reason: string;
    /** 依据的 Evidence id（`## Evidence`）。 */
    evidence: string[];
    /** 考虑过但未采用的替代方案（`## Alternatives Considered`）。 */
    alternatives: string;
    /** 决策状态（`## Status`），如 `decided` / `revisiting` / `reversed`。 */
    status: string;
    createdAt?: string;
    updatedAt?: string;
    sections: Array<{
        title: string;
        body: string;
    }>;
    body: string;
    path: string;
    relPath: string;
}
/** Research State 的核心维度（§13）。**状态空间，不是 workflow step。** */
export type StateDimension = 'Problem' | 'Research Questions' | 'Current Knowledge' | 'Literature' | 'Innovation' | 'Hypotheses' | 'Method' | 'Experiments' | 'Claims' | 'Evidence' | 'Decisions' | 'Risks' | 'Open Questions';
/** 推荐的维度顺序（§17 的 Markdown 结构）。 */
export declare const STATE_DIMENSIONS: readonly StateDimension[];
/**
 * Research State 的成熟度层级（§35）。
 *
 * 用**有序层级**而不是百分比：百分比会假装精度，而这些判断本身是定性的。
 */
export type MaturityLevel = 'Unknown' | 'Weak' | 'Emerging' | 'Strong' | 'Established';
export declare const MATURITY_LEVELS: readonly MaturityLevel[];
/** 成熟度维度（§35 的六个）。 */
export type MaturityDimension = 'Problem' | 'Knowledge' | 'Innovation' | 'Method' | 'Experiment' | 'Evidence';
export declare const MATURITY_DIMENSIONS: readonly MaturityDimension[];
/** Research State 文档（`research/research-state.md`，§17）。 */
export interface ResearchStateDocument {
    /** 版本号（每次 Apply 一次 State Update 递增，§22）。 */
    version: string;
    /**
     * 各维度内容。**允许缺失/不完整**（§14）—— 未涉及的维度不出现即可，
     * 不要为了"填满"而编造内容。
     */
    dimensions: Partial<Record<StateDimension, string>>;
    /** 成熟度（§35）。未设置 → `Unknown`。 */
    maturity: Record<MaturityDimension, MaturityLevel>;
    createdAt?: string;
    updatedAt?: string;
    /** 完整正文（不含 frontmatter），供人直接阅读。 */
    body: string;
    path: string;
    relPath: string;
}
/**
 * 一次状态更新提案（§20）。
 *
 * §20 的核心要求：**Agent 不直接改长期研究状态**，而是提出 proposal，由用户
 * `Accept / Edit / Reject`。这比自动覆盖安全。
 */
export interface StateUpdateProposal {
    id: string;
    /** 提案来源（谁提的、基于什么）。 */
    origin: {
        actor: 'agent' | 'user';
        /** 基于哪些 Evidence。 */
        evidence: string[];
        /** 基于哪次执行 / Plan。 */
        plan?: string;
        harnessSession?: string;
    };
    /** 提案的维度变更：维度 → 新内容（`null` 表示删除该维度）。 */
    changes: Partial<Record<StateDimension, string | null>>;
    /** 提案的成熟度变更。 */
    maturityChanges: Partial<Record<MaturityDimension, MaturityLevel>>;
    /** 一句话解释为什么。 */
    rationale: string;
    /** 置信度（定性的，不是分数）。 */
    confidence: MaturityLevel;
    at: string;
}
/**
 * 提案的处置结果（§21：必须保留 who / when / based on what）。
 */
export interface StateUpdateRecord {
    proposalId: string;
    action: 'accepted' | 'edited' | 'rejected';
    at: string;
    /** 处置前的 State 版本。 */
    fromVersion: string;
    /** 处置后的 State 版本（rejected 时与 fromVersion 相同）。 */
    toVersion: string;
    by: 'user' | 'agent';
    /** 用户编辑后的实际变更（action=edited 时）。 */
    appliedChanges?: Partial<Record<StateDimension, string | null>>;
}
/**
 * 研究资产的目录布局。
 *
 * §36 强调：这是**建议性**研究资产组织方式，**不要**重新建立 Step/Substep/Workflow
 * 式的目录。因此这里只有"资产类型"一层，没有嵌套的阶段层级。
 */
export declare const RESEARCH_DIR = "research";
/**
 * Research State 文件。
 *
 * ⚠️ 按 `v2-Workspace.md` §2 放在**工作区根目录**（`./research-state.md`），
 * 与 `project.md` 一起构成 Research Definition —— 它是研究的定义层，
 * 不属于 `research/` 那些结构化资产。
 */
export declare const RESEARCH_STATE_FILE = "research-state.md";
/** 研究定义文件（`./project.md`）。 */
export declare const PROJECT_FILE = "project.md";
export declare const EVIDENCE_DIR = "research/evidence";
export declare const CLAIMS_DIR = "research/claims";
export declare const DECISIONS_DIR = "research/decisions";
export declare const STATE_HISTORY_DIR = "research/state-history";
export declare const PROPOSALS_DIR = "research/state-proposals";
/** 索引（§18：Markdown 是人/Agent 表示，索引是系统检索表示）。 */
export declare const RESEARCH_INDEX_FILE = "research/index.json";
//# sourceMappingURL=research-data.d.ts.map