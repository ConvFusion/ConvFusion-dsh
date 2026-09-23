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
export const OPENALEX_WORKS_ENDPOINT = 'https://api.openalex.org/works';
/** 单次请求的软上限（OpenAlex 允许 200，这里保守取值以免一次灌爆上下文）。 */
export const OPENALEX_MAX_PER_PAGE = 50;
/** 默认每页条数。 */
export const OPENALEX_DEFAULT_PER_PAGE = 20;
/** 摘要截断长度（字符）。倒排索引重建出的全文往往很长。 */
export const ABSTRACT_MAX_CHARS = 600;
/* ════════════════════════════════════════════════════════════════════════
 * 请求调度：串行队列 + 最小间隔 + 429/5xx 重试
 *
 * OpenAlex 对同一来源 IP 有速率限制（无 Key 的公共池更严）：并发多路检索会
 * 立刻撞上 HTTP 429（实测并行 4 路即触发）。因此这里把**所有** OpenAlex 请求
 * 放进一个模块级串行队列 —— 同一时刻最多一个请求在飞、相邻请求间隔不小于
 * `OPENALEX_MIN_INTERVAL_MS`，也就是"逐个串行检索"。429/5xx 时按
 * `Retry-After`（缺失则指数退避）等待后自动重试，最多 `OPENALEX_MAX_RETRIES`
 * 次，让 Agent 无需自己操心节奏。
 * ════════════════════════════════════════════════════════════════════════ */
/** 相邻 OpenAlex 请求的最小间隔（毫秒）。公共池建议 ≤10 req/s。 */
export const OPENALEX_MIN_INTERVAL_MS = 200;
/** 429/5xx 最多重试次数（不含首次请求）。 */
export const OPENALEX_MAX_RETRIES = 3;
/** 指数退避基准（毫秒）：800 → 1600 → 3200 → 6400。 */
export const OPENALEX_BACKOFF_BASE_MS = 800;
/** 退避/Retry-After 上限（毫秒），避免长时间卡住一个工具调用。 */
export const OPENALEX_BACKOFF_MAX_MS = 8000;
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
export const LITERATURE_FIELDS = ['any', 'title_abstract', 'title'];
/**
 * 字段别名：模型可能直接写 OpenAlex 的原始 filter 名 `title_and_abstract`
 * （而不是本工具的 `title_abstract`）。收敛到规范名，避免拼写差异把一次
 * 受限检索静默降级成全文检索 —— 那会让"未发现"看起来比实际更可信。
 */
const FIELD_ALIASES = {
    title_and_abstract: 'title_abstract',
};
/**
 * 归一化检索字段（未知值收敛到 `any`）。
 *
 * 大小写不敏感、接受别名；**未知值一律收敛到 `any`（最宽）**而不是报错，
 * 因为报错会让 Agent 拿不到任何结果，而 `any` 至少给出可解释的覆盖度。
 */
export function normalizeField(field) {
    const v = (field ?? '').trim().toLowerCase();
    if (v in FIELD_ALIASES)
        return FIELD_ALIASES[v];
    return LITERATURE_FIELDS.includes(v) ? v : 'any';
}
/** 归一化每页条数（越界/缺省都收敛到合法值）。 */
export function normalizePerPage(perPage) {
    if (perPage === undefined || !Number.isFinite(perPage))
        return OPENALEX_DEFAULT_PER_PAGE;
    return Math.min(OPENALEX_MAX_PER_PAGE, Math.max(1, Math.floor(perPage)));
}
function sortParam(sort) {
    if (sort === 'cited')
        return 'cited_by_count:desc';
    if (sort === 'recent')
        return 'publication_date:desc';
    // 相关性是 OpenAlex 的默认排序，不传参数才真的是默认
    return undefined;
}
/**
 * 构造请求 URL。
 *
 * @param query 检索请求
 * @param apiKey OpenAlex API Key（可缺省 —— 无 Key 时走公共池）
 * @param mailto 公共池的联络邮箱（OpenAlex 用它把请求归入 polite pool；有 Key 时不需要）
 * @returns 完整 URL 字符串
 */
