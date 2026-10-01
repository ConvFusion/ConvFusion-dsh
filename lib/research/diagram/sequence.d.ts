import { type LayoutResult } from './layout.js';
import type { NormalizedDiagram } from './normalize.js';
import type { RenderOptions } from './layout.js';
/** 时序图的一行消息。 */
export interface SequenceMessage {
    id: string;
    fromId: string;
    toId: string;
    y: number;
    label?: string;
    /** 自消息（`from === to`）：画成右侧的折回环。 */
    selfMessage: boolean;
}
/** 一条生命线（参与者列的中轴线）。 */
export interface Lifeline {
    nodeId: string;
    x: number;
    y0: number;
    y1: number;
}
/**
 * 时序图布局。
 *
 * 返回的 `LayoutResult` 与分层引擎**同构**（nodes = 参与者头、edges = 消息），
 * 所以渲染器、卡片、导出、校验全都不用分叉；额外多出 `lifelines` 与 `messages`。
 */
export declare function layoutSequence(diagram: NormalizedDiagram, options?: RenderOptions): LayoutResult;
//# sourceMappingURL=sequence.d.ts.map