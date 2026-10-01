/**
 * 引擎派发：按图型选择布局引擎。
 *
 * 为什么单独一个模块而不是在 `layoutDiagram` 里 `if`：`sequence.ts` 要用
 * `layout.ts` 的公共件（量算、卡片栏、出参类型），反过来 `layout.ts` 再 import
 * `sequence.ts` 就成环了。派发点放在两者之上，两边都只往下依赖。
 */
import { type LayoutResult, type RenderOptions } from './layout.js';
import type { NormalizedDiagram } from './normalize.js';
/** 这个图型是否走**时序引擎**（横轴参与者、纵轴时间）。 */
export declare function usesSequenceEngine(diagram: NormalizedDiagram): boolean;
/** 按图型派发到对应引擎。两套引擎的返回类型同构，调用方无需分叉。 */
export declare function layoutAny(diagram: NormalizedDiagram, options?: RenderOptions): LayoutResult;
//# sourceMappingURL=engine.d.ts.map