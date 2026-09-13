/**
 * ConvFusion 2.0 — LaTeX 编译与修复（移植自 ConvFusion-dev `latex_renderer` / `latex_validator`）
 *
 * ## 它补的是哪个洞
 *
 * `latex.ts` 把 Markdown 变成 `main.tex`，但「编译成 PDF」与「按日志修错」这两步
 * 在旧版里是 `latex_renderer_skill`（调 tectonic）+ `latex_validator_skill`（确定性修复）。
 * 迁移时同样丢了。本模块把这两步变成可被工具调用的实现。
 *
 * ## 与旧版的关系
 *
 * - **编译**：旧版 `core/tools/tectonic/tool.py` 的 `subprocess: tectonic <file> --keep-logs`，
 *   返回 `{success, pdf_path, logs}`，成功判据是 `returncode == 0 and pdf 存在`。
 *   这里保持同一 schema 与判据（tectonic 容错性强，很多 LaTeX 错误只产生警告 ——
 *   实测 `100%`、`a_b_c`、`\undefinedcmd` 都不中止编译，只有真正致命错误才无 PDF）。
 * - **日志解析**：旧版只认 pdflatex 风格的 `main.tex:NN: error:` 与 `! ... l.NN`，
 *   且勘察确认有两个缺陷：warning 正则用 DOTALL 会**吞掉下一行**（D3），
 *   error Pattern 2 的 lookahead 要求字面 `\n` 导致几乎不可达（D4）。
 *   这里修正为**按行解析**并同时支持 tectonic 的 `error: <file>:<line>: <msg>` 形态。
 * - **确定性修复**：移植旧版三分支，并修正 D1（`\\\\\{` 要求两个反斜杠，真实 `\{` 永不匹配）
 *   与 D2（分支 d 多发一个 `$`）。
 *
 * ## 环境事实（实测）
 *
 * tectonic 不在默认 PATH；`/opt/homebrew/bin/tectonic` 与 `/Library/TeX/texbin/*` 存在。
 * 且 tectonic 默认缓存写在 `~/Library/Caches/Tectonic`，在受限沙箱下**写入被拒**，
 * 因此编译时必须把 `TECTONIC_CACHE_DIR` 指到工作区内可写目录。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
/* ════════════════════════════════════════════════════════════════════════
 * tectonic 定位与编译
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 编译超时（毫秒）。
 *
 * 旧版是 300 秒。tectonic 首次编译需要下载宏包（实测全新缓存约 43 MB），
 * 180 秒不够 —— 实测在真实工作区因超时而失败，故与旧版对齐取 300 秒。
 */
export const COMPILE_TIMEOUT_MS = 300000;
/** 指定 tectonic 可执行文件的环境变量名（用户未安装到标准位置时的覆盖入口）。 */
export const TECTONIC_ENV = 'CONVFUSION_TECTONIC';
/** 候选 tectonic 路径（PATH 之外常见位置）。 */
const TECTONIC_CANDIDATES = [
    'tectonic',
    '/opt/homebrew/bin/tectonic',
    '/usr/local/bin/tectonic',
    '/Library/TeX/texbin/tectonic',
];
/** 定位 tectonic 可执行文件；找不到返回 undefined。 */
export function findTectonic(env = process.env) {
    const override = (env[TECTONIC_ENV] ?? '').trim();
    if (override && existsSync(override))
        return override;
    for (const c of TECTONIC_CANDIDATES) {
        if (!c.includes('/')) {
            // PATH 查询
            const which = spawnSync('which', [c], { encoding: 'utf8' });
            const out = (which.stdout ?? '').trim();
            if (which.status === 0 && out)
                return out;
            continue;
        }
        if (existsSync(c))
            return c;
    }
    return undefined;
}
/** 探测 tectonic 版本字符串（`Tectonic 0.16.9`）；失败返回 undefined。 */
export function tectonicVersion(bin) {
    try {
        const res = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000 });
        const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split(/\r?\n/)[0];
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 从 tectonic stderr 与 TeX 日志中解析错误。
 *
 * 支持三种形态（按可靠性排序）：
 *   1. `error: <file>:<line>: <msg>` —— tectonic 包装后的带行号错误（首选）
 *   2. `! <msg>` 后跟 `l.<line> <上下文>` —— TeX 经典格式（配对取行号）
 *   3. 无行号的 `error:` / `!` 行 —— 收集但 line=0
 *
 * 按行扫描（修正旧版 D3/D4 的跨行吞并问题）；过滤 underfull/overfull 排版警告。
 */
