/**
 * ConvFusion v0.5.6 — State Transition（规格 §8.3 第三层 + §9/§10/§11/§18）
 *
 * ```text
 * Research State_t + IR_t → Execution → Evidence_t → Research State_{t+1}
 * ```
 *
 * 本模块是这个循环的**确定性闸门**：
 *
 * 1. **Transition Validation（R2xx）** —— 拒绝非法推进：
 *    Claim 标 supported 却没有 Evidence（R201）、要求被不存在的证据"满足"（R202）、
 *    执行步完成却没有产物（R203）、引用悬空（R204）、基于过期修订推进（R205）。
 * 2. **Evidence ↔ IR 显式关系**（§11）—— `satisfies` 把 Evidence 挂到
 *    `evidence_requirements` 上，Review 于是可以**计算** coverage，而不只是问 LLM
 *    "这个实验是否充分"。
 * 3. **State Object + Trace 落盘**（§9/§18）—— 每次合法转移产生新 `S###`
 *    （带 `parentStateId`）并追加一行 Decision Trace。
 *
 * ⚠️ 边界：这里写的只是**内核状态版本与 trace**，不碰 `research-state.md`
 * （用户可读状态仍走 propose → Accept/Edit/Reject 人工闸门）。
 */
import type { IRStateObject, IRTraceEntry, IRValidationIssue, IRValidationReport, ResearchIR } from './types.js';
/** 一次 State Transition 的输入。 */
export interface TransitionInput {
    /** 目标 IR。 */
    irId: string;
    /** 期望的当前修订号（防基于过期修订推进 —— R205）。 */
    revision?: number;
    /** 触发本次转移的 Decision id（`D001`）。 */
    decisionId?: string;
    /** Evidence 满足 IR 的证据要求（§11 satisfies 关系）。 */
    satisfies?: Array<{
        requirement: string;
        evidence: string;
    }>;
    /** 本次完成的执行步（含实际产物）。 */
    completed?: Array<{
        step: string;
        artifact?: string;
    }>;
    /** 本次裁定的 Claim（id → 状态）。 */
    claims?: Array<{
        claim: string;
        status: string;
    }>;
    /** 执行方（记入 provenance）。 */
    agent?: string;
    /** 备注。 */
    note?: string;
}
/**
 * 第三层验证：当前工作区状态 + IR + 提议的推进 → 是否合法。
 *
 * 只判"能不能这么推进"（引用完整、产物存在、证据真实在档），
 * 不判推进是否科学上明智（§19）。
 */
export declare function validateTransition(workspace: string, input: TransitionInput): IRValidationReport;
export type TransitionResult = {
    ok: true;
    state: IRStateObject;
    ir: ResearchIR;
    trace: IRTraceEntry;
} | {
    ok: false;
    errors: IRValidationIssue[];
};
/**
 * 执行一次合法转移：IR 修订 +1（satisfies/完成状态写回 IR）、
 * 产生新 State Object（parent = 链头）、追加 Decision Trace。
 */
export declare function applyTransition(workspace: string, input: TransitionInput): TransitionResult;
/** 单个证据要求的覆盖情况。 */
export interface CoverageItem {
    requirement: string;
    type: string;
    /** 声称满足它的 Evidence id。 */
    claimed: string[];
    /** 其中真实在档的（其余为悬空引用）。 */
    inStore: string[];
    satisfied: boolean;
}
export interface CoverageReport {
    ok: true;
    irId: string;
    revision: number;
    required: number;
    satisfied: number;
    coverage: number;
    items: CoverageItem[];
}
/**
 * 计算证据覆盖率：IR 的 evidence_requirements ↔ 工作区在档 Evidence。
 *
 * Review 从"请判断这个实验是否充分"变成可计算的 Required → Produced → Coverage。
 */
export declare function evidenceCoverage(workspace: string, irId: string): CoverageReport | {
    ok: false;
    error: string;
};
//# sourceMappingURL=transition.d.ts.map