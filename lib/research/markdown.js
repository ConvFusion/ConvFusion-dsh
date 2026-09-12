/**
 * ConvFusion 2.0 — Markdown 资产公共工具
 *
 * Stage 2（Skill）与 Stage 3（Plan）各自实现过一遍 frontmatter / 章节解析；
 * Stage 4 起有四种资产（Evidence / Claim / Decision / Research State），
 * 继续复制会失控。本模块把那份**受限 YAML + `##` 章节**的约定收敛到一处。
 *
 * ## 为什么是"受限 YAML"而不是真 YAML 解析器
 *
 * v2 反复强调 **Markdown-first，不是 DSL**（Stage 2 §3 / Stage 3 §6 / Stage 4 §6）：
 * frontmatter 只承担 Identity / Lifecycle / Provenance / Indexing。
 * 所以只解析**标量键值**，遇到嵌套结构一律不处理 —— 从实现层面阻止 schema 蔓延。
 * 需要真 YAML 时应当反思是不是把资产做成了 DSL。
 */
/** 解析受限 YAML frontmatter（标量键值；不做嵌套、不做列表）。 */
export function parseFrontmatter(source) {
    const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m)
        return {};
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#'))
            continue;
        const idx = line.indexOf(':');
        if (idx <= 0)
            continue;
        const key = line.slice(0, idx).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key))
            continue;
        out[key] = line
            .slice(idx + 1)
            .trim()
            .replace(/^["']|["']$/g, '');
    }
    return out;
}
/** 去掉 frontmatter。 */
export function stripFrontmatter(source) {
    return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
/** 渲染 frontmatter（跳过 undefined / 空串）。 */
export function renderFrontmatter(fields) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(fields)) {
        if (v === undefined)
            continue;
        const s = String(v).trim();
        if (!s)
            continue;
        lines.push(`${k}: ${s}`);
    }
    lines.push('---');
    return lines.join('\n');
}
/**
 * 把正文切成 `#` 标题 + `##` 章节。
 *
 * `###` 归入所属 `##` 的正文（保持内容不丢）。
 */
/**
 * 围栏状态机：判断当前行是否在 ``` / ~~~ 代码围栏内。
 *
 * ⚠️ **必须跳过围栏**。Skill / Plan 的正文里大段是**逐字迁移**的原始提示词，
 * 而那些提示词本身包含 `# 标题`、`## 小节` 与 JSON/LaTeX 片段。把它们当成
 * Markdown 结构会同时坏掉两件事（2026-09-12 实测）：
 *
 *   - `title` 取到围栏里的一行 —— 47 个 Skill 里有 **16 个**的名字变成了
 *     `(JSON formatting policy is provided by Foundation Layer.)`；
 *   - 围栏里的 `## ` 被当成章节边界 —— `result-analysis` 凭空多出「研究主题 /
 *     实验设计 / 基线方法 / 指标分析结果」等 10 个假章节，真实章节的正文被切断。
 */
