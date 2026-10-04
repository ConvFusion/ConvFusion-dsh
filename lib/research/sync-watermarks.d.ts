/**
 * 导师【下载】之后的**水位** —— "学生是不是又改了文件"这件事的本地记忆。
 *
 * ## 它记的是什么
 *
 * 每次成功下载**学生那一侧**（`source=owner`）的 ZIP，就从**那次归档响应本身**记下两个数：
 *
 * ```text
 * updatedAt  = X-Source-Updated-At    ← 这一版的水位（= 列表的 workspace_updated_at）
 * fileCount  = X-File-Count           ← 快照口径（默认非 all_versions）= workspace_files
 * ```
 *
 * 下一轮轮询 `mentor/list` 时（服务器给 `workspace_updated_at` / `workspace_files`）：
 *
 * ```text
 * workspace_updated_at > updatedAt → 学生传了新文件 → 提示重新下载
 * workspace_files      ≠ fileCount → 学生删了文件   → 提示重新下载
 * ```
 *
 * ## 为什么水位必须取自归档响应，而不是下载前后那一次列表
 *
 * （服务器 API.md §13 与 CHANGELOG 的原话，理由照抄在此，免得将来"顺手简化"。）
 *
 * - 下载**前**从列表里取：那个值可能比 ZIP **旧** —— 多提示一次，不漏；
 * - 下载**之后**再拉一次列表：可能比 ZIP **新** —— **会漏文件**（学生在你下载的
 *   那两分钟里又传了一个，你却把"更晚"的水位记成"已看过"）。
 * 只有归档自己报的才是"我拿到的这一版"。
 *
 * ## 为什么两个条件缺一不可
 *
 * 时间戳**看不到删除**（删文件不会让 `MAX(created_at)` 前进），文件数**看不到改写**
 * （改同一个路径只动时间戳、数量不变）。所以一个存不够。
 *
 * ## 为什么键里不含 accountId
 *
 * 读水位的是 `mentor/list`（每次刷新都要读），为此多发一次 `fetchAccount` 正是
 * review_files 那轮刚消掉的 1+N 里的那个 N。同一服务器换账号的极端情况下，
 * 新账号**第一次**轮询可能不提示（漏一次提示的代价 << 每次刷新多一次往返），
 * 该账号自己下载过一次后自愈。
 *
 * ## 存储位置与容错
 *
 * 与已发布映射同目录（`$DSH_HOME/convfusion/sync-watermarks.json`，由 `index.ts` 解析），
 * 写入用「临时文件 + rename」，坏 JSON 当空表（**绝不**让插件起不来）。
 * 内存版供离线验证与精简环境。
 */
/** 一次下载留下的水位。 */
export interface SyncWatermark {
    /**
     * 这一版的水位（ISO-8601，来自 `X-Source-Updated-At`）。
     *
     * 与列表的 `workspace_updated_at` **同一台服务器生成**，直接 `Date.parse` 比大小即可。
     */
    updatedAt: string;
    /**
     * 这一版的条目数（来自 `X-File-Count`；默认快照口径下恒等于 `workspace_files`）。
     *
     * `null` = 老服务器没给这个头 —— 文件数判据转为"未知"，
     * **时间戳判据仍然可用**（一半信息也要用，不因为缺一半就整个放弃）。
     */
    fileCount: number | null;
    /** 本机落盘完成的时刻（只作诊断与日志，**不参与比较**）。 */
    downloadedAt: string;
}
/**
 * "导师手里这份工作区是不是最新"的判读结果。
 *
 * | 情形 | 值 | 界面 |
 * |---|---|---|
 * | **从没下载过** | `{ neverDownloaded: true }` | 提示"先下载"——**手里没有副本本身就是该下载的理由** |
 * | 下载过、学生又动过 | `{ changed: true, reason: 'uploaded' \| 'deleted' }` | 提示"学生更新了 / 删除了，需要重新下载" |
 * | 下载过、学生没动 | `{ changed: false, reason: null }` | 不提示 |
 *
 * `null`（函数返回 `null`）单独表示**无从判断**：旧服务器不给列表字段、
 * 服务器说不可知、或只有一半判据可用 —— 三种都不该编造"有更新"，也不该说"没更新"。
 *
 * ⚠️ **"从没下载过"必须与"无从判断"分开**（2026-10 用户指出）：
 * 导师手里没有这个工作区的副本时，"学生有没有更新"其实不重要 —— 他**反正要下载一次**。
 * 早先把两者都塞进 `null`，结果是"没下载过"也一声不吭（真实反馈：导师在【指导中】
 * 看不到任何提示，而学生明明已经更新过了）。
 */
