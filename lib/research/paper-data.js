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
/* ════════════════════════════════════════════════════════════════════════
 * 目录与文件（§5 / §28）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * Paper 根目录。
 *
 * ⚠️ §28 明确：不要创建 `paper-module/`、`step1/` 这类旧结构。
 * 一个 Paper 一个目录，目录内是**资产类型**，没有阶段层级。
 */
export const PAPERS_DIR = 'papers';
/** 默认 Paper id（最小可用 Paper 只需 paper.md，§5）。 */
export const DEFAULT_PAPER_ID = 'paper-main';
/** Paper 目录内的文件（**按需产生**，不要求全部存在）。 */
export const PAPER_FILES = {
    /** 正文（最小 Paper 只需要它）。 */
    manuscript: 'paper.md',
    metadata: 'metadata.md',
    /** 演化历史（人类可读的事件叙述）。 */
    evolution: 'evolution.md',
    /** Claim → Evidence 映射。 */
    claims: 'claims.md',
    /** Evidence → Section 映射。 */
    evidence: 'evidence.md',
    /** 研究缺口。 */
    gaps: 'gaps.md',
    /** 修订提案（每个提案一个文件）。 */
    proposalsDir: 'proposals',
    /** 版本快照。 */
    historyDir: 'history',
};
export const PAPER_STATUSES = ['draft', 'evolving', 'frozen', 'archived', 'submitted'];
/** 预定义论文类型，可扩展 */
export const PAPER_TYPES = [
    'benchmark',
    'method',
    'survey',
    'demo',
    'position',
    'technical-report',
    'system',
    'other'
];
/** 当前激活论文持久化文件（存放在 workspace 根目录） */
export const ACTIVE_PAPER_FILE = '.active-paper';
export const PAPER_MATURITY_DIMENSIONS = [
    'Problem',
    'Literature',
    'Innovation',
    'Method',
    'Experiment',
    'Evidence',
    'Claims',
    'Writing',
    'Reproducibility',
];
export const PAPER_MATURITY_LEVELS = [
    'Unknown',
    'Weak',
    'Emerging',
    'Strong',
    'Established',
];
/* ════════════════════════════════════════════════════════════════════════
 * 允许的章节名（用于 section 引用与缺失检查）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 论文必需的核心章节（§7 的推荐结构）。
 *
 * 用于"缺章节"规则检查。**不做强制** —— 不同 venue 的章节结构不同，
 * 因此只作为检查依据，不阻断任何操作。
 */
export const REQUIRED_PAPER_SECTIONS = [
    'Abstract',
    'Introduction',
    'Related Work',
    'Method',
    'Experiments',
    'Results',
    'Discussion',
    'Conclusion',
];
/**
 * 每个必需章节的**别名**（小写、整词短语）。
 *
 * ## 为什么需要它
 *
 * 原来的检查是**标题全等**匹配：`REQUIRED_PAPER_SECTIONS` 里有 `Method`，
 * 论文写的是 `Decision-Centric Research: Framework and DCRM Model` —— 于是检测器
 * 报"本文没有 Method 章节"。实测（paper-main）四条全是这类假阳性：
 *
 * ```text
 * 论文实际标题                                    被误报为缺失
 * 2. Background and Related Work                 → Related Work
 * 3. Decision-Centric Research: Framework …       → Method
 * 4. Evaluation                                   → Experiments / Results
 * ```
 *
 * 章节名在各 venue 之间差异极大，全等匹配在这件事上**没有任何判别力**，
 * 只会稳定地产生假阳性；而假阳性会让研究者去补一个已经存在的章节。
 *
 * 匹配规则：章节标题里**包含**任一别名短语（整词边界）即视为该角色已存在。
 * 别名只在"这是该角色的常见命名"时登记 —— 收紧到别名的代价是可能漏报，
 * 而漏报远好于让研究者白跑一轮（见 §自检里的反向用例：真的缺 Method 仍要报）。
 */
export const REQUIRED_SECTION_ALIASES = {
    Abstract: ['abstract', 'summary'],
    Introduction: ['introduction', 'intro'],
    'Related Work': ['related work', 'background', 'prior work', 'literature review', 'related literature'],
    Method: ['method', 'methods', 'methodology', 'approach', 'framework', 'model', 'formulation', 'technical'],
    Experiments: ['experiment', 'experiments', 'experimental', 'evaluation', 'empirical', 'benchmark', 'setup', 'protocol'],
    Results: ['result', 'results', 'evaluation', 'analysis', 'findings', 'experiments'],
    Discussion: ['discussion', 'limitations', 'threats to validity'],
    Conclusion: ['conclusion', 'conclusions', 'concluding', 'summary'],
};
/**
 * 论文的某一节标题是否充当了必需章节 `want` 的角色。
 *
 * 用整词短语包含匹配：`Background and Related Work` ⊃ `related work`；
 * `Evaluation` ≈ Experiments 与 Results（一篇论文用一节同时承担设置与结果，
 * 这在会议论文里是常态，不是缺陷）。
 */
export function sectionPlaysRole(sectionTitle, want) {
    const title = normalizeSectionName(sectionTitle).toLowerCase();
    if (!title)
        return false;
    const aliases = REQUIRED_SECTION_ALIASES[want] ?? [want.toLowerCase()];
    return aliases.some((alias) => {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(title);
    });
}
/** 节标题列表里，是否存在承担 `want` 角色的章节。 */
export function hasSectionFor(titles, want) {
    return titles.some((t) => sectionPlaysRole(t, want));
}
/** 章节名归一（去掉编号，`## 3. Method` → `Method`）。 */
export function normalizeSectionName(title) {
    return title
        .replace(/^\s*\d+[.、)]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=paper-data.js.map