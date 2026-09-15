/**
 * ConvFusion 2.0 — LaTeX 组装（移植自 ConvFusion-dev `modules/paper/latex`）
 *
 * ## 它补的是哪个洞
 *
 * v2 的论文写作主流程是 Markdown（`papers/<id>/paper.md`），但最终要交付 LaTeX：
 * output profile 声明 `format: 'markdown+latex'`，`papers/<id>/latex/` 也留着目录骨架。
 * 然而迁移时**只搬来了技能说明，没有搬工具** —— `latex/` 一直空着，稿子停在 Markdown。
 *
 * 本模块是那条链路的**纯函数半边**：把 Markdown 章节变成可编译的 LaTeX 文档。
 * 执行半边（调 tectonic 编译、解析日志、确定性修复）在 `latex-compile.ts`。
 *
 * ## 与旧版的关系
 *
 * 逐条移植旧版 `latex_composer_skill.py`（609 行）与 `equation` 模块的注入/净化部分，
 * 并**修掉勘察确认的真实缺陷**（见各函数注释）。刻意**不移植**的部分：
 *
 *   - **DSL 编排**（`dsl/compiler.py` 的 5 节点流水线与 `_LatexFixEvaluator`）：
 *     那是通用工作流引擎，v2 明确推倒 Module/Workflow（Stage 0 §6.3）。
 *     3 次编译-修复循环改由技能指导 + 工具动作表达。
 *   - **LLM 修复节点**：v2 的工具不能调 LLM；Agent 本身就是 LLM。
 *     工具产出结构化错误与上下文，Agent 自己改文件 —— 这正是 Native Harness。
 *
 * ## 模板
 *
 * 只做 **IEEEtran 会议 / 期刊** 两套（用户裁定）。模板由代码生成而非固定字符串，
 * 因此能容纳 v2 实际拥有的章节（含 Results / Discussion，旧版模板没有这两节）。
 *
 * ## 三条约束
 *
 * 1. **纯函数**：不读文件、不联网、不依赖外部包（旧版 `pylatexenc` 是可选的，
 *    这里直接移植它的纯 regex fallback）。
 * 2. **数学区不可破坏**：转义必须跳过 `$...$` / `$$...$$` / 数学环境，
 *    否则公式会被自己人转义坏 —— 这是旧版反复踩的坑。
 * 3. **中间态与终态都产出**：`latexIntermediate` 保留 `[cite_key]` 便于人读与比对，
 *    `latex` 用 `\cite{}` 供编译（旧版两个文件都写，移植保持）。
 */
/** Paper 内的 LaTeX 子目录（与 `workspace-layout.ts` 的 `PAPER_SUBDIRS` 对应）。 */
export declare const LATEX_SUBDIR = "latex";
/** 主 tex 文件名（编译入口）。 */
export declare const MAIN_TEX = "main.tex";
/** 中间态 tex（引用保持 `[cite_key]`，便于人读）。 */
export declare const INTERMEDIATE_TEX = "main_intermediate.tex";
/** 论文模板类型（用户裁定：只要 IEEEtran 会议 / 期刊）。 */
export type PaperTemplate = 'conference' | 'journal';
/** 归一化模板名（未知值收敛到会议模板）。 */
export declare function normalizeTemplate(raw?: string): PaperTemplate;
/** 转义 LaTeX 中会引发编译问题的 Unicode 标点（旧版 `sanitize_unicode_chars`）。 */
export declare function sanitizeUnicodeChars(text: string): string;
/**
 * 纯文本安全化（旧版 `safe_text`，只用于 title / abstract）。
 *
 * 章节正文**不能**过这一层：它会把正文里合法的 LaTeX 命令当普通文本转义坏。
 * 正文走 {@link sanitizeLatexMath}。
 *
 * 旧版优先用 `pylatexenc`（可选依赖）；这里直接移植其 fallback 语义。
 */
export declare function safeText(text: string | undefined): string;
/**
 * 移除正文里的 Markdown 格式残留（旧版 `strip_markdown_headers`）。
 *
 * 模板已提供 `\section`，正文里再出现 `#` / `**` 就是标记泄漏（也是旧版最常见的编译错误源）。
 * 同时清掉 v2 论文里常见的占位注释与统计行。
 */
