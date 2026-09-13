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
/** 归一化检索字段（未知值收敛到 `any`）。 */
export function normalizeField(field) {
    const v = (field ?? '').trim().toLowerCase();
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
    p.set('search', query.query.trim());
    p.set('per-page', String(normalizePerPage(query.perPage)));
    const filters = [];
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
        results,
    };
}
export function isLiteratureError(v) {
    return typeof v === 'object' && v !== null && v.error === true;
}
/** 检索超时（毫秒）。学术检索偶发慢响应，必须给上限。 */
export const OPENALEX_TIMEOUT_MS = 20000;
/**
 * 执行一次 OpenAlex 检索。
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
    const ac = new AbortController();
    let timedOut = false;
    let timer;
    const timeout = new Promise((_res, rej) => {
        timer = setTimeout(() => {
            timedOut = true;
            ac.abort();
            rej(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        const res = await Promise.race([
            doFetch(url, {
                headers: {
                    // OpenAlex 要求可识别的 UA；带 mailto 的 UA 还能进 polite pool
                    'user-agent': `ConvFusion/0.2 (${(deps.mailto?.() ?? 'no-mailto').trim() || 'no-mailto'})`,
                    accept: 'application/json',
                },
                signal: ac.signal,
            }),
            timeout,
        ]);
        if (!res.ok) {
            return {
                error: true,
                kind: 'http',
                status: res.status,
                message: res.status === 401 || res.status === 403
                    ? `OpenAlex 拒绝了这次请求（HTTP ${res.status}）：API Key 可能无效或已过期。请在【设置】-【ConvFusion】-【检索源】检查。`
                    : `OpenAlex 返回 HTTP ${res.status}。`,
            };
        }
        const body = await res.json();
        return mapOpenAlexResponse(body, { query: text, requestUrl: url, usedApiKey: Boolean(key) });
    }
    catch (e) {
        return {
            error: true,
            kind: timedOut ? 'network' : 'network',
            message: timedOut
                ? `OpenAlex 请求超时（${Math.round(timeoutMs / 1000)} 秒无响应）。`
                : `无法连接 OpenAlex：${e instanceof Error ? e.message : String(e)}`,
        };
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=literature.js.map