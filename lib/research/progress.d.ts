/**
 * ConvFusion 2.0 — Research Progress Snapshot（本轮研究进展）
 *
 * 设计依据：`v2-Progress.md`。一次对话结束后，展示**这一轮到底让研究前进了多少**。
 *
 * ## 一条不能违反的约束：不许猜
 *
 * `v2-Progress.md` 写得很明确：**"这个进度条不是根据聊天内容猜出来的。它来自真正的
 * Research State 更新。"** 因此本模块只做三件事，且**每一件都从磁盘上的真实资产读出**：
 *
 * ```text
 * A. Research Progress      —— 成熟度维度（Research State 的等级）+ 可数资产计数
 * B. Research State Changes —— 与"本轮开始前"的快照逐项对比（新增/变化）
 * C. Next Research Need     —— 科研过程的当前缺口 + Evidence/Claim 缺口
 * ```
 *
 * ## 为什么成熟度显示的是"等级折算"而不是百分比
 *
 * Research State 的成熟度是**定性等级**（`Unknown/Weak/Emerging/Strong/Established`，
 * Stage 4 §35），不是打分。把它渲染成 `58% → 64%` 会**凭空制造精度** —— 那正是本插件
 * 反复守的一条线（不伪造）。所以这里：
 *
 *   - 进度条的位置由等级折算得到，**同时显示等级名**，并标注"折算"；
 *   - 可数的东西（证据/主张/决策/计划）**给真实计数**，不给百分比；
 *   - 未评估的维度显示 `Unknown`，绝不假装它是 0% 或某个中间值。
 */
import { type AdvanceAssessment } from './advance.js';
import { type MaturityDimension, type MaturityLevel } from './research-data.js';
/** 等级 → 进度条位置（**折算**，不是测量值）。 */
export declare const MATURITY_SCALE: Record<MaturityLevel, number>;
/** 一个研究进度快照（纯数据，可从磁盘重建）。 */
export interface ProgressSnapshot {
    /** 推进判定：下一步是否需要用户拍板（见 `advance.ts`）。 */
    advance: AdvanceAssessment;
    /** Research State 版本。 */
    stateVersion: string;
    /** 各成熟度维度的**等级**（未评估 = Unknown）。 */
    maturity: Record<MaturityDimension, MaturityLevel>;
    /** 可数资产（全部是事实，不是估算）。 */
    counts: {
        evidence: number;
        /** 状态为 supported/verified 的证据数。 */
        evidenceSettled: number;
        /** 带原始产物的证据数（provenance 完整）。 */
        evidenceWithArtifact: number;
        claims: number;
        /** 至少有一条支撑证据的主张数。 */
        claimsSupported: number;
        decisions: number;
        plans: number;
        plansReady: number;
        openQuestions: number;
        outputs: number;
        paperPresent: boolean;
    };
    /** 当前科研过程阶段（提示性）。 */
    stage: {
        id: string;
        label: string;
    } | null;
}
/**
 * 从工作区真实资产采集一次快照。
 *
 * @param skillContent 取能力生效正文（过程定义可被用户定制，见 `research-process.ts`）
 */
export declare function captureProgress(workspace: string, skillContent?: (id: string) => string | undefined, advanceOptions?: {
    staleRounds?: number;
    staleThreshold?: number;
}): ProgressSnapshot;
/** 一处变化。 */
export interface ProgressChange {
    /** 类别（成熟度 / 证据 / 主张 / 决策 / 计划 / 产出）。 */
    kind: string;
    /** 人类可读描述。 */
    text: string;
}
/** 两个快照的差异。 */
export interface ProgressDiff {
    before: ProgressSnapshot;
    after: ProgressSnapshot;
    /** 折算后的整体成熟度（各维度等级的均值；全 Unknown 时为 0）。 */
    overallBefore: number;
    overallAfter: number;
    /** 发生变化的成熟度维度。 */
    maturityChanges: Array<{
        dimension: MaturityDimension;
        from: MaturityLevel;
        to: MaturityLevel;
    }>;
    /** 计数变化（只含真的变了的项）。 */
    countChanges: Array<{
        key: keyof ProgressSnapshot['counts'];
        from: number;
        to: number;
    }>;
    /** 本轮是否有任何实质性推进。 */
    changed: boolean;
}
/** 比较两个快照。 */
export declare function diffProgress(before: ProgressSnapshot, after: ProgressSnapshot): ProgressDiff;
/** 一条进度条（`█` 填充 + `░` 空白）。 */
export declare function renderBar(scale: number, width?: number): string;
/**
 * 渲染成一条 **notice**（`summary` 显示在收起行，`text` 展开可见）。
 *
 * @returns `summary` 受 `CONTEXT_SUMMARY_MAX_CHARS` 约束；`text` 是完整进展块
 */
export declare function renderProgressNotice(diff: ProgressDiff, advance?: AdvanceAssessment): {
    summary: string;
    text: string;
};
/** 供 `/research` 状态展示用：紧凑的一行。 */
export declare function renderProgressLine(snapshot: ProgressSnapshot): string;
//# sourceMappingURL=progress.d.ts.map