/**
 * ConvFusion — Diagram IR 规范化与**结构**校验（v0.5.5 / C08P07）
 *
 * 输入是 Agent 写的任意 JSON（`unknown`），输出是**内部规范化结构** + 结构诊断。
 * 这一层只回答"这份 IR 说不说得通"：字段类型、id 唯一、枚举合法、引用存在、
 * group 关系成树。图的连通性与视觉问题在 `validate.ts` 里查（那一层需要先布局）。
 *
 * 设计取向：**尽可能恢复**。一处枚举写错不该让整张图消失 —— 能回退到默认值的就回退，
 * 同时报一条 error/warning，让 Agent 按 `code` 改。只有"根本没有图"（nodes 为空或
 * 不是对象）才算致命。
 */
import { type Diagnostic, type DiagramEdge, type DiagramEdgeType, type DiagramEvidence, type DiagramGroup, type DiagramIR, type DiagramLabel, type DiagramNode, type DiagramNodeType, type DiagramStyleDefaults, type DiagramType, type LayoutAlgorithm, type LayoutDirection, type StyleToken } from './types.js';
export interface NormalizedNode {
    id: string;
    type: DiagramNodeType;
    label: string;
    description?: string;
    style: StyleToken;
    /** 直接所属 group（多写冲突时取第一个并报错）。 */
    group?: string;
    /** 声明顺序 —— 层内排序的依据（Agent 用它控制同层次序，不需要坐标）。 */
    order: number;
    evidence: DiagramEvidence[];
    /** 这个节点承载的论文资产编号（渲染为盒底一行小字）。 */
    refs?: string[];
}
export interface NormalizedGroup {
    id: string;
    label: string;
    style: StyleToken;
    /** 直接成员（node id 或子 group id），去重后保持声明顺序。 */
    members: string[];
    order: number;
    /** 父 group id（由成员关系推出）。 */
    parent?: string;
    /** 1 = 顶层；2 = 嵌套一层。 */
    depth: number;
    /** 这个模块承载的论文资产编号。 */
    refs?: string[];
}
export interface NormalizedEdge {
    id: string;
    source: string;
    target: string;
    type: DiagramEdgeType;
    label?: string;
    refs?: string[];
    order: number;
}
/** 流程之外的卡片（承载次级论点 / 关键数字）。 */
export interface NormalizedCard {
    id: string;
    title: string;
    body?: string;
    refs?: string[];
    order: number;
}
export interface NormalizedLabel {
    id: string;
    text: string;
    anchor: string;
}
/** 层间距的可调范围（见 `DiagramLayoutSpec.layer_gap`）。 */
export declare const LAYER_GAP_MIN = 12;
export declare const LAYER_GAP_MAX = 120;
export interface NormalizedDiagram {
    version: string;
    type: DiagramType;
    title?: string;
    direction: LayoutDirection;
    algorithm: LayoutAlgorithm;
    /** 层间距覆盖值（未指定时用 `LAYOUT.layerGap`）。 */
    layerGap?: number;
    /** 是否显示节点说明（来自 IR；渲染调用的显式参数优先）。 */
    showDescriptions?: boolean;
    canvas: {
        width?: number;
        height?: number;
    };
    nodes: NormalizedNode[];
    groups: NormalizedGroup[];
    edges: NormalizedEdge[];
    cards: NormalizedCard[];
    labels: NormalizedLabel[];
    styleDefaults: DiagramStyleDefaults;
}
export interface NormalizeResult {
    /** 致命错误（写不出图）时为 null。 */
    diagram: NormalizedDiagram | null;
    /**
     * 结构诊断。
     *
     * `fatal` = 连图都没有（`nodes` 缺失/为空/不是数组）：后面所有检查都不必做。
     */
    diagnostics: Diagnostic[];
    fatal: boolean;
}
/** 把任意 JSON 规范化为内部结构。**不抛异常**：坏输入变成诊断。 */
export declare function normalizeIr(raw: unknown): NormalizeResult;
/** 一个 group 下的**叶子 node**（递归展开子 group）。 */
export declare function leafNodesOf(diagram: NormalizedDiagram, groupId: string): NormalizedNode[];
/** 由最深层 group 开始向上排序（画容器时要先画内层）。 */
export declare function groupsDeepestFirst(diagram: NormalizedDiagram): NormalizedGroup[];
/** 由最外层 group 开始（父节点优先）。 */
export declare function groupsShallowestFirst(diagram: NormalizedDiagram): NormalizedGroup[];
/** 类型化的 `DiagramGroup` 出参（重新导出，供工具层做 JSON 输出）。 */
export type { DiagramGroup, DiagramIR, DiagramLabel, DiagramNode, DiagramEdge };
//# sourceMappingURL=normalize.d.ts.map