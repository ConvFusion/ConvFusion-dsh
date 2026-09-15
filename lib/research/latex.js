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
/* ════════════════════════════════════════════════════════════════════════
 * 模板
 * ════════════════════════════════════════════════════════════════════════ */
/** Paper 内的 LaTeX 子目录（与 `workspace-layout.ts` 的 `PAPER_SUBDIRS` 对应）。 */
export const LATEX_SUBDIR = 'latex';
/** 主 tex 文件名（编译入口）。 */
export const MAIN_TEX = 'main.tex';
/** 中间态 tex（引用保持 `[cite_key]`，便于人读）。 */
export const INTERMEDIATE_TEX = 'main_intermediate.tex';
/** 归一化模板名（未知值收敛到会议模板）。 */
export function normalizeTemplate(raw) {
    const v = (raw ?? '').trim().toLowerCase();
    return v === 'journal' || v === 'ieee' ? 'journal' : 'conference';
}
/** 模板的导言区（两个模板共用，仅 documentclass 选项不同）。 */
const PREAMBLE_PACKAGES = [
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage[numbers]{natbib}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{booktabs}',
    '\\usepackage{url}',
    '\\usepackage{float}',
].join('\n');
/**
 * 转义 LaTeX 中会引发编译问题的 Unicode 标点与符号（旧版 `sanitize_unicode_chars`）。
 *
 * ⚠️ **为什么必须逐字符映射，而不是"过滤掉非 ASCII"**：
 * LaTeX 对不认识的 Unicode 字符是**静默丢弃**的，而其中一些字符**承载语义**。
 * 实测事故：消融表里的 `−0.207`（U+2212 减号）被丢弃后变成 `0.207`，
 * 把"下降 0.207"渲染成"0.207"，直接反转结论方向；`≥2` 变成 `2`；
 * `0→1e-3` 变成 `01e-3`；`Cohen's κ` 变成 `Cohen's `。
 * 因此这里按"语义等价"映射，**绝不删除**既有信息的字符。
 *
 * 数学/希腊字母映射到数学模式命令（`amsmath`/`amssymb` 由模板提供）。
 * emoji 无 LaTeX 字体支持，映射为文本标签以保留"是否达标"的判断。
 */
