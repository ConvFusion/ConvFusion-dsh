/**
 * ConvFusion — Diagram 校验（v0.5.5 / C08P07）
 *
 * 三层，顺序不能换：
 *
 * 1. **结构**（`normalize.ts`）：id、枚举、引用、group 关系。
 * 2. **图**：孤立节点、成环、无法分层。
 * 3. **视觉**（需要先布局）：重叠、线穿盒子、文字溢出、容器压到别的节点、画布不够。
 *
 * 输出一律是**结构化 diagnostics**（`{code, severity, element, message, hint}`），
 * 不是自然语言错误串。理由很实际：Agent 要按 `code` 做确定性修复；message 是给人读的，
 * 措辞随时会变。dev-note §23 明确要求这一点。
 *
 * ⚠️ 这里只**报告**，不修。修由 Agent 做（结构性修改），因为"自动修"意味着系统替
 * Agent 改论文内容 —— 那是 dev-note §33 禁止的越界。
 */
import type { LayoutResult, RenderOptions } from './layout.js';
import { type NormalizedDiagram } from './normalize.js';
import { type ValidationReport } from './types.js';
export interface DiagramInspection {
    report: ValidationReport;
    /** 规范化的 IR（致命错误时为 null）。 */
    diagram: NormalizedDiagram | null;
    /** 布局结果（致命错误时为 null）。 */
    layout: LayoutResult | null;
}
/** 校验一份任意 JSON 的 Diagram IR。 */
export declare function inspectDiagram(raw: unknown, options?: RenderOptions): DiagramInspection;
/** 校验一份**已经规范化**的 IR（render 路径复用，避免重复解析）。 */
export declare function inspectNormalized(diagram: NormalizedDiagram, options?: RenderOptions): DiagramInspection;
//# sourceMappingURL=validate.d.ts.map