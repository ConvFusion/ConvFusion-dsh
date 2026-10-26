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
 * <研究根目录（realpath）> + <方向>  →  { projectId, serverUrl, accountId, version, … }
 * ```
 *
 * ## 为什么键里还有**方向**（v0.6.0）
 *
 * 一个工作区可以在**两个方向**上发布，而且是**两个不同的服务器项目**：
 *
 * - `SEEK_MENTOR`：学生把自己的研究发布出去求指导（【我的】→【寻找指导】）；
 * - `SEEK_STUDENT`：导师把自己的选题发布出去招学生（【我的】→【寻找学生】）。
 *
 * 早先一条工作区只存一条记录 —— 在同一台上先点【寻找指导】再点【寻找学生】，
 * 后者会**复用前者的 `project_id`**，把"学生求指导的研究"顶成"导师招学生的选题"。
 * 所以键是 `(研究根目录, 方向)`；旧文件里的记录没有方向，读作 `SEEK_MENTOR`
 * （那时只有这一个方向）。
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
import type { ProjectDirection } from '../server-client.js';
/** 一条"已发布到服务器"的记录。 */
export interface PublishedRecord {
    /**
     * 这条记录属于哪个方向（见 `ProjectDirection`）。
     *
     * ⚠️ 旧的落盘文件里没有这个字段 → 读作 `SEEK_MENTOR`（那时只有这一个方向），
     * 不丢记录、也不把它误判成导师出题。
     */
    direction: ProjectDirection;
    /**
     * 上次发布时用的**研究工作名**（项目标题）。
     *
     * 名字会随"论文起名 / 主题演进"变化，而项目标题只在建项目时写过一次 ——
     * 下次发布时拿它比一比，不同就 `PUT` 改名（见 `work/publish`）。
     * 旧记录没有这个字段 → 无从比较 → 会改名一次并记下来。
     */
    title?: string;
    /** 服务器上的 Research Project id。 */
    projectId: string;
    /**
     * 这条记录属于**哪一项研究**（`workspace_id`）。
     *
     * ⚠️ 为什么必须有：用户会在同一个会话工作区里**换进换出**多项研究
     * （把当前 `workspace/` 改名、把另一项研究改名成 `workspace/`）。记录键若是路径，
     * 新占用同一个路径的研究就会**继承**旧研究的这条记录 —— 点【更新研究工作】会把
     * 新工作的状态写进**旧工作的服务器项目**（覆盖，不可逆）。
     *
     * 旧记录没有这个字段 → 无从校验（按现状用），下一次发布/核对时补上。
     */
    workId?: string;
    /**
     * 写下这条记录时研究根的指纹（`project.md` 的 `created_at`）。
     *
     * 与 {@link workId} 互补：`workId` 拦"标记不同"，指纹拦"**标记缺失**时路径换了住户"
     * （新占用者还没发布过 → 没有标记，只有指纹能说明住在这里的不是当初那项研究）。
     */
    rootFingerprint?: string;
    /**
     * 上次发布时用的**挂牌价**（Token；只对导师出题 `SEEK_STUDENT` 有意义）。
     *
     * 用来判断"这次改了价没有"：与界面上选的值不同就 `PUT /projects/{id}` 改价
     * （服务器允许改成另一个 `>= 1` 的值；传 null 不会清空，见 `payment-system.md` §3.2.5）。
     * 旧记录没有这个字段 → 无从比较 → 下次发布会发一次并记下来。
     */
    askingFee?: number | null;
    /** 发布时用的服务器地址（归一后的根地址）。 */
    serverUrl: string;
    /** 发布时的账号 id（换账号不重用旧项目）。 */
    accountId: string;
    /** 我们最后一次上传的版本号（下次上传的 `base_version`）。 */
    version: number;
    /** 最后一次上传的内容哈希（内容没变时可以跳过上传）。 */
    contentHash?: string;
    /** 首次发布时间（ISO）。 */
    publishedAt: string;
    /** 最近一次发布时间（ISO）。 */
    updatedAt: string;
    /**
     * 最近一次**向服务器核对**到的可见性（`PUBLISHED` / `PRIVATE`）。
     *
     * ⚠️ 这个字段只由核对回写（列【我的】/【可指导】时）——它记的是**服务器**的状态，
     * 与 `version`（我们自己传过什么）不是一回事：项目可能被服务器删除或取消发布。
     */
    serverVisibility?: string;
    /** 最近一次核对成功的时刻（ISO）。 */
    checkedAt?: string;
    /**
     * 已上传附件的**内容指纹**（研究根相对路径 → `sha256:<hex>`）。
     *
     * ⚠️ 服务器**不去重**：同一个路径重复上传会新建一行元数据 + 一份新字节，
     * 所以「更新」必须靠这份指纹做**增量**（只传新增/变化的文件）。
     */
    files?: Record<string, string>;
    /**
     * 用户确认过的上传选择（「记住这次选择」）。
     *
     * 下次「更新」直接沿用它 —— 但**新文件按规则自动并入**（见 `work/uploadPlan`），
     * 否则新增的证据/计划会静默漏传。
     */
    selection?: string[];
}
/**
 * 记录键的**作用域**：怎么把"研究根"翻成"这是哪一项研究"。
 *
 * 注入而不是写死：`published-store` 是纯 JSON 表读写，不认识研究根的布局
 * （标记文件在哪、`project.md` 长什么样），那两个认识的地方由宿主注入。
 */
export interface PublishedStoreScope {
    /** 研究根 → 当前工作身份（`ws_…`）；`null` = 还不知道。 */
    workIdOf?: (researchRoot: string) => string | null;
    /** 研究根 → 指纹（`project.md` 的 `created_at`）；`null` = 读不到。 */
    fingerprintOf?: (researchRoot: string) => string | null;
}
/**
 * 这条记录属于**现在住在这个路径上**的研究吗？
 *
 * 两个判据各自独立，缺一个就**不拦**（宁可按现状用，也不误伤）：
 *   - 双方都有身份且不同 → 不是我的；
 *   - 双方都有指纹且不同 → 不是我的（路径换过住户）。
 */
export declare function occupantMatches(record: PublishedRecord, workId: string | null, fingerprint: string | null): boolean;
/** 组装表键（落盘 / 遍历用）。 */
/**
 * 组装表键。
 *
 * `scopeKey` 传**工作身份**（`ws_…`，有身份时）或**研究根路径**（还没身份时）——
 * 优先身份：路径会换住户（用户换进换出多项研究），身份不会。
 */
export declare function publishedStoreKey(scopeKey: string, direction: ProjectDirection): string;
/** 拆表键；不带分隔符的旧键 → 研究根本身 + `SEEK_MENTOR`（旧文件只有这一个方向）。 */
export declare function parsePublishedStoreKey(key: string): {
    researchRoot: string;
    direction: ProjectDirection;
};
export interface PublishedStore {
    /** 读一条记录（研究根目录 + 方向 → 记录）。方向省略 = `SEEK_MENTOR`（今天的行为）。 */
    get(researchRoot: string, direction?: ProjectDirection): PublishedRecord | undefined;
    /** 写一条记录（整表落盘）；方向取自 `record.direction`。 */
    set(researchRoot: string, record: PublishedRecord): void;
    /** 删一条记录（例如服务器上项目已不存在时）。 */
    remove(researchRoot: string, direction?: ProjectDirection): void;
    /**
     * 按项目**原地**更新（键不动）。用于"工作列表核对"回写可见性 ——
     * 键改成身份之后，不能再靠"解析键得到研究根"再 `set` 回去。
     */
    updateByProject(projectId: string, patch: Partial<PublishedRecord>): boolean;
    /** 全部记录（只读快照）；键是 {@link publishedStoreKey} —— 同一个根**可以出现两次**。 */
    all(): Record<string, PublishedRecord>;
    /** 落盘位置（设置页/日志展示用）。 */
    readonly path: string;
}
/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制同款：设置里改了目录立刻生效）
 */
export declare function createFilePublishedStore(resolvePath: () => string, scope?: PublishedStoreScope): PublishedStore;
/**
 * 内存存储（离线验证 / 精简环境）。
 *
 * `seed` 的键可以是**裸研究根**（旧写法，按 `SEEK_MENTOR` 收）或
 * {@link publishedStoreKey} 的完整键；记录自己带的 `direction` 优先。
 */
export declare function createMemoryPublishedStore(seed?: Record<string, PublishedRecord>, scope?: PublishedStoreScope): PublishedStore;
//# sourceMappingURL=published-store.d.ts.map