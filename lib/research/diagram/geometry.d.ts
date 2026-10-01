/**
 * ConvFusion — Diagram 几何与文本度量（v0.5.5 / C08P07）
 *
 * 这里刻意**不引入字体库**：论文配图只需要"够准"的度量来做换行与画布尺寸，
 * 不需要像素级一致的排版。用一张确定性的字宽表，代价是 SVG 里文字宽度与
 * 浏览器实测有百分之几的差，收益是渲染**完全确定、无外部依赖、可离线**。
 *
 * 所有对外导出的数值都经过 {@link r3} 取整，因此同一个 IR 反复渲染得到**逐字节相同**
 * 的 SVG（dev-note §40 Test 7）。
 */
/** 取 3 位小数：抹掉浮点噪声，是"相同 IR ⇒ 相同 SVG"的前提。 */
export declare function r3(n: number): number;
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Point {
    x: number;
    y: number;
}
export declare function rectRight(r: Rect): number;
export declare function rectBottom(r: Rect): number;
export declare function rectCenter(r: Rect): Point;
/** 两个矩形是否**内部**相交（只贴边不算，避免 1px 相切被误判重叠）。 */
export declare function rectsOverlap(a: Rect, b: Rect, slack?: number): boolean;
/** 点是否落在矩形**内部**（同样只贴边不算）。 */
export declare function rectContainsPoint(r: Rect, p: Point, slack?: number): boolean;
/** 把一组矩形并成外接矩形。 */
export declare function unionRects(rects: readonly Rect[]): Rect | null;
/** 线段是否穿过矩形内部（**轴对齐或任意**线段都支持，用 Liang–Barsky 裁剪）。 */
export declare function segmentIntersectsRect(a: Point, b: Point, r: Rect, slack?: number): boolean;
/** 折线（≥2 点）是否穿过矩形内部。 */
export declare function polylineIntersectsRect(points: readonly Point[], r: Rect, slack?: number): boolean;
/** 折线总长度（用于挑最长的段放边标签）。 */
export declare function polylineLength(points: readonly Point[]): number;
/** 折线上最长一段的中点与走向（放边标签用）。 */
export declare function longestSegment(points: readonly Point[]): {
    mid: Point;
    horizontal: boolean;
    length: number;
};
/**
 * 单字符视觉宽度（em）。
 *
 * 取值偏保守（略宽于多数无衬线体的实际值）：宁可把盒子算宽一点，也不要文字溢出
 * 盒子 —— 溢出是视觉校验要报的缺陷，而"盒子略宽"没有代价。
 */
export declare function charWidthEm(ch: string): number;
/** 一行文本的视觉宽度（px）。 */
export declare function measureText(text: string, fontSize: number): number;
/**
 * 按**视觉宽度**换行。
 *
 * 规则：优先在空格处断；单个词比整行还宽时按字符硬断（否则长标识符会把盒子撑爆）；
 * 已有显式换行的 `\n` 永远保留（Agent 用它控制断行）。
 */
export declare function wrapText(text: string, maxWidth: number, fontSize: number): string[];
/** 一组行的总高度。 */
export declare function textBlockHeight(lineCount: number, fontSize: number, lineHeightRatio: number): number;
/** 视觉宽度（CJK 记 2）——用于"标签过长"的判定。 */
export declare function visualLength(text: string): number;
/** XML 文本转义（含引号：属性里也会用到）。 */
export declare function escapeXml(text: string): string;
/** 折线 → SVG path 的 `d`（只用直线段，正交走线天然如此）。 */
export declare function polylineToPath(points: readonly Point[]): string;
/**
 * 去掉折线里**重复的相邻点**与共线的中间点。
 *
 * 为什么必须做：正交走线会产生 `(100,50) → (100,50)` 这样的零长度段，浏览器对
 * `orient="auto"` 的箭头在零长度段上行为未定义（箭头会消失或乱指）。
 */
export declare function simplifyPolyline(points: readonly Point[]): Point[];
/**
 * 两条**轴对齐**线段的共线重叠长度（不共线或不相交时返回 0）。
 *
 * 用途：两条边在同一条通道上叠着走时，读者看到的是一根线 —— 这是"连线错误"里
 * 最容易被当成画错的一类，必须在 diagnostics 里点名并给出**实测长度**。
 */
export declare function collinearOverlap(a1: Point, a2: Point, b1: Point, b2: Point): number;
//# sourceMappingURL=geometry.d.ts.map