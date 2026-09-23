/**
 * ConvFusion 2.0 — 文献检索（OpenAlex）
 *
 * ## 它补的是哪个洞
 *
 * v1 的 Discovery 阶段有一个**真正的检索工具**去查 OpenAlex；v2 推倒 sidecar 与云端之后，
 * 只留下了 `literature-search` 这个**方法** Skill —— 它教你"怎么设计检索式"，
 * 但**没有任何东西能真的去检索**。设置页里那把 OpenAlex Key 因此也一直没有消费者：
 * 存了、能看"已配置/未配置"，却没有任何代码读它。
 *
 * 本模块就是那把 Key 的消费者，也是 v1 Discovery 检索能力在 v2 里的对应物：
 * **一个窄工具**，只做一件事 —— 把检索式变成可追溯的文献记录。
 *
 * ## 与「Harness 原生 web 工具」的关系
 *
 * 通用网页检索解决不了这里的问题：学术检索要的是**可复现的检索式 + 结构化结果 +
 * 检索时间**（`literature-search` Skill 的 Evidence Requirements 明确要求
 * queries / sources / retrieval dates）。因此这里直接调 OpenAlex REST API，
 * 返回**结构化记录**与一段 **provenance**，让 Agent 能把它登记成可追溯的 Evidence。
 *
 * ## 三条约束
 *
 * 1. **密钥只进请求，不进返回值**：返回的 `provenance.url` 是**去掉密钥**的版本，
 *    否则密钥会随手被写进 `research/evidence/*.md`。
 * 2. **网络失败必须说清原因**，不能返回空结果冒充"没检索到"。
 * 3. **纯函数可离线测**：URL 构造、倒排摘要重建、响应映射都不依赖网络。
 */
/** OpenAlex Works API 端点。 */
export declare const OPENALEX_WORKS_ENDPOINT = "https://api.openalex.org/works";
/** 单次请求的软上限（OpenAlex 允许 200，这里保守取值以免一次灌爆上下文）。 */
export declare const OPENALEX_MAX_PER_PAGE = 50;
/** 默认每页条数。 */
export declare const OPENALEX_DEFAULT_PER_PAGE = 20;
/** 摘要截断长度（字符）。倒排索引重建出的全文往往很长。 */
export declare const ABSTRACT_MAX_CHARS = 600;
/** 相邻 OpenAlex 请求的最小间隔（毫秒）。公共池建议 ≤10 req/s。 */
export declare const OPENALEX_MIN_INTERVAL_MS = 200;
/** 429/5xx 最多重试次数（不含首次请求）。 */
export declare const OPENALEX_MAX_RETRIES = 3;
/** 指数退避基准（毫秒）：800 → 1600 → 3200 → 6400。 */
export declare const OPENALEX_BACKOFF_BASE_MS = 800;
/** 退避/Retry-After 上限（毫秒），避免长时间卡住一个工具调用。 */
export declare const OPENALEX_BACKOFF_MAX_MS = 8000;
/**
 * 检索字段。
 *
 * OpenAlex 的默认 `search` 参数是**全文检索**：一次"新方法是否存在"的检索会被
 * 综述与教科书淹没（实测同一问题 `search` 命中 1281 条、`title_and_abstract` 376 条、
 * `title` 仅 19 条）。因此字段必须可选，否则"覆盖度"只能给出"未发现"级别的结论。
 *
 * - `any`：OpenAlex 默认全文检索（`search=`）——**宽，噪声大**
 * - `title_abstract`：标题 + 摘要（`filter=title_and_abstract.search:`）——探索的默认推荐
 * - `title`：仅标题（`filter=title.search:`）——确认"是否已有人以此为题"
 */
export declare const LITERATURE_FIELDS: readonly ["any", "title_abstract", "title"];
export type LiteratureField = (typeof LITERATURE_FIELDS)[number];
/**
 * 归一化检索字段（未知值收敛到 `any`）。
 *
 * 大小写不敏感、接受别名；**未知值一律收敛到 `any`（最宽）**而不是报错，
 * 因为报错会让 Agent 拿不到任何结果，而 `any` 至少给出可解释的覆盖度。
 */