export function parseCompileErrors(raw) {
    if (!raw || !raw.trim())
        return [];
    const lines = raw.split(/\r?\n/);
    const found = [];
    const seen = new Set();
    const push = (line, message, severity) => {
        const msg = message.trim();
        if (!msg)
            return;
        const lower = msg.toLowerCase();
        // 排版警告不当作错误（旧版同样跳过）
        if (lower.includes('underfull') || lower.includes('overfull'))
            return;
        const key = `${line}|${msg.slice(0, 60)}`;
        if (seen.has(key))
            return;
        seen.add(key);
        found.push({ line, message: msg, severity });
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 形态 1：tectonic 带行号错误
        const m1 = line.match(/^\s*error:\s*(?:.*?[/\\])?([^/\s\\]+\.tex):(\d+):\s*(.*)$/i);
        if (m1) {
            push(Number(m1[2]), m1[3], 'error');
            continue;
        }
        // 形态 1b：无文件名的 error:（如 `error: !Emergency stop`）
        const m1b = line.match(/^\s*error:\s*(.+)$/i);
        if (m1b) {
            const msg = m1b[1].trim();
            // 跳过 tectonic 自身的无关提示
            if (!/^(halted on|Running |Rerunning |Writing |Skipped |downloading )/i.test(msg)) {
                push(0, msg.replace(/^!\s*/, ''), 'error');
            }
            continue;
        }
        // 形态 2：TeX 经典 `! msg` + 后续 `l.NN`
        if (/^!/.test(line.trim())) {
            const msg = line.trim().replace(/^!\s*/, '');
            // 向后找最多 6 行内的 l.NN
            let lineNo = 0;
            for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
                const ml = lines[j].match(/^l\.(\d+)\s/);
                if (ml) {
                    lineNo = Number(ml[1]);
                    break;
                }
            }
            push(lineNo, msg, 'error');
            continue;
        }
        // 形态 3：LaTeX Warning（保留关键类，其余忽略）
        const mw = line.match(/LaTeX (?:Font )?Warning:\s*(.*)$/i);
        if (mw) {
            const msg = mw[1].trim();
            if (/undefined|Missing character|Invalid UTF-8/i.test(msg) && !/Font shape/i.test(msg)) {
                push(0, msg, 'warning');
            }
            continue;
        }
    }
    // 有行号的排前面，再按行号升序
    return found.sort((a, b) => {
        if (a.line === 0 && b.line !== 0)
            return 1;
        if (b.line === 0 && a.line !== 0)
            return -1;
        return a.line - b.line;
    });
}
/**
 * 编译一个 `.tex` 文件为 PDF。
 *
 * 在 tex 文件所在目录执行 `tectonic <file> --keep-logs`，与旧版一致。
 * `TECTONIC_CACHE_DIR` 默认指到 `latex/.tectonic-cache`（工作区内可写）。
 */
