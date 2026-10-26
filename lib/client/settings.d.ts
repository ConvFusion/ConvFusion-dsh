/**
 * ConvFusion 2.0 — 设置页本体（【设置】-【ConvFusion】-【本地研究方法】）
 *
 * ## v2 与 v0.1.5 的结构差异（重建依据见仓库根 `ConvFusion_setting.md`）
 *
 * ```text
 * v0.1.5   模块（8 个，Python 管线）→ 提示词节点（110 个）
 * v0.2     能力类别（taxonomy 的 9 个大类）→ 能力 / Skill（47 个）→ 可定制章节（6 个）
 * ```
 *
 * 所以 v0.1.5 的「① 模块 / ② 提示词」两个下拉，在 v2 里是
 * 「① 能力类别 / ② 能力」两个下拉 + 一个「③ 可定制章节」选择器。
 *
 * ## 术语（不要混用）
 *
 * | 词 | 指的是 |
 * |---|---|
 * | **能力 / Skill** | 库里的**一个**条目（`research-gap-analysis`）。它是可复用的方法片段 |
 * | **能力类别** | 能力的分类（文献 / 实验 / 分析…）。**不是**研究方法 |
 * | **能力库 / Skill Library** | 管理全部能力的地方（我们维护、只读） |
 * | **研究方法** | 用户把**多个能力**逐个定制之后**形成的那一整套做法** —— |
 * | | 它可以被分享给其他研究者使用。**一个 Skill 不等于一套研究方法。** |
 *
 * ## 两个数据源，不要混
 *
 * | 内容 | 通道 | 为什么 |
 * |---|---|---|
 * | 定制**文件名** | `configForms`（落 profile 条目 `convfusion` 的 config） | 它是配置，不是内容 |
 * | 定制**正文** | 同源 `POST /dsh-convfusion/<endpoint>`（落 `$DSH_HOME/convfusion/<file>.json`） | 用户拍板：设置文件绝不能因定制而变大 |
 *
 * ## 依赖约束
 *
 * 只 import `react` 与本 bundle 的本地模块。跨插件服务（`slots` / `configForms`）
 * 通过 cordis 的 inject face 拿到，并在这里**结构化镜像**其契约 ——
 * 不 value-import 任何 `@deepseek-ai/*` 包（bundle 里它们本来就是 external）。
 *
 * 数据面用**同源 `fetch`**（不是 Connection RPC）：宿主侧的 RPC 渠道对外部插件不可用，
 * 详见 `src/settings-rpc.ts` 文件头与 `scripts/probe-settings-rpc-route.mjs`。
 * 路由带 Harness 的信任/鉴权栅栏，等价于 RPC 渠道的安全级别。
 */
import { type Translate } from './i18n/index.js';
import { type PriceGuideLike, type PriceOption } from './price-guide.js';
import { type UploadTreeNode } from './upload-tree.js';
import { type MentorshipView } from './mentorship-view.js';
/**
 * settings scope 的快照。
 *
 * ⚠️ **刻意只读 `status`**：定制文件叫什么、放在哪，对用户不可见也不可配。
 * 这里保留 `value` 只会诱导后来者又把它渲染出来（那正是被要求删掉的东西）。
 */