export declare function normalizeField(field?: string): LiteratureField;
/** 一次检索请求。 */
export interface LiteratureQuery {
    /** 检索式（自然语言或 OpenAlex 布尔式）。 */
    query: string;
    /** 每页条数（1..{@link OPENALEX_MAX_PER_PAGE}）。 */
    perPage?: number;
    /** 起始年份（含）。 */
    yearFrom?: number;
    /** 结束年份（含）。 */
    yearTo?: number;
    /**
     * 排序。
     * - `relevance`：相关性（默认）
     * - `cited`：被引最多
     * - `recent`：最新发表
     */
    sort?: 'relevance' | 'cited' | 'recent';
    /** 只返回开放获取（可免费读到全文）的结果。 */
    openAccessOnly?: boolean;
    /**
     * 检索字段（{@link LITERATURE_FIELDS}）。
     * 缺省 `any` 走 OpenAlex 全文 `search`；其余走 `filter=<field>.search:`。
     */
    field?: LiteratureField;
}
/** 归一化每页条数（越界/缺省都收敛到合法值）。 */
export declare function normalizePerPage(perPage?: number): number;
/**
 * 构造请求 URL。
 *
 * @param query 检索请求
 * @param apiKey OpenAlex API Key（可缺省 —— 无 Key 时走公共池）
 * @param mailto 公共池的联络邮箱（OpenAlex 用它把请求归入 polite pool；有 Key 时不需要）
 * @returns 完整 URL 字符串
 */