export function compileLatex(texPath, opts = {}) {
    const bin = findTectonic(opts.env);
    if (!bin) {
        return {
            success: false,
            pdfPath: '',
            logs: '',
            errors: [],
            reason: '未找到 tectonic 可执行文件（试过 PATH、/opt/homebrew/bin、/usr/local/bin、/Library/TeX/texbin）。',
        };
    }
    if (!existsSync(texPath)) {
        return { success: false, pdfPath: '', logs: '', errors: [], reason: `LaTeX 文件不存在：${texPath}` };
    }
    const workDir = dirname(texPath);
    const fileName = texPath.slice(workDir.length + 1);
    const cacheDir = opts.cacheDir ?? join(workDir, '.tectonic-cache');
    const timeoutMs = opts.timeoutMs ?? COMPILE_TIMEOUT_MS;
    const res = spawnSync(bin, [fileName, '--keep-logs'], {
        cwd: workDir,
        encoding: 'utf8',
        timeout: timeoutMs,
        env: { ...(opts.env ?? process.env), TECTONIC_CACHE_DIR: cacheDir },
    });
    const logs = `${res.stderr ?? ''}${res.stdout ?? ''}`.trim();
    const pdfPath = texPath.replace(/\.tex$/i, '.pdf');
    const pdfExists = existsSync(pdfPath);
    // 汇总日志文件内容（TeX 经典 `! ...` / `l.NN` 在 .log 里）
    let fullLog = logs;
    const logPath = texPath.replace(/\.tex$/i, '.log');
    if (existsSync(logPath)) {
        try {
            fullLog = `${logs}\n${readFileSync(logPath, 'utf8')}`;
        }
        catch {
            /* 日志读不到不影响主流程 */
        }
    }
    if (res.error && res.error.code === 'ETIMEDOUT') {
        return {
            success: false,
            pdfPath: '',
            logs: fullLog,
            errors: parseCompileErrors(fullLog),
            reason: `编译超时（${Math.round(timeoutMs / 1000)} 秒）。`,
        };
    }
    return {
        success: res.status === 0 && pdfExists,
        pdfPath: pdfExists ? pdfPath : '',
        logs: fullLog,
        errors: parseCompileErrors(fullLog),
        ...(pdfExists ? {} : { reason: '编译未产出 PDF。' }),
    };
}
/* ════════════════════════════════════════════════════════════════════════
 * 确定性修复（移植 latex_validator_skill，修正 D1 / D2）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 转义**非数学区**的 `%`（旧版 `_escape_percent_outside_math`，全局防御性修复）。
 * `100%` 是最常见的编译错误源，而 `$x \% y$` 里的必须保留。
 */
export function escapePercentOutsideMath(latex) {
    const regions = [];
    let out = latex
        .replace(/\$\$[^$]*\$\$/g, (m) => {
        regions.push(m);
        return `\u0000PMATH${regions.length - 1}\u0000`;
    })
        .replace(/\$[^$]*\$/g, (m) => {
        regions.push(m);
        return `\u0000PMATH${regions.length - 1}\u0000`;
    });
    if (out.includes('%'))
        out = out.replace(/(?<!\\)%/g, '\\%');
    for (let i = 0; i < regions.length; i++)
        out = out.split(`\u0000PMATH${i}\u0000`).join(regions[i]);
    return out;
}
/** 取错误行附近的上下文（旧版 `extract_context`，供 Agent 精修用）。 */
export function extractErrorContext(latex, lineNum, contextSize = 6) {
    const lines = latex.split('\n');
    const total = lines.length;
    const start = Math.max(1, lineNum - contextSize);
    const end = Math.min(total, lineNum + contextSize);
    const out = [];
    for (let i = start; i <= end; i++) {
        const marker = i === lineNum ? '→ ' : '  ';
        out.push(`${marker}${String(i).padStart(4)}: ${lines[i - 1] ?? ''}`);
    }
    return { startLine: start, endLine: end, text: out.join('\n') };
}
/**
 * 对单行做确定性修复（旧版 `_programmatic_fix` 三分支）。
 *
 * 修正：
 *   - **D1**：旧版 `\\\\\{` 要求**两个**反斜杠，真实的 `\{` 永不匹配；这里改为单反斜杠，
 *     且替换产出的也是单反斜杠 `\{`。
 *   - **D2**：旧版分支 d 的替换组里 group1 已含开 `$`，又重新加了一个 → 产出 `$$`；这里去掉。
 */
