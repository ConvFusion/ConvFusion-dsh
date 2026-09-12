/**
 * ConvFusion 2.0 — Paper Entity 与 Manuscript（Stage 5）
 *
 * ## 本模块负责
 *
 * - **Paper 实体**：create / read / update / version / archive / restore（Task 1）
 * - **Manuscript**：`paper.md` 的 create / read / edit / save / version / diff（Task 2）
 * - **Metadata**：`metadata.md`（Task 3）
 * - **Claim Map**（Task 4）与 **Evidence Map**（Task 5）
 * - **Evolution History**：`evolution.md` + `history/`（Task 6）
 *
 * ## 三条不变式
 *
 * 1. **最小 Paper 只需要 `paper.md`**（§5）：其余文件**按需产生**，缺文件不是错误。
 *    `readPaper` 对缺文件一律返回空值而不是抛错。
 * 2. **不删除性覆盖**（§12）：每次版本推进先把当前正文归档到 `history/v<version>.md`，
 *    旧版本永远可读；`restore` 可以回到任意历史版本。
 * 3. **Paper 不被"写完"**（§27）：`status: evolving` 是常态；不存在"完成"状态。
 *    `frozen` 只是"暂时不再演化"，仍可恢复为 `evolving`。
 */
import { type EvolutionEvent, type PaperClaimEntry, type PaperDocument, type PaperEvidenceEntry, type PaperMetadata, type PaperVersionEntry } from './paper-data.js';
/** Paper 目录（绝对）。 */
export declare function paperDir(workspace: string, paperId?: string): string;
/** 相对 workspace 的 Paper 目录。 */
export declare function paperRelDir(paperId?: string): string;
/** 序列化 metadata.md（frontmatter + 人类可读摘要）。 */
export declare function serializeMetadata(meta: PaperMetadata): string;
/** 列出全部 Paper id。 */
export declare function listPaperIds(workspace: string): string[];
/**
 * 读一个 Paper（缺文件 → 空值，**不抛错**）。
 *
 * @returns Paper 文档；Paper 目录与 `paper.md` 都不存在时返回 `null`
 */
export declare function readPaper(workspace: string, paperId?: string): PaperDocument | null;
export interface PaperWriteError {
    error: string;
}
export declare function isPaperWriteError(v: unknown): v is PaperWriteError;
/** 最小 Paper 正文骨架（§7 的推荐章节；**可裁剪**）。 */
export declare function manuscriptTemplate(title?: string): string;
/**
 * 创建 Paper（Task 1 create）。
 *
 * 最小形态只需要 `paper.md`（§5）。
 */
export declare function createPaper(workspace: string, input?: {
    id?: string;
    title?: string;
    researchDomain?: string;
    targetVenue?: string;
    authors?: string;
    researchProject?: string;
    researchStateVersion?: string;
    /** 自定义正文；缺省用 {@link manuscriptTemplate}。 */
    manuscript?: string;
}): PaperDocument | PaperWriteError;
/** 更新 metadata（不改正文）。 */
export declare function updatePaperMetadata(workspace: string, paperId: string, patch: Partial<Omit<PaperMetadata, 'id'>>): PaperDocument | PaperWriteError;
/** 整体保存正文（编辑器路径）。 */
export declare function saveManuscript(workspace: string, paperId: string, manuscript: string): PaperDocument | PaperWriteError;
/** 替换单个章节（其余内容原样保留）。章节不存在则追加。 */
export declare function updatePaperSection(workspace: string, paperId: string, section: string, body: string): PaperDocument | PaperWriteError;
/** 递增论文版本：`0.4` → `0.5`。 */
export declare function bumpPaperVersion(version: string, kind?: 'minor' | 'major'): string;
/** 归档当前版本（`history/v<version>.md`），幂等。 */
export declare function archivePaperVersion(workspace: string, paperId: string, options?: {
    reason?: string;
    version?: string;
}): PaperVersionEntry | undefined;
/** 列出历史版本。 */
export declare function listPaperVersions(workspace: string, paperId: string): PaperVersionEntry[];
/** 读某个历史版本正文（含归档注释，便于追溯原因）。 */
export declare function readPaperVersion(workspace: string, paperId: string, version: string): string | undefined;
/**
 * 还原到某个历史版本（Task 1 restore）。
 *
 * ⚠️ 还原本身也是一次演化：**先把当前正文归档**，再写入历史内容，并递增版本，
 * 因此还原不会丢掉还原前的状态（§12 不删除性覆盖）。
 */
