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
/** 一个标签行拆成的排版 run：普通文字 / 数学斜体 / 下标 / 上标。 */
export interface TextRun {
    kind: 'text' | 'math' | 'sub' | 'sup';
    text: string;
}
/** 上下标的相对字号（业界常用 0.7 左右）。 */
export declare const SUB_SUP_SCALE = 0.72;
/**
 * 解析标签里的**受限公式标记**。
 *
 * 为什么只做受限子集而不是 LaTeX：图里的公式只有"变量 + 上下标"这一种形态
 * （`S_{t+1}`、`D_t`），而 SVG 的 `<tspan>` 只能表达字形级别的排版。
 * 完整 LaTeX 需要 TeX 引擎，那就把"确定性渲染"这条底线交出去了。
 * 因此只支持三种记号：`$...$`（数学斜体）、`_{...}`（下标）、`^{...}`（上标）；
 * 未配对 `$` 或后接非 `{` 的单个字符也接受（`$R_t$`）。
 */
export declare function parseLabelRuns(line: string): TextRun[];
/** 按 run 计算宽度（上下标按缩小字号）。 */
export declare function measureRuns(runs: readonly TextRun[], fontSize: number): number;
/** 纯文本宽度（不含公式标记语义）。 */
export declare function measureTextPlain(text: string, fontSize: number): number;
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
/** 点到线段的最短距离。 */
export declare function pointSegmentDistance(p: Point, a: Point, b: Point): number;
/**
 * 两条线段的**最短间距**：相交记为 0，否则取四个端点到对方线段距离的最小值。
 *
 * 用于 `layout.edge_gap` 的"线之间必须留出间距"约束 —— 共线重叠检测（`collinearOverlap`）
 * 只抓同一条直线上的叠置，抓不到"两条近平行线贴得很近"。
 */
export declare function segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): number;
/** 两条线段是否**真相交**（用于把"交叉"与"并排过近"区分开）。 */
export declare function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean;
//# sourceMappingURL=geometry.d.ts.map