/**
 * 把**行内** Markdown 强调转成 LaTeX 命令（旧版靠上游 sanitizer 做，v2 的 paper.md 里内联强调很多）。
 *
 * `**x**` → `\textbf{x}`，`*x*` → `\textit{x}`。
 *
 * ⚠️ 必须保护数学区：`*` 在数学里是乘号，`$a*b$` 绝不能被当成斜体标记。
 * 行首的 `* 列表项` 因为不闭合，天然不会被匹配。
 */
export declare function convertInlineEmphasis(text: string): string;
export declare function stripMarkdownHeaders(text: string | undefined): string;
/**
 * 保护数学区、转义其余文本中的 LaTeX 特殊字符。
 *
 * 顺序（必须一致，否则会自己破坏公式）：
 *   1. 保护 `\begin{env}...\end{env}` 数学环境
 *   2. 保护 `$$...$$`
 *   3. 保护 `$...$`
 *   4. 把裸的 `x_1` / `x^2` 自动包进 `$...$` 并保护
 *   5. 对剩余文本转义 `& % # _ ^`（`(?<!\\)` 跳过已转义的）
 *   6. 还原占位
 *
 * 已知取舍（旧版实测行为，保留）：`snake_case` 会被误判成数学下标包成 `$snake_case$`；
 * 落单的 `$` 会把后续文本吞进数学区。改这两点会改变既有输出，故保持原语义。
 */
export declare function sanitizeLatexMath(text: string): string;
/** 一条参考文献（对应一个 `\bibitem`）。 */
export interface BibEntry {
    /** 引用键（`\cite{key}` 用）。 */
    key: string;
    /** 已排好的条目文本（IEEE 风格）。 */
    text: string;
}
/**
 * 构造 `thebibliography` 环境（旧版 `build_thebibliography`）。
 *
 * 旧版从 `citation_graph` 的 nodes 建 bibitem；v2 直接接受已排好的条目，
 * 让调用方（工具）从论文的参考文献段或 OpenAlex 记录构造。
 */
export declare function buildThebibliography(entries: readonly BibEntry[]): string;
/**
 * 把引用占位符转成 `\cite{}`（旧版 `inject_citations` 的三层转换）。
 *
 *   1. `[key1, key2]` → `\cite{key1,key2}`；分隔符支持逗号或分号
 *      （`[key1; key2; key3]`），并容忍 `arXiv:` / `doi:` 后缀注解
 *      （`[key, arXiv:2609.02265]` → `\cite{key}`，编号已写在参考文献条目里）
 *   2. `[alphaKey]` → `\cite{alphaKey}`（兜底；提供 knownKeys 时只转已知键，
 *      避免 `[TBD]` / `[t]` 之类被误转）
 *   3. `[12]` / `[3-5]` → 按 numberToKey 映射 → `\cite{...}`
 *
 * 数学区（`$...$` / `$$...$$`）内不替换 —— `\cite` 不能在数学模式里用。
 */
export declare function injectCitations(text: string, opts?: {
    knownKeys?: readonly string[];
    numberToKey?: Record<string, string>;
}): string;
/** 一张图（文件名 + 图注）。 */
export interface FigureSpec {
    name: string;
    caption: string;
}
/**
 * 把 Markdown 表格块转成 LaTeX `table` 环境（booktabs），并用哨兵保护正文，
 * 避免后续 `sanitizeLatexMath` 把 `&` 分隔符转义、把 `fact_update` 包进数学区。
 *
 * 支持 GitHub 风格管道表格：`| a | b |` 表头行 + `|---|---|` 分隔行（可带 `:`
 * 对齐标记）+ 数据行。表格上方紧邻的 `Table: <caption>` 行（或 `**Table N:**`）
 * 作为题注消费掉。
 *
 * 列宽策略（对齐 visual-evidence-selection 的宽表规则）：
 * - 估算各列最大视觉宽度（ASCII 1、CJK 2），总宽超过单栏阈值（约 62 字符）
 *   或列数 ≥ 6 → `table*`（跨栏），长文本列用 `p{...}` 换行；否则单栏 `table`，
 *   窄列用 `l` / `c` / `r`。
 *
 * 单元格内容按 LaTeX 转义（`& % # _ ^ $` 等），数学区（`$...$`）受保护。
 * 返回带 `\u0000MDTABLE<i>\u0000` 哨兵的正文；用 {@link restoreMarkdownTables}
 * 在净化/引用注入完成后还原。
 */
