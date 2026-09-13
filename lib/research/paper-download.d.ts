/**
 * ConvFusion 2.0 — 论文全文下载（Paper Full-Text Download）
 *
 * ## 它补的是哪个洞
 *
 * 做基准 / 基线对比时，要从论文全文里抽取数据集名称、评测指标、实验设置等要素。
 * `research_literature_search` 能查到题录与摘要，但摘要不含这些细节 —— 必须读全文。
 * 通用网页检索（web_fetch）拿到的是 HTML 渲染页，对 PDF 论文（arXiv / 出版商）无能为力。
 *
 * 本模块是那条"把一篇 OpenAlex 记录变成工作区里的全文文件"的**窄工具**：
 *
 *   - 从 OpenAlex 记录的链接字段推导出**候选下载 URL**（PDF 直链优先 → OA 全文 → 落地页 → DOI）；
 *   - 对 arXiv / ACL Anthology 这类**稳定公开源**，从落地页/DOI 推导出 PDF 直链；
 *   - 真的把字节流拉下来，**校验是不是 PDF**（`%PDF-`）；
 *   - 落盘到 `research/literature/fulltext/`，带**自增序号**的文件名；
 *   - 同时维护一个 `manifest.json`（序号 → 论文元信息 → 文件 → 来源 URL），让后续抽取可追溯；
 *   - **拉不到全文**时不静默失败：生成一个同名占位 `.txt`，写清"未拿到全文 + 用户自取链接"，
 *     用户手动下载后替换同名文件即可被后续流程识别。
 *
 * ## 三条约束（沿用 literature.ts）
 *
 * 1. **失败必须说清原因**：网络失败 / 非 PDF / 403 都要带原因返回，不能返回空结果冒充"下载成功"。
 * 2. **序号稳定**：manifest 是单一事实来源；序号按下载顺序自增、不复用、不重排。
 * 3. **纯函数可离线测**：URL 推导、文件名构造、manifest 读写都不依赖网络。
 *
 * ## 与 literature.ts 的关系
 *
 * literature.ts 负责"检索"（题录 + provenance）；本模块负责"取全文"（字节流 + 落盘）。
 * 检索结果的链接字段（pdfUrl / openAccessUrl / landingPageUrl / doi）是本模块的输入。
 */
/** 全文落盘目录（相对 workspace）。与 literature runtime 同级，便于后续抽取流程定位。 */
export declare const FULLTEXT_DIR = "research/literature/fulltext";
/** manifest 文件名。序号 → 下载记录的单一事实来源。 */
export declare const FULLTEXT_MANIFEST = "research/literature/fulltext/manifest.json";
/** 下载超时（毫秒）。论文 PDF 可达数 MB 且学术源常较慢，需足够宽松。 */
export declare const DOWNLOAD_TIMEOUT_MS = 120000;
/** 单文件大小上限（字节）。防异常响应灌爆工作区；50 MB 足够任何论文 PDF。 */
export declare const DOWNLOAD_MAX_BYTES: number;
/**
 * 一篇论文的链接字段（来自 OpenAlex `mapWork`，或工具调用方手填）。
 * 任意字段缺失均可，由 {@link resolveDownloadCandidates} 按优先级补齐。
 */
export interface PaperLinks {
    /** OpenAlex work id（`https://openalex.org/W123`）。 */
    id?: string;
    /** DOI（OpenAlex 给的是 `https://doi.org/10.xxx` URL 形式）。 */
    doi?: string;
    /** OA 全文地址（`open_access.oa_url`）。 */
    openAccessUrl?: string;
    /** 出版商落地页（`primary_location.landing_page_url`）。 */
    landingPageUrl?: string;
    /** 直链 PDF（`primary_location.pdf_url`）。 */
    pdfUrl?: string;
}
/** 一个候选下载源（带来源标签，便于 manifest 记录"从哪拿到的"）。 */
export interface DownloadCandidate {
    /** 候选 URL。 */
    url: string;
    /** 来源标签：pdf_direct / oa_url / arxiv_derived / acl_derived / landing / doi。 */
    source: string;
}
/** 从任意 URL 提取 arXiv id。 */
export declare function extractArxivId(url: string | undefined): string | undefined;
/**
 * 从 DOI（`https://doi.org/10.xxx` 或裸 `10.xxx`）提取 DOI 字符串。
 */
