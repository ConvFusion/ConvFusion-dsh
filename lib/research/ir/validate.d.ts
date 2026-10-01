/**
 * ConvFusion v0.5.6 — IR Validator（规格 §8：三层验证的前两层 + §16 Repair）
 *
 * ```text
 * IR → Schema Validator（R0xx）→ Scientific Structural Validator（R1xx）
 *    → Transition Validator（R2xx，见 transition.ts）→ Executable IR
 * ```
 *
 * ## 边界（§19）
 *
 * 科研结构层判的是 **"它是否满足一个可执行、可验证的科研结构"**，
 * 不判"这个科研设计是不是科学上正确"。所以这里的每条规则都是
 * 确定性的（字段存在性 / 引用一致性 / 可测量性），不是科学评判。
 *
 * ## Repair（§16）
 *
 * 每条错误都带 `repair` —— 返回结构化的修复动作建议，而不是
 * "你的方案有问题，请重新设计"。Agent 拿到 errors 后按 repair 修，再提交。
 */
import { type IRValidationReport, type ResearchIR } from './types.js';
/**
 * 把原始 JSON 归一成 Typed IR（不报错 —— 语义检查交给 {@link validateIR}）。
 *
 * `id` / `revision` / `provenance` 由 store 分配；缺失时这里给中性缺省。
 */
export declare function normalizeIR(raw: unknown): ResearchIR;
/** 原始 JSON → 归一 + 校验，一步到位（工具入口用）。 */
export declare function parseIR(raw: unknown): {
    ir: ResearchIR;
    report: IRValidationReport;
};
/**
 * 三层验证的前两层：Structural（R0xx）+ Scientific（R1xx）。
 *
 * 第三层 Transition（R2xx）需要工作区上下文，见 `transition.ts`。
 */
export declare function validateIR(ir: ResearchIR): IRValidationReport;
/** 把报告渲染成人类可读文本（Repair 循环里给模型看）。 */
export declare function formatReport(report: IRValidationReport): string;
//# sourceMappingURL=validate.d.ts.map