export declare function buildOpenAlexUrl(query: LiteratureQuery, apiKey?: string, mailto?: string): string;
/** 去掉密钥后的 URL（**只有这个版本允许出现在返回值与日志里**）。 */
export declare function redactOpenAlexUrl(url: string): string;
/** 一条文献记录（已经从 OpenAlex 的原始结构里收敛过）。 */
export interface LiteratureRecord {
    /** OpenAlex work id（如 `https://openalex.org/W123`）。 */
    id: string;
    title: string;
    year?: number;
    /**
     * DOI（OpenAlex 返回的是 `https://doi.org/10.xxx` 形式的 URL）。
     * 它是下载全文的关键锚点之一（DOI resolver 多数指向出版商落地页）。
     */
    doi?: string;
    /** 发表处（期刊/会议名）。 */
    venue?: string;
    /** 前若干位作者（构建参考文献用）。 */
    authors: string[];
    /** 作者总数 —— 大于 `authors.length` 时渲染会补 `et al.`。 */
    authorCount?: number;
    citedByCount?: number;
    /**
     * 开放获取全文地址（`open_access.oa_url`，有则可直接读全文）。
     * 这是下载论文的首选来源之一。
     */
    openAccessUrl?: string;
    /** 开放获取状态（gold/green/hybrid/bronze/closed）—— 判断能否拿到全文。 */
    openAccessStatus?: string;
    /**
     * 出版商落地页（`primary_location.landing_page_url`）。
     * 常含指向 PDF 的链接；arXiv / ACL Anthology 的落地页可推导出 PDF 直链。
     */
    landingPageUrl?: string;
    /**
     * 直链 PDF 地址（`primary_location.pdf_url`，若 OpenAlex 已识别）。
     * 下载论文时的第一选择。
     */
    pdfUrl?: string;
    type?: string;
    /** 倒排索引重建出的摘要（截断）。 */
    abstract?: string;
}
/** 倒排索引（word → 位置）重建为可读摘要。 */
export declare function reconstructAbstract(inverted: unknown, maxChars?: number): string | undefined;
/** 把一条 OpenAlex work 收敛成 {@link LiteratureRecord}。无法识别则返回 undefined。 */
export declare function mapWork(raw: unknown): LiteratureRecord | undefined;
/** 一次检索的完整结果（含 provenance —— 没有它，检索结论不可追溯）。 */
export interface LiteratureSearchResult {
    /** 实际使用的检索式。 */
    query: string;
    /** 数据源（目前只有 OpenAlex）。 */
    source: 'openalex';
    /** 检索时刻（ISO）。Skill 的 Evidence Requirements 要求记录 retrieval date。 */
    retrievedAt: string;
    /** 命中总数（注意：不等于返回条数）。 */
    total: number;
    /** 本次返回条数。 */
    returned: number;
    /** **已去密钥**的请求 URL（可安全写进 evidence）。 */
    requestUrl: string;
    /** 是否使用了 API Key（只记事实，不记值）。 */
    usedApiKey: boolean;
    /**
     * 实际使用的检索字段（{@link LITERATURE_FIELDS}）。
     *
     * 必须记录：**没有它，"未发现"就无法被解释** —— 全文检索没命中与仅标题
     * 没命中，可信度完全不同，而覆盖度结论正是建立在这上面。
     */
    field: LiteratureField;
    results: LiteratureRecord[];
}
/** 把 OpenAlex 的响应体映射成 {@link LiteratureSearchResult}。 */
export declare function mapOpenAlexResponse(body: unknown, ctx: {
    query: string;
    requestUrl: string;
    usedApiKey: boolean;
    retrievedAt?: string;
    field?: LiteratureField;
}): LiteratureSearchResult;
/** 检索失败的原因分类（让调用方能给用户一句有用的话，而不是空结果）。 */
export type LiteratureErrorKind = 'no-query' | 'http' | 'network' | 'bad-response';
export interface LiteratureError {
    error: true;
    kind: LiteratureErrorKind;
    message: string;
    /** HTTP 状态码（kind === 'http' 时）。 */
    status?: number;
}
export declare function isLiteratureError(v: unknown): v is LiteratureError;
/** 最小 fetch 契约（便于离线测试注入）。 */
export type FetchLike = (url: string, init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text?: () => Promise<string>;
    /** 响应头（读取 `Retry-After` 用；真实 fetch Response 原生提供）。 */
    headers?: {
        get(name: string): string | null;
    };
}>;
/** 检索依赖（由插件入口注入配置解析器）。 */
export interface LiteratureDeps {
    /** 当前 API Key（可为空 —— 无 Key 时走公共池）。 */
    apiKey: () => string;
    /** 公共池联络邮箱（可选）。 */
    mailto?: () => string | undefined;
    /** fetch 实现（缺省用全局 fetch）。 */
    fetchImpl?: FetchLike;
    /** 请求超时（毫秒）。 */
    timeoutMs?: number;
    /** 429/5xx 最多重试次数（缺省 {@link OPENALEX_MAX_RETRIES}）。 */
    maxRetries?: number;
    /** 等待函数（缺省 setTimeout；测试可注入）。 */
    wait?: WaitFn;
}
/** 检索超时（毫秒）。学术检索偶发慢响应，必须给上限。 */
export declare const OPENALEX_TIMEOUT_MS = 20000;
/** 等待函数（便于测试注入）。 */
export type WaitFn = (ms: number) => Promise<void>;
/**
 * 把一次 OpenAlex 请求放进全局串行队列。
 *
 * - 同一时刻最多一个请求在飞（逐个串行）
 * - 相邻请求至少间隔 `minIntervalMs`（从上次请求**开始**时刻起算）
 * - 前一个请求抛错不会卡死队列：release 在 finally 里必定执行
 */
export declare function runOpenAlexSlot<T>(task: () => Promise<T>, opts?: {
    minIntervalMs?: number;
    wait?: WaitFn;
}): Promise<T>;
/** 解析 `Retry-After` 响应头（秒 或 HTTP-date），返回等待毫秒；无法解析返回 undefined。 */
export declare function parseRetryAfter(header: string | null | undefined, now?: number): number | undefined;
/** 指数退避（attempt 从 0 开始）：base × 2^attempt，封顶 {@link OPENALEX_BACKOFF_MAX_MS}。 */
export declare function openAlexBackoffMs(attempt: number): number;
/**
 * 执行一次 OpenAlex 检索。
 *
 * 请求自动进入全局串行队列（逐个发出），429/5xx 自动按 `Retry-After` 或指数
 * 退避重试最多 `maxRetries` 次 —— 并发多路检索不再互相触发限流。
 *
 * @returns 检索结果，或<b>带原因的</b>失败（绝不返回空结果冒充"没查到"）
 */
export declare function searchOpenAlex(query: LiteratureQuery, deps: LiteratureDeps): Promise<LiteratureSearchResult | LiteratureError>;
//# sourceMappingURL=literature.d.ts.map