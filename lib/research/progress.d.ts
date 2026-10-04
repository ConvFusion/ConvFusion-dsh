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
import { type GapPriority, type PaperGapType, type PaperMaturityLevel } from './paper-data.js';
/** 等级 → 进度条位置（**折算**，不是测量值）。 */
export declare const MATURITY_SCALE: Record<MaturityLevel, number>;
/** 一个研究工作自己的可数资产（全部是事实，不是估算）。 */
export interface WorkCounts {
    /** 正文章节总数。 */
    sections: number;
    /** 有实质内容的章节数。 */
    sectionsWithContent: number;
    claims: number;
    claimsWithoutEvidence: number;
    evidence: number;
    /** 正文实际引用的证据数。 */
    evidenceUsedInManuscript: number;
    /** 未解决缺口（已记录的 ∪ 规则检查实时发现的）。 */
    gaps: number;
    gapsHigh: number;
    openProposals: number;
}
/** 一个研究工作的进展。 */
export interface WorkProgress {
    /** Paper id（工作 id）。 */
    id: string;
    /** 完整标题（悬停显示）。 */
    title: string;
    /** 短标题（tab 用）。 */
    short: string;
    /** 是否是当前激活的论文。 */
    active: boolean;
    status: string;
    version: string;
    /** 该工作成熟度等级折算的均值（0..1）。 */
    overall: number;
    /**
     * 成熟度的来源：
     * `recorded` = `papers/<id>/maturity.md` 里有评估；`derived` = 没有评估，
     * 按真实资产规则**推定**（界面必须标明"推定"，不能冒充评估值）。
     */
    maturitySource: 'recorded' | 'derived';
    /** 论文成熟度维度（等级 + 等级折算）。 */
    maturity: Array<{
        dimension: string;
        level: PaperMaturityLevel;
        scale: number;
    }>;
    counts: WorkCounts;
    /** 下一步：最高优先级的未解决缺口（结构化 code，界面自己本地化）。 */
    next?: {
        code: PaperGapType;
        priority: GapPriority;
        target?: string;
        skill?: string;
    };
}
/**
 * 短标题（tab 用）：优先取副标题之前的部分，再收成前 2 个词或 22 个字符。
 *
 * 论文标题常常很长（`A: B, and C`），整条塞进 tab 会撑爆面板；这里只做**显示**收缩，
 * 完整标题仍在 `title` 里（悬停可见），所以不丢信息。
 */
export declare function shortWorkTitle(title: string, id: string): string;
/** 采集每个研究工作自己的进展（纯读盘；依次复用 Stage 5 的既有 helper）。 */
export declare function captureWorkProgress(workspace: string): WorkProgress[];
/** 汇总里的一行（一个工作；只投影总览要显示的那几个数）。 */
export interface WorkAggregateRow {
    id: string;
    /** 完整标题（悬停）。 */
    title: string;
    /** 短标题（行首）。 */
    short: string;
    active: boolean;
    /** 该工作成熟度等级折算的均值（0..1）。 */
    overall: number;
    maturitySource: 'recorded' | 'derived';
    counts: WorkCounts;
}
/**
 * 多个工作的合计（工作数 > 1 时才存在；单工作时为 `undefined`）。
 *
 * 为什么要有它：工作区的聚合字段（`WorkspaceProgress.counts` / `paper`）是**项目级**
 * 读数，几篇论文的资产合在一起 —— "证据 12" 分不清是哪一篇。总览 tab 因此需要
 * 一份"每个工作各一行 + 逐项合计"的读数；它全部由各工作自己的数字相加得到。
 */
export interface WorksAggregate {
    /** 参与合计的工作数。 */
    works: number;
    /**
     * 各工作 `counts` 的逐项求和（键与 `WorkCounts` 完全一致）。
     *
     * ⚠️ **一个刻意的例外：`evidence` 不相加。** `paperStatusSummary` 给每个工作报的
     * `evidence.total` 是**同一个**工作区证据库的读数（`listEvidence(workspace)`），不是
     * "属于这个工作的证据"。相加会把同一批证据按工作数重复计（实测 2 个工作 × 15 条 → 30），
     * 与同一面板里项目级 A2 的「证据 15」当场矛盾 —— 那正是本插件不允许的"编一个数"。
     * 所以 `evidence` 只报**一份**共享读数；「正文引用」`evidenceUsedInManuscript`
     * 确实是分工作的，照旧相加。
     */
    totals: WorkCounts;
    /** 每个工作一行，顺序与工作 tab 一致。 */
    rows: WorkAggregateRow[];
}
/** 逐项求和（**唯一**一处加法：界面与回归测试都用它，避免两处求和漂移）。 */
export declare function sumWorkCounts(counts: WorkCounts[]): WorkCounts;
/**
 * 各工作报的**同一份**工作区证据库读数。
 *
 * 取最大值而不是求和：正常情况下每个工作的这个数都一样（都来自 `listEvidence(workspace)`），
 * 万一将来出现不一致，报得出来也比静默少报好。
 */