export function sanitizeUnicodeChars(text) {
    // 先保护**已有**数学区域：替换会在文本里插入 `$...$`，若落在原有 `$...$` 内部
    // 会产生嵌套定界符，改变数学模式边界。
    const mathRegions = [];
    let out = text
        .replace(/\$\$[\s\S]*?\$\$/g, (m) => {
        mathRegions.push(m);
        return `\u0000UMATH${mathRegions.length - 1}\u0000`;
    })
        .replace(/\$[^$\n]*\$/g, (m) => {
        mathRegions.push(m);
        return `\u0000UMATH${mathRegions.length - 1}\u0000`;
    });
    out = out
        // ── 标点 ──
        .replace(/\u2014/g, '---') // em dash
        .replace(/\u2013/g, '--') // en dash
        .replace(/\u2019/g, "'") // ’
        .replace(/\u2018/g, "'") // ‘
        .replace(/\u201c/g, '``') // “
        .replace(/\u201d/g, "''") // ”
        .replace(/\u2022/g, '$\\bullet$') // •
        .replace(/\u00a0/g, ' ') // nbsp
        .replace(/\u2026/g, '\\ldots{}') // …
        .replace(/\u2032/g, "$'$") // ′
        .replace(/\u2033/g, "$''$") // ″
        // ── 数学关系与运算（缺失会导致语义反转）──
        .replace(/\u2212/g, '-') // − minus sign（文本模式下即正确减号）
        .replace(/\u2265/g, '$\\geq$') // ≥
        .replace(/\u2264/g, '$\\leq$') // ≤
        .replace(/\u2260/g, '$\\neq$') // ≠
        .replace(/\u2248/g, '$\\approx$') // ≈
        .replace(/\u2192/g, '$\\rightarrow$') // →
        .replace(/\u2190/g, '$\\leftarrow$') // ←
        .replace(/\u21d2/g, '$\\Rightarrow$') // ⇒
        .replace(/\u00d7/g, '$\\times$') // ×
        .replace(/\u00f7/g, '$\\div$') // ÷
        .replace(/\u00b1/g, '$\\pm$') // ±
        .replace(/\u2208/g, '$\\in$') // ∈
        .replace(/\u2209/g, '$\\notin$') // ∉
        .replace(/\u221e/g, '$\\infty$') // ∞
        .replace(/\u221d/g, '$\\propto$') // ∝
        .replace(/\u2211/g, '$\\sum$') // ∑
        .replace(/\u220f/g, '$\\prod$') // ∏
        .replace(/\u221a/g, '$\\surd$') // √
        .replace(/\u222a/g, '$\\cup$') // ∪
        .replace(/\u2229/g, '$\\cap$') // ∩
        .replace(/\u2286/g, '$\\subseteq$') // ⊆
        .replace(/\u2205/g, '$\\emptyset$') // ∅
        .replace(/\u00b0/g, '$^\\circ$') // °
        // ── 希腊字母（论文高频；amsmath/amssymb 提供）──
        .replace(/\u03b1/g, '$\\alpha$')
        .replace(/\u03b2/g, '$\\beta$')
        .replace(/\u03b3/g, '$\\gamma$')
        .replace(/\u03b4/g, '$\\delta$')
        .replace(/\u03b5/g, '$\\epsilon$')
        .replace(/\u03b6/g, '$\\zeta$')
        .replace(/\u03b7/g, '$\\eta$')
        .replace(/\u03b8/g, '$\\theta$')
        .replace(/\u03b9/g, '$\\iota$')
        .replace(/\u03ba/g, '$\\kappa$')
        .replace(/\u03bb/g, '$\\lambda$')
        .replace(/\u03bc/g, '$\\mu$')
        .replace(/\u03bd/g, '$\\nu$')
        .replace(/\u03be/g, '$\\xi$')
        .replace(/\u03c0/g, '$\\pi$')
        .replace(/\u03c1/g, '$\\rho$')
        .replace(/\u03c2/g, '$\\varsigma$')
        .replace(/\u03c3/g, '$\\sigma$')
        .replace(/\u03c4/g, '$\\tau$')
        .replace(/\u03c5/g, '$\\upsilon$')
        .replace(/\u03c6/g, '$\\phi$')
        .replace(/\u03c7/g, '$\\chi$')
        .replace(/\u03c8/g, '$\\psi$')
        .replace(/\u03c9/g, '$\\omega$')
        .replace(/\u0393/g, '$\\Gamma$')
        .replace(/\u0394/g, '$\\Delta$')
        .replace(/\u0398/g, '$\\Theta$')
        .replace(/\u039b/g, '$\\Lambda$')
        .replace(/\u039e/g, '$\\Xi$')
        .replace(/\u03a0/g, '$\\Pi$')
        .replace(/\u03a3/g, '$\\Sigma$')
        .replace(/\u03a6/g, '$\\Phi$')
        .replace(/\u03a8/g, '$\\Psi$')
        .replace(/\u03a9/g, '$\\Omega$')
        // ── 排版/货币（用纯文本等价物，避免依赖额外宏包）──
        .replace(/\u00a9/g, '(c)') // ©
        .replace(/\u00ae/g, '(R)') // ®
        .replace(/\u2122/g, '(TM)') // ™
        .replace(/\u00a7/g, '\\S{}') // §
        .replace(/\u00b6/g, '\\P{}') // ¶
        .replace(/\u20ac/g, 'EUR') // €
        .replace(/\u00a3/g, 'GBP') // £
        .replace(/\u00a5/g, 'JPY') // ¥
        // ── emoji / 状态标记 → 文本标签（保留语义，不静默丢弃）──
        .replace(/\u26a0\ufe0f?/g, '[!]') // ⚠️
        .replace(/\u2705/g, '[yes]') // ✅
        .replace(/\u274c/g, '[no]') // ❌
        .replace(/\u2b50/g, '[*]') // ⭐
        .replace(/\u2714\ufe0f?/g, '[yes]') // ✔
        .replace(/\u2717/g, '[no]') // ✗
        .replace(/\ud83d\udd11/g, '[key]') // 🔑
        .replace(/\ud83d\udcca/g, '[chart]') // 📊
        .replace(/\ud83d\udcc4/g, '[file]') // 📄
        .replace(/\ud83c\udfaf/g, '[target]') // 🎯
        .replace(/\ud83d\udd0d/g, '[search]') // 🔍
        // ── 零宽字符与变体选择符：无渲染意义，删除 ──
        .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '')
        .replace(/\ufe0f/g, '');
    // 还原被保护的数学区域
    for (let i = 0; i < mathRegions.length; i++) {
        out = out.split(`\u0000UMATH${i}\u0000`).join(mathRegions[i]);
    }
    return out;
}
/**
 * 纯文本安全化（旧版 `safe_text`，只用于 title / abstract）。
 *
 * 章节正文**不能**过这一层：它会把正文里合法的 LaTeX 命令当普通文本转义坏。
 * 正文走 {@link sanitizeLatexMath}。
 *
 * 旧版优先用 `pylatexenc`（可选依赖）；这里直接移植其 fallback 语义。
 */
export function safeText(text) {
    // title / abstract / authors 与正文一样会带 Unicode（`≥`、`κ`、`⚠️` 等）。
    // 不做这层映射，它们会在 PDF 里静默消失 —— 论文标题里少一个符号读者是看得见的。
    const src = sanitizeUnicodeChars(text ?? '');
    const mathRegions = [];
    const protect = (m) => {
        mathRegions.push(m);
        return `\u0000MATHREGION${mathRegions.length - 1}\u0000`;
    };
    let out = src
        .replace(/\$\$[\s\S]*?\$\$/g, protect)
        .replace(/\$[^$]*\$/g, protect);
    const table = [
        ['&', '\\&'],
        ['%', '\\%'],
        ['#', '\\#'],
        ['_', '\\_'],
        ['~', '\\textasciitilde{}'],
    ];
    for (const [from, to] of table)
        out = out.split(from).join(to);
    out = out.split('{').join('\\{').split('}').join('\\}').split('^').join('\\^{}');
    for (let i = 0; i < mathRegions.length; i++) {
        out = out.split(`\u0000MATHREGION${i}\u0000`).join(mathRegions[i]);
    }
    return out;
}
/* ════════════════════════════════════════════════════════════════════════
 * Markdown 残留清理
 * ════════════════════════════════════════════════════════════════════════ */
