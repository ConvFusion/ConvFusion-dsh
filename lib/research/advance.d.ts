/**
 * ConvFusion 2.0 — 推进判定（下一步是否需要用户拍板）
 *
 * ## 用户要求
 *
 * > 增加对当前进展的评价；如果下一步方向比较明确、不需要用户输入，就**直接继续推进**；
 * > 除非有**非常难的抉择**，才提醒用户，由用户决定选哪个方向。
 *
 * 所以这里回答的不是"研究到了哪一步"（那是 `research-process.ts`），而是：
 *
 * ```text
 * 下一步清楚吗？
 *   ├── clear     → 可以自主继续（不需要用户）
 *   ├── ambiguous → 有多个势均力敌的方向 / 连续几轮没有进展 → 提醒用户选
 *   └── blocked   → 有明确标着"阻塞"的问题未决 → 必须用户拍板
 * ```
 *
 * ## 一条硬约束：不猜
 *
 * 判定**全部来自磁盘上的可核查依据**，不做语义猜测：
 *
 *   - 阻塞项：研究问题里带**显式标记**的（`[blocking]` / `（阻塞项）`）。
 *     是标记驱动的 —— 插件没有能力判断"这个问题难不难"，只有作者/用户能标。
 *   - 停滞：连续 N 轮研究资产计数无变化（由调用方传入连续轮数）。
 *   - 歧义：存在 ≥2 个 **draft** 状态且互斥的候选计划（说明方向还没收敛）；
 *     但若 `research/decisions/` 已有 `status: decided` 的研究决策，方向视为已收敛，
 *     残留 draft 计划按簿记残留处理（不触发歧义）。
 *   - 其余情况视为 clear，但 clear **只在"下一步确实是常规推进"时才成立**：
 *     当前科研过程阶段还缺产出，且没有停滞、没有歧义、没有阻塞。
 *
 * ⚠️ 判定结果只影响"要不要自动继续"，**不驱动任何研究内容本身**；
 * 每一次自动继续仍然是原生 Agent 的一整轮，用户随时可以插话。
 */
import { type ProcessAssessment } from './research-process.js';
/** 推进判定结果。 */
export type AdvanceClarity = 'clear' | 'ambiguous' | 'blocked';
/** 一次推进判定。 */
export interface AdvanceAssessment {
    clarity: AdvanceClarity;
    /** 稳定展示码；浏览器据此本地化，`basis` 只保留给日志/Agent。 */
    basisCode: 'blockingQuestion' | 'stalled' | 'draftPlans' | 'processComplete' | 'stagePending';
    basisParams?: Record<string, string | number>;
    /** 判定依据（可核查的一句话）。 */
    basis: string;
    /** 建议的下一步（`clarity === 'clear'` 时给出；否则为空）。 */
    nextStep?: string;
    /** 需要用户决定的事项（`clear` 时为空）。 */
    needsUserDecision?: string;
    /** 固定提示的稳定码；缺省表示 `needsUserDecision` 是用户原文。 */
    decisionCode?: 'stalled' | 'draftPlans' | 'processComplete';
}
/**
 * 判断研究问题里是否有**显式标记**的阻塞项。
 *
 * 标记是刻意的：插件无法判断一个问题的"难度"，只有写下它的人能标。
 * 支持中英两种写法，见 `project.md` 的约定。
 */
export declare function findBlockingQuestion(questions: readonly string[] | undefined): string | undefined;
/** 判定输入。 */
export interface AdvanceInput {
    workspace: string;
    /** 连续多少轮研究资产没有变化（由进展桥统计）。 */
    staleRounds?: number;
    /** 连续停滞多少轮就认为需要用户介入。 */
    staleThreshold?: number;
    /** 过程评估（缺省现算）。 */
    process?: ProcessAssessment;
}
/** 默认停滞阈值。 */
export declare const DEFAULT_STALE_THRESHOLD = 2;
/**
 * 判定下一步是否需要用户拍板。
 *
 * @returns 判定结果（含依据）；**不做任何写入**
 */
export declare function assessAdvance(input: AdvanceInput): AdvanceAssessment;
/** 自动继续策略。 */
export interface AutoContinuePolicy {
    /** 是否启用自动继续（设置项）。 */
    enabled: boolean;
    /** 单次会话内最多连续自动推进多少轮（防止无人值守跑飞）。 */
    maxRounds: number;
}
/** 默认策略：开启，最多连续 3 轮。 */
export declare const DEFAULT_AUTO_CONTINUE: AutoContinuePolicy;
/**
 * 是否应当自动继续。
 *
 * @param assessment 推进判定
 * @param policy 策略
 * @param roundsUsed 本会话已连续自动推进的轮数
 */
export declare function shouldAutoContinue(assessment: AdvanceAssessment, policy: AutoContinuePolicy, roundsUsed: number): {
    go: boolean;
    reason: string;
};
//# sourceMappingURL=advance.d.ts.map