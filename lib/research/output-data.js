/**
 * ConvFusion 2.0 — Research Output 数据模型（Stage 5.1）
 *
 * ## 定位（§1）
 *
 * Stage 5.1 **不是新的研究阶段**，也不是 Paper 之后的 workflow step。它是
 * **对已有 Research State / Claims / Evidence / Paper 进行不同形式成果表达的能力层**。
 *
 * ## 核心边界（§3 / §18）
 *
 * ```text
 * Research State = 科学研究状态
 * Evidence       = 科学证据
 * Claim          = 科学主张
 * Paper          = 论文研究成果实体
 * OutputArtifact = 某一种具体成果表达形式
 * ```
 *
 * 所以 **Patent / Report / Slides 不是与 Research State 同等级的核心对象** ——
 * 它们首先是 `Research Output`。这也意味着：
 *
 * - §18：**Output 不应修改 Research State**（转换是单向的，见 `output.ts` 的类型约束）；
 * - §26：不要把来源写死成 `source_paper`，`source` 可以引用
 *   Research State / Paper / Claims / Evidence / Plans 中的任意组合。
 */
export const OUTPUT_TYPES = ['paper', 'patent', 'technical-report', 'slides'];
/** 预留类型（§6 允许但不实现）。 */
export const RESERVED_OUTPUT_TYPES = [
    'proposal',
    'project-report',
    'technical-document',
    'poster',
];
/** 类型 → 目录名（§24：一个 `outputs/` 统一注册表，不为每种类型建独立系统）。 */
/**
 * 类型 → 目录名（§2 / §10：`outputs/{patents,reports,slides}/`）。
 *
 * 注意 `paper` 不在 `outputs/` 下 —— Paper 是**核心 Research Output**，
 * 单独放 `papers/<id>/`（§8）。这里保留映射只为兼容按类型查目录的调用方。
 */
export const OUTPUT_DIRS = {
    paper: 'papers',
    patent: 'patents',
    'technical-report': 'reports',
    slides: 'slides',
};
export const OUTPUT_STATUSES = ['draft', 'reviewed', 'approved', 'archived'];
/* ════════════════════════════════════════════════════════════════════════
 * Output 目录（§24 / Task 10）
 * ════════════════════════════════════════════════════════════════════════ */
/** Output 注册表根目录。 */
export const OUTPUTS_DIR = 'outputs';
/** 版本快照目录（与各类型目录平级）。 */
export const OUTPUT_VERSIONS_DIR = 'outputs/.history';
/**
 * 类型 → id 前缀（**单数**）。
 *
 * ⚠️ 目录名是复数（`patents/`，§10），但成果 id 是单数编号（`patent-001`）——
 * 早期实现直接用目录名生成 id，产出了 `patents-001` 这种不规范的 id。
 *
 * 编号本身是必要的：成果**可以有多份**（初稿 / 修改稿 / 不同受众版本），
 * 不像 Paper 是每个研究的唯一科学表达实体（§8）。
 */
export const OUTPUT_ID_PREFIX = {
    paper: 'paper',
    patent: 'patent',
    'technical-report': 'report',
    slides: 'presentation',
};
/**
 * 类型 → **主文档文件名**（`v2-Workspace.md` §11/§12/§13）。
 *
 * ```text
 * patents/patent-001/patent.md
 * reports/report-001/report.md
 * slides/presentation-001/slides.md
 * ```
 *
 * 主文档**不再重复 id**：id 已经由目录名表达（`patent-001/patent.md` 而非
 * `patent-001/patent-001.md`）。
 */
export const OUTPUT_MAIN_FILE = {
    paper: 'paper.md',
    patent: 'patent.md',
    'technical-report': 'report.md',
    slides: 'slides.md',
};
/** 每个成果目录内的标准附属文件（§11–§13）。 */
export const OUTPUT_AUX_FILES = {
    paper: [],
    patent: ['metadata.md', 'claims.md', 'provenance.md'],
    'technical-report': ['metadata.md', 'provenance.md'],
    slides: ['metadata.md', 'provenance.md'],
};
/** 每个成果目录内的标准附属**目录**（§13：slides 有 assets/）。 */
export const OUTPUT_AUX_DIRS = {
    paper: ['history', 'latex', 'figures'],
    patent: [],
    'technical-report': [],
    slides: ['assets'],
};
//# sourceMappingURL=output-data.js.map