/**
 * ConvFusion v0.5.6 — IR Delta（规格 §17：增量变更，不整份重写）
 *
 * > 长期研究尤其需要记录 **Agent 到底改变了什么**。
 *
 * 每次变更 = 一个 {@link IRDelta}（change / target / operations / reason），
 * 施加到当前 IR 上得到新修订；施加后**整体再验证**（§15 Agent Loop 的
 * "IR Proposal → Kernel Validation"），验证不过就不产生新修订。
 *
 * ## 确定性操作语义
 *
 * 对象目标（`question` / `decision` / `plan` / `research` / 元素）：
 *
 * | 操作 | 语义 | 失败 |
 * |---|---|---|
 * | `add: {字段: 值}` | 增加**尚不存在**的字段 | 字段已存在 → R303 |
 * | `update: {字段: 值}` | 修改**已存在**的字段 | 字段不存在 → R304 |
 * | `remove: [字段]` | 删除字段 | 字段不存在 → R305 |
 *
 * 数组目标（`hypotheses` / `evidence_requirements` / `plan.steps`）：
 *
 * | 操作 | 语义 |
 * |---|---|
 * | `add` + `items: [...]` | 追加元素（id 缺失自动分配，冲突 → R303） |
 * | `update` + `items: [{id, …}]` | 按 id 合并元素的部分字段（找不到 → R304） |
 * | `remove: [id, …]` | 按 id 删除元素（找不到 → R305） |
 */
import type { IRDelta, IRValidationIssue, IRValidationReport, ResearchIR } from './types.js';
export type DeltaResult = {
    ok: true;
    ir: ResearchIR;
    applied: string[];
    report: IRValidationReport;
} | {
    ok: false;
    errors: IRValidationIssue[];
    report?: IRValidationReport;
};
/**
 * 对一个 IR 施加 delta，返回新修订（`revision + 1`）。
 *
 * 只在**整体验证通过**后才返回 ok —— 非法修订不产生（Repair 循环的确定性闸门）。
 */
export declare function applyDelta(ir: ResearchIR, delta: IRDelta): DeltaResult;
/** 一句话摘要（进 trace / 日志）。 */
export declare function summarizeDelta(delta: IRDelta): string;
//# sourceMappingURL=delta.d.ts.map