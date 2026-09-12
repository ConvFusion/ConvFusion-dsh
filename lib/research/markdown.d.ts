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
export declare function parseFrontmatter(source: string): Record<string, string>;
/** 去掉 frontmatter。 */
export declare function stripFrontmatter(source: string): string;
/** 渲染 frontmatter（跳过 undefined / 空串）。 */
export declare function renderFrontmatter(fields: Record<string, string | number | undefined>): string;
/**
 * 把正文切成 `# 标题` + `##` 章节。
 *
 * - **标题取第一个**一级标题（不是最后一个 —— 后者会被围栏内的 `#` 覆盖）；
 * - **围栏内的标题一律不当结构**（见 {@link fenceTracker}）；
 * - `###` 子标题归入所属 `##` 的正文（弱结构，用户自加内容不丢）。
 */
export declare function parseSections(body: string): {
    title: string | null;
    sections: Array<{
        title: string;
        body: string;
    }>;
};
/** 渲染 `# 标题` + `##` 章节。 */
export declare function renderSections(title: string, sections: Array<{
    title: string;
    body: string;
}>): string;
/** 按标题取章节（宽松匹配：大小写与标点不敏感）。 */
export declare function findSection(sections: Array<{
    title: string;
    body: string;
}>, ...names: string[]): string;
/** 替换或追加章节（其余内容原样保留）。 */
export declare function withSection(sections: Array<{
    title: string;
    body: string;
}>, title: string, body: string): Array<{
    title: string;
    body: string;
}>;
/** 解析 Markdown 列表 / 逗号分隔 / 空格分隔的 id 串（如 `E001, E003`）。 */
export declare function parseIdList(raw: string | undefined): string[];
/** 渲染 id 列表。 */
export declare function renderIdList(ids: readonly string[]): string;
export declare function stripArchiveHeader(source: string): string;
/** 写快照文件（带时间戳注释），幂等：内容未变返回 `undefined`。 */
export declare function writeSnapshotIfChanged(file: string, content: string, note: string | undefined, readFile: (p: string) => string | undefined, writeFile: (p: string, c: string) => void, exists: (p: string) => boolean): boolean;
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
export declare function stripListMarker(line: string): string;
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
export declare function parseListItems(section: string): string[];
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
export declare function deriveShortName(text: string, max?: number): string;
//# sourceMappingURL=markdown.d.ts.map