export declare function convertMarkdownTables(text: string, tables?: string[]): string;
/** 把 `convertMarkdownTables` 留下的哨兵还原为 LaTeX 表格。 */
export declare function restoreMarkdownTables(text: string, tables: readonly string[]): string;
/** 从图名派生 label（旧版规则：去 .png、下划线转连字符）。 */
export declare function figureLabel(name: string): string;
/**
 * 把 `\ref{fig:label}` 所在行替换为占位符 `<<FIG:label>>`（旧版 `embed_figures_in_text`）。
 * 占位符是纯文本，不会被 {@link sanitizeLatexMath} 污染。
 */
export declare function embedFiguresInText(text: string, figures: readonly FigureSpec[]): string;
/** 把 `<<FIG:label>>` 还原为 figure 环境（旧版 `inject_figure_code`；双栏用 0.5\textwidth）。 */
export declare function injectFigureCode(text: string, figures: readonly FigureSpec[]): string;
/** 公式类型（29 种；未知类型静默收敛为 `custom`，与旧版一致）。 */
export declare const EQUATION_TYPES: readonly string[];
/** 一条公式（旧版 EquationIR 的最小形态）。 */
export interface EquationSpec {
    equationId: string;
    equationType: string;
    description?: string;
    label?: string;
    /** 仅 custom 类型使用：structure.latex 或 components。 */
    structure?: {
        latex?: string;
        components?: Array<Record<string, unknown>>;
    };
}
/** 归一化公式类型（未知 → `custom`，静默收敛，与旧版一致）。 */
export declare function normalizeEquationType(raw: string | undefined): string;
/** 渲染一条公式的**体**（不含 environment）。 */
export declare function renderEquationBody(eq: EquationSpec): string;
/** 渲染一条公式为 `equation` 环境（旧版 `EquationRenderer.render`）。 */
export declare function renderEquation(eq: EquationSpec, withLabel?: boolean): string;
/**
 * 把 `<<EQ:key>>` 占位符替换为渲染后的公式（旧版 `inject_equation_code`）。
 *
 * 每条公式注册 7 个键（**先注册者优先**）：
 * `equationId`、`eq-<id>`、`equationType`、`eq-<type>`、`$<type>$`、`label`、`label 冒号转连字符`。
 * 未匹配的占位符**原样保留**（旧版行为，便于发现漏配）。
 */
export declare function injectEquationCode(text: string, equations: readonly EquationSpec[]): string;
/** 组装输入。 */
export interface ComposeInput {
    template?: PaperTemplate | string;
    title?: string;
    authors?: string;
    affiliation?: string;
    keywords?: string[];
    abstract?: string;
    /** 正文章节（按顺序；模板会为每节生成 `\section`）。 */
    sections: Array<{
        title: string;
        body: string;
    }>;
    /** 参考文献条目。 */
    bibliography?: readonly BibEntry[];
    /** 已知引用键（用于过滤无效引用）。 */
    knownKeys?: readonly string[];
    /** 数字引用 → key 映射（旧版 citation_graph 的等价物）。 */
    numberToKey?: Record<string, string>;
    equations?: readonly EquationSpec[];
    figures?: readonly FigureSpec[];
    /** 已渲染好的表 / 图 LaTeX（追加到实验章节末尾）。 */
    tablesLatex?: string;
    figuresLatex?: string;
}
/** 组装结果。 */
export interface ComposeResult {
    /** 终态文档（`\cite{}`，用于编译）。 */
    latex: string;
    /** 中间态文档（引用保持 `[cite_key]` 原样，便于人读）。 */
    latexIntermediate: string;
    /** 处理后留下的提示（如未匹配的占位符）。 */
    warnings: string[];
}
/**
 * 组装完整 LaTeX 文档（旧版 `latex_composer.execute` 的移植）。
 *
 * 处理链：Markdown 残留清理 → 公式注入 → 数学区净化 →（图占位）→ 引用注入。
 * 终态与中间态分别产出，与旧版 `latex_document` / `latex_document_intermediate` 对应。
 */
export declare function composeDocument(input: ComposeInput): ComposeResult;
/**
 * 章节标题安全化。
 *
 * v2 的 `paper.md` 章节标题带编号与标点（`1. Introduction`、`4. Experiments`），
 * LaTeX 里 `\section{1. Introduction}` 会连编号一起排进去，因此剥掉前导编号。
 * 同时转义标题里的特殊字符。
 */
export declare function escapeSectionTitle(title: string): string;
//# sourceMappingURL=latex.d.ts.map