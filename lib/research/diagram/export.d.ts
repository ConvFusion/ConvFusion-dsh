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
/** 随包发行的转换脚本（相对包根）。 */
export declare const SVG2PDF_SCRIPT: string;
/** 环境变量：用户自备解释器（与 `CONVFUSION_TECTONIC` 同一套做法）。 */
export declare const PYTHON_ENV = "CONVFUSION_PYTHON";
/** 论文栏宽：IEEE 会议单栏 ≈ 252 pt、双栏跨栏 ≈ 516 pt。 */
export declare const COLUMN_WIDTH_PT = 252;
export declare const FULL_WIDTH_PT = 516;
/** 图内文字在论文里的可读下限（pt）。低于它就要么改图、要么跨栏。 */
export declare const MIN_LEGIBLE_PT = 7;
/**
 * 定位包内的 `svg2pdf.py`。
 *
 * `lib/research/diagram/export.js` → 包根要退三级；另外保留两个兜底路径
 * （目录布局变化、以及从仓库根直接跑的情况），与 `systemSkillRoot()` 同一策略。
 */
export declare function findSvg2PdfScript(): string | null;
export interface PythonProbeFailure {
    ok: false;
    /** 逐个候选解释器的尝试结果（给用户看的"为什么不行"）。 */
    tried: Array<{
        candidate: string;
        reason: string;
    }>;
    error: string;
}
export interface PythonProbeSuccess {
    ok: true;
    python: string;
    version: string;
    pymupdf: string;
}
export type PythonProbe = PythonProbeSuccess | PythonProbeFailure;
/**
 * 找一个**真的能跑**的解释器。
 *
 * 两道闸：
 *   1. `-c "print(1)"` 必须回显 `1`（挡掉"退出码 0 但什么都不输出"的坏解释器）；
 *   2. `import fitz` 必须成功（挡掉解释器能用但没装 PyMuPDF 的情况 —— 这时错误信息
 *      要直接告诉用户装什么，而不是让他在转换失败里猜）。
 */
export declare function findDiagramPython(): PythonProbe;
export interface ExportPdfOptions {
    svgPath: string;
    pdfPath: string;
    /** 图在论文里被画多宽（pt）。默认单栏 252。 */
    targetWidthPt?: number;
    /** 渲染器用的节点字号（SVG 单位），默认 13。 */
    nodeFontPt?: number;
}
export interface ExportPdfResult {
    ok: boolean;
    error?: string;
    svgPath: string;
    pdfPath: string;
    bytes?: number;
    widthPt?: number;
    heightPt?: number;
    textChars?: number;
    vectorDrawings?: number;
    allFontsEmbedded?: boolean;
    seconds?: number;
    targetWidthPt?: number;
    scale?: number;
    /** 图内节点文字在论文里的实际字号（pt）。 */
    effectiveNodePt?: number;
    /** 是否达到可读下限（`MIN_LEGIBLE_PT`）。 */
    legible?: boolean;
    /** 想达到 7 pt，画布单位最多能有多宽 —— 超宽图的修改目标。 */
    maxCanvasUnitsFor7pt?: number;
    python?: string;
    pymupdf?: string;
}
/** 跑一次转换。失败**不抛异常**：调用方（工具层）要把原因说给模型听。 */
export declare function exportDiagramPdf(options: ExportPdfOptions): ExportPdfResult;
/**
 * 一张画布宽度为 `canvasUnits` 的图，画在 `targetWidthPt` 宽的栏里时，
 * 图内节点文字还剩多少 pt。
 *
 * 实测校验：342.22 单位的图按 252 pt 画 → 计算 9.57 pt，实际编译出的 PDF 里量到 9.54 pt。
 */
export declare function effectiveNodeFontPt(canvasUnits: number, targetWidthPt: number, nodeFontPt?: number): number;
/** 想让节点文字达到 `minPt`，画布单位最多能有多宽。 */
export declare function maxCanvasUnitsFor(minPt: number, targetWidthPt: number, nodeFontPt?: number): number;
//# sourceMappingURL=export.d.ts.map