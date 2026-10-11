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
import { COLUMN_WIDTH_PT, FULL_WIDTH_PT, MIN_LEGIBLE_PT, type PythonProbe } from '../diagram/export.js';
/** 随包发行的渲染脚本（相对包根）。 */
export declare const SCHEMATIC_SCRIPT: string;
export { COLUMN_WIDTH_PT, FULL_WIDTH_PT, MIN_LEGIBLE_PT };
export type { PythonProbe };
/** 定位包内的 `render_schematic.py`（与 svg2pdf 同一套兜底策略）。 */
export declare function findSchematicScript(): string | null;
export interface SchematicRenderResult {
    ok: boolean;
    name?: string;
    pdf?: string;
    copies?: string[];
    sizeIn?: [number, number];
    aspect?: number;
    /** 图按栏宽缩放后，框内标题/描述的字号（pt）。 */
    effectiveNodePt?: [number, number];
    /** 描述字号是否达到可读下限（{@link MIN_LEGIBLE_PT}）。 */
    legible?: boolean;
    stats?: {
        boxes: number;
        texts: number;
        edges: number;
        lanes: number;
    };
    error?: string;
    /** Python 探测失败时的候选清单。 */
    tried?: Array<{
        candidate: string;
        reason: string;
    }>;
}
export interface RenderSchematicOptions {
    spec: Record<string, unknown>;
    /** 图在论文里被画多宽（pt）。默认单栏 252。 */
    targetWidthPt?: number;
}
/**
 * 渲染一张示意图。
 *
 * 失败**不抛异常**：把 Python 侧的结构性错误（IR 不合法、几何断言不过）原样返回，
 * 让模型看到原因并改 IR —— 与 `research_diagram` 同一约定。
 */
export declare function renderSchematic(options: RenderSchematicOptions): SchematicRenderResult;
/** 列表：论文 `figures/` 下已有的示意图（按名字）。 */
export declare function listSchematics(papersRoot: string, paperId: string): string[];
//# sourceMappingURL=index.d.ts.map