export declare function extractDoi(doi: string | undefined): string | undefined;
/**
 * 把一篇论文的链接字段解析为**有序候选下载 URL 列表**。
 *
 * 优先级（稳定公开源优先，落地页兜底）：
 *   1. `pdfUrl`（OpenAlex 已识别的直链 PDF）
 *   2. `openAccessUrl`（OA 全文 —— 多数是 PDF 或 HTML 落地页）
 *   3. arXiv 推导（从任意字段命中 arXiv id → `arxiv.org/pdf/<id>`）
 *   4. ACL Anthology 推导（落地页 → `.pdf`）
 *   5. `landingPageUrl`（出版商落地页 —— 可能是 HTML，需后续判断）
 *   6. `doi`（DOI resolver —— 通常到落地页）
 *
 * 去重，保持顺序。纯函数：不联网。
 */
export declare function resolveDownloadCandidates(links: PaperLinks): DownloadCandidate[];
/**
 * 把标题收敛成安全的文件名基名（去掉路径分隔符与控制字符，限长）。
 * 不含序号与扩展名 —— 序号由 manifest 决定，扩展名由下载结果决定。
 */
export declare function slugifyTitle(title: string | undefined): string;
/**
 * 构造带序号的文件名。
 * - 成功下载 PDF：`<seq>_<slug>.pdf`
 * - 成功下载 HTML 全文：`<seq>_<slug>.html`
 * - 占位：`<seq>_<slug>.txt`
 */
export declare function buildFilename(seq: number, slug: string, ext: 'pdf' | 'html' | 'txt'): string;
/**
 * 构造占位文件内容：用户拿到后按提示自取全文，替换同名文件即可。
 */
export declare function buildPlaceholderContent(meta: {
    title: string | undefined;
    seq: number;
    candidates: DownloadCandidate[];
    reason: string;
}): string;
/** manifest 里一条下载记录。 */
export interface FulltextManifestEntry {
    /** 自增序号（稳定，不复用）。 */
    seq: number;
    /** 论文标题。 */
    title?: string;
    /** OpenAlex work id。 */
    openalexId?: string;
    /** DOI。 */
    doi?: string;
    /** 落盘文件名（相对 fulltext 目录）。 */
    filename: string;
    /** 相对 workspace 的路径（方便后续流程直接读）。 */
    path: string;
    /** 文件类型：pdf / html / txt(占位)。 */
    kind: 'pdf' | 'html' | 'txt';
    /** 是否占位（无法自动下载全文时为 true）。 */
    placeholder: boolean;
    /** 实际下载来源 URL（成功时）。 */
    downloadedFrom?: string;
    /** 候选来源标签（成功时）。 */
    source?: string;
    /** 下载失败的候选链接（占位时）。 */
    candidates?: DownloadCandidate[];
    /** 下载/创建时间（ISO）。 */
    createdAt: string;
    /** 文件字节数（成功时）。 */
    bytes?: number;
    /** 下载失败原因（占位时）。 */
    reason?: string;
}
/** manifest 结构。 */
export interface FulltextManifest {
    version: number;
    nextSeq: number;
    entries: FulltextManifestEntry[];
}
/** 读 manifest（不存在返回空 manifest）。纯 I/O，不抛。 */
export declare function readManifest(workspace: string): FulltextManifest;
/** 写 manifest（幂等覆盖）。纯 I/O。 */
export declare function writeManifest(workspace: string, manifest: FulltextManifest): void;
/** 分配下一个序号并写入一条记录，返回新记录与新 manifest。 */
export declare function appendManifestEntry(workspace: string, entry: Omit<FulltextManifestEntry, 'seq'>): {
    entry: FulltextManifestEntry;
    manifest: FulltextManifest;
};
/**
 * 写入一条已分配序号的记录（序号由调用方从 manifest 决定）。
 * 用于"先拿序号定文件名、再写文件、最后登记记录"的流程，避免重复读 manifest。
 */
