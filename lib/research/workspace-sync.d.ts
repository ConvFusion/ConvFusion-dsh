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
 * 一个**流式**落盘目标：先写临时文件，**校验通过才改名**成正式名字。
 *
 * ## 为什么不是"收完再写"
 *
 * 2026-09 用户反馈：【指导中】点【下载】一直「读取中…」，磁盘上什么也没有。
 * 实测那个工作区的 ZIP 是 13.6 MB、链路 ~118 KB/s → **115 秒**；而旧写法
 * （`arrayBuffer()` 收完再 `writeFileSync`）在这 115 秒里既看不到字节、也看不到进度，
 * 只有一句「读取中…」—— 慢与死长得一模一样。
 *
 * 所以改成边收边写：
 *   - 界面上"已下载 x MB"是**真的**（字节确实在盘上）；
 *   - 内存不随文件大小增长（旧写法整包驻留内存）；
 *   - 半成品叫 `.convfusion-<hex>.zip.part`，**不占正式名字**，失败就删掉。
 *
 * ## 为什么要校验
 *
 * 生产实测出现过一次：HTTP 200、响应头正常，正文传到 126 KB 就结束了 —— 得到一个
 * **没有 EOCD 的坏 ZIP**。旧写法会把它写下来并报「已保存」，用户解压时才发现。
 * `commit` 因此先查 ZIP 结尾的 EOCD（中央目录结束记录）与条目数，不合格**抛错**。
 */
export interface DownloadPart {
    /** 已经写到盘上的字节数（进度用）。 */
    readonly received: number;
    /** 顺序追加一块。 */
    write(chunk: Uint8Array): void;
    /**
     * 校验后改名成正式名字（同名自动加序号，**绝不覆盖**）。
     *
     * @param rawName 服务器给的或客户端兜底的文件名
     * @param expect 服务器声明的条目数（`X-File-Count`）；对不上就是没传全
     * @throws 校验不通过时抛错，并已清掉临时文件（不留半成品、绝不报成功）
     */
    commit(rawName: string, expect?: {
        fileCount?: number | null;
    }): WrittenFile;
    /** 放弃这次下载：关掉并删掉临时文件。 */
    abort(): void;
}
/**
 * 开一个**流式下载目标**（临时文件 + 校验 + 改名）。
 *
 * @param dir 目标工作区目录（写在这里，不进 `<工作区>/workspace/` 研究数据区）
 * @param nameHint 只用来给临时文件起个可读的前缀；正式名字在 `commit` 时定
 */
export declare function openDownloadPart(dir: string, nameHint?: string): DownloadPart;
//# sourceMappingURL=workspace-sync.d.ts.map