/**
 * ConvFusion 2.0 — **本机研究工作 ↔ 服务器项目** 的映射（落盘）
 *
 * ## 为什么必须有这份映射
 *
 * 【研究工作 · 我的】里的一个本机工作区，在 ConvFusion.com 上对应一个
 * Research Project（`project_id`）。没有映射的话，每点一次「寻找指导」都会
 * **新建一个项目** —— 网络里很快会出现同一个研究的一堆副本，而且没有一个能持续更新。
 *
 * ```text
 * <研究根目录（realpath）>  →  { projectId, serverUrl, accountId, version, … }
 * ```
 *
 * ## 为什么存在 `$DSH_HOME` 而不是工作区里
 *
 * `project_id` 是**「(哪台服务器, 哪个账号) 下的对象」**：
 *
 * - 同一个工作区被两个账号（或两台服务器）发布 → 必须是两个不同的项目；
 * - 工作区可能在共享盘上，而凭据是本机、本账号的。
 *
 * 所以映射属于**这台机器的这个 DSH 用户**，放在 `$DSH_HOME/convfusion/` 下，
 * 与 Skill 定制同一个目录（都经 `config.ts` 的路径解析）。
 * 记录里带 `serverUrl` 与 `accountId`：换服务器或换账号时**不重用**旧项目
 * （服务器上 `GET /projects/{id}` 是 owner-only，重用只会得到 404，
 * 与其撞上去再补救，不如按记录里的归属直接新建）。
 *
 * ## 容错
 *
 * 与定制文件同款：坏 JSON / 非对象 / 值类型不对 → 当作空表（**绝不**让插件起不来），
 * 写入用「临时文件 + rename」，避免半截文件。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** 单条记录的形状校验（坏记录直接丢掉，不留半截数据）。 */
function parseRecord(raw) {
    if (!isRecord(raw))
        return undefined;
    const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
    const serverUrl = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '';
    const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : '';
    const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0;
    if (!projectId || !serverUrl)
        return undefined;
    return {
        projectId,
        serverUrl,
        accountId,
        version,
        ...(typeof raw.contentHash === 'string' && raw.contentHash ? { contentHash: raw.contentHash } : {}),
        ...(isRecord(raw.files)
            ? {
                files: Object.fromEntries(Object.entries(raw.files).filter((e) => typeof e[1] === 'string')),
            }
            : {}),
        ...(Array.isArray(raw.selection)
            ? { selection: raw.selection.filter((x) => typeof x === 'string') }
            : {}),
        publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : '',
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
        ...(typeof raw.serverVisibility === 'string' && raw.serverVisibility
            ? { serverVisibility: raw.serverVisibility }
            : {}),
        ...(typeof raw.checkedAt === 'string' && raw.checkedAt ? { checkedAt: raw.checkedAt } : {}),
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
    for (const [root, value] of Object.entries(data)) {
        const record = parseRecord(value);
        if (record)
            out[root] = record;
    }
    return out;
}
/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制同款：设置里改了目录立刻生效）
 */
export function createFilePublishedStore(resolvePath) {
    const load = () => {
        const path = resolvePath();
        try {
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
        get: (root) => load()[root],
        set: (root, record) => {
            const table = load();
            table[root] = record;
            save(table);
        },
        remove: (root) => {
            const table = load();
            if (!(root in table))
                return;
            delete table[root];
            save(table);
        },
        all: () => load(),
        get path() {
            return resolvePath();
        },
    };
}
/** 内存存储（离线验证 / 精简环境）。 */
export function createMemoryPublishedStore(seed = {}) {
    const table = { ...seed };
    return {
        get: (root) => table[root],
        set: (root, record) => {
            table[root] = record;
        },
        remove: (root) => {
            delete table[root];
        },
        all: () => ({ ...table }),
        path: '(memory)',
    };
}
//# sourceMappingURL=published-store.js.map