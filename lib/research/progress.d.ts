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
 *
 * ## 两个展示面（同一套数据，2026-09 改版）
 *
 * ```text
 * 顶部「研究进展」按钮的面板（主）  ← `WorkspaceProgress`：任何时刻点开都看"现在到哪了"
 * 回合尾部曾经注入的进度卡（已删）  ← `TurnProgressReport`：链式槽位的 selector 拿不到会话身份，
 *                                    只能靠一个进程级全局变量猜，于是会命中所有会话
 * ```
 *
 * `TurnProgressReport` 仍然保留：面板的"本轮变化"一节用它（哪个会话的哪一轮，
 * 由 `progress-bridge.ts` 按会话 id 记录）。
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
/** 全部计数项的显示名（报告与 notice 共用，避免两处文案漂移）。 */
export declare function countLabel(key: string): string;
/**
 * 当前缺口（只陈述事实，不猜）。
 *
 * `v2-Progress.md` 的 C 段：Research State 现在暴露了什么需求。
 */
export declare function researchGaps(snapshot: ProgressSnapshot): string[];
/**
 * 一轮对话结束后的研究进展报告（`v2-Progress.md` 的三段式）。
 *
 * 为什么返回**结构化数据**而不是 Markdown：报告由**客户端**渲染成面板里的一节
 * （顶部「研究进展」按钮，见 `client/progress-panel.tsx`），结构化的字段才能排版成
 * 图表，而不是把 Markdown 字符串塞进界面。
 */
export interface TurnProgressReport {
    /** 生成时刻（ISO）。 */
    at: string;
    /** 回合号（未知为 -1）。 */
    turn: number;
    /** 一行摘要（界面自己加图标）。 */
    summary: string;
    /** 折算后的整体成熟度变化（0..1）。 */
    overall: {
        before: number;
        after: number;
    };
    /** A. 研究现在到了哪里。 */
    progress: {
        dimensions: Array<{
            dimension: string;
            level: MaturityLevel;
            scale: number;
        }>;
        stage: string | null;
    };
    /** B. 刚才这轮改变了什么。 */
    changes: {
        changed: boolean;
        maturity: Array<{
            dimension: string;
            from: MaturityLevel;
            to: MaturityLevel;
        }>;
        counts: Array<{
            key: string;
            label: string;
            from: number;
            to: number;
        }>;
    };
    /** C. 接下来最值得做什么。 */
    need: {
        gaps: string[];
        clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown';
        basis: string;
        nextStep?: string;
        needsUserDecision?: string;
    };
    /** 本轮是否推进了（供界面决定强调程度）。 */
    moved: boolean;
}
/** 由差异 + 快照构造界面用的回合报告。 */
export declare function buildTurnReport(diff: ProgressDiff, turn: number, advance?: AdvanceAssessment, at?: Date): TurnProgressReport;
/** 面板里的一行可数资产（数字全部是事实，不是估算）。 */
export interface ProgressCountRow {
    /** 计数键（`ProgressSnapshot['counts']` 的子集）。 */
    key: string;
    /** 显示名。 */
    label: string;
    /** 计数。 */
    value: number;
    /** 附带说明（如"5 已确认"）。 */
    note?: string;
}
/**
 * 当前工作区的研究进展（**不是**"本轮变化"）。
 *
 * 刻意**不给整体百分比之外的伪精度**：成熟度是等级折算（`scale`），同时带上等级名；
 * 可数资产给真实计数；未评估的维度是 `Unknown`（折算 0，界面必须显示名字）。
 */
export interface WorkspaceProgress {
    /** 生成时刻（ISO）。 */
    at: string;
    /** Research State 版本。 */
    stateVersion: string;
    /** 各成熟度维度等级折算的均值（0..1；全 Unknown 时为 0）。 */
    overall: number;
    /** A. 研究现在到了哪里。 */
    progress: {
        dimensions: Array<{
            dimension: string;
            level: MaturityLevel;
            scale: number;
        }>;
        stage: string | null;
    };
    /** 可数资产（真实计数）。 */
    counts: ProgressCountRow[];
    /** 是否已有论文正文（`papers/<id>/paper.md`）。 */
    paper: boolean;
    /** C. 当前缺口与推进判定。 */
    need: {
        gaps: string[];
        clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown';
        basis: string;
        nextStep?: string;
        needsUserDecision?: string;
    };
}
/** 可数资产 → 面板行（顺序固定，便于两次点开之间对照）。 */
export declare function progressCountRows(snapshot: ProgressSnapshot): ProgressCountRow[];
/** 由当前快照构造工作区报告（纯函数：同一份磁盘状态必得同一结果）。 */
export declare function buildWorkspaceProgress(snapshot: ProgressSnapshot, at?: Date): WorkspaceProgress;
/** 供 `/research` 状态展示用：紧凑的一行。 */
export declare function renderProgressLine(snapshot: ProgressSnapshot): string;
//# sourceMappingURL=progress.d.ts.map