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
/** 一条"已发布到服务器"的记录。 */
export interface PublishedRecord {
    /** 服务器上的 Research Project id。 */
    projectId: string;
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
export interface PublishedStore {
    /** 读一条记录（研究根目录 → 记录）。 */
    get(researchRoot: string): PublishedRecord | undefined;
    /** 写一条记录（整表落盘）。 */
    set(researchRoot: string, record: PublishedRecord): void;
    /** 删一条记录（例如服务器上项目已不存在时）。 */
    remove(researchRoot: string): void;
    /** 全部记录（只读快照）。 */
    all(): Record<string, PublishedRecord>;
    /** 落盘位置（设置页/日志展示用）。 */
    readonly path: string;
}
/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制同款：设置里改了目录立刻生效）
 */
export declare function createFilePublishedStore(resolvePath: () => string): PublishedStore;
/** 内存存储（离线验证 / 精简环境）。 */
export declare function createMemoryPublishedStore(seed?: Record<string, PublishedRecord>): PublishedStore;
//# sourceMappingURL=published-store.d.ts.map