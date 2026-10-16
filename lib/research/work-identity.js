/**
 * ConvFusion 2.0 — **这项研究是谁**（`workspace_id` 的本地侧）
 *
 * ## 它解决什么问题
 *
 * 【指导中】的【下载】要把别人的工作区快照存进用户选的工作区。存之前必须回答一个问题：
 * **这个工作区里已有的 `workspace/`，和我要下载的是不是同一项研究？**
 *
 * - 同一个 → 允许下载，之后由 agent 把两份内容**融合**（不是覆盖）；
 * - 另一个 → **拒绝**，否则两份不同的研究会被搅在一起。
 *
 * 判据只能来自服务器：它给"一项研究工作"一个**全局唯一、跨项目生命周期不变**的标识
 * `workspace_id`（`ws_<32 hex>`；改题、改描述、项目删掉重建、重新发布都不变 ——
 * 服务器侧规格见 `dev-notes/v3-Workspace-Identity-API.md`）。
 * 本模块负责**本地这一半**：把那个标识记下来、读回来、并给出判定。
 *
 * ## 为什么不用研究主题（也别用 project_id）
 *
 * - **主题会变**：改题、换角度、服务器侧改标题都会改 → 同一项研究被判成"另一项" →
 *   **误禁下载**，比不校验更糟；
 * - **`project_id` 是"一次发布"的 id**：项目在服务器上失效后重建，id 就换了
 *   （`published-store.ts` 的既有行为就是"死掉的 id 就新建项目"）→ 同样误判。
 *
 * ## 两级记录
 *
 * | 级别 | 位置 | 什么时候写 | 为什么 |
 * |---|---|---|---|
 * | ① 工作区内标记 | `<研究根>/.convfusion/work.json` | 下载成功后（研究根已存在）/ **整合提示词让 agent 写** | **权威、可移植**：工作区被复制、搬到另一台机器后仍然自证身份 |
 * | ② 插件侧注册表 | `$DSH_HOME/convfusion/work-identities.json` | 下载成功时 / 上传时 | **解压之前**就能判定；标记缺失时的兜底 |
 *
 * 读取优先级 ① → ②；两者都在且**值不同** → 报冲突（`conflict`），由界面说清楚，
 * **绝不静默取一个**（取错了就是"把 A 的研究融合进 B 的工作区"）。
 *
 * 为什么标记放在 `<研究根>/.convfusion/` 而不是工作区根？现有设计刻意把
 * **用户材料**（工作区根，ZIP 落在这里）与**研究数据**（`workspace/`）分开
 * （见 `settings-rpc.ts` 的 `mentor/download`）。身份属于"这项研究"，
 * 所以放研究根下的插件自有元数据目录：不污染研究内容，也不与用户文件混在一起。
 * 上传侧把 `.convfusion` 列为跳过的机器产物目录（`upload-selection.ts` 的 `JUNK_DIRS`），
 * 所以这个标记不会被当成项目文件传上去。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
/** 研究根下的插件元数据目录（研究根相对）。 */
export const WORK_META_DIR = '.convfusion';
/** 身份标记在研究根里的相对路径（**研究根相对**，与归档内路径同一口径）。 */
export const WORK_MARKER_REL = `${WORK_META_DIR}/work.json`;
/**
 * 一个字符串是不是服务器给的标识。
 *
 * **刻意宽松**：服务器是格式的权威，插件只用来把"给了值"与"没给/给了个空的"分开 ——
 * 将来服务器换前缀、加长 hex 都不该让插件把值当成"没给"（那会静默退化成"无法校验"）。
 * 判据只要求：`ws_` 开头、后面至少 16 位十六进制（当前是 32 位）。
 */
export function isWorkspaceId(value) {
    return typeof value === 'string' && /^ws_[0-9a-f]{16,}$/i.test(value.trim());
}
/**
 * 研究根的**指纹**：`project.md` frontmatter 里的 `created_at`。
 *
 * ## 它解决什么
 *
 * 用户会在**同一个会话工作区**里换进换出多项研究（把当前 `workspace/` 改名、
 * 把另一项研究改名成 `workspace/`）。凡是**以路径为键**的本机记录
 * （发布记录、身份注册表）都会被新占用者继承 —— 那意味着"把 A 的发布写进 B"
 * 或者"允许 B 的快照写进 A 的研究"。
 *
 * 指纹就是为这两种情况准备的判据：**同一条路径，住的是不是当初那项研究**。
 *
 * ## 为什么用 `created_at`
 *
 * - 它在创建研究根时写下（`project.md` 的 frontmatter），之后**从不改动**；
 * - 它**跟着目录走**：改名、移动、备份、恢复都不变 —— 这正是我们要的语义
 *   （身份跟着研究走，路径只是"当前住址"）；
 * - 同一项研究的两份拷贝共享它（`.convfusion/work.json` 也共享），所以
 *   "同一项研究的另一个快照"不会被误判成"另一项研究"。
 *
 * 读不到（没有 `project.md` / 没有该字段）→ `null` = **不知道**，调用方按"不拦"处理。
 */