function fixSingleLine(line, errorMessage) {
    const lower = errorMessage.toLowerCase();
    let out = line;
    // 分支 A：double subscript
    if (lower.includes('double subscript')) {
        out = out.replace(/(\w+)_\(/g, '$1(');
        out = out.replace(/\(_\{([^}]+)\}\^\{([^}]+)\}\s+_(\w)/g, '\\sum_{$1}^{$2} \\theta_{$3}');
        out = out.replace(/\(_\{([^}]+)\}\^\{([^}]+)\}/g, '\\sum_{$1}^{$2}');
        out = out.replace(/(\$[^$]+)_([a-zA-Z])\$.*?\$([a-zA-Z])\s+\\\{/g, '$1_{$2}$ where $3 \\in \\{');
        out = out.replace(/\$_\{([^}]+)\}\^([a-zA-Z])\s*=/g, '$\\alpha_{$1}^{$2} =');
    }
    // 分支 B：missing control sequence / inserted
    if (lower.includes('missing') && (lower.includes('control sequence') || lower.includes('inserted'))) {
        out = out.replace(/\$_(\w+)/g, '$\\theta_{$1}');
        out = out.replace(/\$([a-zA-Z])\s+\\\{/g, '$$1 \\in \\{');
    }
    // 分支 C：invalid in math mode
    if (lower.includes('invalid in math mode')) {
        out = out.replace(/\$([^$]*?)\\cite\{([^}]+)\}([^$]*)\$/g, (_m, pre, key, post) => {
            const tail = post.trim() ? `$${post}$` : '';
            return `$${pre}$\\cite{${key}}${tail}`;
        });
        if (out.includes('\\bfseries')) {
            out = out.replace(/\$([^$]*?)\\bfseries([^$]*)\$/g, '$$1$2$');
        }
    }
    return out;
}
/**
 * 按编译日志做**确定性**修复（不调 LLM）。
 *
 * 与旧版一致：先做全局 `%` 转义，再按错误逐行修（**行号降序**，避免改前一行后
 * 后面行号错位）。修不动的留在 `remaining` 里，由 Agent 精修。
 */
export function repairLatex(latex, errors) {
    let out = escapePercentOutsideMath(latex);
    const remaining = [];
    let fixedCount = 0;
    // 行号降序：先改后面的行，前面的行号才不会漂移
    const ordered = [...errors].filter((e) => e.severity === 'error').sort((a, b) => b.line - a.line);
    for (const err of ordered) {
        if (!Number.isInteger(err.line) || err.line <= 0) {
            remaining.push(err);
            continue;
        }
        const lines = out.split('\n');
        const idx = err.line - 1;
        if (idx < 0 || idx >= lines.length) {
            remaining.push(err);
            continue;
        }
        const before = lines[idx];
        const after = fixSingleLine(before, err.message);
        if (after === before) {
            remaining.push(err);
            continue;
        }
        lines[idx] = after;
        out = lines.join('\n');
        fixedCount++;
    }
    return { latex: out, fixedCount, remaining };
}
/* ════════════════════════════════════════════════════════════════════════
 * 语法扫描（移植 latex_grammar_validator，修正 D5）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 已知安全的命令与环境的**基础集**。
 *
 * 旧版只有 18 个命令 / 8 个环境，连 `\usepackage`、`\author`、`\item` 都不在其中，
 * 于是真实论文几乎必然被报成 invalid，而该结果又**无人消费**（勘察确认），
 * 是个纯误导的死代码（D5）。这里：
 *
 *   - 大幅扩充基础集（覆盖模板与常见正文命令）；
 *   - 输出语义改为**「未识别命令清单」**（报告性提示），不再给 `valid: false` 这种伪判定。
 */