export function buildOpenAlexUrl(query, apiKey, mailto) {
    const p = new URLSearchParams();
    p.set('per-page', String(normalizePerPage(query.perPage)));
    const field = normalizeField(query.field);
    const text = query.query.trim();
    const filters = [];
    // 字段决定检索走哪条路：
    // - any            → 全文 `search=`（宽、噪声大；**不能**与 filter 叠加，否则条件互相稀释）
    // - title_abstract → `filter=title_and_abstract.search:`
    // - title          → `filter=title.search:`
    if (field === 'title_abstract')
        filters.push(`title_and_abstract.search:${text}`);
    else if (field === 'title')
        filters.push(`title.search:${text}`);
    else
        p.set('search', text);
    const from = query.yearFrom;
    const to = query.yearTo;
    if (typeof from === 'number' && typeof to === 'number')
        filters.push(`publication_year:${from}-${to}`);
    else if (typeof from === 'number')
        filters.push(`publication_year:>${from - 1}`);
    else if (typeof to === 'number')
        filters.push(`publication_year:<${to + 1}`);
    if (query.openAccessOnly)
        filters.push('is_oa:true');
    // OpenAlex 的多个条件是**一个**用逗号分隔的 filter 参数
    if (filters.length > 0)
        p.set('filter', filters.join(','));
    const sort = sortParam(query.sort);
    if (sort)
        p.set('sort', sort);
    // 只取用得上的字段：响应小、也不把无关数据带进上下文
    p.set('select', 'id,doi,title,display_name,publication_year,publication_date,primary_location,open_access,authorships,cited_by_count,abstract_inverted_index,type');
    const key = (apiKey ?? '').trim();
    if (key)
        p.set('api_key', key);
    else if ((mailto ?? '').trim())
        p.set('mailto', (mailto ?? '').trim());
    return `${OPENALEX_WORKS_ENDPOINT}?${p.toString()}`;
}
/** 去掉密钥后的 URL（**只有这个版本允许出现在返回值与日志里**）。 */
export function redactOpenAlexUrl(url) {
    return url.replace(/([?&])api_key=[^&]*/g, '$1api_key=***');
}
/** 倒排索引（word → 位置）重建为可读摘要。 */
export function reconstructAbstract(inverted, maxChars = ABSTRACT_MAX_CHARS) {
    if (!inverted || typeof inverted !== 'object' || Array.isArray(inverted))
        return undefined;
    const slots = [];
    for (const [word, positions] of Object.entries(inverted)) {
        if (!Array.isArray(positions))
            continue;
        for (const pos of positions) {
            if (typeof pos === 'number' && Number.isInteger(pos) && pos >= 0)
                slots[pos] = word;
        }
    }
    const text = slots.filter((w) => typeof w === 'string').join(' ').trim();
    if (!text)
        return undefined;
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
function authorNames(authorships, limit = 4) {
    if (!Array.isArray(authorships))
        return [];
    return authorships
        .slice(0, limit)
        .map((a) => {
        const name = a?.author?.display_name;
        return typeof name === 'string' ? name : '';
    })
        .filter(Boolean);
}
/** 把一条 OpenAlex work 收敛成 {@link LiteratureRecord}。无法识别则返回 undefined。 */
export function mapWork(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const w = raw;
    const title = typeof w.display_name === 'string' ? w.display_name : typeof w.title === 'string' ? w.title : '';
    const id = typeof w.id === 'string' ? w.id : '';
    if (!id && !title)
        return undefined;
    const primary = w.primary_location;
    const venue = primary?.source?.display_name;
    const oa = w.open_access;
    const oaUrl = typeof oa?.oa_url === 'string' && oa.oa_url ? oa.oa_url : undefined;
    const oaStatus = typeof oa?.oa_status === 'string' && oa.oa_status ? oa.oa_status : undefined;
    const landing = typeof primary?.landing_page_url === 'string' && primary.landing_page_url ? primary.landing_page_url : undefined;
    const pdf = typeof primary?.pdf_url === 'string' && primary.pdf_url ? primary.pdf_url : undefined;
    return {
        id,
        title: title || '(无标题)',
        ...(typeof w.publication_year === 'number' ? { year: w.publication_year } : {}),
        ...(typeof w.doi === 'string' && w.doi ? { doi: w.doi } : {}),
        ...(typeof venue === 'string' && venue ? { venue } : {}),
        authors: authorNames(w.authorships),
        ...(Array.isArray(w.authorships) ? { authorCount: w.authorships.length } : {}),
        ...(typeof w.cited_by_count === 'number' ? { citedByCount: w.cited_by_count } : {}),
        ...(oaUrl ? { openAccessUrl: oaUrl } : {}),
        ...(oaStatus ? { openAccessStatus: oaStatus } : {}),
        ...(landing ? { landingPageUrl: landing } : {}),
        ...(pdf ? { pdfUrl: pdf } : {}),
        ...(typeof w.type === 'string' ? { type: w.type } : {}),
        ...(reconstructAbstract(w.abstract_inverted_index) ? { abstract: reconstructAbstract(w.abstract_inverted_index) } : {}),
    };
}
/** 把 OpenAlex 的响应体映射成 {@link LiteratureSearchResult}。 */
export function mapOpenAlexResponse(body, ctx) {
    const b = (body ?? {});
    const meta = (b.meta ?? {});
    const rawResults = Array.isArray(b.results) ? b.results : [];
    const results = rawResults.map(mapWork).filter((r) => r !== undefined);
    return {
        query: ctx.query,
        source: 'openalex',
        retrievedAt: ctx.retrievedAt ?? new Date().toISOString(),
        total: typeof meta.count === 'number' ? meta.count : results.length,
        returned: results.length,
        requestUrl: redactOpenAlexUrl(ctx.requestUrl),
        usedApiKey: ctx.usedApiKey,
        field: normalizeField(ctx.field),
        results,
    };
}
export function isLiteratureError(v) {
    return typeof v === 'object' && v !== null && v.error === true;
}
/** 检索超时（毫秒）。学术检索偶发慢响应，必须给上限。 */
export const OPENALEX_TIMEOUT_MS = 20000;
/* ── 请求调度（串行队列 + 最小间隔） ─────────────────────────────────── */
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
/** 上一次 OpenAlex 请求**开始**时刻（用于相邻请求最小间隔）。 */
let openAlexLastStartedAt = 0;
/** 串行队列尾：前一个请求完成后才放行下一个。 */
let openAlexQueueTail = Promise.resolve();
/**
 * 把一次 OpenAlex 请求放进全局串行队列。
 *
 * - 同一时刻最多一个请求在飞（逐个串行）
 * - 相邻请求至少间隔 `minIntervalMs`（从上次请求**开始**时刻起算）
 * - 前一个请求抛错不会卡死队列：release 在 finally 里必定执行
 */
export function runOpenAlexSlot(task, opts) {
    const minInterval = opts?.minIntervalMs ?? OPENALEX_MIN_INTERVAL_MS;
    const wait = opts?.wait ?? sleep;
    const prev = openAlexQueueTail;
    let release;
    openAlexQueueTail = new Promise((res) => (release = res));
    return (async () => {
        await prev;
        try {
            const gap = Math.max(0, openAlexLastStartedAt + minInterval - Date.now());
            if (gap > 0)
                await wait(gap);
            openAlexLastStartedAt = Date.now();
            return await task();
        }
        finally {
            release();
        }
    })();
}
/** 解析 `Retry-After` 响应头（秒 或 HTTP-date），返回等待毫秒；无法解析返回 undefined。 */
export function parseRetryAfter(header, now = Date.now()) {
    if (!header)
        return undefined;
    const v = header.trim();
    if (/^\d+$/.test(v)) {
        const secs = Number(v);
        return Number.isFinite(secs) && secs >= 0 ? Math.min(secs * 1000, OPENALEX_BACKOFF_MAX_MS) : undefined;
    }
    const t = Date.parse(v);
    return Number.isFinite(t) ? Math.max(0, Math.min(t - now, OPENALEX_BACKOFF_MAX_MS)) : undefined;
}
/** 指数退避（attempt 从 0 开始）：base × 2^attempt，封顶 {@link OPENALEX_BACKOFF_MAX_MS}。 */
export function openAlexBackoffMs(attempt) {
    return Math.min(OPENALEX_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt), OPENALEX_BACKOFF_MAX_MS);
}
/** 是否值得自动重试的状态码：429（限流）与 5xx（服务端瞬时错误）。 */
function isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
}
/** 带超时的单次 OpenAlex 请求。超时/网络错误直接抛，由调用方决定是否重试。 */
async function openAlexFetchOnce(doFetch, url, headers, timeoutMs) {
    const ac = new AbortController();
    let timer;
    try {
        return await Promise.race([
            doFetch(url, { headers, signal: ac.signal }),
            new Promise((_res, rej) => {
                timer = setTimeout(() => {
                    ac.abort();
                    rej(new Error(`timeout after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/**
 * 执行一次 OpenAlex 检索。
 *
 * 请求自动进入全局串行队列（逐个发出），429/5xx 自动按 `Retry-After` 或指数
 * 退避重试最多 `maxRetries` 次 —— 并发多路检索不再互相触发限流。
 *
 * @returns 检索结果，或<b>带原因的</b>失败（绝不返回空结果冒充"没查到"）
 */
export async function searchOpenAlex(query, deps) {
    const text = query.query.trim();
    if (!text)
        return { error: true, kind: 'no-query', message: '检索式不能为空。' };
    const key = deps.apiKey().trim();
    const url = buildOpenAlexUrl(query, key, deps.mailto?.());
    const doFetch = deps.fetchImpl ?? globalThis.fetch;
    const timeoutMs = deps.timeoutMs ?? OPENALEX_TIMEOUT_MS;
    const maxRetries = deps.maxRetries ?? OPENALEX_MAX_RETRIES;
    const headers = {
        // OpenAlex 要求可识别的 UA；带 mailto 的 UA 还能进 polite pool
        'user-agent': `ConvFusion/0.2 (${(deps.mailto?.() ?? 'no-mailto').trim() || 'no-mailto'})`,
        accept: 'application/json',
    };
    return runOpenAlexSlot(async () => {
        for (let attempt = 0;; attempt++) {
            let res;
            try {
                res = await openAlexFetchOnce(doFetch, url, headers, timeoutMs);
            }
            catch (e) {
                // 网络失败/超时：不自动重试，按原语义带原因返回（避免 20s 超时×多轮拖死工具）
                return {
                    error: true,
                    kind: 'network',
                    message: e instanceof Error && e.message.startsWith('timeout after')
                        ? `OpenAlex 请求超时（${Math.round(timeoutMs / 1000)} 秒无响应）。`
                        : `无法连接 OpenAlex：${e instanceof Error ? e.message : String(e)}`,
                };
            }
            if (res.ok) {
                const body = await res.json();
                return mapOpenAlexResponse(body, {
                    query: text,
                    requestUrl: url,
                    usedApiKey: Boolean(key),
                    field: query.field,
                });
            }
            if (isRetryableStatus(res.status) && attempt < maxRetries) {
                const retryAfter = res.headers?.get?.('retry-after');
                const delay = parseRetryAfter(retryAfter) ?? openAlexBackoffMs(attempt);
                await (deps.wait ?? sleep)(delay);
                continue;
            }
            if (res.status === 429) {
                return {
                    error: true,
                    kind: 'http',
                    status: 429,
                    message: `OpenAlex 限流（HTTP 429）：已自动串行重试 ${maxRetries} 次仍被限流，请稍后再试。` +
                        `若频繁触发，可在【设置】-【ConvFusion】-【系统设置】配置 OpenAlex API Key 进入更高配额池。`,
                };
            }
            return {
                error: true,
                kind: 'http',
                status: res.status,
                message: res.status === 401 || res.status === 403
                    ? `OpenAlex 拒绝了这次请求（HTTP ${res.status}）：API Key 可能无效或已过期。请在【设置】-【ConvFusion】-【系统设置】检查。`
                    : `OpenAlex 返回 HTTP ${res.status}。`,
            };
        }
    }, { wait: deps.wait });
}
//# sourceMappingURL=literature.js.map