export type StudentSyncCheck = 
/** 本地没有这个项目的水位 = 从没成功下载过 → 该下载（与"无从判断"是两件事）。 */
{
    neverDownloaded: true;
}
/** 下载过，且学生那一侧动过（时间戳变大 / 文件数变了）。 */
 | {
    changed: true;
    reason: 'uploaded' | 'deleted';
}
/** 下载过，两个判据都说没动。 */
 | {
    changed: false;
    reason: null;
};
export interface SyncWatermarkStore {
    /** 读一条水位（没有下载记录 → `undefined`，**不是**"没更新"）。 */
    get(serverUrl: string, projectId: string): SyncWatermark | undefined;
    /** 写一条水位（覆盖同项目的旧值）。 */
    set(serverUrl: string, projectId: string, watermark: SyncWatermark): void;
    /** 全部记录（只读快照；设置页 / 日志展示用）。 */
    all(): Record<string, SyncWatermark>;
    /** 落盘位置（离线环境是 `(memory)`）。 */
    readonly path: string;
}
/** 存储键：**同一台服务器 + 同一个项目**（不含账号，理由见文件头）。 */
export declare function syncWatermarkKey(serverUrl: string, projectId: string): string;
/** 文件存储（`index.ts` 注入真实路径；延迟求值 = 设置里改了目录立刻生效）。 */
export declare function createFileSyncWatermarkStore(resolvePath: () => string): SyncWatermarkStore;
/** 内存存储（离线验证 / 精简环境）。 */
export declare function createMemorySyncWatermarkStore(seed?: Record<string, SyncWatermark>): SyncWatermarkStore;
/**
 * 判读：**上一次下载之后，学生那一侧动过吗？**
 *
 * 四种结果，**"该下载"与"无从判断"分开**：
 *
 * | 情况 | 返回 | 为什么 |
 * |---|---|---|
 * | 从没下载过（`wm` 缺失） | `{ neverDownloaded: true }` | 手里没有副本 → **该下载**（不需要知道学生有没有动过） |
 * | 旧服务器不给列表字段 | `null` | 服务器这一版不会说 → 不编造 |
 * | 服务器说不可知（`null`） | `null` | 查不到 ≠ 没有（三态纪律） |
 * | 只有一半判据可用（如 `fileCount` 是 `null`） | `null` | 查不全 ≠ 没变（会漏掉那次看不见的删除） |
 *
 * 已知的判据才说话，且**只有两个判据都可判时**才敢说"没动"：
 * - `serverUpdatedAt > wm.updatedAt` → `uploaded`（时间戳变大 = 传了新文件）；
 * - `serverFiles !== wm.fileCount` → `deleted`（文件数变了而时间戳没前进 = 删了文件）；
 * - 只要**任一**已知判据说"变过" → `changed: true`（有证据就不放过）；
 * - **只有一半判据可用**（另一半未知）→ `null`：拿"时间戳没变"去断言"没变过"会
 *   漏掉那次看不见的删除 —— 查不全 ≠ 没变（同三态纪律）。
 *
 * 两条互补、缺一不可：**删除**不会让时间戳前进（可能原地不动），
 * **改同一个路径**只让时间戳前进、文件数不变。
 *
 * @param watermark 本地存的水位（`undefined` = 从没下载过）
 * @param serverUpdatedAt 列表里的 `workspace_updated_at`（三态）
 * @param serverFiles 列表里的 `workspace_files`（三态）
 */
export declare function checkStudentChange(watermark: SyncWatermark | undefined, serverUpdatedAt: string | null | undefined, serverFiles: number | null | undefined): StudentSyncCheck | null;
//# sourceMappingURL=sync-watermarks.d.ts.map