/** 数学环境名（净化时需要保护）。 */
const MATH_ENVS = '(?:equation|equation\\*|align|align\\*|gather|gather\\*|multline|multline\\*|eqnarray|eqnarray\\*|displaymath)';
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
export function convertInlineEmphasis(text) {
    const regions = [];
    let out = text
        .replace(/\$\$[\s\S]*?\$\$/g, (m) => {
        regions.push(m);
        return `\u0000EMPH${regions.length - 1}\u0000`;
    })
        .replace(/\$[^$]*\$/g, (m) => {
        regions.push(m);
        return `\u0000EMPH${regions.length - 1}\u0000`;
    });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '\\textbf{$1}');
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '\\textit{$1}');
    for (let i = 0; i < regions.length; i++)
        out = out.split(`\u0000EMPH${i}\u0000`).join(regions[i]);
    return out;
}
export function stripMarkdownHeaders(text) {
    if (text === undefined || text === null)
        return '';
    let out = text;
    // HTML 注释（v2 论文里的章节占位 `<!-- 1. Introduction -->`）
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    // 行首整行加粗（如 **Abstract**）
    out = out.replace(/^\*\*(.+?)\*\*/gm, '$1');
    out = out.replace(/^__(.+?)__/gm, '$1');
    // 转义后的版本 \*\*
    out = out.replace(/^\\\*\\\*(.+?)\\\*\\\*/gm, '$1');
    // 行首 Markdown 标题。分两类处理，因为它们的归宿不同：
    //   `### X` / `#### X` 是**子小节**，在论文里承载真实结构（如 "3.1 Overview"）
    //     → 转成 \subsection* / \subsubsection* 保留层次。
    //     用**带星号**的形式：论文里的子小节标题自带编号（"3.1"、"4.2"），
    //     若用自动编号的 \subsection，IEEEtran 会再加一层 "A."，渲染成 "A. 3.1 …"（实测冗余）。
    //     作者自带编号也让正文里的 "Section 5.3" 一类引用与标题始终对得上。
    //     此前这些行被无差别删除，导致子小节标题**全部消失**：正文段落还在，
    //     读者却看不出方法被分成了哪几块。
    //   `## X` / `# X` 是章节标题，已由模板的 \section 承载；正文里再出现即为标记泄漏，删除。
    // 顺序要紧：先 4 个 #、再 3 个 #，最后才删除剩余的 1–2 个 #。
    out = out.replace(/^####\s+(.+?)\s*$/gm, '\\subsubsection*{$1}');
    out = out.replace(/^###\s+(.+?)\s*$/gm, '\\subsection*{$1}');
    out = out.replace(/^(?:\\#|#)+\s+.*$/gm, '');
    // 统计摘要行（旧版遗留）
    out = out.replace(/^.*?(Reference Count|Total Word Count|Number of Paragraphs).*$/gm, '');
    // v2 写作状态标记：[STATUS: ...] 单独成行
    out = out.replace(/^\s*\[STATUS:[^\]]*\]\s*$/gm, '');
    // 行内强调 → LaTeX 命令
    out = convertInlineEmphasis(out);
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
}
/* ════════════════════════════════════════════════════════════════════════
 * 数学区净化（旧版 equation_utils.sanitize_latex_math）
 * ════════════════════════════════════════════════════════════════════════ */
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
export function sanitizeLatexMath(text) {
    const regions = [];
    let idx = 0;
    const sentinel = (i) => `\u0000MATH${i}\u0000`;
    const protect = (m) => {
        const i = idx++;
        regions.push(m);
        return sentinel(i);
    };
    let out = text;
    // 0) 命令参数里的**字面名字**（图片文件名 / 引用键 / 标签）：这些参数中的 `_`、`%`、`&`
    //    是名字本身的一部分，不是排版符号。转义它们会让 LaTeX 找不到目标。
    //    实测事故：`\includegraphics{figures/fig1_method.pdf}` 被转成
    //    `figures/fig1\_method.pdf` —— **图片静默不渲染**：PDF 里只剩图注和空白，
    //    而 `\includegraphics` 失败不报 error，编译仍然 0 错误。这类缺陷肉眼极难发现。
    out = out.replace(/(\\(?:includegraphics|label|ref|eqref|cite|citep|citet|input|include|bibliography)\s*(?:\[[^\]]*\])?\s*\{)([^}]*)(\})/g, (_m, pre, arg, post) => `${pre}${protect(arg)}${post}`);
    // 1) 数学环境
    out = out.replace(new RegExp(`\\\\begin\\{${MATH_ENVS}\\}[\\s\\S]*?\\\\end\\{${MATH_ENVS}\\}`, 'g'), protect);
    // 2) display math
    out = out.replace(/\$\$[^$]*\$\$/g, protect);
    // 3) inline math
    out = out.replace(/\$[^$]*\$/g, protect);
    // 4) 裸下标 / 上标
    out = out.replace(/\b[a-zA-Z]+(?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+)+\b/g, (m) => protect(`$${m}$`));
    // 5) 转义（跳过已转义字符）
    const escapes = [
        ['&', '\\&'],
        ['%', '\\%'],
        ['#', '\\#'],
        ['_', '\\_'],
        ['^', '\\^'],
    ];
    for (const [ch, to] of escapes) {
        out = out.replace(new RegExp(`(?<!\\\\)${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), to);
    }
    // 6) 还原
    for (let i = 0; i < regions.length; i++) {
        out = out.split(sentinel(i)).join(regions[i]);
    }
    return out;
}
/**
 * 构造 `thebibliography` 环境（旧版 `build_thebibliography`）。
 *
 * 旧版从 `citation_graph` 的 nodes 建 bibitem；v2 直接接受已排好的条目，
 * 让调用方（工具）从论文的参考文献段或 OpenAlex 记录构造。
 */
export function buildThebibliography(entries) {
    if (entries.length === 0)
        return '';
    const items = entries.map((e) => `\\bibitem{${e.key}} ${e.text}`);
    return `\\begin{thebibliography}{99}\n${items.join('\n')}\n\\end{thebibliography}`;
}
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
export function injectCitations(text, opts = {}) {
    const known = opts.knownKeys && opts.knownKeys.length > 0 ? new Set(opts.knownKeys) : null;
    const regions = [];
    const protect = (m) => {
        regions.push(m);
        return `\u0000CITEMATH${regions.length - 1}\u0000`;
    };
    let out = text.replace(/\$\$[^$]*\$\$/g, protect).replace(/\$[^$]*\$/g, protect);
    // 0) 引用组归一化：`[a; b]` → `[a, b]`；剥离 `, arXiv:xxxx` / `, doi:xxxx` 注解。
    //    只在组内容「全是引用键（可带 arXiv:/doi: 注解）」时处理；其余（[TBD]、[t]、
    //    [width=\textwidth]、含空格/标点的 prose 括号）原样保留。
    out = out.replace(/\[([a-zA-Z][a-zA-Z0-9]*(?:\s*[,;]\s*(?:[a-zA-Z][a-zA-Z0-9]*|(?:arXiv|doi):[^\s,;]+))+\s*)\]/g, (m, group) => {
        const keys = group
            .split(/\s*[,;]\s*/)
            .map((s) => s.replace(/^(?:arXiv|doi):.*$/i, '').trim())
            .filter(Boolean);
        return keys.length > 0 ? `[${keys.join(', ')}]` : m;
    });
    // 1) 多引用
    out = out.replace(/\[([a-zA-Z][a-zA-Z0-9]+(?:\s*,\s*[a-zA-Z][a-zA-Z0-9]+)+)\]/g, (m, group) => {
        const keys = group.split(/\s*,\s*/);
        const valid = known ? keys.filter((k) => known.has(k)) : keys;
        return valid.length > 0 ? `\\cite{${valid.join(',')}}` : m;
    });
    // 2) 单引用兜底（提供 knownKeys 时只转已知键）
    out = out.replace(/\[([a-zA-Z][a-zA-Z0-9]+)\]/g, (m, key) => {
        if (known && !known.has(key))
            return m;
        return `\\cite{${key}}`;
    });
    // 3) 数字引用 → key
    if (opts.numberToKey && Object.keys(opts.numberToKey).length > 0) {
        const map = opts.numberToKey;
        out = out.replace(/\[(\d+(?:[,-]\s*\d+)*)\]/g, (m, group) => {
            const keys = [];
            for (const part of group.split(',')) {
                const p = part.trim();
                if (p.includes('-')) {
                    const [a, b] = p.split('-');
                    const start = Number(a);
                    const end = Number(b);
                    if (Number.isFinite(start) && Number.isFinite(end)) {
                        for (let n = start; n <= end; n++) {
                            const k = map[String(n)];
                            if (k)
                                keys.push(k);
                        }
                    }
                }
                else {
                    const k = map[p];
                    if (k)
                        keys.push(k);
                }
            }
            const unique = [...new Set(keys)];
            return unique.length > 0 ? `\\cite{${unique.join(',')}}` : m;
        });
    }
    for (let i = 0; i < regions.length; i++)
        out = out.split(`\u0000CITEMATH${i}\u0000`).join(regions[i]);
    return out;
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
export function convertMarkdownTables(text, tables = []) {
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const isTableLine = /^\s*\|.*\|\s*$/.test(line);
        const isSep = i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]);
        if (isTableLine && isSep) {
            // 收集表块（表头 + 分隔 + 数据行）
            const block = [line];
            let j = i + 1;
            while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
                block.push(lines[j]);
                j++;
            }
            // 题注：表格上方的 `Table: ...` / `**Table N:** ...` 行
            let caption = '';
            let k = i - 1;
            while (k >= 0 && lines[k].trim() === '')
                k--;
            if (k >= 0) {
                const m = lines[k].match(/^\s*(?:\*\*)?Table\s*\d*\.?:?\s*(.+?)\s*\*{0,2}$/i);
                if (m) {
                    caption = m[1].trim();
                    lines[k] = ''; // 消费题注行
                }
            }
            const idx = tables.length;
            tables.push(buildTableLatex(block, caption, idx));
            out.push(`\u0000MDTABLE${idx}\u0000`);
            i = j;
        }
        else {
            out.push(line);
            i++;
        }
    }
    return out.join('\n');
}
/** 把 `convertMarkdownTables` 留下的哨兵还原为 LaTeX 表格。 */
export function restoreMarkdownTables(text, tables) {
    let out = text;
    for (let i = 0; i < tables.length; i++) {
        out = out.split(`\u0000MDTABLE${i}\u0000`).join(tables[i]);
    }
    return out;
}
/** 单元格内联 Markdown 残留清理 + LaTeX 转义（保护数学区）。 */
function escapeTableCell(raw) {
    const regions = [];
    let out = raw
        .replace(/\$\$[\s\S]*?\$\$/g, (m) => {
        regions.push(m);
        return `\u0000CELLMATH${regions.length - 1}\u0000`;
    })
        .replace(/\$[^$]*\$/g, (m) => {
        regions.push(m);
        return `\u0000CELLMATH${regions.length - 1}\u0000`;
    });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '\\textbf{$1}');
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '\\textit{$1}');
    out = out.replace(/&/g, '\\&').replace(/%/g, '\\%').replace(/#/g, '\\#').replace(/_/g, '\\_').replace(/\^/g, '\\^{}');
    out = out.replace(/\$/g, '\\$'); // 落单 $ 转义（数学区已保护）
    for (let r = 0; r < regions.length; r++)
        out = out.split(`\u0000CELLMATH${r}\u0000`).join(regions[r]);
    return out;
}
/** 估算字符串在 8pt IEEEtron 下的近似宽度（ASCII=1，CJK/宽字符=2）。 */
function visualWidth(s) {
    let w = 0;
    for (const ch of s) {
        const code = ch.codePointAt(0) ?? 0;
        // LaTeX 命令按字面长度算（\textbf{..} 等），已转义字符按剩余文本算
        w += code > 0x2e7f || code === 0x2014 ? 2 : 1;
    }
    return w;
}
/** 解析一行管道表格 → 单元格数组（去掉首尾 `|`）。 */
function parsePipeRow(line) {
    const trimmed = line.trim();
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    return inner.split('|').map((c) => c.trim());
}
/** 由分隔行推断对齐（`:---` 左、`---:` 右、`:---:` 中、默认左）。 */
function alignFromSep(sep) {
    const s = sep.replace(/-/g, '').trim();
    const left = s.startsWith(':');
    const right = s.endsWith(':');
    if (left && right)
        return 'c';
    if (right)
        return 'r';
    return 'l';
}
/** 把表块（含题注行判断之外的 `|` 行）渲染成 LaTeX `table`/`table*`。 */
function buildTableLatex(block, caption, idx) {
    const header = parsePipeRow(block[0]);
    const sepRow = parsePipeRow(block[1] ?? '');
    const dataRows = block.slice(2).map(parsePipeRow);
    const nCols = Math.max(header.length, ...dataRows.map((r) => r.length));
    // 各列最大视觉宽度
    const colWidths = Array(nCols).fill(0);
    for (const row of [header, ...dataRows]) {
        for (let c = 0; c < nCols; c++) {
            colWidths[c] = Math.max(colWidths[c], visualWidth(row[c] ?? ''));
        }
    }
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const wide = totalWidth > 62 || nCols >= 6;
    const aligns = Array.from({ length: nCols }, (_, c) => (sepRow[c] ? alignFromSep(sepRow[c]) : 'l'));
    // 列规格：宽表的长列（>18 视觉宽）用 p{...}，其余用 l/c/r
    const colSpec = Array.from({ length: nCols }, (_, c) => {
        const w = colWidths[c];
        if (wide && w > 18) {
            const frac = Math.max(0.1, Math.min(0.8, (w / Math.max(totalWidth, 1)) * (wide ? 0.92 : 1)));
            return `p{${frac.toFixed(2)}\\textwidth}`;
        }
        return aligns[c];
    }).join(' ');
    const fmtRow = (row) => Array.from({ length: nCols }, (_, c) => escapeTableCell(row[c] ?? '')).join(' & ') + ' \\\\';
    const env = wide ? 'table*' : 'table';
    const lines = [
        `\\begin{${env}}[t]`,
        '\\centering',
    ];
    if (caption) {
        lines.push(`\\caption{${escapeTableCell(caption)}}`);
        lines.push(`\\label{tab:md-${idx}}`);
    }
    lines.push(`\\begin{tabular}{${colSpec}}`, '\\toprule', fmtRow(header), '\\midrule', ...dataRows.map(fmtRow), '\\bottomrule', '\\end{tabular}', `\\end{${env}}`);
    return lines.join('\n');
}
/** 从图名派生 label（旧版规则：去 .png、下划线转连字符）。 */
export function figureLabel(name) {
    return name.replace(/\.png$/i, '').replace(/_/g, '-');
}
/**
 * 把 `\ref{fig:label}` 所在行替换为占位符 `<<FIG:label>>`（旧版 `embed_figures_in_text`）。
 * 占位符是纯文本，不会被 {@link sanitizeLatexMath} 污染。
 */
export function embedFiguresInText(text, figures) {
    if (figures.length === 0 || !text)
        return text;
    const labels = new Set(figures.map((f) => figureLabel(f.name)));
    const inserted = new Set();
    const out = [];
    for (const line of text.split('\n')) {
        for (const label of labels) {
            if (inserted.has(label))
                continue;
            if (line.includes(`\\ref{fig:${label}}`)) {
                inserted.add(label);
                out.push(`<<FIG:${label}>>`, '');
                break;
            }
        }
        out.push(line);
    }
    return out.join('\n');
}
/** 把 `<<FIG:label>>` 还原为 figure 环境（旧版 `inject_figure_code`；双栏用 0.5\textwidth）。 */
export function injectFigureCode(text, figures) {
    if (figures.length === 0)
        return text;
    let out = text;
    for (const fig of figures) {
        const label = figureLabel(fig.name);
        const block = [
            '\\begin{figure}[H]',
            '\\centering',
            `\\includegraphics[width=0.5\\textwidth]{${fig.name}}`,
            `\\caption{${fig.caption}}`,
            `\\label{fig:${label}}`,
            '\\end{figure}',
        ].join('\n');
        out = out.split(`<<FIG:${label}>>`).join(block);
    }
    return out;
}
/* ════════════════════════════════════════════════════════════════════════
 * 公式（移植自 modules/paper/equation）
 * ════════════════════════════════════════════════════════════════════════ */
/** 公式类型（29 种；未知类型静默收敛为 `custom`，与旧版一致）。 */
export const EQUATION_TYPES = [
    'attention', 'softmax', 'message_passing', 'linear_projection', 'cross_entropy',
    'mse_loss', 'contrastive_loss', 'graph_aggregation', 'transformer_attention', 'gat_attention',
    'temporal_convolution', 'layer_norm', 'batch_norm', 'relu', 'gelu',
    'sigmoid', 'tanh', 'residual_connection', 'feed_forward', 'positional_encoding',
    'graph_convolution', 'weighted_sum', 'mean_pooling', 'max_pooling', 'concat',
    'dot_product', 'cosine_similarity', 'euclidean_distance', 'custom',
];
/** 类型 → LaTeX 公式体（旧版各 renderer 的表合并；`custom` 走 structure.latex）。 */
const EQUATION_TEMPLATES = {
    attention: '\\text{Attention}(Q, K, V) = \\text{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d_k}}\\right) V',
    transformer_attention: '\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\ldots, \\text{head}_h) W^O',
    gat_attention: '\\alpha_{vu} = \\frac{\\exp\\!\\left(\\text{LeakyReLU}\\!\\left(\\mathbf{a}^{\\top}[\\mathbf{W}\\mathbf{h}_v \\| \\mathbf{W}\\mathbf{h}_u]\\right)\\right)}{\\sum_{w \\in \\mathcal{N}(v)} \\exp\\!\\left(\\text{LeakyReLU}\\!\\left(\\mathbf{a}^{\\top}[\\mathbf{W}\\mathbf{h}_v \\| \\mathbf{W}\\mathbf{h}_w]\\right)\\right)}',
    cross_entropy: '\\mathcal{L}_{\\text{CE}} = -\\sum_{i=1}^{N} y_i \\log(\\hat{y}_i)',
    mse_loss: '\\mathcal{L}_{\\text{MSE}} = \\frac{1}{N} \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2',
    contrastive_loss: '\\mathcal{L}_{\\text{contrast}} = -\\log \\frac{\\exp(\\text{sim}(z_i, z_j) / \\tau)}{\\sum_{k \\neq i} \\exp(\\text{sim}(z_i, z_k) / \\tau)}',
    message_passing: '\\mathbf{h}_v^{(l+1)} = \\text{UPDATE}^{(l)}\\!\\left(\\mathbf{h}_v^{(l)}, \\text{AGGREGATE}^{(l)}\\!\\left(\\left\\{\\mathbf{h}_u^{(l)} : u \\in \\mathcal{N}(v)\\right\\}\\right)\\right)',
    graph_aggregation: '\\mathbf{a}_v^{(l)} = \\text{AGGREGATE}^{(l)}\\!\\left(\\left\\{\\mathbf{h}_u^{(l)} : u \\in \\mathcal{N}(v)\\right\\}\\right)',
    graph_convolution: '\\mathbf{H}^{(l+1)} = \\sigma\\!\\left(\\tilde{\\mathbf{D}}^{-\\frac{1}{2}} \\tilde{\\mathbf{A}} \\tilde{\\mathbf{D}}^{-\\frac{1}{2}} \\mathbf{H}^{(l)} \\mathbf{W}^{(l)}\\right)',
    softmax: '\\text{softmax}(x_i) = \\frac{\\exp(x_i)}{\\sum_{j} \\exp(x_j)}',
    linear_projection: '\\mathbf{y} = \\mathbf{W}\\mathbf{x} + \\mathbf{b}',
    layer_norm: '\\text{LayerNorm}(\\mathbf{x}) = \\gamma \\odot \\frac{\\mathbf{x} - \\mu}{\\sqrt{\\sigma^2 + \\epsilon}} + \\beta',
    batch_norm: '\\text{BatchNorm}(\\mathbf{x}) = \\gamma \\odot \\frac{\\mathbf{x} - \\mu_{\\mathcal{B}}}{\\sqrt{\\sigma_{\\mathcal{B}}^2 + \\epsilon}} + \\beta',
    relu: '\\text{ReLU}(x) = \\max(0, x)',
    gelu: '\\text{GELU}(x) = x \\cdot \\Phi(x) \\approx 0.5x \\left(1 + \\tanh\\!\\left(\\sqrt{\\frac{2}{\\pi}} (x + 0.044715x^3)\\right)\\right)',
    sigmoid: '\\sigma(x) = \\frac{1}{1 + e^{-x}}',
    tanh: '\\tanh(x) = \\frac{e^{x} - e^{-x}}{e^{x} + e^{-x}}',
    residual_connection: '\\mathbf{h}^{(l+1)} = \\mathbf{h}^{(l)} + \\mathcal{F}^{(l)}(\\mathbf{h}^{(l)})',
    feed_forward: '\\text{FFN}(\\mathbf{x}) = \\text{GELU}(\\mathbf{x}W_1 + b_1)W_2 + b_2',
    positional_encoding: '\\text{PE}_{(pos, 2i)} = \\sin\\!\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right),\\quad \\text{PE}_{(pos, 2i+1)} = \\cos\\!\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right)',
    temporal_convolution: '\\mathbf{h}_t = \\sum_{k=0}^{K-1} \\mathbf{W}_k \\mathbf{x}_{t-k} + \\mathbf{b}',
    weighted_sum: '\\mathbf{z} = \\sum_{i=1}^{n} w_i \\mathbf{x}_i',
    mean_pooling: '\\mathbf{z} = \\frac{1}{N} \\sum_{i=1}^{N} \\mathbf{x}_i',
    max_pooling: '\\mathbf{z} = \\max_{i=1}^{N} \\mathbf{x}_i',
    concat: '\\mathbf{z} = [\\mathbf{x}_1 \\| \\mathbf{x}_2 \\| \\cdots \\| \\mathbf{x}_n]',
    dot_product: 's(\\mathbf{x}, \\mathbf{y}) = \\mathbf{x}^{\\top}\\mathbf{y}',
    cosine_similarity: '\\text{cosine}(\\mathbf{x}, \\mathbf{y}) = \\frac{\\mathbf{x}^{\\top}\\mathbf{y}}{\\|\\mathbf{x}\\| \\|\\mathbf{y}\\|}',
    euclidean_distance: 'd(\\mathbf{x}, \\mathbf{y}) = \\|\\mathbf{x} - \\mathbf{y}\\|_2',
};
/** 归一化公式类型（未知 → `custom`，静默收敛，与旧版一致）。 */
export function normalizeEquationType(raw) {
    const v = (raw ?? '').trim().toLowerCase();
    return EQUATION_TYPES.includes(v) ? v : 'custom';
}
/** 把 components 拼成公式体（旧版 `_render_from_components`）。 */
function renderFromComponents(components) {
    const parts = [];
    for (const c of components) {
        const type = String(c.type ?? '');
        const content = c.content === undefined ? '' : String(c.content);
        const sub = c.subscript === undefined ? '' : String(c.subscript);
        const sup = c.superscript === undefined ? '' : String(c.superscript);
        switch (type) {
            case 'text':
                parts.push(content);
                break;
            case 'fraction':
                parts.push(`\\frac{${c.numerator ?? '1'}}{${c.denominator ?? '1'}}`);
                break;
            case 'sum':
                parts.push(`\\sum${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}`);
                break;
            case 'paren':
                parts.push(`(${content})`);
                break;
            case 'bracket':
                parts.push(`[${content}]`);
                break;
            case 'superscript':
                parts.push(`^{${content}}`);
                break;
            case 'subscript':
                parts.push(`_{${content}}`);
                break;
            case 'sqrt':
                parts.push(`\\sqrt{${content}}`);
                break;
            case 'exp':
                parts.push(`\\exp(${content})`);
                break;
            case 'log':
                parts.push(`\\log(${content})`);
                break;
            default:
                parts.push(content);
                break;
        }
    }
    return parts.join(' ');
}
/** 渲染一条公式的**体**（不含 environment）。 */
export function renderEquationBody(eq) {
    const type = normalizeEquationType(eq.equationType);
    if (type === 'custom') {
        const s = eq.structure ?? {};
        if (typeof s.latex === 'string' && s.latex)
            return s.latex;
        if (Array.isArray(s.components))
            return renderFromComponents(s.components);
        return eq.description ?? '';
    }
    return EQUATION_TEMPLATES[type] ?? eq.description ?? '';
}
/** 渲染一条公式为 `equation` 环境（旧版 `EquationRenderer.render`）。 */
export function renderEquation(eq, withLabel = true) {
    const body = renderEquationBody(eq);
    const lines = ['\\begin{equation}', body];
    if (withLabel && eq.label)
        lines.push(`\\label{${eq.label}}`);
    lines.push('\\end{equation}');
    return lines.join('\n');
}
/**
 * 把 `<<EQ:key>>` 占位符替换为渲染后的公式（旧版 `inject_equation_code`）。
 *
 * 每条公式注册 7 个键（**先注册者优先**）：
 * `equationId`、`eq-<id>`、`equationType`、`eq-<type>`、`$<type>$`、`label`、`label 冒号转连字符`。
 * 未匹配的占位符**原样保留**（旧版行为，便于发现漏配）。
 */
export function injectEquationCode(text, equations) {
    if (!text || equations.length === 0)
        return text;
    const map = new Map();
    const add = (key, rendered) => {
        const placeholder = `<<EQ:${key}>>`;
        if (!map.has(placeholder))
            map.set(placeholder, rendered);
    };
    for (const eq of equations) {
        const rendered = renderEquation(eq, true);
        add(eq.equationId, rendered);
        add(`eq-${eq.equationId}`, rendered);
        add(eq.equationType, rendered);
        add(`eq-${eq.equationType}`, rendered);
        add(`$${eq.equationType}$`, rendered);
        if (eq.label) {
            add(eq.label, rendered);
            add(eq.label.replace(/:/g, '-'), rendered);
        }
    }
    let out = text;
    for (const [placeholder, rendered] of map) {
        if (out.includes(placeholder))
            out = out.split(placeholder).join(`\n\n${rendered}\n\n`);
    }
    return out;
}
/**
 * 组装完整 LaTeX 文档（旧版 `latex_composer.execute` 的移植）。
 *
 * 处理链：Markdown 残留清理 → 公式注入 → 数学区净化 →（图占位）→ 引用注入。
 * 终态与中间态分别产出，与旧版 `latex_document` / `latex_document_intermediate` 对应。
 */
export function composeDocument(input) {
    const warnings = [];
    const template = normalizeTemplate(input.template);
    // 标题：取首行、限长 200、纯文本安全化
    const rawTitle = (input.title ?? '').split(/\r?\n/)[0]?.trim() ?? '';
    const title = safeText(rawTitle.slice(0, 200) || 'Untitled');
    const abstractRaw = safeText(input.abstract ?? '');
    const abstract = stripMarkdownHeaders(abstractRaw);
    const equations = input.equations ?? [];
    const figures = input.figures ?? [];
    const chapters = [];
    for (const section of input.sections) {
        // 1) Markdown 残留
        let body = stripMarkdownHeaders(section.body);
        // 1.5) Markdown 表格 → 哨兵（必须赶在数学净化之前：& 分隔符、snake_case 单元格）
        const tables = [];
        body = convertMarkdownTables(body, tables);
        // 2) 图占位（保护 \ref 不被后续净化污染）
        body = embedFiguresInText(body, figures);
        // 3) 公式注入
        body = injectEquationCode(body, equations);
        // 4) 数学区净化
        body = sanitizeLatexMath(body);
        // 5) 图还原
        body = injectFigureCode(body, figures);
        const intermediate = restoreMarkdownTables(body, tables);
        const final = restoreMarkdownTables(injectCitations(body, {
            ...(input.knownKeys ? { knownKeys: input.knownKeys } : {}),
            ...(input.numberToKey ? { numberToKey: input.numberToKey } : {}),
        }), tables);
        chapters.push({ title: section.title, intermediate, final });
    }
    // 未匹配的公式占位符：提示出来后由调用方决定是否补配
    const allText = chapters.map((c) => c.final).join('\n');
    const unmatched = [...new Set(allText.match(/<<EQ:([^>]+)>>/g) ?? [])];
    if (unmatched.length > 0) {
        warnings.push(`有 ${unmatched.length} 个公式占位符未匹配：${unmatched.slice(0, 5).join(', ')}`);
    }
    const bib = buildThebibliography(input.bibliography ?? []);
    // 追加已渲染的表 / 图到最后一个章节（旧版把 artifacts 追加到 experiment）
    const artifacts = [input.tablesLatex, input.figuresLatex].filter((s) => Boolean(s && s.trim()));
    const appendArtifacts = (text, chapterTitle) => {
        if (artifacts.length === 0)
            return text;
        return `${text}\n\n${artifacts.join('\n\n')}`;
    };
    const renderDoc = (pick) => {
        const parts = [];
        parts.push(`\\documentclass${template === 'journal' ? '[journal]' : ''}{IEEEtran}`);
        parts.push(PREAMBLE_PACKAGES);
        parts.push('');
        parts.push('\\begin{document}');
        parts.push('');
        parts.push(`\\title{${title}}`);
        parts.push('');
        const authors = safeText(input.authors ?? 'Authors');
        const affiliation = safeText(input.affiliation ?? 'Affiliation');
        parts.push('\\author{\\IEEEauthorblockN{' + authors + '} \\\\');
        parts.push('\\IEEEauthorblockA{' + affiliation + '}}');
        parts.push('');
        parts.push('\\maketitle');
        parts.push('');
        if (abstract) {
            parts.push('\\begin{abstract}');
            parts.push(abstract);
            parts.push('\\end{abstract}');
            parts.push('');
        }
        if (template === 'journal' && input.keywords && input.keywords.length > 0) {
            parts.push('\\begin{IEEEkeywords}');
            parts.push(input.keywords.join(', '));
            parts.push('\\end{IEEEkeywords}');
            parts.push('');
        }
        for (const ch of chapters) {
            const body = appendArtifacts(pick === 'final' ? ch.final : ch.intermediate, ch.title);
            parts.push(`\\section{${escapeSectionTitle(ch.title)}}`);
            parts.push(body);
            parts.push('');
        }
        if (bib) {
            parts.push(bib);
            parts.push('');
        }
        parts.push('\\end{document}');
        return sanitizeUnicodeChars(parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n');
    };
    return {
        latex: renderDoc('final'),
        latexIntermediate: renderDoc('intermediate'),
        warnings,
    };
}
/**
 * 章节标题安全化。
 *
 * v2 的 `paper.md` 章节标题带编号与标点（`1. Introduction`、`4. Experiments`），
 * LaTeX 里 `\section{1. Introduction}` 会连编号一起排进去，因此剥掉前导编号。
 * 同时转义标题里的特殊字符。
 */
export function escapeSectionTitle(title) {
    const withoutNumber = title.replace(/^\s*\d+(?:\.\d+)*[.、)]?\s*/, '').trim() || title.trim();
    return withoutNumber
        .replace(/[&%#_]/g, (ch) => `\\${ch}`)
        .replace(/\$/g, '\\$');
}
//# sourceMappingURL=latex.js.map