export declare function sharedEvidenceCount(works: WorkProgress[]): number;
/**
 * 由各工作构造汇总（纯函数：同一份 `works` 必得同一结果）。
 *
 * @returns 工作数 ≤ 1 时为 `null` —— 单工作没有"汇总"可言，界面照旧渲染今天的内容
 */
export declare function aggregateWorks(works: WorkProgress[]): WorksAggregate | null;
/** 一个研究进度快照（纯数据，可从磁盘重建）。 */
export interface ProgressSnapshot {
    /**
     * 工作区里每个研究工作自己的进展（一个工作 = 一个 Paper）。
     *
     * 聚合字段（`counts` / `paper` / `maturity`）保持不变：它们是**项目级**读数，
     * 仍然要在；`works` 只是把"哪个工作到哪了"补上。
     */
    works: WorkProgress[];
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
/** 浏览器展示用的结构化缺口；固定文案由客户端按 code 本地化。 */
export type ProgressGap = {
    code: 'stagePending';
    stage: {
        id: string;
        label: string;
    };
} | {
    code: 'processComplete';
} | {
    code: 'unsupportedClaims';
    count: number;
} | {
    code: 'missingArtifacts';
    count: number;
} | {
    code: 'openQuestions';
    count: number;
};
export declare function progressGapData(snapshot: ProgressSnapshot): ProgressGap[];
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
        stage: {
            id: string;
            label: string;
        } | null;
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
            from: number;
            to: number;
        }>;
    };
    /** C. 接下来最值得做什么。 */
    need: {
        gaps: ProgressGap[];
        clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown';
        basis: string;
        basisCode?: string;
        basisParams?: Record<string, string | number>;
        nextStep?: string;
        needsUserDecision?: string;
        decisionCode?: string;
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
    /** 计数。 */
    value: number;
    /** 附带的结构化计数（如"5 已确认"）。 */
    detail?: {
        code: 'settled' | 'supported' | 'ready';
        count: number;
    };
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
    /**
     * 每个研究工作自己的进展（一个工作 = 一个 Paper；没有论文时为空）。
     *
     * 界面在**多于一个**工作时用它画 tab（见 `client/progress-panel.tsx`）；
     * 只有一个工作时界面照旧渲染下面的聚合内容（不出现 tab 条）。
     */
    works: WorkProgress[];
    /**
     * 多个工作时的汇总（工作数 ≤ 1 时**没有这个字段**）。
     *
     * 总览 tab 用它概括所有工作（逐工作一行 + 合计）；单工作时字段缺席，
     * 面板的行为与加它之前**完全一致**。
     */
    aggregate?: WorksAggregate;
    /** A. 研究现在到了哪里。 */
    progress: {
        dimensions: Array<{
            dimension: string;
            level: MaturityLevel;
            scale: number;
        }>;
        stage: {
            id: string;
            label: string;
        } | null;
    };
    /** 可数资产（真实计数）。 */
    counts: ProgressCountRow[];
    /** 是否已有论文正文（`papers/<id>/paper.md`）。 */
    paper: boolean;
    /** C. 当前缺口与推进判定。 */
    need: {
        gaps: ProgressGap[];
        clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown';
        basis: string;
        basisCode?: string;
        basisParams?: Record<string, string | number>;
        nextStep?: string;
        needsUserDecision?: string;
        decisionCode?: string;
    };
}
/** 可数资产 → 面板行（顺序固定，便于两次点开之间对照）。 */
export declare function progressCountRows(snapshot: ProgressSnapshot): ProgressCountRow[];
/** 由当前快照构造工作区报告（纯函数：同一份磁盘状态必得同一结果）。 */
export declare function buildWorkspaceProgress(snapshot: ProgressSnapshot, at?: Date): WorkspaceProgress;
/** 供 `/research` 状态展示用：紧凑的一行。 */
export declare function renderProgressLine(snapshot: ProgressSnapshot): string;
//# sourceMappingURL=progress.d.ts.map