export function researchRootFingerprint(researchRoot) {
    try {
        const text = readFileSync(join(researchRoot, 'project.md'), 'utf8');
        const m = /^created_at:[ \t]*(.+)$/m.exec(text);
        const value = m?.[1]?.trim();
        return value ? value : null;
    }
    catch {
        return null;
    }
}
/** `workspace_id` 的规范形（小写、去空白）；非法 → `null`。 */
export function normalizeWorkspaceId(value) {
    if (!isWorkspaceId(value))
        return null;
    return value.trim().toLowerCase();
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asRole(v) {
    return v === 'owner' ? 'owner' : 'mentor';
}
/** 标记文件的绝对路径。 */
export function workMarkerPath(researchRoot) {
    return join(researchRoot, WORK_META_DIR, 'work.json');
}
/**
 * 读工作区里的标记。
 *
 * 容错纪律与 `published-store` 同款：文件不在 / 坏 JSON / 形状不对 → `undefined`
 * （**绝不抛**，也绝不把坏值当成一个 id 用）。
 *
 * ⚠️ 只认 `workspace_id` 一个字段为必需：标记可能是**用户会话里的 agent** 按提示词写的，
 * 缺 `project_id` 之类的附加信息不影响判定。
 */
export function readWorkMarker(researchRoot) {
    let raw;
    try {
        const path = workMarkerPath(researchRoot);
        if (!existsSync(path))
            return undefined;
        raw = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return undefined;
    }
    if (!isRecord(raw))
        return undefined;
    // 兼容两种写法：服务器风格的 snake_case（提示词里写的就是它）与驼峰
    const id = normalizeWorkspaceId(raw.workspace_id ?? raw.workspaceId);
    if (!id)
        return undefined;
    const pick = (a, b) => {
        const v = typeof a === 'string' && a.trim() ? a.trim() : typeof b === 'string' && b.trim() ? b.trim() : '';
        return v || undefined;
    };
    return {
        workspaceId: id,
        ...(pick(raw.project_id, raw.projectId) ? { projectId: pick(raw.project_id, raw.projectId) } : {}),
        ...(pick(raw.server_url, raw.serverUrl) ? { serverUrl: pick(raw.server_url, raw.serverUrl) } : {}),
        ...(typeof raw.role === 'string' && raw.role.trim() ? { role: asRole(raw.role) } : {}),
        ...(pick(raw.synced_at, raw.updatedAt) ? { syncedAt: pick(raw.synced_at, raw.updatedAt) } : {}),
    };
}
/**
 * 写工作区里的标记（**临时文件 + rename**，避免半截文件）。
 *
 * @returns 写成功了吗（失败**不抛**：这只是锦上添花的身份记录，写不进去不该让下载失败）。
 */
export function writeWorkMarker(researchRoot, identity) {
    try {
        const path = workMarkerPath(researchRoot);
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.tmp-${process.pid.toString(36)}`;
        writeFileSync(tmp, markerJson(identity), 'utf8');
        renameSync(tmp, path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 标记文件的 JSON 文本。
 *
 * ⚠️ **提示词与读取共用这一个函数**：整合提示词要求 agent 写出的内容就是它，
 * 所以"写进去的"和"读回来的"不可能对不上（离线自检直接钉住这一点）。
 */
export function markerJson(identity) {
    const payload = { workspace_id: identity.workspaceId };
    if (identity.projectId)
        payload.project_id = identity.projectId;
    if (identity.serverUrl)
        payload.server_url = identity.serverUrl;
    if (identity.role)
        payload.role = identity.role;
    payload.synced_at = identity.updatedAt || new Date().toISOString();
    return `${JSON.stringify(payload, null, 2)}\n`;
}
/* ════════════════════════════════════════════════════════════════════════
 * ② 插件侧注册表（解压之前就能判定）
 * ════════════════════════════════════════════════════════════════════════ */
function parseIdentity(raw) {
    if (!isRecord(raw))
        return undefined;
    const workspaceId = normalizeWorkspaceId(raw.workspaceId ?? raw.workspace_id);
    if (!workspaceId)
        return undefined;
    return {
        workspaceId,
        projectId: typeof raw.projectId === 'string' ? raw.projectId.trim() : '',
        serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '',
        accountId: typeof raw.accountId === 'string' ? raw.accountId.trim() : '',
        role: asRole(raw.role),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
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
        const record = parseIdentity(value);
        if (record)
            out[root] = record;
    }
    return out;
}
/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制 / 发布映射同款：设置里改了目录立刻生效）
 */
export function createFileWorkIdentityStore(resolvePath) {
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
        const tmp = `${path}.tmp-${process.pid.toString(36)}`;
        writeFileSync(tmp, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
        renameSync(tmp, path);
    };
    return {
        get: (researchRoot) => load()[researchRoot],
        set: (researchRoot, record) => {
            const table = load();
            table[researchRoot] = record;
            save(table);
        },
        remove: (researchRoot) => {
            const table = load();
            if (!(researchRoot in table))
                return;
            delete table[researchRoot];
            save(table);
        },
        all: () => load(),
        get path() {
            return resolvePath();
        },
    };
}
/** 内存存储（离线自检用；与文件版同一语义）。 */
export function createMemoryWorkIdentityStore(seed = {}) {
    let table = { ...seed };
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
/**
 * 读一个工作区本地这一侧的身份：① 工作区内标记 → ② 插件侧注册表。
 *
 * @param researchRoot 研究根（真身路径）。
 * @param store 注册表；缺省 = 没有第二级。
 */
export function readLocalIdentity(researchRoot, store) {
    const marker = readWorkMarker(researchRoot);
    const registry = normalizeWorkspaceId(store?.get(researchRoot)?.workspaceId);
    if (marker && registry) {
        if (marker.workspaceId === registry) {
            return { workspaceId: marker.workspaceId, source: 'both', conflict: false };
        }
        return { workspaceId: null, source: 'both', conflict: true };
    }
    if (marker)
        return { workspaceId: marker.workspaceId, source: 'marker', conflict: false };
    if (registry)
        return { workspaceId: registry, source: 'registry', conflict: false };
    return { workspaceId: null, source: null, conflict: false };
}
/**
 * 判定一个候选目标工作区（**纯函数**：路径/磁盘的事由调用方查好再传进来）。
 *
 * 规则的核心是**三态纪律**（与 `sync-watermarks.ts` 同款）：
 * **两端都有值才做严格比较**，缺任一端是"判不出来"，绝不当成"不同" —— 把"判不出来"
 * 表现成"禁止"会挡住正常用户，表现成"同一项"会把两份研究搅在一起，两者都不可接受。
 */
export function judgeWorkspace(input) {
    if (!input.exists)
        return 'missing';
    if (!input.hasResearch)
        return 'new';
    const remote = normalizeWorkspaceId(input.remoteWorkspaceId);
    const local = normalizeWorkspaceId(input.localWorkspaceId);
    if (!remote)
        return 'unverifiable';
    if (!local)
        return 'unknown';
    return local === remote ? 'same' : 'other';
}
/**
 * 判定结果能不能**直接**下载（界面据此决定要不要禁用这一项）。
 *
 * · `other`     另一项研究 → 不可（唯一硬拦）
 * · `unknown`   有研究但读不到标识 → 要用户二次确认，故不算"可直接"
 * · `missing`   目录暂时不在 → **可以**：落盘那一步会 `mkdirSync` 把它建出来
 * · 其余（`new` / `same` / `unverifiable`）→ 可以
 *
 * ⚠️ 客户端（`settings.tsx` 的 `blocked()`）镜像了同一条规则 —— 它不能 import 本模块
 * （本模块 import 了 `node:fs`）。改这里的判据要两边一起改，离线自检按字符串钉住这一点。
 */
export function isDirectlySelectable(status) {
    return status === 'new' || status === 'same' || status === 'unverifiable' || status === 'missing';
}
/** 下载成功后要记的那条身份（缺字段用调用方给的现值补）。 */
export function makeWorkIdentity(input) {
    return {
        workspaceId: normalizeWorkspaceId(input.workspaceId) ?? input.workspaceId,
        projectId: input.projectId,
        serverUrl: input.serverUrl,
        accountId: input.accountId,
        role: input.role,
        updatedAt: input.updatedAt || new Date().toISOString(),
    };
}
//# sourceMappingURL=work-identity.js.map