interface ScopeSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
}
interface SettingsScopeLike {
    getSnapshot(): ScopeSnapshot;
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
}
interface RpcResult {
    ok: boolean;
    value?: unknown;
    error?: {
        code?: string;
        message?: string;
    };
}
/** 设置面的 HTTP 路由前缀（与宿主 `settings-rpc.ts` 的常量一致）。 */
export declare const SETTINGS_ROUTE_PREFIX = "/dsh-convfusion";
/** 一次端点调用；可替换，便于离线测试。 */
export type SettingsSend = (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<RpcResult>;
export interface ConvFusionSettingsProps {
    scope: SettingsScopeLike;
    /** DSH Slot 标准注入：跟随全局语言并在切换时重渲染。 */
    t: Translate;
    /** 传输实现（缺省 = 浏览器同源 fetch）。 */
    send?: SettingsSend | undefined;
}
interface HostSection {
    section: string;
    base: string;
    overridden: boolean;
    userText?: string;
}
interface HostSkill {
    skillId: string;
    skillName: string;
    /** 唯一编号（`CxxPyy`）。 */
    code?: string;
    /** 中文名。 */
    label?: string;
    sections: HostSection[];
    overriddenCount: number;
}
interface HostCategory {
    categoryId: string;
    categoryName: string;
    /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
    code?: string;
    /** 类别中文名。 */
    label?: string;
    skills: HostSkill[];
    overriddenCount: number;
    pointCount: number;
}
/**
 * 设置页真正用到的状态。
 *
 * 宿主还会多返回 `config` / `file`（定制文件路径、是否存在、覆盖数）供诊断与测试用，
 * 但**界面一个都不读** —— 所以这里也不声明，免得被顺手拿来渲染。
 */
interface HostState {
    /** 宿主协议版本；与 bundle 内联值不一致 = 宿主半边没重启。 */
    protocol?: number;
    /** 插件版本（package.json 单一来源；旧宿主没有 → 不显示版本徽章）。 */
    version?: string;
    library: {
        root: string;
        skillCount: number;
    };
    customizableSections: string[];
    categories: HostCategory[];
    /** 只看可用性，**没有密钥**（密钥是 secret 字段，不回传浏览器）。 */
    retrieval: {
        configured: boolean;
        source: 'settings' | 'env' | 'none';
        envVar: string;
    };
    /** 【ConvFusion.com】的登录状态（服务器地址 + 有无凭据 + 已验证账号）。**不含凭据。** */
    account?: HostAccountState;
    /** 本地外部依赖（tectonic）——【系统设置】页的"配置检查"。 */
    dependencies?: {
        tectonic: HostDependency;
    };
}
/**
 * 服务器上的账号（宿主 `AccountWire` 的镜像）。**没有任何凭据字段。**
 *
 * ConvFusion.com 没有口令登录：账号是邀请制，凭据是一份 `cf_live_…` API Key，
 * 它**只存在于宿主**。浏览器这一侧从头到尾拿不到明文。
 */
interface HostAccount {
    id: string;
    email: string;
    displayName: string;
    status: string;
    roles: string[];
}
/** 【ConvFusion.com】的登录状态（宿主 `AccountState` 的镜像）。 */
export interface HostAccountState {
    serverUrl: string;
    defaultServerUrl: string;
    serverUrlSource: 'settings' | 'env' | 'config' | 'default';
    /**
     * 两个环境的地址（开发 / 生产），给地址框右边那两个**快捷图标按钮**用。
     *
     * 由宿主解析（配置文件 > 内置兜底）→ 客户端**不写死任何域名**。旧宿主没有这个字段时
     * 按钮**不显示**（拿不到 ≠ 没有，但不假装有）。
     */
    serverPresets?: {
        development: string;
        production: string;
    };
    /**
     * 当前环境（开发 / 生产）。
     *
     * ⚠️ **地址随环境而变**（开发 = 本机服务器，生产 = 线上）。界面必须把这件事说出来：
     * "在我电脑上登录成功"与"线上能用"是两件事，混在一起会得出错误结论。
     */
    environment?: 'development' | 'production';
    /** 地址与环境矛盾（生产却指向本机 / 开发却指向线上）。 */
    serverUrlMismatch?: boolean;
    keyConfigured: boolean;
    keySource: 'settings' | 'env' | 'none';
    apiKeyEnvVar: string;
    /** 只有在**联网验证过**之后才非空。 */
    account: HostAccount | null;
    /**
     * Token 余额（联网验证过才有）。
     *
     * 宿主是**尽力而为**地取它：拿不到就是 null（界面不显示数字，而不是显示 0）。
     *
     * ⚠️ `grant` / `funded` 是**两池**（协议 28）：`grant`（赠送额度）只能买平台自营服务，
     * `funded`（资金池）是**唯一**能付给导师、能提现的部分 —— 接受指导冻结押金走它。
     * 两者为 `null` = 旧宿主不分开说（**不是 0**）：那时按 `available` 处理（旧语义下
     * 全部余额都能付导师），不许把账号误判成付不起。
     */
    tokens?: {
        available: number;
        frozen: number;
        total: number;
        grant: number | null;
        funded: number | null;
    } | null;
}
/**
 * 一条续费申请（宿主 `account/recharge-requests` 的镜像）。
 *
 * `PENDING` = 等管理员处理；`APPROVED` = 已发放（`grantTxId` 指向账本那条 `GRANT`）；
 * `REJECTED` = 被拒。弹窗据此告诉用户"我申请到哪一步了"。
 */
interface HostRechargeRequest {
    id: string;
    amount: number;
    reason: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    reviewedAt: string | null;
    grantTxId: string | null;
    createdAt: string;
}
/** 一个本地外部依赖的检测结果（与 host 的 LocalDependencyStatus 对应）。 */
interface HostDependency {
    name: string;
    available: boolean;
    path?: string;
    version?: string;
    viaEnv: boolean;
    envVar: string;
    purposeCode: string;
}
/** 能力下优先选已有定制的章节；都没有定制 → 第一个。 */
export declare function preferredSection(sections: HostSection[] | undefined): string;
/** 类别下优先选已有定制的能力；都没有定制 → 第一个。 */
export declare function preferredSkill(skills: HostSkill[] | undefined): HostSkill | undefined;
/** 类别列表里优先选已有定制的类别；都没有定制 → 第一个。 */
export declare function preferredCategory(categories: HostCategory[] | undefined): HostCategory | undefined;
export type SettingsLoad = {
    kind: 'ok';
    state: HostState;
} | {
    kind: 'error';
    message: string;
};
/** 状态读取的超时（毫秒）。挂起的请求也必须变成一条可见的错误，而不是空白页。 */
export declare const SETTINGS_LOAD_TIMEOUT_MS = 15000;
/**
 * 默认传输：浏览器同源 `fetch` 到宿主注册的前缀路由。
 *
 * 始终带上凭据（同源下即 cookie），这样 Harness 的鉴权栅栏能认出这个请求。
 */
export declare const fetchSettingsSend: SettingsSend;
/**
 * 从宿主读取整页状态；**永不抛异常**（异常会变成 `{ kind: 'error' }`）。
 *
 * @param send 传输实现（缺省 {@link fetchSettingsSend}）
 * @param options.timeoutMs 超时（测试用；缺省 {@link SETTINGS_LOAD_TIMEOUT_MS}）
 */
export declare function loadSettingsState(send?: SettingsSend, options?: {
    timeoutMs?: number;
}, t?: Translate): Promise<SettingsLoad>;
export declare function ConvFusionProjectSettings({ scope, t, send, }: ConvFusionSettingsProps): JSX.Element;
/**
 * 「指导中」那一行的**进展文案**。
 *
 * ⚠️ 提案状态（`PROPOSED`/`ACCEPTED`/…）是**提案**的生命周期，接受之后就不再变化 ——
 * 于是列表会永远停在「已接受」，看不出指导到底有没有开始（2026-09 用户反馈）。
 * 关系建立之后真正有意义的是：**导师传了指导结果没有**。
 *
 * 因此 ACCEPTED 拆成两个进展状态，并且**按角色换称呼**（导师看自己的行不该写
 * "导师已指导"）：
 *
 * | 事实 | 学生看到 | 导师看到 |
 * |---|---|---|
 * | 对方那一侧还没有文件 | 等待指导意见 | 待我指导 |
 * | 对方那一侧有文件 | 导师已指导 | 我已指导 |
 */
/**
 * 一条指导提案**在我眼里**是什么（方向 + 当事人 id 推出的派生量）。
 *
 * ## 为什么要有这一层（v0.6.0 出题模式的核心）
 *
 * 早先界面用一个 `incoming = (我是 researcher)` 同时表达了四件事：我要不要动作、
 * 我上传落在哪一侧、进展文案怎么称呼、谁的资料该给我看。**方向 B（导师出题）里
 * 这四件事不再一致** —— 项目 owner 是导师、发起人是学生、接受人是导师，
 * 继续用"我是不是 researcher"判断会在每一处都反过来。
 *
 * 所以统一在这里算清楚，其余地方只读这些派生量：
 *
 * | 派生量 | 方向 A（学生出题） | 方向 B（导师出题） |
 * |---|---|---|
 * | `iAmOwner`（服务器 `owner` 侧） | 我是学生 | 我是导师 |
 * | `mySide` | 学生 → `owner` | 导师 → `owner` |
 * | `iProposed` | 导师 | 学生 |
 * | `iAmAcceptor`（该我接受/拒绝） | 学生 | 导师 |
 */
interface HostProposalView extends MentorshipView {
    /** 我上传时要与自己比对的那一侧（服务器 `?source=`）。 */
    mySide: HostFileSide;
    /** 对方的侧（下载读它）。 */
    otherSide: HostFileSide;
    /** 要判断的那个人（对方）。 */
    counterparty: HostProposalParty | null;
    /** 对方是导师吗（决定资料框的标题与措辞）。 */
    counterpartyIsMentor: boolean;
}
/**
 * **我要下载的那一侧**的文件数（三态：`number` / `null` = 服务器说不知道 / `undefined` = 旧服务器）。
 *
 * 【下载】按钮与"先下载一次"提示**必须**共用这一个判据 —— v0.6.7 之前的 bug 就是没共用：
 * 提示按 `view.otherSide` 取数（学生下载 owner 侧 → 数导师的工作区），按钮却一律看
 * `reviewFiles`（= **非 owner 那一侧**，方向 B 下是**学生自己的交付**）。于是"导师出题 →
 * 学生选题"的关系里，导师的工作区有内容（提示让先下载）、学生自己的交付是 0 份（按钮判为
 * 没意义 → 隐藏），学生既被要求下载又没有下载按钮（2026-10-26 用户反馈）。
 *
 * 取数规则（与 `sideSyncHint` 完全一致）：
 *   · 下载 `owner` 侧 → `workspaceFiles`（owner 那一侧的工作区文件数）
 *   · 下载 `mentor` 侧（= 非 owner 侧 / review 侧）→ `reviewFiles`
 */
export declare function downloadSideCount(p: HostProposal, view: HostProposalView): number | null | undefined;
/**
 * 【下载】能不能点：关系已建立，且**我要下载的那一侧**确实有东西。
 *
 * 下载回来的是"对方那一侧的快照"；那一侧空着时点了也没用，所以隐藏
 * （2026-09 用户反馈：还没有人上传，按钮却可点）。
 *
 * 三态纪律：`null`（查不到）/ `undefined`（旧服务器）→ **保留按钮** ——
 * 拿不到 ≠ 没有，不能因为一次探测失败就把一个可能可用的动作藏起来。
 */
export declare function canDownloadProposal(p: HostProposal, view: HostProposalView): boolean;
/** **本机**研究工作（宿主 `LocalWorkItem` 的镜像）—— 数据来自磁盘，不需要登录。 */
/**
 * 一项研究工作的**方向**（宿主 `ProjectDirection` 的镜像）。
 *
 * 两个方向共用同一套项目 / 提案 / 合同结构，差别只在谁拥有项目、谁发起、谁接受
 * （两个方向都是学生出钱、论文主体是学生）。缺字段 → 宿主已归一到 `SEEK_MENTOR`
 * （= 今天唯一存在的行为）。
 */
type HostProjectDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT';
/**
 * **挂牌价**要显示的那句话（三态；`null` = 不显示）。
 *
 * 服务器同一个 `asking_fee` 两种含义，措辞按**卡片自己的方向**选：
 *   · `SEEK_STUDENT`（导师出题）→「导师开价 800」；
 *   · `SEEK_MENTOR`（学生发题）→「预算 800」。
 *
 * 三态纪律：`null`（没挂牌价，不是 0）/ `undefined`（旧服务器）→ 不显示，也不写"未知"。
 */
export declare function askingFeeText(t: Translate, direction: HostProjectDirection, askingFee: number | null | undefined): string | null;
/**
 * 一个**候选下载目标工作区**的校验结果（宿主 `mentor/downloadState` 的 `items[]` 镜像）。
 *
 * 判据是服务器给的研究工作标识 `workspace_id`（全局唯一、跨项目生命周期不变）：
 * 这个工作区里已有的 `workspace/` 和我要下载的是不是**同一项研究**。
 */
interface HostDownloadTarget {
    id: string;
    title: string;
    path: string;
    /** 目录还在吗。 */
    exists: boolean;
    /** 研究根绝对路径（已有或将会是）。 */
    researchRoot: string | null;
    /** `nested` = `<ws>/workspace`；`legacy` = 研究直接在 `<ws>`；`null` = 还没有研究。 */
    layout: 'nested' | 'legacy' | null;
    /**
     * 结论：
     * · `new` 还没有研究工作区 → 允许（按新建处理）
     * · `same` 同一项研究 → 允许（下载后融合）
     * · `other` **另一项研究** → 禁止
     * · `unknown` 有研究但读不到标识 → 默认禁止，二次确认可强制
     * · `unverifiable` 服务器没给标识 → 允许，但明说"无法校验"
     * · `missing` 目录不存在 → 禁止
     */
    status: 'new' | 'same' | 'other' | 'unknown' | 'unverifiable' | 'missing';
    /** 本地读到的标识（`null` = 读不到）。 */
    localWorkspaceId: string | null;
    /** 工作区内标记与本地记录冲突（读到了但值不同）。 */
    identityConflict: boolean;
}
/**
 * 项目文件空间的**两侧**（宿主 `FileSource` 的镜像）：`owner` = 学生自己那份，
 * `mentor` = 导师回传的那份。同一路径两侧并存、互不覆盖。
 */
type HostFileSide = 'owner' | 'mentor';
/** 导师简介（`research_profiles` 投影；后端 enrich 后才有）。 */
interface HostMentorProfile {
    institution: string | null;
    department: string | null;
    bio: string | null;
    researchFields: string[];
    researchInterests: string[];
    researchExpertise: string[];
}
/** 提案当事一方。`displayName` 缺失时宿主已回退成 id 短前缀。 */
interface HostProposalParty {
    id: string;
    displayName: string;
    profile?: HostMentorProfile | null;
}
type HostProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
/** 一条指导提案：我发起的 / 我收到的（两个方向共用这个结构）。 */
interface HostProposal {
    id: string;
    projectId: string;
    /**
     * 这条提案所属的方向（服务器的 `direction`）。
     *
     * ⚠️ 界面**必须**靠它（而不是"我是什么角色"）判断：谁能接受、我上传落在哪一侧、
     * 进展文案怎么称呼。旧服务器缺字段 → 宿主已归一到 `SEEK_MENTOR`。
     */
    direction: HostProjectDirection;
    /**
     * 谁发起了这次提案（服务器的 `proposed_by_id`）。
     *
     * `null` = 旧服务器不返回 → 界面按方向推断（`SEEK_MENTOR` → 导师发起；
     * `SEEK_STUDENT` → 学生发起）。"谁能接受"= **未发起的那一方**。
     */
    proposedById: string | null;
    /** 项目标题（后端 enrich 后才有；缺 → null）—— 旧服务器的兜底，见 {@link HostProposal.workName}。 */
    projectTitle: string | null;
    /** **这项研究工作的名字**（服务器的 `work_name`）：列表该显示的就是它。 */
    workName?: string | null;
    /**
     * **发布方的挂牌价**（服务器 `asking_fee`）：与这份提案的 `totalFee` **并排显示** ——
     * "开价 800 / 出价 100" 的差距就是议价信息。
     *
     * 三态：数字 = 有价；`null` = 没挂牌价（不是 0）；`undefined` = 旧服务器 → 不显示。
     */
    askingFee?: number | null;
    mentor: HostProposalParty | null;
    researcher: HostProposalParty | null;
    guidanceScope: string;
    totalFee: number;
    depositAmount: number;
    successPaymentAmount: number;
    /**
     * 成功条件。`jcrLevel` / `ccfLevel` 只在**论文类**条件上出现（价格 = 等级）——
     * 列表行与接受确认框靠它们说清"这份提案按什么等级定价"。
     */
    successCondition: {
        type: string;
        description: string | null;
        jcrLevel?: number | null;
        ccfLevel?: string | null;
    };
    status: HostProposalStatus;
    /**
     * 关系建立（ACCEPTED）后，**非 owner 那一侧**交付的文件数（服务器 `review_files`）。
     *
     * 提案状态接受之后就不再变了，而用户要看的是**指导进展**；这个事实只在项目文件里。
     * 宿主在 `mentor/list` 里补齐；`null` = 没查到（未知），不是"没有"。
     *
     * ⚠️ v0.6.0：它是**非 owner 侧**的计数 —— 方向 A 下是导师的指导产物，
     * **方向 B 下是学生的交付**（项目 owner 是导师）。所以进展文案要按方向换称呼。
     */
    reviewFiles?: number | null;
    /** **owner 那一侧**当前的文件数（服务器 `workspace_files`；与上面同一套三态）。 */
    workspaceFiles?: number | null;
    /** **owner 那一侧**最后一次上传的时间（服务器 `workspace_updated_at`）。 */
    workspaceUpdatedAt?: string | null;
    /**
     * **非 owner 那一侧**最后一次上传的时间（服务器 `counterpart_updated_at`）。
     *
     * 与 `workspaceUpdatedAt` 配对，只是**另一侧**：方向 B 下导师靠它发现
     * "学生又交付了"。界面不直接用它 —— 宿主把它比进 `syncBySide.mentor`。
     */
    counterpartUpdatedAt?: string | null;
    /**
     * **宿主算好的**"我要下载的那一侧变了吗"，**按侧给**（判别联合，见 `sync-watermarks.ts`）。
     *
     * - `{ neverDownloaded: true }` —— 本地没有**这一侧**的水位 = 从没下载过这一侧 → 提示"先下载"；
     * - `{ changed: true, reason: 'uploaded' | 'deleted' }` —— 下载过、对方又动过 → 提示重新下载；
     * - `{ changed: false }` —— 下载过、两个判据都说没动；
     * - `null` —— **无从判断**（旧服务器不给字段 / 服务器说不可知 / 只有一半判据可用）。
     *
     * ⚠️ 为什么两侧都要：界面取**自己下载的那一侧**（`otherSide`），而那是哪一侧由**方向**决定
     *   —— 方向 A 的导师下 `owner` 侧，方向 B 的导师下 `mentor` 侧。
     *
     * ⚠️ `undefined` = 旧宿主不返回这个字段 → 界面**不提示**（那不等于"没更新"），
     * 不许编成 false。
     */
    syncBySide?: {
        owner: HostSyncCheck;
        mentor: HostSyncCheck;
    } | null;
    /**
     * **旧形状**（协议 < 25）：只有 owner 侧这一个判读结果；界面为兼容继续认它。
     *
     * 只在 `syncBySide` 缺失时读 —— 两份都在时以 `syncBySide` 为准。
     */
    sync?: HostSyncCheck;
    expiresAt: string;
    createdAt: string;
}
/**
 * 一侧的"变了吗"判读结果（宿主 `checkSideChange` 的镜像）。
 *
 * ⚠️ **"从没下载过"与"无从判断"必须分开**（2026-10 用户指出）：前者手里没副本、
 * 该提示下载；后者是判不出来，不该编造。早先两者都在 `null` 里 → 导师第一次进
 * 【指导中】一声不吭，而学生明明更新过了。
 */
type HostSyncCheck = {
    neverDownloaded: true;
} | {
    changed: boolean;
    reason: 'uploaded' | 'deleted' | null;
} | null;
/**
 * 复制文本到剪贴板。
 *
 * ⚠️ 两条路都要有：`navigator.clipboard` 需要**安全上下文**（回环地址算，所以 DSH Web
 * 正常可用），拿不到时退到 `execCommand('copy')` 那套老办法。
 * 无论哪条路失败都**只返回 false、不抛** —— 复制失败不该让界面崩，也不该打断下载。
 */
export declare function copyText(text: string): Promise<boolean>;
export declare function CategoryFileTreeView({ t, nodes, prefix, open, categoryId, selection, maxFileBytes, onToggleFiles, onToggleOpen, }: {
    t: Translate;
    nodes: readonly UploadTreeNode[];
    /** 被剥掉的顶层前缀（如 `research/literature`）：渲染成一行灰色面包屑，没有则为空串。 */
    prefix?: string;
    /** 展开中的目录（键 = `${categoryId}::${path}`）。 */
    open: ReadonlySet<string>;
    categoryId: string;
    selection: ReadonlySet<string>;
    maxFileBytes: number;
    onToggleFiles: (relPaths: string[], next: boolean) => void;
    onToggleOpen: (path: string) => void;
}): JSX.Element;
/**
 * 导师「出题」时的**挂牌价**这一行（发布 / 更新对话框里）。
 *
 * ```text
 * 挂牌价  [500 Token · JCR 4区 / CCF-C ▾]   ≈ ¥5,000
 *         挂牌价只是标价：成交价仍按提案金额结算
 * ```
 *
 * ## 三个决定
 *
 * 1. **档位来自服务器**（`GET /mentorship/price-guide`），客户端不自带价目表 ——
 *    写死的价目在平台调价那天会撒谎（服务器文档明确要求）。取不到参考时退化成
 *    "直接填价格"，不挡发布。
 * 2. **按价格升序**（入门档 500 在最上面）：用户的直觉是"从便宜看到贵"，
 *    而服务器的 `tiers` 是等级降序（1区首）。
 * 3. **允许自定义**：下拉最后一项是「自定义…」→ 出现数字输入框（整数、≥ 服务器下限）。
 *    导师有自己的议价，界面不该只给四档。
 *
 * 纯视图（无 hook）：状态在 `CommunityTab` 的对话框状态里，便于离线自检直接渲染。
 */
export declare function PriceGuideRow({ t, direction, guide, options, mode, tokens, text, onSelectPreset, onSelectCustom, onText, }: {
    t: Translate;
    /** 哪个方向：导师出题 = 开价；学生发题 = 预算 / 出价。 */
    direction: HostProjectDirection;
    guide: PriceGuideLike | null;
    options: PriceOption[];
    mode: 'preset' | 'custom';
    /** 当前生效的价格（`null` = 用户填的还不合法）。 */
    tokens: number | null;
    /** 自定义输入框里的原文（切回档位时保留，用户改主意不用重打）。 */
    text: string;
    onSelectPreset: (tokens: number) => void;
    onSelectCustom: () => void;
    onText: (next: string) => void;
}): JSX.Element;
/**
 * 接受指导的**确认对话框**。
 *
 * ⚠️ 为什么必须有它：接受会把押金从可用的钱转到 `frozen` —— 这是真正动 Token 的
 * 操作。用户规则是"所有扣费操作都要先提醒，不能点击即生效"。所以点【接受】只是
 * 打开这个框；点了「确认接受」才发请求。
 *
 * 框里必须说清三件事：跟谁合作（对方 + 机构）、冻多少钱（押金）、**冻的是谁的钱**。
 *
 * ⚠️ `iPayer`（v0.6.0）：两个方向都是**学生**出钱，但接受的人不同 ——
 * 方向 A 由学生接受（冻的是我自己的，要显示我的余额），方向 B 由导师接受
 * （冻的是**学生**的，显示导师自己的余额是误导，所以不显示）。
 *
 * ⚠️ **资金池（v0.6.3）**：押金只能从 `funded`（资金池）冻结，赠送额度**不能**付给导师。
 * 所以"我就是学生"时，这里用 `funded` 而不是两池之和来判断 —— 余额够但全在赠送池里时，
 * 点【确认接受】只会拿到 402。既然客户端已经知道这件事，就该在**点之前**拦住，
 * 并把可行动作写出来（自助付费尚未开通 → 找管理员发放 Token）。
 * 旧宿主不分开报两池（`funded === null`）→ 退回按 `available` 判断（旧语义下没错）。
 *
 * ⚠️ **导出是给离线自检用的**（`verify-settings-page.mjs` 把组件当普通函数调、遍历产出的树）：
 * 它**没有 hook**（状态都在上层 `CommunityTab` 里）才可能这样跑；加了 hook 就走不通了
 * （那时改回断言源码）。
 */
export declare function AcceptConfirmDialog({ t, proposal, party, partyIsMentor, iPayer, balance, funded, grant, onCancel, onConfirm, }: {
    t: Translate;
    proposal: HostProposal;
    /** 对方（方向 A 是导师、方向 B 是学生）。 */
    party: HostProposalParty;
    partyIsMentor: boolean;
    /** 押金是不是从我自己的账户冻结（= 我就是学生）。 */
    iPayer: boolean;
    /** 可用余额（两池之和）；旧宿主只有这一个数。 */
    balance: number | null;
    /** 资金池（能付给导师的那一池）；旧宿主 → `null`（按 `balance` 判断）。 */
    funded: number | null;
    /** 赠送额度（只能买自营服务）；旧宿主 → `null`。 */
    grant: number | null;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/**
 * **Token 余额弹窗**（点账号行的余额徽章打开，2026-09 用户要求）。
 *
 * 三件事：① 余额明细（**两池**：资金池 / 赠送，+ 可用 / 冻结 / 合计）；
 * ② **续费说明**（目前由管理员发放，暂未开通自助付费）；③ **申请续费** ——
 * 往服务器写一条申请记录，管理员事后在服务器上处理（本插件不接真实付费）。
 *
 * ⚠️ **两池为什么必须分开显示**（v0.6.3）：只有**资金池**能付给导师、能提现，
 * 赠送额度只能买平台自营服务。混成一个"可用余额"会让用户在点【接受指导】时
 * 撞上 402 而完全不明白为什么 —— 数字明明够。
 *
 * ⚠️ **防重复申请**：服务器 `POST /tokens/recharge-requests` **不幂等**（每次调用新增一条
 * `PENDING`），所以这里在打开时读一次自己的申请记录，有 `PENDING` 就**不再给表单**
 * （显示"已申请 N Token，等待管理员处理"）。不靠按钮禁用来兜 —— 用户重开弹窗也必须挡住。
 *
 * 数量是**必填**的：服务器 `RechargeRequestCreate.amount` 是 `gt=0` 的必填字段，
 * 申请得说清要多少（这正是管理员批准时的依据）。
 *
 * ⚠️ **导出是给离线自检用的**（同 `AcceptConfirmDialog`）：它没有 hook，所以能被直接调用、
 * 遍历产出的树，"两池是否真的分列"才验得动。
 */
export declare function TokenDialog({ t, tokens, requests, loading, amount, reason, submitting, error, receipt, onAmount, onReason, onApply, onRefresh, onClose, }: {
    t: Translate;
    tokens: {
        available: number;
        frozen: number;
        total: number;
        grant: number | null;
        funded: number | null;
    } | null;
    requests: HostRechargeRequest[] | null;
    loading: boolean;
    amount: string;
    reason: string;
    submitting: boolean;
    error: string | null;
    receipt: string | null;
    onAmount: (v: string) => void;
    onReason: (v: string) => void;
    onApply: () => void;
    onRefresh: () => void;
    onClose: () => void;
}): JSX.Element;
/**
 * 【下载】：下载到**用户选的 DSH 工作区**（2026-09 用户要求）。
 *
 * 不用浏览器的默认下载，也不需要输地址：列出宿主注册表里的工作区，点一个就行。
 *
 * **只存 ZIP，不解压**（2026-09 用户拍板）：同名不覆盖（宿主自动加序号），
 * 所选工作区里原有的东西一个都不动。
 *
 * ⚠️ **0.5.8 起多了一道闸门**：每一项先判"这个工作区里已有的 `workspace/` 和我要下载的
 * 是不是**同一项研究**"（判据是服务器的 `workspace_id`）—— 同一项才允许下进去融合，
 * 另一项**在下之前就拦住**（而不是等文件都解压进去了才发现）。
 */
export declare function DownloadDialog({ t, proposal, fileName, workspaces, workspacesAvailable, workspacesReason, selection, files, bytes, busy, 
/** 下载中已收到的字节数（宿主如实报告；null = 还没开始/已结束）。 */
received, notice, targets, currentWorkspaceId, done, onSelect, onDownload, onClose, onFill, onCopy, onRefill, }: {
    t: Translate;
    proposal: HostProposal;
    /** 预计保存成的文件名（服务器命名 `<owner>-<title>.zip`；实际以响应头为准）。 */
    fileName: string;
    workspaces: Array<{
        id: string;
        title: string;
        path: string;
    }> | null;
    workspacesAvailable: boolean;
    workspacesReason: string | null;
    selection: string;
    files: number | null;
    bytes: number | null;
    busy: boolean;
    received: number | null;
    notice: {
        tone: 'success' | 'error';
        text: string;
    } | null;
    /** v23：每个候选工作区的校验结论；`null` = 旧宿主（不显示状态，退回旧行为）。 */
    targets: HostDownloadTarget[] | null;
    /** 当前会话的工作区 id（标出来 + 说明提示词能不能填）。 */
    currentWorkspaceId: string | null;
    /**
     * 「整合提示词」面板；`null` = 没在下载也没下过。
     *
     * `phase = 'pending'` 发生在下载**进行中** —— 那时提示词已经先用预检的值填好了
     * （2026-10 用户要求：不要等下载完才出现），只是文件名还是猜的。
     */
    done: {
        phase: 'pending' | 'ready';
        dir: string;
        name: string;
        plan: string;
        prompt: string;
        correctedPrompt: string | null;
        canFill: boolean;
        filled: boolean;
        fillHint: string | null;
    } | null;
    onSelect: (id: string) => void;
    onDownload: () => void;
    onClose: () => void;
    /** 把提示词填进当前会话的输入框（**不发送**）。 */
    onFill: () => void;
    /** 复制提示词到剪贴板。 */
    onCopy: () => void;
    /** 用**实际落盘的文件名**替换提示词（只在这两者不一致时出现）。 */
    onRefill: () => void;
}): JSX.Element;
/**
 * 【设置】-【ConvFusion】-【ConvFusion.com】这一页的**全部内容**。
 *
 * ⚠️ 它同时被两处渲染：设置页的 Tab 2，以及会话 Tab「科V社区」的正文
 * （`./community-view.js`）。所以它必须**自给自足** —— 自己读 `account/state`、
 * 自己联网验证、自己持有全部对话状态；宿主状态传 `null` 也能正常站起来
 * （`initial` 只是首屏的乐观初值，省掉一次闪烁）。
 */
/**
 * 「把提示词放进输入框」的窄接口（**不发送**）。
 *
 * 只有**会话内**那个视图（`./community-view.js`）能提供它 —— DSH 把 `inputActions` 作为
 * session 标准 props 交给会话作用域槽位；设置页没有，所以那里只给「复制提示词」。
 */
export interface SessionBridge {
    /**
     * 当前会话（下载预检要用它算"当前会话的工作区"）。
     *
     * 只有它才能回答两件事：① 该预选哪个工作区；② 下载完**能不能**把提示词填进输入框
     * （DSH 的写权限按会话自己的工作区收窄，目标不是它时会话就写不进去）。
     */
    sessionId: string;
    /** 把整段提示词放进输入框（**绝不**调用 submit）。缺省 = 拿不到输入框，只能复制。 */
    setDraft?: ((text: string) => void) | undefined;
    /** 输入框现在是空的吗（空 → 自动填；非空 → 先问一句再替换）。 */
    draftEmpty: boolean;
}
export declare function CommunityTab({ send, initial, t, session, }: {
    send: SettingsSend;
    initial: HostAccountState | null;
    t: Translate;
    /**
     * 会话桥（会话内才有）。
     *
     * 它的有无**就是**"要不要/能不能把整合提示词填进输入框"那个开关：DSH 的写权限按会话
     * 自己的工作区收窄，所以只有"目标工作区 == 当前会话的工作区"时填进去才有意义。
     */
    session?: SessionBridge | undefined;
}): JSX.Element;
export default ConvFusionProjectSettings;
