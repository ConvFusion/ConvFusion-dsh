import { REVIEW_DIR } from './workspace-layout.js';
export { REVIEW_DIR };
/** `review/` 下的一个待上传文件。 */
export interface ReviewFile {
    /** 研究根相对路径，已带 `review/` 前缀（直接作为服务器的 `relative_paths`）。 */
    relPath: string;
    size: number;
}
/**
 * 把一个不可信的相对路径解析成根目录下的**安全**绝对路径。
 *
 * 绝对路径、空、`..`、以及规范化后逃出根目录的路径一律拒绝。拿到不可信的相对路径
 * 就往磁盘上写，一个被篡改的值就能写到 `~/.ssh/authorized_keys`。
 *
 * @returns 绝对路径；不安全时返回 `null`。
 */
export declare function safeJoin(root: string, relativePath: string): string | null;
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
/** 一次落盘的结果。 */
export interface WrittenFile {
    /** 实际写出的绝对路径（重名时名字与请求的不同）。 */
    path: string;
    /** 实际写出的文件名。 */
    name: string;
    bytes: number;
}
/** 把一段用户可见的文字变成**安全的文件名片段**（去掉分隔符与危险片段）。 */
export declare function safeDirName(raw: string, fallback?: string): string;
/**
 * 把一个文件写进目录，**绝不覆盖已有文件**（同名就加 `-2`、`-3`…）。
 *
 * 这是"下载只是把 .zip 存下来"的直接后果：目标目录里原来的东西一个都不动，
 * 所以任何工作区都能安全地当目标（用户 2026-09 拍板：不必因此禁用工作区）。
 */
export declare function writeFileUnique(dir: string, rawName: string, bytes: Uint8Array): WrittenFile;
//# sourceMappingURL=workspace-sync.d.ts.map