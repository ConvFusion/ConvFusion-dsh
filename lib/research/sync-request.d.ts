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
import { type WorkIdentityStore, type WorkspaceStatus } from './work-identity.js';
import type { SyncNoteStore } from './sync-note.js';
/** `/research` 的参数是不是一次"同步"请求。 */
export declare function isSyncArg(arg: string): boolean;
/** 动词之后的**引用原文**（保留 `@` / `@"…"`，交给 {@link normalizeZipRef}）。 */
export declare function zipRefOf(arg: string): string;
/**
 * 规范化引用文本 → 绝对路径。
 *
 * 去 `@`、去 `@"…"` 的引号、去两侧空白与成对引号；相对路径按会话工作区解析。
 */
export declare function normalizeZipRef(ref: string, sessionWorkspace: string): string;
export interface ZipRefResolution {
    ok: boolean;
    /** 解析出的绝对路径（`ok=false` 时也给出，用于报错信息）。 */
    path: string;
    /** 失败原因（给人看的一句话）。 */
    error?: string;
    /**
     * 同前缀候选：宿主落盘时同名会加 `-2`、`-3`，用户记的是旧名字。
     * 这时把候选列出来比只说"找不到"有用得多。
     */
    candidates: string[];
}
/** 解析引用 → 一个**存在**的 ZIP 路径（不存在时给候选）。 */
export declare function resolveZipReference(ref: string, sessionWorkspace: string): ZipRefResolution;
/** 同目录下"同名加序号"的候选（`x.zip` → `x-2.zip`、`x-3.zip`）。 */
export declare function siblingCandidates(path: string): string[];
export interface ZipInspection {
    ok: boolean;
    bytes: number;
    /** 失败原因（给人看）。 */
    error?: string;
    /** 成功但有话要说（例如"还在下载中"）。 */
    notice?: string;
}
/**
 * 校验一个 ZIP **能用来同步**：完整、格式对、不是在下载中。
 *
 * 比"提示词里写一句'可能还在下载中'"强的地方：这是**现场检查** ——
 * 用户没等下载完就发送，命令会直接告诉他等一等，而不是让 agent 去解一个半成品。
 */
export declare function inspectZip(path: string): ZipInspection;
/** 判定五态（与 `judgeWorkspace` 的结果一一对应，`missing` 归到 `new`）。 */
export type SyncStatus = 'new' | 'same' | 'other' | 'unknown' | 'unverifiable';
export interface SyncFacts {
    zip: string;
    bytes: number;
    /** ZIP 能不能用（存在、是 ZIP、不是在下载中）。 */
    zipOk: boolean;
    /** `zipOk=false` 时的原因（给人看的一句话）。 */
    zipError?: string;
    workspace: string;
    researchRoot: string;
    status: SyncStatus;
    /** 本机读到的工作标识（没有就是 null）。 */
    localWorkspaceId: string | null;
    /** 本机身份文件里有没有冲突的两说。 */
    localConflict: boolean;
    /** 研究根里的研究主题（读得到就带上，帮 agent 认人）。 */
    localTopic: string | null;
    /** 服务器标识（来自下载便签；没有就是 null）。 */
    remoteWorkspaceId: string | null;
    projectId: string | null;
    projectTitle: string | null;
    serverUrl: string | null;
    /** ZIP 校验时要说的一句话（如"旁边还有半成品"）。 */
    notice?: string;
}
/** `judgeWorkspace` 的 `missing` 归到 `new`（目录不在时落盘那一步会把它建出来）。 */
export declare function syncStatusOf(raw: WorkspaceStatus): SyncStatus;
export interface CollectSyncFactsInput {
    zip: string;
    sessionWorkspace: string;
    /** 会话工作区的**研究根**（`researchWorkspaceOf(会话工作区)`）。 */
    researchRoot: string;
    noteStore?: Pick<SyncNoteStore, 'get'> | undefined;
    identityStore?: Pick<WorkIdentityStore, 'get'> | undefined;
}
/**
 * 收集本次同步的参数（**读**：便签 + 本机标识 + 掉盘现状，不写任何东西）。
 *
 * 判定用与下载同一套 `judgeWorkspace`：两端标识一致才是 `same`，
 * 读不到任一端时**绝不说"另一项"**（那是 `unknown` / `unverifiable`，
 * 由技能里的"先盘查、给判断、等确认"那一支处理）。
 */
export declare function collectSyncFacts(input: CollectSyncFactsInput): SyncFacts;
/** 判定 → 给人看的一句话（命令回执与交接文本共用）。 */
export declare function syncStatusText(status: SyncStatus): string;
/**
 * 拼**交接文本**：一段参数 + "请先加载 sync 技能"。
 *
 * ⚠️ 这里**不写流程** —— 流程在 `skills/sync.md`。改流程只改技能，
 * 命令不必跟着改；两边也不会各说一套。
 */
export declare function buildSyncText(facts: SyncFacts, rootPrefix: string): string;
/** 命令回执（用户在会话里看到的那几行）。 */
export declare function syncReceipt(facts: SyncFacts): string;
//# sourceMappingURL=sync-request.d.ts.map