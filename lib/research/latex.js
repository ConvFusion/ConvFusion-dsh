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
/** 转义 LaTeX 中会引发编译问题的 Unicode 标点（旧版 `sanitize_unicode_chars`）。 */
export function sanitizeUnicodeChars(text) {
    return text
        .replace(/\u2014/g, '---') // em dash
        .replace(/\u2013/g, '--') // en dash
        .replace(/\u2019/g, "'") // ’
        .replace(/\u2018/g, "'") // ‘
        .replace(/\u201c/g, '``') // “
        .replace(/\u201d/g, "''") // ”
        .replace(/\u2022/g, '$\\bullet$') // •
        .replace(/\u00a0/g, ' '); // nbsp
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
    const src = text ?? '';
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
    // 行首 Markdown 标题（# / \#，含 "## 3. Method" 形态）
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
 *   1. `[key1, key2]` → `\cite{key1,key2}`
 *   2. `[alphaKey]` → `\cite{alphaKey}`（兜底，捕获 Agent 自由生成的引用）
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
    // 1) 多引用
    out = out.replace(/\[([a-zA-Z][a-zA-Z0-9]+(?:\s*,\s*[a-zA-Z][a-zA-Z0-9]+)+)\]/g, (m, group) => {
        const keys = group.split(/\s*,\s*/);
        const valid = known ? keys.filter((k) => known.has(k)) : keys;
        return valid.length > 0 ? `\\cite{${valid.join(',')}}` : m;
    });
    // 2) 单引用兜底
    out = out.replace(/\[([a-zA-Z][a-zA-Z0-9]+)\]/g, '\\cite{$1}');
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
        // 2) 图占位（保护 \ref 不被后续净化污染）
        body = embedFiguresInText(body, figures);
        // 3) 公式注入
        body = injectEquationCode(body, equations);
        // 4) 数学区净化
        body = sanitizeLatexMath(body);
        // 5) 图还原
        body = injectFigureCode(body, figures);
        const intermediate = body;
        const final = injectCitations(body, {
            ...(input.knownKeys ? { knownKeys: input.knownKeys } : {}),
            ...(input.numberToKey ? { numberToKey: input.numberToKey } : {}),
        });
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