export declare function writeManifestEntry(workspace: string, manifest: FulltextManifest, entry: FulltextManifestEntry): FulltextManifest;
/** 最小 fetch 契约（与 literature.ts 同款，便于注入与测试）。 */
export type DownloadFetchLike = (url: string, init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: string;
}) => Promise<{
    ok: boolean;
    status: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text?: () => Promise<string>;
}>;
/** 下载依赖（由插件入口注入）。 */
export interface PaperDownloadDeps {
    fetchImpl?: DownloadFetchLike;
    timeoutMs?: number;
}
/** 下载结果。 */
export interface DownloadOutcome {
    /** 是否拿到可用全文。 */
    ok: boolean;
    /** 文件类型：pdf / html / txt(占位)。 */
    kind: 'pdf' | 'html' | 'txt';
    /** 字节内容（ok 且非占位时）。 */
    bytes?: Uint8Array;
    /** 实际下载来源 URL。 */
    downloadedFrom?: string;
    /** 来源标签。 */
    source?: string;
    /** 失败原因（ok=false 时）。 */
    reason?: string;
}
/** 判断字节是否为 PDF（魔数）。 */
export declare function isPdf(bytes: Uint8Array): boolean;
/** 判断字节是否像 HTML（宽松：含 `<html` 或 `<!doctype html`）。 */
export declare function looksLikeHtml(bytes: Uint8Array): boolean;
/**
 * 尝试下载一个候选 URL。
 *
 * 对每个候选：fetch → 取字节 → 判断是否 PDF（首选）/ HTML（次选）。
 * 非 PDF 非 HTML、4xx/5xx、超时、超大都会跳到下一个候选。
 * 全部失败时返回带原因的 `ok: false`。
 */
export declare function downloadFromCandidates(candidates: DownloadCandidate[], deps: PaperDownloadDeps): Promise<DownloadOutcome>;
/** 下载参数（链接字段 + 可选标题）。 */
export interface DownloadPaperInput {
    /** 论文标题（用于文件名与 manifest）。 */
    title?: string;
    /** 链接字段（来自 OpenAlex 记录或手填）。 */
    links: PaperLinks;
}
/** 下载结果（已落盘 + 已登记 manifest）。 */
export interface DownloadPaperResult {
    /** 自增序号。 */
    seq: number;
    /** 落盘文件名（相对 fulltext 目录）。 */
    filename: string;
    /** 相对 workspace 的路径。 */
    path: string;
    /** 文件类型。 */
    kind: 'pdf' | 'html' | 'txt';
    /** 是否占位（无法自动下载全文时为 true）。 */
    placeholder: boolean;
    /** 实际下载来源（成功时）。 */
    downloadedFrom?: string;
    /** 下载失败原因（占位时）。 */
    reason?: string;
}
/**
 * 下载一篇论文全文到工作区，并登记 manifest。
 *
 * - 解析候选 URL → 逐个尝试下载；
 * - 拿到 PDF/HTML → 落盘 `research/literature/fulltext/<seq>_<slug>.<ext>`；
 * - 拿不到 → 生成同名 `.txt` 占位（含候选链接，用户自取替换）；
 * - 无论成败都写一条 manifest 记录。
 *
 * @param workspace 研究 workspace 根目录（绝对路径）
 * @param input 下载参数
 * @param deps 下载依赖
 */
export declare function downloadPaper(workspace: string, input: DownloadPaperInput, deps: PaperDownloadDeps): Promise<DownloadPaperResult>;
//# sourceMappingURL=paper-download.d.ts.map