/**
 * ConvFusion — Diagram 确定性布局（v0.5.5 / C08P07）
 *
 * ## 这份布局解决什么
 *
 * Agent 写的是**关系**（谁连着谁），不是坐标。布局负责把关系变成几何，并且每次都
 * 变成**同样的**几何。三个决定：
 *
 * 1. **分层**：按最长路径把节点分到层（lane）；回边（feedback/residual 或成环的边）
 *    先被识别出来、不参与分层，否则成环图会被判成"无法布局"。
 * 2. **层内顺序**：按声明顺序（group 成员结块）。这就是 Agent 控制排版的**唯一旋钮** ——
 *    想要 Feature Fusion 在 Backbone 下面，就把它的声明或 group 位置调到前面，
 *    不需要（也不给）坐标。
 * 3. **走线**：正交走线，且**只在层间空隙里做竖直移动** —— 空隙里没有节点，所以
 *    "线穿过盒子"不是靠运气避开的。直连走线不行时退到上/下外绕，两条外绕路径
 *    的竖直段同样落在空隙里、水平段在全部节点之上/之下。
 *
 * ## 坐标映射
 *
 * 布局全部在**流向空间** `(u, v)` 里做：`u` 沿阅读方向、`v` 横向。这样 LR/RL/TB/BT
 * 共用同一份代码，最后一步才映射到屏幕 x/y（RL/BT 是镜像）。少一份代码 = 少一类
 * "某个方向下才出现"的缺陷。
 */
import { type Point, type Rect } from './geometry.js';
import type { Lifeline, SequenceMessage } from './sequence.js';
import { type NormalizedCard, type NormalizedDiagram, type NormalizedEdge, type NormalizedGroup, type NormalizedNode } from './normalize.js';
import { type Diagnostic } from './types.js';
export interface PlacedNode {
    id: string;
    type: NormalizedNode['type'];
    style: NormalizedNode['style'];
    label: string;
    labelLines: string[];
    descriptionLines: string[];
    rect: Rect;
    layer: number;
    /** 该 node 在 IR 里声明了证据吗（validate 用）。 */
    traced: boolean;
    /** 绑定的论文资产编号，渲染为盒底一行小字（如 `[C1 · E008]`）。 */
    refText?: string;
    /** `refText` 按字体折行后的行（盒子高度按它算）。 */
    refLines: string[];
}
/** 流程之外的一张卡片（见 `DiagramCard`）。 */
export interface PlacedCard {
    id: string;
    titleLines: string[];
    bodyLines: string[];
    refText?: string;
    rect: Rect;
}
export interface PlacedGroup {
    id: string;
    label: string;
    style: NormalizedGroup['style'];
    rect: Rect;
    depth: number;
    /** 直接成员（含子 group）。 */
    members: string[];
    /** 容器标签后面追加的引用（`[C1]`）。 */
    refText?: string;
}
export interface RoutedEdge {
    id: string;
    source: string;
    target: string;
    /** 声明的端点（可能是 group id）—— 与 source/target（解析成 node）区分开。 */
    declaredSource: string;
    declaredTarget: string;
    type: NormalizedEdge['type'];
    label?: string;
    points: Point[];
    labelPos?: Point;
    labelAnchor: 'middle' | 'start';
    /** 全部候选都穿过了节点（validate 报 EDGE_CROSSES_NODE 用）。 */
    crossesNode: boolean;
    /** 走线用了外绕（validate 报"曲线过长/交叉"之类时用）。 */
    detoured: boolean;
}
export interface PlacedLabel {
    id: string;
    text: string;
    x: number;
    y: number;
    anchor: 'middle' | 'start' | 'end';
}
export interface LayoutResult {
    width: number;
    height: number;
    title?: string;
    titleX: number;
    titleY: number;
    nodes: PlacedNode[];
    nodeById: Map<string, PlacedNode>;
    groups: PlacedGroup[];
    groupById: Map<string, PlacedGroup>;
    edges: RoutedEdge[];
    labels: PlacedLabel[];
    cards: PlacedCard[];
    /** 时序图的生命线（分层模式为空）。 */
    lifelines?: Lifeline[];
    /** 时序图的消息行（分层模式为空）。 */
    messages?: SequenceMessage[];
    /** 走线检测用到的层带（供 validate 判定空间是否够）。 */
    layerBands: Array<{
        start: number;
        end: number;
    }>;
    diagnostics: Diagnostic[];
}
export interface RenderOptions {
    /** 是否在节点里显示 `description`（默认 false —— dev-note §21：图上字越少越好）。 */
    showDescriptions?: boolean;
    /**
     * 工作区里**真实存在**的论文资产编号（claim / evidence），用于校验 `refs`。
     *
     * 由调用方注入而不是内核去读工作区：内核保持纯函数（同输入同输出、可测），
     * "编号是否存在"属于**研究记录**的事实，只有工具层知道去哪儿读。
     * 不提供时只做形状检查（见 `BAD_REF_SHAPE`）。
     */
    knownRefs?: ReadonlySet<string>;
}
/**
 * 一个盒子（节点 / 时序图参与者）的文字与尺寸。
 *
 * **两套引擎共用**（分层引擎与 `sequence.ts`）：否则同一张论文里，
 * 同一个 `node` 在流程图和时序图里会长得不一样 —— 那是"看起来像 bug"的那种不一致。
 */
