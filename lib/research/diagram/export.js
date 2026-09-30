/**
 * ConvFusion — Diagram PDF 导出（v0.5.5 / C08P07 的 LaTeX 交付步骤）
 *
 * ## 为什么必须有这一步
 *
 * LaTeX 的 `\includegraphics` 不吃 SVG，而 `paper-diagrams` 第一阶段的产物是 SVG。
 * 少这一步，"方法示意图必须画出来、且**确实出现在 PDF 里**"（本课题组草稿固化判据）
 * 就只完成了一半。
 *
 * ## 为什么由**我们**转换，而不是让 Agent 自己找工具
 *
 * 转换是一次**渲染**，不是一次"处理"。如果 Agent 用随手找到的转换器（不同机器上
 * 可能是 inkscape / rsvg / Chrome / 某个在线服务），那么同一份 IR 在不同机器上会得到
 * 不同的 PDF —— 前面用 IR + 确定性 renderer 保证的可复现性，会在最后一步全丢掉。
 *
 * 所以：脚本随包发行（`assets/diagram/svg2pdf.py`），用 PyMuPDF —— 它把我们的 SVG
 * 子集转成**矢量** PDF，字体内嵌、文字仍是真文字（可选中可搜索），且输出
 * **逐字节可复现**（不含 CreationDate / ID，同一 SVG 转两次字节相同，可进 git）。
 *
 * ## 解释器这件事要比看起来小心
 *
 * 本机存在一个**坏的 `python3`**（`/opt/homebrew/bin/python3` 3.14：`python3 -c "print(1)"`
 * 不输出、退出码 0）。直接拿来跑脚本会得到"成功但什么也没做"——这是本项目踩过的坑
 * （见 AGENTS.md）。因此这里**不接受"存在即用"**：每个候选解释器都要先通过
 * `-c "print(1)"` 必须回显 `1` 的自检，再检查 `import fitz` 能不能过。
 *
 * 与 `tectonic` 同一条边界：这是**可选**外部依赖。找不到就像实报告"不可用"，
 * 绝不假装导出成功。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevTooling } from '../../server-env.js';
/** 随包发行的转换脚本（相对包根）。 */
export const SVG2PDF_SCRIPT = join('assets', 'diagram', 'svg2pdf.py');
/** 环境变量：用户自备解释器（与 `CONVFUSION_TECTONIC` 同一套做法）。 */
export const PYTHON_ENV = 'CONVFUSION_PYTHON';
/** 一次转换最多等多久（正常 <0.1 s）。 */
const EXPORT_TIMEOUT_MS = 30_000;
/** 结果行前缀（与脚本约定）。 */
const RESULT_PREFIX = '@@SVG2PDF@@ ';
/** 论文栏宽：IEEE 会议单栏 ≈ 252 pt、双栏跨栏 ≈ 516 pt。 */
export const COLUMN_WIDTH_PT = 252;
export const FULL_WIDTH_PT = 516;
/** 图内文字在论文里的可读下限（pt）。低于它就要么改图、要么跨栏。 */
export const MIN_LEGIBLE_PT = 7;
/* ════════════════════════════════════════════════════════════════════════
 * 脚本位置
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 定位包内的 `svg2pdf.py`。
 *
 * `lib/research/diagram/export.js` → 包根要退三级；另外保留两个兜底路径
 * （目录布局变化、以及从仓库根直接跑的情况），与 `systemSkillRoot()` 同一策略。
 */
export function findSvg2PdfScript() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, '..', '..', '..', SVG2PDF_SCRIPT),
        join(here, '..', '..', SVG2PDF_SCRIPT),
        join(process.cwd(), SVG2PDF_SCRIPT),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
