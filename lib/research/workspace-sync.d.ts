/**
 * 导师交付指导结果的目录名（相对**研究根**）。
 *
 * 服务器把这个前缀保留给关系方（`docs/API.md` §13.1）：导师只能写 `review/**`，
 * 结构上改不了 `project.md` / `research-state.md` 这些研究事实。
 */
export declare const REVIEW_DIR = "review";
/** `review/` 下的一个待上传文件。 */
export interface ReviewFile {
    /** 研究根相对路径，已带 `review/` 前缀（直接作为服务器的 `relative_paths`）。 */
    relPath: string;
    size: number;
}
/**
 * 把一个不可信的相对路径解析成根目录下的**安全**绝对路径。
 *
 * 绝对路径、空、`..`、以及规范化后逃出根目录的路径一律拒绝 —— 拿到不可信的
 * 相对路径就往磁盘上写，一个被篡改的值就能写到 `~/.ssh/authorized_keys`。
 *
 * @returns 绝对路径；不安全时返回 `null`。
 */
export declare function safeJoin(root: string, relative: string): string | null;
/**
 * 列出某个工作区里 `review/` 下的全部文件。
 *
 * 为什么以**目录**为输入而不是单个文件：导师的交付物可能带子目录
 * （`review/figures/x.png`），服务器要求 `relative_paths` 保留目录层次，
 * 所以必须能枚举出整棵树。
 *
 * @param dir 用户选的工作区目录（会话工作区**或**研究根都行，按 `researchWorkspaceOf` 判）。
 */
export declare function scanReviewFiles(dir: string): {
    researchRoot: string;
    reviewDir: string;
    files: ReviewFile[];
};
/** 读一个 `review/` 文件的字节（上传用；路径必须已在 `review/` 下）。 */
export declare function readReviewFile(researchRoot: string, relPath: string): Uint8Array;
//# sourceMappingURL=workspace-sync.d.ts.map