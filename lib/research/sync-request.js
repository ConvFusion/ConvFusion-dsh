/**
 * `/research sync <@zip>` 的解析与交接文本。
 *
 * ## 为什么要把"一大段提示词"换成一行命令
 *
 * 2026-10 用户反馈：同步一次要往输入框里塞几十行提示词 —— 不友好，而且那段文字
 * 每次都由插件现场拼、用户看不到"流程到底写在哪"。改成：
 *
 * ```text
 * /research sync @ku-Jev-Paper2.zip      ← 用户只写这一行
 *    │
 *    ├─ 本模块：解析引用 → 校验 ZIP → 读便签/本机标识 → 现场判定 → 拼**参数**
 *    └─ 流程本身写在技能 `skills/sync.md`（agent 按需加载，见 sync 技能）
 * ```
 *
 * 分工的理由：**参数是本次的、每次不同**（哪个 zip、哪个工作区、判成什么），
 * **流程是固定的**（两步走、融合规则、备份命名）—— 后者属于"能力"，写进技能；
 * 前者由命令传给 agent。
 *
 * ## 引用形式（DSH `@` 引用的 clipboardText 投影）
 *
 * `dsh-client-ui-reference` 把文件引用写成 `@path`；含空格时写成 `@"path with space"`
 * （`openReference` 用 `ref.startsWith('@"') ? ref.slice(2, -1) : ref.slice(1)` 反解）。
 * 相对路径按**会话工作区**解析（`@` 补全给的是 cwd 内的相对路径）。
 */
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { hasProjectDefinition, loadProjectFile } from './project.js';
import { judgeWorkspace, readLocalIdentity } from './work-identity.js';
/** 触发同步的动词（中文别名与界面语言一致，同 `/research 导出研究方法` 的习惯）。 */
const SYNC_ARG_RE = /^(?:sync|同步)(?:[\s,:：]|$)/i;
/** `/research` 的参数是不是一次"同步"请求。 */
export function isSyncArg(arg) {
    return SYNC_ARG_RE.test(arg.trim());
}
/** 动词之后的**引用原文**（保留 `@` / `@"…"`，交给 {@link normalizeZipRef}）。 */
export function zipRefOf(arg) {
    return arg.trim().replace(SYNC_ARG_RE, '').trim();
}
/**
 * 规范化引用文本 → 绝对路径。
 *
 * 去 `@`、去 `@"…"` 的引号、去两侧空白与成对引号；相对路径按会话工作区解析。
 */
