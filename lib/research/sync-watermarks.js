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
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
/** 存储键：**同一台服务器 + 同一个项目**（不含账号，理由见文件头）。 */
export function syncWatermarkKey(serverUrl, projectId) {
    return `${serverUrl.trim()}|${projectId.trim()}`;
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** 坏记录直接丢掉（半截数据比缺一条更麻烦）。 */
function parseRecord(raw) {
    if (!isRecord(raw))
        return undefined;
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.trim() : '';
    if (!updatedAt)
        return undefined;
    const fileCount = typeof raw.fileCount === 'number' && Number.isFinite(raw.fileCount) && raw.fileCount >= 0
        ? Math.trunc(raw.fileCount)
        : raw.fileCount === null
            ? null
            : undefined;
    if (fileCount === undefined)
        return undefined;
    return {
        updatedAt,
        fileCount,
        downloadedAt: typeof raw.downloadedAt === 'string' ? raw.downloadedAt : '',
    };
}
function parseTable(text) {
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        return {};
    }
    if (!isRecord(data))
        return {};
    const out = {};
    for (const [key, value] of Object.entries(data)) {
        const record = parseRecord(value);
        if (record)
            out[key] = record;
    }
    return out;
}
/** 文件存储（`index.ts` 注入真实路径；延迟求值 = 设置里改了目录立刻生效）。 */
export function createFileSyncWatermarkStore(resolvePath) {
    const load = () => {
        try {
            const path = resolvePath();
            if (!existsSync(path))
                return {};
            return parseTable(readFileSync(path, 'utf8'));
        }
        catch {
            return {};
        }
    };
    const save = (table) => {
        const path = resolvePath();
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        writeFileSync(tmp, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
        renameSync(tmp, path);
    };
    return {
        get: (serverUrl, projectId) => load()[syncWatermarkKey(serverUrl, projectId)],
        set: (serverUrl, projectId, watermark) => {
            const table = load();
            table[syncWatermarkKey(serverUrl, projectId)] = watermark;
            save(table);
        },
        all: () => load(),
        get path() {
            return resolvePath();
        },
    };
}
/** 内存存储（离线验证 / 精简环境）。 */
export function createMemorySyncWatermarkStore(seed = {}) {
    const table = { ...seed };
    return {
        get: (serverUrl, projectId) => table[syncWatermarkKey(serverUrl, projectId)],
        set: (serverUrl, projectId, watermark) => {
            table[syncWatermarkKey(serverUrl, projectId)] = watermark;
        },
        all: () => ({ ...table }),
        path: '(memory)',
    };
}
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
export function checkStudentChange(watermark, serverUpdatedAt, serverFiles) {
    /*
     * 没有水位 = 从没成功下载过 → **明确说"该下载"**，而不是"无从判断"。
     *
     * 这里原来返回 `null`（归到"无从判断"那一档），于是导师第一次进【指导中】
     * 什么提示都没有 —— 但他手里连一份副本都没有，这正是最该提示下载的情形。
     */
    if (!watermark)
        return { neverDownloaded: true };
    let uploaded = false;
    let uploadedKnown = false;
    if (typeof serverUpdatedAt === 'string' && serverUpdatedAt.trim()) {
        const now = Date.parse(serverUpdatedAt);
        const then = Date.parse(watermark.updatedAt);
        // 解析失败（格式怪 / 空串）→ 该分支未知，不能据此下结论
        if (Number.isFinite(now) && Number.isFinite(then)) {
            uploadedKnown = true;
            uploaded = now > then;
        }
    }
    let deleted = false;
    let deletedKnown = false;
    if (typeof serverFiles === 'number' && Number.isFinite(serverFiles)) {
        if (watermark.fileCount !== null) {
            deletedKnown = true;
            deleted = Math.trunc(serverFiles) !== watermark.fileCount;
        }
    }
    // 有证据就报（任何一个分支说"变过"）
    if (uploadedKnown && uploaded)
        return { changed: true, reason: 'uploaded' };
    if (deletedKnown && deleted)
        return { changed: true, reason: 'deleted' };
    // 两个判据**都**可判且都说"没变"才断言没变；只有一半可用 → 无从判断
    if (uploadedKnown && deletedKnown)
        return { changed: false, reason: null };
    return null;
}
//# sourceMappingURL=sync-watermarks.js.map