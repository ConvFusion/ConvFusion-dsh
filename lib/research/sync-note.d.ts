/**
 * 「待同步便签」：下载成功时记一笔"这个 ZIP 是哪项研究"，供 `/research sync` 读取。
 *
 * ## 为什么需要它
 *
 * 同步的**判定**（同一项研究 → 融合；另一项 → 先备份再换）取决于两端的
 * `workspace_id`：本机那份读得到（`<研究根>/.convfusion/work.json`），
 * 下载的这份**只有下载那一刻才知道** —— 它来自 `mentor/download` 的响应
 * （归档响应头 `X-Workspace-Id` 为权威）。
 *
 * 下载完就把它写下来，之后 `/research sync @那个.zip` 才不用再猜：
 *
 * ```text
 * 下载时  : mentor/download 成功 → putSyncNote({ zipPath, remoteWorkspaceId, … })
 * 同步时  : /research sync @x.zip → getSyncNote(realpath(x.zip)) → 精确判定
 * ```
 *
 * 查不到便签也**不是错误**（用户可能换了台机器、挪过文件、或用了旧版本下载）：
 * 那时判定退化为 `unverifiable` —— sync 技能的第一步就是只读盘查 + 让用户确认，
 * 功能不缺失，只是少一个自动化结论。
 *
 * ## 存储
 *
 * 与身份注册表同目录（`$DSH_HOME/convfusion/`）的一个 JSON 文件，键是 ZIP 的
 * **规范化绝对路径**（`realpath` 优先 —— macOS 上 `/var` 与 `/private/var` 是同一处，
 * 只用字符串比较会查不到）。
 */
/** 一条便签：这次下载的是"哪项研究"。 */
export interface SyncNote {
    /** 落盘后的 ZIP 绝对路径（规范化）。 */
    zipPath: string;
    /** 服务器给这项研究的标识（权威值）。 */
    remoteWorkspaceId: string | null;
    /** 服务器上的项目 id（排查用）。 */
    projectId: string | null;
    /** 项目标题（只用于展示与备份名建议）。 */
    projectTitle: string | null;
    /** 服务器地址（写进身份文件时用）。 */
    serverUrl: string | null;
    /** 下载的是哪一侧：`owner` = 导师拿学生的工作区，`mentor` = 研究者取回回传那份。 */
    source: 'owner' | 'mentor' | null;
    /** 记录时间（ISO）。 */
    savedAt: string;
}
export interface SyncNoteStore {
    get(zipPath: string): SyncNote | undefined;
    put(note: SyncNote): void;
    all(): SyncNote[];
}
/** 便签最多留这么多条（按时间取最新；超出就丢最旧的）。 */
export declare const SYNC_NOTE_LIMIT = 50;
/**
 * ZIP 路径的**规范化形式**（存储与查询都用它）。
 *
 * `realpath` 优先：macOS 上 `/var/folders/...` 与 `/private/var/folders/...` 是同一处，
 * 下载时写的是前者、命令解析出来可能是后者 —— 只按字符串比就会"查不到便签"。
 * 文件不在（还没落盘 / 已删）时退回 `resolve()`。
 */
export declare function canonicalZipPath(zipPath: string): string;
/** 文件后端（宿主用）。`resolvePath()` 每次现取，配置改了立刻生效。 */
export declare function createFileSyncNoteStore(resolvePath: () => string): SyncNoteStore;
/** 内存后端（未配置路径 / 自检用）。 */
export declare function createMemorySyncNoteStore(): SyncNoteStore;
//# sourceMappingURL=sync-note.d.ts.map