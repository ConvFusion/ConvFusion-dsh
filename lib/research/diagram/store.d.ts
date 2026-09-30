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
/** 论文的图片目录（相对 `papers/<paperId>/`）。 */
export declare const FIGURES_SUBDIR = "figures";
/** last-good 快照目录（隐藏，避免被当成一张正式图）。 */
export declare const LAST_GOOD_SUBDIR = ".last-good";
export interface DiagramPaths {
    dir: string;
    irPath: string;
    svgPath: string;
    lastGoodIrPath: string;
    lastGoodSvgPath: string;
    /** 相对研究根的路径（工具返回值里给模型看的）。 */
    relIr: string;
    relSvg: string;
}
/**
 * 规整图名。
 *
 * 图名会变成文件名，所以必须挡住路径分隔符与 `..`：Agent 写 `"../../etc/x"` 时
 * 我们拒绝，而不是在论文目录外写文件。
 */
export declare function sanitizeDiagramName(raw: unknown): {
    ok: true;
    name: string;
} | {
    ok: false;
    error: string;
};
/** `<ws>/papers/<paperId>/figures`。 */
export declare function figuresDir(paperDir: string): string;
/** 一个图的全部落点（不创建目录、不检查存在性）。 */
export declare function diagramPaths(ws: string, paperId: string, name: string): DiagramPaths;
/** 读回一份 IR（增量编辑的起点）。 */
export declare function readDiagramIr(paths: DiagramPaths): {
    ok: true;
    raw: unknown;
    text: string;
} | {
    ok: false;
    error: string;
};
/** 写 IR（`figures/` 按需建立）。 */
export declare function writeDiagramIr(paths: DiagramPaths, raw: unknown): void;
/** 写 SVG（只在调用方确认校验通过后调用）。 */
export declare function writeDiagramSvg(paths: DiagramPaths, svg: string): void;
/** 把一份"已验证可用"的图另存为 last-good。 */
export declare function saveLastGood(paths: DiagramPaths, raw: unknown, svg: string): void;
export interface DiagramArtifactEntry {
    name: string;
    ir: {
        path: string;
        bytes: number;
        mtimeMs: number;
    } | null;
    svg: {
        path: string;
        bytes: number;
        mtimeMs: number;
    } | null;
    /** IR 与 SVG 是否都存在且可读。 */
    complete: boolean;
    /** IR 里记的图类型（读不出来时为 null）。 */
    type: string | null;
}
/** 列出论文图片目录下的全部图（按名字排序，确定性）。 */
export declare function listDiagramArtifacts(ws: string, paperId: string): DiagramArtifactEntry[];
//# sourceMappingURL=store.d.ts.map