/**
 * 候选解释器。
 *
 * ⚠️ 复用 `resolveDevTooling()` 而不是另立一套：本插件里**只有一处**决定"这台机器用哪个
 * Python"（`CONVFUSION_PYTHON` → `convfusion.env.json` 的 `dev.python` → PATH 上的 `python3`）。
 * 两条并行的解析链迟早会互相矛盾，而症状是"某个功能说找不到解释器、另一个却跑得好好的"，
 * 极难排查。用户已经配过一次，画图导出就该沿用它。
 *
 * 之后的 `python3` / `python` 是 PATH 兜底；每一个候选都要过自检（见 {@link findDiagramPython}）。
 */
function pythonCandidates() {
    const out = [];
    try {
        const resolved = resolveDevTooling().python;
        if (resolved && resolved.trim())
            out.push(resolved.trim());
    }
    catch {
        // 配置文件读不了不该让"导出"整体不可用：退回 PATH 探测。
    }
    const explicit = process.env[PYTHON_ENV];
    if (explicit && explicit.trim())
        out.push(explicit.trim());
    out.push('python3', 'python');
    // 去重但保持顺序（已配置的解释器优先）
    return [...new Set(out)];
}
function runProbe(python, code) {
    try {
        const stdout = execFileSync(python, ['-c', code], {
            encoding: 'utf8',
            timeout: 10_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, stdout };
    }
    catch (e) {
        const err = e;
        if (err.code === 'ENOENT')
            return { ok: false, reason: 'not found on PATH' };
        const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '';
        return { ok: false, reason: `exit ${String(err.code)}${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : ''}` };
    }
}
/**
 * 找一个**真的能跑**的解释器。
 *
 * 两道闸：
 *   1. `-c "print(1)"` 必须回显 `1`（挡掉"退出码 0 但什么都不输出"的坏解释器）；
 *   2. `import fitz` 必须成功（挡掉解释器能用但没装 PyMuPDF 的情况 —— 这时错误信息
 *      要直接告诉用户装什么，而不是让他在转换失败里猜）。
 */
export function findDiagramPython() {
    const tried = [];
    for (const candidate of pythonCandidates()) {
        const selfCheck = runProbe(candidate, 'print(1)');
        if (!selfCheck.ok) {
            tried.push({ candidate, reason: selfCheck.reason });
            continue;
        }
        if (selfCheck.stdout.trim() !== '1') {
            tried.push({ candidate, reason: `self-check did not echo 1 (got ${JSON.stringify(selfCheck.stdout.slice(0, 40))})` });
            continue;
        }
        const probe = runProbe(candidate, 'import fitz,sys;sys.stdout.write(fitz.__version__ if hasattr(fitz,"__version__") else "?")');
        if (!probe.ok) {
            tried.push({ candidate, reason: probe.reason });
            continue;
        }
        if (probe.stdout.trim() === '') {
            tried.push({ candidate, reason: 'PyMuPDF not importable' });
            continue;
        }
        const version = runProbe(candidate, 'import sys;sys.stdout.write(sys.version.split()[0])');
        return {
            ok: true,
            python: candidate,
            version: version.ok ? version.stdout.trim() : '?',
            pymupdf: probe.stdout.trim(),
        };
    }
    return {
        ok: false,
        tried,
        error: `No usable Python interpreter found (tried ${tried.map((t) => t.candidate).join(', ')}). ` +
            `PDF export needs an interpreter with PyMuPDF installed (\`python -m pip install pymupdf\`). ` +
            `Point the plugin at one via ${PYTHON_ENV}, or via \`dev.python\` in convfusion.env.json. ` +
            `SVG output does not need Python at all.`,
    };
}
/** 跑一次转换。失败**不抛异常**：调用方（工具层）要把原因说给模型听。 */
export function exportDiagramPdf(options) {
    const base = { svgPath: options.svgPath, pdfPath: options.pdfPath };
    const script = findSvg2PdfScript();
    if (script === null) {
        return { ok: false, error: `Bundled converter not found (expected ${SVG2PDF_SCRIPT}).`, ...base };
    }
    if (!existsSync(options.svgPath)) {
        return { ok: false, error: `SVG not found: ${options.svgPath}. Render the diagram first.`, ...base };
    }
    const probe = findDiagramPython();
    if (!probe.ok)
        return { ok: false, error: probe.error, ...base };
    const targetWidthPt = options.targetWidthPt ?? COLUMN_WIDTH_PT;
    const nodeFontPt = options.nodeFontPt ?? 13;
    let stdout = '';
    try {
        stdout = execFileSync(probe.python, [script, options.svgPath, options.pdfPath, '--target-width-pt', String(targetWidthPt), '--node-font-pt', String(nodeFontPt), '--quiet'], { encoding: 'utf8', timeout: EXPORT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    catch (e) {
        const err = e;
        const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '';
        // 脚本失败时仍然会吐一行 JSON —— 优先用它，那才是"为什么失败"的权威说法。
        const parsed = parseResultLine(stderr) ?? parseResultLine(String(err.message ?? ''));
        return { ok: false, error: parsed?.error ?? `converter failed: ${stderr.trim() || (err.message ?? 'unknown')}`, ...base };
    }
    const parsed = parseResultLine(stdout);
    if (parsed === null) {
        return { ok: false, error: `converter produced no result line: ${stdout.slice(0, 200)}`, ...base };
    }
    if (parsed.ok !== true) {
        return { ok: false, error: parsed.error ?? 'converter reported failure', ...base };
    }
    // 产物闸门：脚本说成功不算成功，**PDF 真的存在且非空**才算（与 tectonic 同一条纪律）。
    if (!existsSync(options.pdfPath)) {
        return { ok: false, error: `converter reported success but ${options.pdfPath} does not exist.`, ...base };
    }
    const size = statSync(options.pdfPath).size;
    if (size <= 0) {
        return { ok: false, error: `converter wrote an empty ${options.pdfPath}.`, ...base };
    }
    return {
        ok: true,
        ...base,
        bytes: size,
        widthPt: parsed.widthPt,
        heightPt: parsed.heightPt,
        textChars: parsed.textChars,
        vectorDrawings: parsed.vectorDrawings,
        allFontsEmbedded: parsed.allFontsEmbedded,
        seconds: parsed.seconds,
        targetWidthPt: parsed.targetWidthPt,
        scale: parsed.scale,
        effectiveNodePt: parsed.effectiveNodePt,
        legible: parsed.legible,
        maxCanvasUnitsFor7pt: parsed.maxCanvasUnitsFor7pt,
        python: probe.python,
        pymupdf: probe.pymupdf,
    };
}
/** 在（可能混有其它输出/日志的）文本里找出结果行并解析。 */
function parseResultLine(text) {
    const idx = text.lastIndexOf(RESULT_PREFIX);
    if (idx < 0)
        return null;
    const line = text.slice(idx + RESULT_PREFIX.length).split('\n')[0]?.trim();
    if (!line)
        return null;
    try {
        return JSON.parse(line);
    }
    catch {
        return null;
    }
}
/* ════════════════════════════════════════════════════════════════════════
 * 可读性换算（不依赖解释器，供校验/提示使用）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 一张画布宽度为 `canvasUnits` 的图，画在 `targetWidthPt` 宽的栏里时，
 * 图内节点文字还剩多少 pt。
 *
 * 实测校验：342.22 单位的图按 252 pt 画 → 计算 9.57 pt，实际编译出的 PDF 里量到 9.54 pt。
 */
export function effectiveNodeFontPt(canvasUnits, targetWidthPt, nodeFontPt = 13) {
    if (canvasUnits <= 0)
        return 0;
    return Math.round(((nodeFontPt * targetWidthPt) / canvasUnits) * 100) / 100;
}
/** 想让节点文字达到 `minPt`，画布单位最多能有多宽。 */
export function maxCanvasUnitsFor(minPt, targetWidthPt, nodeFontPt = 13) {
    if (minPt <= 0)
        return Number.POSITIVE_INFINITY;
    return Math.round(((nodeFontPt * targetWidthPt) / minPt) * 10) / 10;
}
//# sourceMappingURL=export.js.map