/**
 * ConvFusion — Diagram SVG 渲染（v0.5.5 / C08P07）
 *
 * 这是整条链路里**唯一**把几何变成图形的地方，也是唯一碰 SVG 的地方。
 * Agent 永远不写 SVG（dev-note §2 / §33）。
 *
 * 三条硬约束：
 *
 * 1. **确定性**：同一个 IR 渲染 N 次得到逐字节相同的 SVG。没有时间戳、没有随机数、
 *    没有 Map 迭代顺序依赖（只用数组与按声明顺序插入的 Map）、所有数字 `r3` 取整。
 * 2. **自包含**：不引用外部字体文件、图片或 CSS。字体用系统字体栈，样式用展示属性
 *    （presentation attributes）而不是 `<style>` —— 后者在部分 SVG→PDF 转换器里会被丢。
 * 3. **不改输入**：`layoutDiagram` 的结果只读使用；渲染不产生隐藏状态。
 */
import type { LayoutResult, RoutedEdge } from './layout.js';
import type { NormalizedDiagram } from './normalize.js';
export interface RenderResult {
    svg: string;
    layout: LayoutResult;
}
/** 渲染成 SVG 字符串。 */
export declare function renderSvg(diagram: NormalizedDiagram, layout: LayoutResult): string;
/** 供工具层做 PNG/PDF 导出时复用的几何（第一阶段不导出，仅暴露给测试）。 */
export declare function edgePathBounds(edge: RoutedEdge): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
//# sourceMappingURL=render.d.ts.map