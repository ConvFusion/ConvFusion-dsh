/**
 * ConvFusion 2.0 — 发布时**该上传哪些文件**（规则引擎 + 体积核算）
 *
 * ## 为什么必须先算清楚再上传
 *
 * 一个真实研究工作区可以很大：本机实测某个工作区 **657 MB**，其中
 *
 * ```text
 * research/literature/fulltext/*.pdf   543 MB（别人论文的原文 PDF）
 * .tectonic-cache/ + harness/           89 MB（LaTeX 构建缓存，纯机器产物）
 * research/literature 下的 .txt 抽取文本   19 MB（PDF 抽出来的纯文本）
 * ────────────────────────────────────────────────
 * 而真正对导师有用的：项目定义 / 研究状态 / 计划 / 论文 / 实验 / 证据 / 主张 …
 *                                        约 3 MB（0.5%）
 * ```
 *
 * 全量上传既浪费服务器空间（服务器免费额度 1 GB），也把真正该看的东西埋掉。
 * 所以：**先分类打分，再由用户确认**。
 *
 * ## 三级判定（不是"能/不能"两档）
 *
 * | 级别 | 含义 | 默认 |
 * |---|---|---|
 * | `recommended` | 导师判断"这项研究在做什么、做到哪"需要的 | ✅ 勾选 |
 * | `optional` | 有价值但体积大 / 是原始素材（文献全文、抽取文本、检索报文、单个大文件） | ⬜ 不勾 |
 * | `excluded` | 机器产物或与本研究无关（版本库、依赖、构建缓存、模型权重） | 🚫 不可选 |
 *
 * ⚠️ **一切都要可见**：被排除的文件也要列出来并写明原因，否则用户会以为"漏了"。
 *
 * ## 与小节的对应
 *
 * `plans/**`、`research/evidence|claims|decisions|analysis`、`papers/**`、`experiments/**`
 * 这些路径来自本插件自己的 v2 工作区约定（`research/workspace-layout.ts`）——
 * 规则的依据是"研究资产"，不是文件名猜测。
 */
/** 服务器的硬限制（`ConvFusion-server/app/core/config.py`，可用环境变量覆盖）。 */
export declare const UPLOAD_LIMITS: {
    /** 单文件上限（`MAX_FILE_SIZE`）。 */
    readonly maxFileBytes: number;
    /** 单次请求文件数（`MAX_FILES_PER_REQUEST`）。 */
    readonly maxFilesPerRequest: 20;
    /** 单次请求总量（`MAX_UPLOAD_SIZE`）。 */
    readonly maxRequestBytes: number;
};
/**
 * 默认"大文件"阈值：超过它的一律降级为 `optional`。
 *
 * 为什么需要这条兜底：规则表再全也会漏（有人把数据集、checkpoint、录屏放在
 * `experiments/` 里）。体积是最诚实的信号 —— 单个文件大于 10 MB 时，
 * 默认不传，但**允许用户手动勾上**。
 */
export declare const LARGE_FILE_BYTES: number;
export type UploadDecision = 'recommended' | 'optional' | 'excluded';
/** 一个分类（对话框里的一行）。 */
export interface UploadCategory {
    id: string;
    /** 判定级别（分类内所有文件同级别，便于 UI 归纳）。 */
    decision: UploadDecision;
    files: Array<{
        relPath: string;
        size: number;
    }>;
    bytes: number;
}
/** 需要用户手动处理的异常（超出服务器单文件上限）。 */
export interface OversizeFile {
    relPath: string;
    size: number;
}
export interface UploadPlan {
    /** 研究根目录（真身路径）。 */
    root: string;
    /** 按分类聚合（顺序固定：recommended → optional → excluded）。 */
    categories: UploadCategory[];
    totals: {
        /** 目录里所有文件的合计（含排除项）—— 用来对比"全传"与"推荐"的差距。 */
        allBytes: number;
        allFiles: number;
        recommendedBytes: number;
        recommendedFiles: number;
        optionalBytes: number;
        optionalFiles: number;
        excludedBytes: number;
        excludedFiles: number;
    };
    limits: typeof UPLOAD_LIMITS;
    /** 被默认勾选（= recommended 且未超单文件上限）的文件。 */
    defaultSelection: string[];
    /** 默认勾选里超过服务器单文件上限的（必须让用户知道传不上去）。 */
    oversize: OversizeFile[];
    /** 默认勾选需要几批上传（服务器 20 个/次）。 */
    requestCount: number;
}
/**
 * 判定一个文件。
 *
 * 顺序很重要：**先排除**（机器产物/权重），**再看是否原始素材**（optional），
 * 最后按研究资产目录判 recommended。反过来的话 `research/literature/fulltext/*.pdf`
 * 会因为落在 `research/**` 下而被误判为推荐。
 */
export declare function classify(relPath: string, size: number): {
    categoryId: string;
    decision: UploadDecision;
};
/** 分类顺序（对话框里的显示顺序；推荐在前，排除在后）。 */
export declare const CATEGORY_ORDER: readonly ["state", "plans", "papers", "experiments", "research-assets", "review", "outputs", "literature-raw", "literature-fulltext", "large-files", "others", "runtime-artifacts", "build-artifacts", "models-data"];
/** 是否可被用户勾选（`excluded` 不可选）。 */
export declare function isSelectable(decision: UploadDecision): boolean;
/** 扫描上限（防御性：某些工作区可能塞了几十万个文件）。 */
export declare const SCAN_MAX_FILES = 20000;
/**
 * 扫描研究根目录并给出上传计划。
 *
 * - 不跟随符号链接（避免环 / 指到工作区外）；
 * - 只有**被排除**的分类会被跳过目录（省时间），其余照常统计；
 * - 单个目录读不动（权限等）→ 跳过，不让整份计划失败。
 */
export declare function buildUploadPlan(root: string): UploadPlan;
/**
 * 把用户的选择整理成**上传批次**（服务器：≤20 个文件 / ≤200 MB 每次）。
 *
 * 超过单文件上限的文件**不会**进批次，而是出现在 `skipped` 里 ——
 * 让界面如实告诉用户"这几个传不上去"，而不是等服务器 413。
 */
export declare function planUploadBatches(root: string, selection: readonly string[]): {
    batches: string[][];
    skipped: OversizeFile[];
    bytes: number;
};
//# sourceMappingURL=upload-selection.d.ts.map