function fenceTracker() {
    let fence = null;
    return {
        inFence: () => fence !== null,
        feed(line) {
            const m = line.match(/^\s*(`{3,}|~{3,})/);
            if (!m)
                return;
            const char = m[1][0];
            const len = m[1].length;
            if (fence === null)
                fence = { char, len };
            else if (char === fence.char && len >= fence.len)
                fence = null;
        },
    };
}
/**
 * 把正文切成 `# 标题` + `##` 章节。
 *
 * - **标题取第一个**一级标题（不是最后一个 —— 后者会被围栏内的 `#` 覆盖）；
 * - **围栏内的标题一律不当结构**（见 {@link fenceTracker}）；
 * - `###` 子标题归入所属 `##` 的正文（弱结构，用户自加内容不丢）。
 */
export function parseSections(body) {
    const lines = body.split(/\r?\n/);
    let title = null;
    const sections = [];
    let current = null;
    const fence = fenceTracker();
    for (const line of lines) {
        const wasInFence = fence.inFence();
        fence.feed(line);
        if (!wasInFence) {
            if (title === null && /^#\s+/.test(line) && !line.startsWith('## ')) {
                title = line.replace(/^#\s+/, '').trim();
                continue;
            }
            const h2 = line.match(/^##\s+(.+?)\s*$/);
            if (h2) {
                if (current)
                    sections.push({ title: current.title, body: current.lines.join('\n').trim() });
                current = { title: h2[1].trim(), lines: [] };
                continue;
            }
        }
        if (current)
            current.lines.push(line);
    }
    if (current)
        sections.push({ title: current.title, body: current.lines.join('\n').trim() });
    return { title, sections };
}
/** 渲染 `# 标题` + `##` 章节。 */
export function renderSections(title, sections) {
    const parts = [`# ${title}`, ''];
    for (const s of sections)
        parts.push(`## ${s.title}`, '', s.body.trim(), '');
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
/** 按标题取章节（宽松匹配：大小写与标点不敏感）。 */
export function findSection(sections, ...names) {
    for (const want of names) {
        const w = want.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
        const hit = sections.find((s) => s.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '') === w);
        if (hit)
            return hit.body;
    }
    return '';
}
/** 替换或追加章节（其余内容原样保留）。 */
export function withSection(sections, title, body) {
    const idx = sections.findIndex((s) => s.title.toLowerCase() === title.toLowerCase());
    const next = [...sections];
    if (idx >= 0)
        next[idx] = { title: next[idx].title, body };
    else
        next.push({ title, body });
    return next;
}
/** 解析 Markdown 列表 / 逗号分隔 / 空格分隔的 id 串（如 `E001, E003`）。 */
export function parseIdList(raw) {
    if (!raw)
        return [];
    return (raw.match(/[ECDP]\d{1,4}/gi) ?? []).map((s) => s.toUpperCase());
}
/** 渲染 id 列表。 */
export function renderIdList(ids) {
    return ids.length === 0 ? '(none)' : ids.join(', ');
}
/** 剥离归档/时间戳注释（历史快照的幂等比较用）。 */
const ARCHIVE_HEADER_RE = /^<!--\s*(?:archived|snapshot):[\s\S]*?-->\r?\n/;
export function stripArchiveHeader(source) {
    return source.replace(ARCHIVE_HEADER_RE, '');
}
/** 写快照文件（带时间戳注释），幂等：内容未变返回 `undefined`。 */
export function writeSnapshotIfChanged(file, content, note, readFile, writeFile, exists) {
    if (exists(file)) {
        const existing = readFile(file);
        if (existing !== undefined && stripArchiveHeader(existing).trim() === content.trim())
            return false;
    }
    const header = note ? `<!-- snapshot: ${new Date().toISOString()} — ${note} -->\n` : '';
    writeFile(file, header + content);
    return true;
}
/* ════════════════════════════════════════════════════════════════════════
 * 列表项解析（供 project / research-state / paper-gaps 共用）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 去掉**列表标记**（`-` / `*` / `+` / `1.` / `2)`），并去掉 Markdown 强调符号。
 *
 * ⚠️ 这里踩过一个真实的坑：早先的实现用 `^\s*[-*\d.]+\s*` 去标记，
 * 而 `*` 也在字符类里 —— 于是一行 `**Q1（主问题）**` 被吃掉了**开头的** `**`、
 * 留下了**结尾的** `**`，注入到 Research Context 里就成了
 * `- Q1（主问题）**`。同时它还要求"标记后面可以有零个空格"，
 * 把 `*emphasis*` 这种行首强调也误判成列表项。
 *
 * 现在的规则：标记必须是 `-`/`*`/`+`/`N.`/`N)` **且后面跟空白**；
 * 之后再去掉成对的 `**` / `__` / 单个 `*`。
 */
export function stripListMarker(line) {
    const withoutMarker = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
    return withoutMarker
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/^[*_]+|[*_]+$/g, '')
        .trim();
}
/** 整行加粗（`**…**` / `__…__`）—— 常见的"小标题"写法。 */
function isBoldHeading(line) {
    return /^\s*(?:\*\*|__)[^*_]+(?:\*\*|__)\s*$/.test(line);
}
/**
 * 把一段 Markdown 解析成列表项（**段落语义**，不是逐行）。
 *
 * 逐行切会把一个跨行的条目拆成好几条（小标题 + 正文各算一条），注入上下文时全是断句。
 * 规则：
 *
 *   - 列表标记（`-` / `*` / `+` / `N.`）→ 开新条目；
 *   - **整行加粗**当作小标题，也开新条目（作者常用 `**Q1（…）**` + 正文的写法）；
 *   - 其余非空行 → 并入上一条目（正文属于它的小标题）。
 *
 * @param section 章节正文（不含标题行）
 * @returns 条目列表（已去标记与强调符号，忽略 HTML 注释与空行）
 */
export function parseListItems(section) {
    const items = [];
    for (const raw of section.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('<!--'))
            continue;
        const startsItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw) || isBoldHeading(raw);
        const text = stripListMarker(raw);
        if (!text)
            continue;
        if (startsItem || items.length === 0)
            items.push(text);
        else
            items[items.length - 1] = `${items[items.length - 1]} ${text}`;
    }
    return items;
}
/**
 * 从一段陈述派生**可读的短名**。
 *
 * ⚠️ 这里修过一个真实的展示缺陷：Claim / Decision 的 `name` 原先是
 * `statement.slice(0, 80)` —— 硬截断会在**词中间**切断，于是列表里出现
 * `…若两类误差` 这种半句话当标题。名字应当是**标题**，不是被切的正文。
 *
 * 规则：先取到第一个句末/分号为止的整句；整句仍过长时，在 max 内回退到
 * 最后一个词/顿逗边界，并只在**确实被截断**时加省略号。
 */
export function deriveShortName(text, max = 80) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean)
        return '';
    if (clean.length <= max)
        return clean;
    // 先按句末标点取整句（中英文都要认）
    const firstSentence = clean.split(/[。；;]|(?<=[.。!！?？])\s/)[0]?.trim() ?? clean;
    if (firstSentence.length > 0 && firstSentence.length <= max)
        return firstSentence;
    // 仍过长：在 max 内回退到最后一个边界，避免切断词
    const cut = clean.slice(0, max);
    const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf(','));
    const head = boundary > max * 0.5 ? cut.slice(0, boundary) : cut;
    return `${head.replace(/[，,、\s]+$/, '')}…`;
}
//# sourceMappingURL=markdown.js.map