export function normalizeZipRef(ref, sessionWorkspace) {
    let s = ref.trim();
    if (s.startsWith('@"') && s.endsWith('"') && s.length > 2)
        s = s.slice(2, -1);
    else if (s.startsWith('@'))
        s = s.slice(1);
    if (s.length >= 2 && /^['"]/.test(s) && /['"]$/.test(s))
        s = s.slice(1, -1);
    s = s.trim();
    return isAbsolute(s) ? resolve(s) : resolve(sessionWorkspace, s);
}
/** 解析引用 → 一个**存在**的 ZIP 路径（不存在时给候选）。 */
export function resolveZipReference(ref, sessionWorkspace) {
    const path = normalizeZipRef(ref, sessionWorkspace);
    if (!ref.trim()) {
        return { ok: false, path, error: '没有给出压缩包', candidates: [] };
    }
    if (existsSync(path)) {
        try {
            if (!statSync(path).isFile()) {
                return { ok: false, path, error: `${path} 不是文件`, candidates: [] };
            }
        }
        catch {
            /* 读不到状态就当它是文件，后面的 ZIP 头校验会再拦一次 */
        }
        return { ok: true, path, candidates: [] };
    }
    return { ok: false, path, error: `找不到这个文件：${path}`, candidates: siblingCandidates(path) };
}
/** 同目录下"同名加序号"的候选（`x.zip` → `x-2.zip`、`x-3.zip`）。 */
export function siblingCandidates(path) {
    const dir = dirname(path);
    const base = basename(path).replace(/\.zip$/i, '');
    try {
        return readdirSync(dir)
            .filter((name) => new RegExp(`^${escapeRe(base)}(?:-\\d+)?\\.zip$`, 'i').test(name))
            .filter((name) => name !== basename(path))
            .sort()
            .map((name) => join(dir, name));
    }
    catch {
        return [];
    }
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** ZIP 头（本地文件头魔数）。 */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/**
 * 校验一个 ZIP **能用来同步**：完整、格式对、不是在下载中。
 *
 * 比"提示词里写一句'可能还在下载中'"强的地方：这是**现场检查** ——
 * 用户没等下载完就发送，命令会直接告诉他等一等，而不是让 agent 去解一个半成品。
 */
export function inspectZip(path) {
    let bytes = 0;
    try {
        bytes = statSync(path).size;
    }
    catch {
        return { ok: false, bytes: 0, error: `读不到这个文件：${path}` };
    }
    if (bytes === 0)
        return { ok: false, bytes, error: `${basename(path)} 是空文件` };
    let head;
    try {
        head = readHead(path, ZIP_MAGIC.length);
    }
    catch {
        return { ok: false, bytes, error: `读不到 ${basename(path)} 的开头` };
    }
    if (!head.equals(ZIP_MAGIC)) {
        return {
            ok: false,
            bytes,
            error: `${basename(path)} 不是 ZIP 文件（开头不是 PK\\x03\\x04）—— 可能还没下完，或者选错了文件`,
        };
    }
    const part = newestPart(dirname(path));
    const notice = part ? `${basename(path)} 旁边还有没写完的下载片段 ${basename(part)}，确认这次下载已完成` : undefined;
    return notice ? { ok: true, bytes, notice } : { ok: true, bytes };
}
function readHead(path, length) {
    // 低层读：快照十几 MB，为了 4 个字节的魔数不值得整份读进内存
    const fd = openSync(path, 'r');
    try {
        const buf = Buffer.alloc(length);
        readSync(fd, buf, 0, length, 0);
        return buf;
    }
    finally {
        closeSync(fd);
    }
}
/** 同目录里"下载中的半成品"（`openDownloadPart` 落的是 `.convfusion-*.part`）。 */
function newestPart(dir) {
    try {
        const parts = readdirSync(dir)
            .filter((name) => name.startsWith('.convfusion-') && name.endsWith('.part'))
            .map((name) => join(dir, name));
        if (parts.length === 0)
            return null;
        return parts.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
    }
    catch {
        return null;
    }
}
/** `judgeWorkspace` 的 `missing` 归到 `new`（目录不在时落盘那一步会把它建出来）。 */
export function syncStatusOf(raw) {
    return raw === 'missing' ? 'new' : raw;
}
/**
 * 收集本次同步的参数（**读**：便签 + 本机标识 + 掉盘现状，不写任何东西）。
 *
 * 判定用与下载同一套 `judgeWorkspace`：两端标识一致才是 `same`，
 * 读不到任一端时**绝不说"另一项"**（那是 `unknown` / `unverifiable`，
 * 由技能里的"先盘查、给判断、等确认"那一支处理）。
 */
export function collectSyncFacts(input) {
    const root = input.researchRoot;
    const note = input.noteStore?.get(input.zip);
    const local = readLocalIdentity(root, input.identityStore);
    const hasResearch = hasProjectDefinition(root) || existsSync(join(root, 'research-state.md'));
    const status = syncStatusOf(judgeWorkspace({
        exists: existsSync(root),
        hasResearch,
        localWorkspaceId: local.workspaceId,
        remoteWorkspaceId: note?.remoteWorkspaceId ?? null,
    }));
    const project = loadProjectFile(root);
    const inspected = inspectZip(input.zip);
    return {
        zip: input.zip,
        bytes: inspected.bytes,
        zipOk: inspected.ok,
        ...(inspected.error ? { zipError: inspected.error } : {}),
        workspace: input.sessionWorkspace,
        researchRoot: root,
        status,
        localWorkspaceId: local.workspaceId,
        localConflict: local.conflict,
        localTopic: project?.topic ?? null,
        remoteWorkspaceId: note?.remoteWorkspaceId ?? null,
        projectId: note?.projectId ?? null,
        projectTitle: note?.projectTitle ?? null,
        serverUrl: note?.serverUrl ?? null,
        ...(inspected.notice ? { notice: inspected.notice } : {}),
    };
}
/** 判定 → 给人看的一句话（命令回执与交接文本共用）。 */
export function syncStatusText(status) {
    switch (status) {
        case 'new':
            return '本工作区里还没有研究根 → 解压成新的研究根';
        case 'same':
            return '本工作区里已经是同一项研究 → 就地融合（不是覆盖）';
        case 'other':
            return '本工作区里是另一项研究 → 先整体备份现有研究根，再解压成新的';
        case 'unknown':
            return '有研究但读不到它的标识 → 先盘查、给判断、等确认';
        default:
            return '拿不到服务器标识 → 先盘查、给判断、等确认';
    }
}
/**
 * 拼**交接文本**：一段参数 + "请先加载 sync 技能"。
 *
 * ⚠️ 这里**不写流程** —— 流程在 `skills/sync.md`。改流程只改技能，
 * 命令不必跟着改；两边也不会各说一套。
 */
export function buildSyncText(facts, rootPrefix) {
    const mb = (facts.bytes / 1024 / 1024).toFixed(1);
    const lines = [
        `同步一份下载下来的研究工作区快照：\`${facts.zip}\``,
        '',
        '请**先加载 `sync` 技能**，按它的流程执行 —— 第 1 步只读盘查并报告，**停下等我确认**，',
        '确认后才动文件。',
        '',
        '本次参数（缺的以你现场看到的为准）：',
        '',
        `- 压缩包：\`${facts.zip}\`（已校验：完整 ZIP，${mb} MB）`,
        `- 本工作区：\`${facts.workspace}\``,
        `- 研究根：\`${facts.researchRoot}\`（相对会话工作区是 \`${rootPrefix || '.'}\`）`,
        `- 现场判定：**${facts.status}** —— ${syncStatusText(facts.status)}`,
    ];
    if (facts.localTopic)
        lines.push(`- 本机研究的主题：${facts.localTopic}`);
    if (facts.localWorkspaceId) {
        lines.push(`- 本机标识：\`${join(facts.researchRoot, '.convfusion', 'work.json')}\` → \`${facts.localWorkspaceId}\``);
    }
    else {
        lines.push('- 本机标识：读不到（没有 `.convfusion/work.json`）');
    }
    if (facts.localConflict)
        lines.push('- ⚠️ 本机标识**自相矛盾**（标记与注册表不一致）—— 以盘查结果为准');
    if (facts.projectTitle)
        lines.push(`- 项目：${facts.projectTitle}`);
    if (facts.remoteWorkspaceId) {
        const extra = [
            facts.projectId ? `项目 \`${facts.projectId}\`` : '',
            facts.serverUrl ? `服务器 \`${facts.serverUrl}\`` : '',
        ].filter(Boolean);
        lines.push(`- 服务器标识：\`${facts.remoteWorkspaceId}\`${extra.length ? `（${extra.join('，')}）` : ''}`);
    }
    else {
        lines.push('- 服务器标识：这次下载**没有记录**（插件没写过便签）—— 不要凭它下结论');
    }
    if (facts.notice)
        lines.push(`- ⚠️ ${facts.notice}`);
    lines.push('', `备份目录名由你取（前缀固定 \`workspace_\`，接研究缩写与日期，同名加 \`-2\`），` +
        '并在报告里给出最终名字 —— 规则见技能。');
    return lines.join('\n');
}
/** 命令回执（用户在会话里看到的那几行）。 */
export function syncReceipt(facts) {
    const mb = (facts.bytes / 1024 / 1024).toFixed(1);
    return [
        `已把同步任务交给 Agent（判定：${facts.status}）`,
        `- 快照：\`${basename(facts.zip)}\`（${mb} MB）`,
        `- 目标：\`${facts.researchRoot}\``,
        `- ${syncStatusText(facts.status)}`,
        '',
        '第 1 步只读盘查，报告完会**停下等你确认**再动文件。',
    ].join('\n');
}
//# sourceMappingURL=sync-request.js.map