export declare function restorePaperVersion(workspace: string, paperId: string, version: string, reason?: string): PaperDocument | PaperWriteError;
/** 正文 diff（Task 2 diff）：按行给出统一格式的差异。 */
export declare function diffManuscript(workspace: string, paperId: string, other: {
    version?: string;
    text?: string;
}): {
    added: string[];
    removed: string[];
    changedLines: number;
} | PaperWriteError;
/**
 * 读 Claim Map（`claims.md`）。
 *
 * 若文件不存在，则**从正文推导**一个初始映射：正文里出现的 `C001` / `E001` 引用
 * 会被收集起来，这样即使用户没有手工维护 Claim Map，Paper 也能回答
 * "这句话对应哪个 Claim"（§8 的意图）。
 */
export declare function readClaimMap(workspace: string, paperId?: string): PaperClaimEntry[];
/** 从正文推导 Claim → Sections（§8 的 `Paper Sections` 部分）。 */
export declare function deriveClaimMapFromManuscript(paper: PaperDocument): PaperClaimEntry[];
/** 写 Claim Map（由 `research/claims/*.md` 与正文引用合成，不新增事实）。 */
export declare function writeClaimMap(workspace: string, paperId: string, entries: readonly PaperClaimEntry[]): string;
/**
 * 构建 Evidence Map：`evidence id → { supports, contradicts, sections }`。
 *
 * 从 Claim Map + 正文引用推导。这回答了 §9 的两个问题：
 * "这个实验结果最终被论文哪里使用了？" 与
 * "如果删除 Evidence E008，会影响论文哪些结论？"
 */
export declare function buildEvidenceMap(workspace: string, paperId?: string): PaperEvidenceEntry[];
/** 写 Evidence Map（`evidence.md`）。 */
export declare function writeEvidenceMap(workspace: string, paperId: string, entries: readonly PaperEvidenceEntry[]): string;
/** 读演化事件索引。 */
export declare function listEvolutionEvents(workspace: string, paperId?: string): EvolutionEvent[];
/**
 * 记录一次演化事件（Task 6）。
 *
 * 同时更新：
 *   - `evolution.json`（机器索引，§29）
 *   - `evolution.md`（人类可读叙述，§29 强调说明仍放 Markdown）
 */
export declare function recordEvolutionEvent(workspace: string, paperId: string, event: Omit<EvolutionEvent, 'id' | 'timestamp'> & {
    id?: string;
    timestamp?: string;
}): EvolutionEvent;
/** 归档 Paper（不是删除：置 `status: archived`，正文与历史都保留）。 */
export declare function archivePaper(workspace: string, paperId: string): PaperDocument | PaperWriteError;
/** 从归档恢复为演化中。 */
export declare function restoreArchivedPaper(workspace: string, paperId: string): PaperDocument | PaperWriteError;
/** 冻结（暂时不再演化）—— 与归档不同，仍视为当前论文。 */
export declare function freezePaper(workspace: string, paperId: string): PaperDocument | PaperWriteError;
/**
 * 彻底删除 Paper（含历史）。
 *
 * ⚠️ 与 Evidence 的规则一致（Stage 4 §9）：**归档优先**。删除仅用于误建场景，
 * 因此要求显式 `confirm`，且不删除任何 `research/` 下的证据。
 */
export declare function deletePaper(workspace: string, paperId: string, options?: {
    confirm?: boolean;
}): {
    ok: true;
    id: string;
} | PaperWriteError;
//# sourceMappingURL=paper.d.ts.map