const KNOWN_COMMANDS = new Set([
    // 文档结构
    'documentclass', 'usepackage', 'begin', 'end', 'title', 'author', 'maketitle',
    'begin', 'end', 'item', 'and', 'thanks', 'footnote',
    // 章节
    'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'appendix',
    // 文本
    'textbf', 'textit', 'emph', 'texttt', 'textsc', 'textrm', 'textsf', 'textsl', 'underline',
    'textsuperscript', 'textsubscript', 'text', 'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathsf',
    'mathtt', 'mbox', 'hbox', 'newline', 'linebreak', 'pagebreak', 'noindent', 'centering',
    // 引用与标签
    'cite', 'citep', 'citet', 'ref', 'eqref', 'label', 'bibitem', 'bibliographystyle', 'bibliography',
    // 图与表
    'includegraphics', 'caption', 'centering', 'hline', 'toprule', 'midrule', 'bottomrule', 'cline',
    // 数学
    'frac', 'sqrt', 'sum', 'prod', 'int', 'log', 'exp', 'min', 'max', 'argmax', 'argmin',
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi',
    'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi',
    'Psi', 'Omega', 'times', 'cdot', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx', 'equiv', 'propto',
    'in', 'notin', 'subset', 'supset', 'cup', 'cap', 'forall', 'exists', 'nabla', 'partial',
    'infty', 'rightarrow', 'leftarrow', 'leftrightarrow', 'top', 'bot', 'odot', 'oplus', 'otimes',
    'mathbb', 'mathbf', 'boldsymbol', 'tilde', 'hat', 'bar', 'vec', 'dot', 'ddot', 'prime',
    'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'textstyle', 'limits', 'nonumber',
    'sim', 'simeq', 'll', 'gg', 'to', 'mapsto', 'langle', 'rangle', 'lceil', 'rceil', 'lfloor', 'rfloor',
    // IEEEtran 专有
    'IEEEauthorblockN', 'IEEEauthorblockA', 'IEEEkeywords', 'IEEEeqnarray',
    // 其他常用
    'url', 'href', 'input', 'include', 'vspace', 'hspace', 'small', 'large', 'footnotesize',
    'scriptsize', 'tiny', 'normalsize', 'bfseries', 'itshape', 'rmfamily', 'sffamily', 'ttfamily',
]);
/** 已知安全的环境。 */
const KNOWN_ENVS = new Set([
    'document', 'abstract', 'itemize', 'enumerate', 'description', 'equation', 'equation*',
    'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'eqnarray', 'eqnarray*',
    'figure', 'figure*', 'table', 'table*', 'tabular', 'tabular*', 'center', 'flushleft', 'flushright',
    'thebibliography', 'IEEEkeywords', 'IEEEeqnarray', 'quote', 'verbatim', 'minipage', 'array',
    'cases', 'split', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'smallmatrix', 'subfigure',
]);
/** 扫描未识别的命令 / 环境（报告性，不作为编译 gate）。 */
export function scanUnsafeTokens(latex) {
    const unknownCommands = [];
    const unknownEnvs = [];
    const seenCmd = new Set();
    const seenEnv = new Set();
    for (const m of latex.matchAll(/\\([a-zA-Z]+)/g)) {
        const cmd = m[1];
        if (KNOWN_COMMANDS.has(cmd) || seenCmd.has(cmd))
            continue;
        // 自定义宏很常见（\newcommand 定义），这里只作为提示
        seenCmd.add(cmd);
        unknownCommands.push(cmd);
    }
    for (const m of latex.matchAll(/\\begin\{([^}]+)\}/g)) {
        const env = m[1];
        if (KNOWN_ENVS.has(env) || seenEnv.has(env))
            continue;
        seenEnv.add(env);
        unknownEnvs.push(env);
    }
    return {
        unknownCommands,
        unknownEnvs,
        allKnown: unknownCommands.length === 0 && unknownEnvs.length === 0,
    };
}
//# sourceMappingURL=latex-compile.js.map