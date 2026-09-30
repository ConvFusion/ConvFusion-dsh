/**
 * ConvFusion — Diagram 产物落盘（v0.5.5 / C08P07）
 *
 * ## 两个文件，两种地位
 *
 * ```text
 * figures/<name>.json   ← 图的**源**（Diagram IR），可编辑、可 diff、进 git
 * figures/<name>.svg    ← 图的**产物**（渲染结果），可重生成、不进手工修改
 * ```
 *
 * 这个区分是"图是可演化的研究资产，而不是一次性生成的图片"（dev-note §37）的实现方式：
 * 自然语言修改改的是 IR，SVG 永远是重渲染出来的。
 *
 * ## last-good（dev-note §25）
 *
 * 修复失败时**绝不能**把一张坏图盖掉已经可用的一张。因此有两个保险：
 *
 * 1. 校验不过时不写 `.svg`；
 * 2. 每次成功渲染额外留一份 `.last-good/<name>.{json,svg}`。
 *
 * 第 2 条不是冗余：Agent 可能用 `write` 工具直接改 `<name>.json`（Harness 原生工具），
 * 改坏了之后 IR 自己已经没了 —— 只有 `last-good` 还能把它找回来。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** 论文的图片目录（相对 `papers/<paperId>/`）。 */
export const FIGURES_SUBDIR = 'figures';
/** last-good 快照目录（隐藏，避免被当成一张正式图）。 */
export const LAST_GOOD_SUBDIR = '.last-good';
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/**
 * 规整图名。
 *
 * 图名会变成文件名，所以必须挡住路径分隔符与 `..`：Agent 写 `"../../etc/x"` 时
 * 我们拒绝，而不是在论文目录外写文件。
 */
export function sanitizeDiagramName(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return { ok: false, error: 'Diagram `name` is required (e.g. "fig1_method").' };
    }
    const trimmed = raw.trim().replace(/\.(json|svg)$/i, '');
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
        return { ok: false, error: `Diagram name "${raw}" must not contain a path.` };
    }
    if (!NAME_PATTERN.test(trimmed)) {
        return {
            ok: false,
            error: `Diagram name "${raw}" is not usable as a file name. Use letters, digits, dot, dash or underscore (max 64 chars).`,
        };
    }
    return { ok: true, name: trimmed };
}
/** `<ws>/papers/<paperId>/figures`。 */
export function figuresDir(paperDir) {
    return join(paperDir, FIGURES_SUBDIR);
}
/** 一个图的全部落点（不创建目录、不检查存在性）。 */
export function diagramPaths(ws, paperId, name) {
    const paperDir = join(ws, 'papers', paperId);
    const dir = figuresDir(paperDir);
    return {
        dir,
        irPath: join(dir, `${name}.json`),
        svgPath: join(dir, `${name}.svg`),
        lastGoodIrPath: join(dir, LAST_GOOD_SUBDIR, `${name}.json`),
        lastGoodSvgPath: join(dir, LAST_GOOD_SUBDIR, `${name}.svg`),
        relIr: `papers/${paperId}/${FIGURES_SUBDIR}/${name}.json`,
        relSvg: `papers/${paperId}/${FIGURES_SUBDIR}/${name}.svg`,
    };
}
/** 读回一份 IR（增量编辑的起点）。 */
export function readDiagramIr(paths) {
    if (!existsSync(paths.irPath))
        return { ok: false, error: `No diagram at ${paths.relIr}.` };
    try {
        const text = readFileSync(paths.irPath, 'utf8');
        return { ok: true, raw: JSON.parse(text), text };
    }
    catch (e) {
        return { ok: false, error: `Cannot read ${paths.relIr}: ${e instanceof Error ? e.message : String(e)}` };
    }
}
/** 写 IR（`figures/` 按需建立）。 */
export function writeDiagramIr(paths, raw) {
    if (!existsSync(paths.dir))
        mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.irPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}
/** 写 SVG（只在调用方确认校验通过后调用）。 */
export function writeDiagramSvg(paths, svg) {
    if (!existsSync(paths.dir))
        mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.svgPath, svg, 'utf8');
}
/** 把一份"已验证可用"的图另存为 last-good。 */
export function saveLastGood(paths, raw, svg) {
    const dir = join(paths.dir, LAST_GOOD_SUBDIR);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(paths.lastGoodIrPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    writeFileSync(paths.lastGoodSvgPath, svg, 'utf8');
}
/** 列出论文图片目录下的全部图（按名字排序，确定性）。 */
export function listDiagramArtifacts(ws, paperId) {
    const dir = figuresDir(join(ws, 'papers', paperId));
    if (!existsSync(dir))
        return [];
    const names = new Set();
    for (const f of readdirSync(dir)) {
        if (f.startsWith('.'))
            continue;
        const m = f.match(/^(.*)\.(json|svg)$/);
        if (m)
            names.add(m[1]);
    }
    const out = [];
    for (const name of [...names].sort()) {
        const stat = (p) => {
            if (!existsSync(p))
                return null;
            const s = statSync(p);
            return { path: p.slice(p.indexOf(FIGURES_SUBDIR)), bytes: s.size, mtimeMs: s.mtimeMs };
        };
        const ir = stat(join(dir, `${name}.json`));
        const svg = stat(join(dir, `${name}.svg`));
        let type = null;
        if (ir !== null) {
            try {
                const parsed = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
                if (typeof parsed.type === 'string')
                    type = parsed.type;
            }
            catch {
                type = null;
            }
        }
        out.push({ name, ir, svg, complete: ir !== null && svg !== null, type });
    }
    return out;
}
//# sourceMappingURL=store.js.map