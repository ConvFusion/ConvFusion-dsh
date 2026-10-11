/**
 * ConvFusion — 论文示意图（matplotlib 规程）插件能力。
 *
 * ## 为什么要有这一层
 *
 * 本课题组把论文**示意图**的画法固化成了一套样式与几何纪律（白底黑框小圆角、
 * 粗体标题+灰描述、单栏 ≥7pt、出厂前跑几何断言）。这套东西此前只存在于
 * **某一个工作区的 `papers/figures_kit.py`** 里，于是：
 *
 *   · 其它工作区要用它，只能把脚本复制过去 —— 复制出来的副本会和源分叉；
 *   · Agent 在缺这份脚本的工作区里会改用别的方式画图（例如 Diagram-IR 渲染器），
 *     而两种渲染器的底色/边框/圆角/字号不一致，同一篇论文里必然出现"两种风格"。
 *
 * 所以绘图实现**随插件发行**（`assets/figures_kit/`），工具层
 * （`research_schematic`）只做编排与落盘 —— 与 Diagram-IR 的
 * "工具层不含任何绘图逻辑"是同一条边界。
 *
 * ## 与 `research_diagram` 的分工
 *
 * | 用途 | 工具 |
 * |---|---|
 * | 结构/流程示意图（本课题组样式，几何断言，单栏 ≥7pt 判据） | `research_schematic` |
 * | Diagram-IR（自带样式与校验器）；**不要在同一篇论文里与上者混用** | `research_diagram` |
 *
 * 统计图仍由读结果文件的绘图脚本生成 —— 两者都不做统计图。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMN_WIDTH_PT, FULL_WIDTH_PT, MIN_LEGIBLE_PT, findDiagramPython, } from '../diagram/export.js';
/** 随包发行的渲染脚本（相对包根）。 */
export const SCHEMATIC_SCRIPT = join('assets', 'figures_kit', 'render_schematic.py');
/** 一次渲染最多等多久（正常 <2 s；首次可能触发 matplotlib 建字体缓存）。 */
const RENDER_TIMEOUT_MS = 60_000;
/** 结果行前缀（与脚本约定）。 */
const RESULT_PREFIX = '@@SCHEMATIC@@ ';
export { COLUMN_WIDTH_PT, FULL_WIDTH_PT, MIN_LEGIBLE_PT };
/** 定位包内的 `render_schematic.py`（与 svg2pdf 同一套兜底策略）。 */
export function findSchematicScript() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, '..', '..', '..', SCHEMATIC_SCRIPT),
        join(here, '..', '..', SCHEMATIC_SCRIPT),
        join(process.cwd(), SCHEMATIC_SCRIPT),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
/**
 * 渲染一张示意图。
 *
 * 失败**不抛异常**：把 Python 侧的结构性错误（IR 不合法、几何断言不过）原样返回，
 * 让模型看到原因并改 IR —— 与 `research_diagram` 同一约定。
 */
export function renderSchematic(options) {
    const script = findSchematicScript();
    if (!script) {
        return {
            ok: false,
            error: `schematic renderer not found (looked for ${SCHEMATIC_SCRIPT}). ` +
                'The packaged assets are missing — reinstall the plugin, or run from the repository root.',
        };
    }
    const probe = findDiagramPython();
    if (!probe.ok) {
        return { ok: false, error: probe.error, tried: probe.tried };
    }
    const spec = { ...options.spec };
    if (spec.columnWidthPt === undefined) {
        spec.columnWidthPt = options.targetWidthPt ?? COLUMN_WIDTH_PT;
    }
    const payload = JSON.stringify(spec);
    let stdout = '';
    try {
        stdout = execFileSync(probe.python, [script], {
            input: payload,
            encoding: 'utf8',
            timeout: RENDER_TIMEOUT_MS,
            maxBuffer: 8 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    }
    catch (e) {
        const err = e;
        stdout = typeof err.stdout === 'string' ? err.stdout : '';
        if (!stdout.includes(RESULT_PREFIX)) {
            const stderr = typeof err.stderr === 'string' ? err.stderr.trim().split('\n').slice(-3).join(' / ') : '';
            return {
                ok: false,
                error: `schematic renderer exited ${String(err.code)}${stderr ? `: ${stderr}` : ''}`,
            };
        }
    }
    const line = stdout.split('\n').find((l) => l.startsWith(RESULT_PREFIX));
    if (!line) {
        return { ok: false, error: 'schematic renderer produced no result line' };
    }
    try {
        return JSON.parse(line.slice(RESULT_PREFIX.length));
    }
    catch (e) {
        return { ok: false, error: `could not parse renderer output: ${String(e)}` };
    }
}
/** 列表：论文 `figures/` 下已有的示意图（按名字）。 */
export function listSchematics(papersRoot, paperId) {
    const dir = join(papersRoot, paperId, 'figures');
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        return [];
    // 延迟 import：避免顶层依赖 fs.readdirSync 的同步开销扩散到不需要它的路径
    const { readdirSync } = require('node:fs');
    return readdirSync(dir)
        .filter((f) => f.endsWith('.pdf') || f.endsWith('.png') || f.endsWith('.svg'))
        .sort();
}
//# sourceMappingURL=index.js.map