export interface NodeBox {
    w: number;
    h: number;
    labelLines: string[];
    descriptionLines: string[];
    refText?: string;
    refLines: string[];
}
export declare function measureNodeBox(node: NormalizedNode, showDescriptions: boolean, maxTextWidth?: 168): NodeBox;
/**
 * 卡片排成**一行**（时序图用）。
 *
 * 为什么时序图不用右侧竖栏：时序图天然是"宽而扁"的（参与者成列、消息成行），
 * 右侧再挂一条 250 单位的竖栏会把画布撑到近千单位宽，缩进栏宽后字只有 6~7pt。
 * 改成排在下方的**一行**，宽度不动、只加高度，缩进跨栏正好落在可读区间。
 * 同一件事在两种图型里要有不同的做法 —— 这就是"按模式分契约"。
 */
export declare function buildCardRow(cards: readonly NormalizedCard[], flowBounds: Rect): PlacedCard[];
/**
 * 卡片栏：整块排在**给定流程边界之外**的右侧。
 *
 * 两套引擎共用（分层 / 时序）：卡片永远不参与走线，所以它在哪种图里都不会制造连线问题。
 */
export declare function buildCardPanel(cards: readonly NormalizedCard[], flowBounds: Rect): PlacedCard[];
/** 把规范化 IR 布局成几何。纯函数：不读文件、不用随机数、不看时钟。 */
export declare function layoutDiagram(diagram: NormalizedDiagram, options?: RenderOptions): LayoutResult;
/**
 * 把折线的 `start` 或 `end` 端裁到矩形边框上。
 *
 * 用途：边指向一个 group 时，线要停在**块的边框**，而不是画进块里停在某个成员节点上。
 *
 * 做法：先把折线排成"从**外端**走向矩形内部"的顺序（裁 `end` 用原序、裁 `start` 用逆序），
 * 再取**最后一个落在矩形外的点** k —— 点 k+1 就已经在矩形内了，跨越段 k→k+1 与边框
 * 的交点就是裁剪点。
 *
 * ⚠️ 不要写成"从内端往回找第一段相交"：那样遍历方向反了，`segmentEntryPoint` 的
 * 求交会退化成返回内端点本身（线上实测过：箭头停在成员节点上，差了一个 groupPadding）。
 */
export declare function clipAtRect(points: readonly Point[], rect: Rect, side: 'start' | 'end'): Point[];
//# sourceMappingURL=layout.d.ts.map