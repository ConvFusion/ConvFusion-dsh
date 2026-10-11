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
/** 研究根下的插件元数据目录（研究根相对）。 */
export declare const WORK_META_DIR = ".convfusion";
/** 身份标记在研究根里的相对路径（**研究根相对**，与归档内路径同一口径）。 */
export declare const WORK_MARKER_REL = ".convfusion/work.json";
/** 一条身份记录：这项工作在服务器上属于哪一项研究。 */
export interface WorkIdentity {
    /** 服务器给的稳定标识（`ws_…`）。 */
    workspaceId: string;
    /** 写入时的服务器项目（"一次发布"的 id；只作诊断，不参与判定）。 */
    projectId: string;
    /** 归一后的服务器根地址（换服务器不重用旧身份）。 */
    serverUrl: string;
    /** 当时的账号 id（换账号不重用旧身份）。 */
    accountId: string;
    /** 我在这项研究里的角色：`owner` = 我的；`mentor` = 我下载回来的。 */
    role: 'owner' | 'mentor';
    /** 写入时刻（ISO）。 */
    updatedAt: string;
}
/** 注册表（`$DSH_HOME/convfusion/work-identities.json`）。 */
export interface WorkIdentityStore {
    /** 读一条（研究根 realpath → 记录）。 */
    get(researchRoot: string): WorkIdentity | undefined;
    /** 写一条（整表落盘）。 */
    set(researchRoot: string, record: WorkIdentity): void;
    /** 删一条。 */
    remove(researchRoot: string): void;
    /** 全部记录（只读快照）。 */
    all(): Record<string, WorkIdentity>;
    /** 落盘位置（设置页/日志展示用）。 */
    readonly path: string;
}
/**
 * 一个字符串是不是服务器给的标识。
 *
 * **刻意宽松**：服务器是格式的权威，插件只用来把"给了值"与"没给/给了个空的"分开 ——
 * 将来服务器换前缀、加长 hex 都不该让插件把值当成"没给"（那会静默退化成"无法校验"）。
 * 判据只要求：`ws_` 开头、后面至少 16 位十六进制（当前是 32 位）。
 */
export declare function isWorkspaceId(value: unknown): value is string;
/** `workspace_id` 的规范形（小写、去空白）；非法 → `null`。 */
export declare function normalizeWorkspaceId(value: unknown): string | null;
/** 读到的标记（缺字段就是缺字段，不编造）。 */
export interface WorkMarker {
    workspaceId: string;
    projectId?: string;
    serverUrl?: string;
    role?: 'owner' | 'mentor';
    syncedAt?: string;
}
/** 标记文件的绝对路径。 */
export declare function workMarkerPath(researchRoot: string): string;
/**
 * 读工作区里的标记。
 *
 * 容错纪律与 `published-store` 同款：文件不在 / 坏 JSON / 形状不对 → `undefined`
 * （**绝不抛**，也绝不把坏值当成一个 id 用）。
 *
 * ⚠️ 只认 `workspace_id` 一个字段为必需：标记可能是**用户会话里的 agent** 按提示词写的，
 * 缺 `project_id` 之类的附加信息不影响判定。
 */
export declare function readWorkMarker(researchRoot: string): WorkMarker | undefined;
/**
 * 写工作区里的标记（**临时文件 + rename**，避免半截文件）。
 *
 * @returns 写成功了吗（失败**不抛**：这只是锦上添花的身份记录，写不进去不该让下载失败）。
 */
export declare function writeWorkMarker(researchRoot: string, identity: Pick<WorkIdentity, 'workspaceId'> & Partial<WorkIdentity>): boolean;
/**
 * 标记文件的 JSON 文本。
 *
 * ⚠️ **提示词与读取共用这一个函数**：整合提示词要求 agent 写出的内容就是它，
 * 所以"写进去的"和"读回来的"不可能对不上（离线自检直接钉住这一点）。
 */
export declare function markerJson(identity: Pick<WorkIdentity, 'workspaceId'> & Partial<Omit<WorkIdentity, 'workspaceId'>>): string;
/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制 / 发布映射同款：设置里改了目录立刻生效）
 */
export declare function createFileWorkIdentityStore(resolvePath: () => string): WorkIdentityStore;
/** 内存存储（离线自检用；与文件版同一语义）。 */
export declare function createMemoryWorkIdentityStore(seed?: Record<string, WorkIdentity>): WorkIdentityStore;
/** 一个工作区本地这一侧的身份（缺 = `null`，**不编造**）。 */
export interface LocalIdentity {
    /** 用来与服务器比较的标识；两级都读不到 = `null`（无从判断）。 */
    workspaceId: string | null;
    /** 从哪读到的。 */
    source: 'marker' | 'registry' | 'both' | null;
    /**
     * 标记与注册表**都有值且不同**。
     *
     * 这时 `workspaceId` 归 `null`（判不了），界面按"无法确认"处理并额外说明 ——
     * 静默取一个就可能把 A 的研究融合进 B 的工作区。
     */
    conflict: boolean;
}
/**
 * 读一个工作区本地这一侧的身份：① 工作区内标记 → ② 插件侧注册表。
 *
 * @param researchRoot 研究根（真身路径）。
 * @param store 注册表；缺省 = 没有第二级。
 */
export declare function readLocalIdentity(researchRoot: string, store?: Pick<WorkIdentityStore, 'get'> | undefined): LocalIdentity;
/** 目标工作区的判定结论。 */
export type WorkspaceStatus = 
/** 还没有研究工作区 → 允许，按**新建**处理。 */
'new'
/** 同一项研究 → 允许，下载后**融合**。 */
 | 'same'
/** 另一项研究 → **禁止**。 */
 | 'other'
/** 有研究工作区，但本地读不到标识 → 默认禁止，二次确认可强制。 */
 | 'unknown'
/** 有研究工作区，但服务器不给标识（老服务器）→ 允许，但明说"无法校验"。 */
 | 'unverifiable'
/** 目录已不存在 → 禁止。 */
 | 'missing';
/**
 * 判定一个候选目标工作区（**纯函数**：路径/磁盘的事由调用方查好再传进来）。
 *
 * 规则的核心是**三态纪律**（与 `sync-watermarks.ts` 同款）：
 * **两端都有值才做严格比较**，缺任一端是"判不出来"，绝不当成"不同" —— 把"判不出来"
 * 表现成"禁止"会挡住正常用户，表现成"同一项"会把两份研究搅在一起，两者都不可接受。
 */
export declare function judgeWorkspace(input: {
    /** 目录还在吗。 */
    exists: boolean;
    /** 这个工作区里有研究定义吗（`project.md` / `research-state.md`）。 */
    hasResearch: boolean;
    /** 本地读到的标识（`readLocalIdentity().workspaceId`）。 */
    localWorkspaceId: string | null;
    /** 本次下载项在服务器上的标识；`null` = 服务器没给。 */
    remoteWorkspaceId: string | null;
}): WorkspaceStatus;
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
export declare function isDirectlySelectable(status: WorkspaceStatus): boolean;
/** 下载成功后要记的那条身份（缺字段用调用方给的现值补）。 */
export declare function makeWorkIdentity(input: {
    workspaceId: string;
    projectId: string;
    serverUrl: string;
    accountId: string;
    role: 'owner' | 'mentor';
    updatedAt?: string;
}): WorkIdentity;
//# sourceMappingURL=work-identity.d.ts.map