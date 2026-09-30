/**
 * ConvFusion — Diagram 样式 token（v0.5.5 / C08P07）
 *
 * 样式是**有限枚举**，不是自由 CSS。这是"同一篇论文的所有图看起来是一套"的唯一保证，
 * 也是校验器能对样式说"这个 token 不存在"的前提。
 *
 * 配色取克制的浅底深框：论文里常灰度打印，浅底+深框在灰度下仍分得开；同时避免
 * 高饱和色（会喧宾夺主、彩色打印失真）。
 */
import type { DiagramEdgeType, DiagramNodeType, StyleToken } from './types.js';
/** 字体栈：西文优先，附 CJK 回退（图中若出现中文不至于变成方框）。 */
export declare const FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";
export declare const MONO_FAMILY = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";
/** 字号表（一处定义，避免每张图各写一套）。 */
export declare const FONT_SIZE: {
    readonly title: 16;
    readonly groupLabel: 12;
    readonly nodeLabel: 13;
    readonly nodeDescription: 11;
    readonly edgeLabel: 11;
    readonly freeLabel: 12;
};
export interface NodeStyle {
    fill: string;
    stroke: string;
    text: string;
    strokeWidth: number;
    /** 虚线（如 external / 未定模块）。 */
    dash?: string;
    rx: number;
}
/** 11 个内置 node/group 样式 token。 */
export declare const NODE_STYLES: Record<StyleToken, NodeStyle>;
/** Node type → 默认样式 token（Agent 不写 `style` 时的映射）。 */
export declare const NODE_STYLE_BY_TYPE: Record<DiagramNodeType, StyleToken>;
export interface EdgeStyle {
    stroke: string;
    strokeWidth: number;
    /** 虚线；`feedback`/`residual` 用虚线，读者才知道那是回边而不是主流程。 */
    dash?: string;
    /** 箭头大小（userSpaceOnUse 单位）。 */
    arrow: number;
}
/** 6 个 edge type 的画法。 */
export declare const EDGE_STYLES: Record<DiagramEdgeType, EdgeStyle>;
/** 命中一个样式 token；未知 token 回退 `default`（校验器已单独报 UNKNOWN_STYLE_TOKEN）。 */
export declare function nodeStyle(token: StyleToken | undefined): NodeStyle;
/** 命中一个边样式。 */
export declare function edgeStyle(type: DiagramEdgeType | undefined): EdgeStyle;
export declare const LAYOUT: {
    /** 画布四周留白。 */
    readonly canvasMargin: 24;
    /** 标题与内容之间的间距（有标题时才占）。 */
    readonly titleBand: 34;
    /** 同层相邻 node 的间距。 */
    readonly nodeGap: 22;
    /** 层与层之间的间距（也 ≥ 边标签需要的宽度）。 */
    readonly layerGap: 64;
    /** group 容器相对成员的外扩（含顶部标签带）。 */
    readonly groupPadding: 16;
    readonly groupLabelBand: 20;
    /** node 内边距与最大宽度（超过就换行，而不是把盒子撑长）。 */
    readonly nodePaddingX: 12;
    readonly nodePaddingY: 10;
    readonly nodeMaxLabelWidth: 168;
    readonly nodeMinWidth: 84;
    readonly lineHeightRatio: 1.32;
    /** 外绕走线距最外层 node 的距离。 */
    readonly detourGap: 16;
};
//# sourceMappingURL=styles.d.ts.map