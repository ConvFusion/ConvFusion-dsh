/**
 * ConvFusion 2.0 — 会话 Tab「研究进展」的正文（面板本体 + 整页容器）
 *
 * ## 演进（两次用户拍板）
 *
 * ```text
 * 2026-09  conversation.chat.turnTail（对话流里的进度卡）
 *            ↓ 链式槽位拿不到会话身份，只能靠进程级全局变量猜 → 内容跑到别的会话里
 * 2026-09  conversation.session.header.utilities（顶部按钮 + 浮层）
 *            ↓ 组件拿到**自己会话**的 sessionId，判定天然按会话正确
 * 2026-10  conversation.view（会话 Tab，order 19：对话 | 轨迹 | 研究进展 | 科V社区）
 * ```
 *
 * 现在这一页是**会话 Tab 的正文**，按钮与浮层已移除（用户要求"只留 tab"）。
 * tab 的显隐与文案由 `./convfusion-tab.js` 的闸门管：只在研究工作区注册，
 * 文案里的百分比也取自闸门对宿主的那一次探针（面板没挂载时 tab 也要有数）。
 *
 * ## 三条必须守住的边界
 *
 * 1. **只出现在研究工作区**：`research !== true` 时闸门根本不注册这个 tab（不是渲染成空，
 *    而是根本不占位）；判定来自宿主，用的是会话自己的 `header.cwd`，与插件进程的启动目录无关。
 * 2. **不发明数据**：只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就说明"宿主还没返回"，不显示 0%。
 * 3. **会话作用域**：`sessionId` 来自 DSH 的 session 作用域 standard props，每个会话只问
 *    自己的宿主答案 —— 这正是那次链式槽位故障的反面。
 */
import { type Translate } from './i18n/index.js';
/** 成熟度维度（等级 + 等级折算的位置）。 */
interface ProgressDimension {
    dimension: string;
    level: string;
    scale: number;
}
/** 一行可数资产。 */
interface ProgressCountRow {
    key: string;
    value: number;
    detail?: {
        code: 'settled' | 'supported' | 'ready';
        count: number;
    };
}
interface ProgressStage {
    id: string;
    label: string;
}
type ProgressGap = {
    code: 'stagePending';
    stage: ProgressStage;
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
/** 一个研究工作自己的可数资产（宿主 `captureWorkProgress` 的产物）。 */
interface WorkCounts {
    sections: number;
    sectionsWithContent: number;
    claims: number;
    claimsWithoutEvidence: number;
    evidence: number;
    evidenceUsedInManuscript: number;
    /** 未解决缺口（已记录的 ∪ 规则检查实时发现的）。 */
    gaps: number;
    gapsHigh: number;
    openProposals: number;
}
/** 一个研究工作自己的进展（一个工作 = 一个 Paper）。 */
interface WorkProgress {
    id: string;
    /** 完整标题（tab 的悬停提示）。 */
    title: string;
    /** 短标题（tab 上用）。 */
    short: string;
    /** 是否是当前激活的论文。 */
    active: boolean;
    status: string;
    version: string;
    /** 该工作成熟度等级折算的均值（0..1）。 */
    overall: number;
    /** `derived` = 该论文还没有成熟度评估，等级是按真实资产**推定**的（界面必须标明）。 */
    maturitySource: 'recorded' | 'derived';
    maturity: Array<{
        dimension: string;
        level: string;
        scale: number;
    }>;
    counts: WorkCounts;
    /** 最高优先级的未解决缺口；没有缺口时没有这个字段。 */
    next?: {
        code: string;
        priority: string;
        target?: string;
        skill?: string;
    };
}
/** 汇总里的一行（一个工作；宿主 `WorkAggregateRow` 的镜像）。 */
interface WorkAggregateRow {
    id: string;
    title: string;
    short: string;
    active: boolean;
    overall: number;
    maturitySource: 'recorded' | 'derived';
    counts: WorkCounts;
}
/**
 * 多个工作的合计（宿主 `WorksAggregate` 的镜像）。
 *
 * 只在多于一个工作时才由宿主带来；单工作/老宿主没有这个字段 → 总览照旧。
 */
interface WorksAggregate {
    works: number;
    totals: WorkCounts;
    rows: WorkAggregateRow[];
}
/** 当前工作区的研究进展（宿主 `buildWorkspaceProgress` 的产物）。 */
interface WorkspaceReport {
    at: string;
    stateVersion: string;
    overall: number;
    progress: {
        dimensions: ProgressDimension[];
        stage: ProgressStage | null;
    };
    counts: ProgressCountRow[];
    paper: boolean;
    /**
     * 每个研究工作自己的进展（一个工作 = 一个 Paper）。
     *
     * 按可选读：老宿主不带这个字段，界面就退回"只有聚合内容"（今天的行为）。
     */
    works?: WorkProgress[];
    /** 多工作汇总（可选读：单工作与老宿主都没有）。 */
    aggregate?: WorksAggregate;
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
/** 最近一轮的变化（宿主 `TurnProgressReport` 的子集）。 */
interface TurnReport {
    turn: number;
    at: string;
    summary: string;
    overall: {
        before: number;
        after: number;
    };
    changes: {
        changed: boolean;
        maturity: Array<{
            dimension: string;
            from: string;
            to: string;
        }>;
        counts: Array<{
            key: string;
            from: number;
            to: number;
        }>;
    };
}
/** `progress/workspace` 的返回值。 */
export interface WorkspaceProgressValue {
    protocol: number;
    sessionId: string;
    workspace: string | null;
    research: boolean;
    report: WorkspaceReport | null;
    lastTurn: TurnReport | null;
}
/**
 * 按钮的显示状态。
 *
 * `hidden` 是**保守**结论：宿主不可达、端点不存在（老宿主）、或该会话不是研究项目 ——
 * 三种情况都不显示按钮。宁可少显示一次，也不能在没有研究进展的地方出现一个假按钮。
 */
export type ProgressProbe = {
    kind: 'loading';
} | {
    kind: 'hidden';
} | {
    kind: 'shown';
    workspace: string | null;
    report: WorkspaceReport | null;
    lastTurn: TurnReport | null;
};
/**
 * 纯函数：宿主返回 → 按钮状态（可离线测试）。
 *
 * 判定只看宿主明确回答的 `research === true`；任何异常/缺字段都退化为 `hidden`，
 * 绝不"猜一个研究项目出来"（旧实现的全局缓存正是这么错的）。
 */
export declare function readProgressValue(res: unknown): ProgressProbe;
/** 只保留路径的最后两段（顶部浮层里不需要完整路径）。 */
export declare function shortenPath(path: string | null): string;
/**
 * 进展的后台刷新间隔（毫秒）。
 *
 * 两处用它：① 面板内容（研究资产一变，读数就该变）；② `./convfusion-tab.js` 的闸门
 * —— tab 文案里的百分比来自闸门的探针，靠同一个低频轮询跟上变化。
 */
export declare const PROGRESS_REFRESH_MS = 60000;
/** 「研究进展」正文与整页容器共用的 props。 */
interface PanelProps {
    /** 当前会话 id（DSH 的 session 作用域 standard prop）。 */
    sessionId?: string | undefined;
    /** DSH Slot 标准注入。 */
    t: Translate;
}
/**
 * 「研究进展」的**正文**（面板本体）。
 *
 * ## 为什么与组件分离
 *
 * 这一页原先只是会话头部一个按钮点开的**浮层**；用户 2026-10 拍板改成会话 Tab
 * （`对话 | 轨迹 | 研究进展 | 科V社区`），于是正文必须能脱离那个按钮独立渲染：
 *
 * ```text
 * conversation.view (id: convfusion-progress, order: 19)
 *   └─ ResearchProgressView   ← 整页容器（自己滚动 + 居中列宽）
 *        └─ ResearchProgressPanel  ← 本组件：读数 + A/A2/B/C 四块
 * ```
 *
 * ## 三条边界
 *
 * 1. **不发明数据**：只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就说明"宿主还没返回"，**不显示 0%**。
 * 2. **会话作用域**：`sessionId` 由 DSH 的 session 作用域 standard props 给到，
 *    因此每个会话只问自己的宿主答案，**不存在跨会话串味**（这正是 2026-09 那次
 *    链式槽位故障的反面：那时判定只能靠进程级全局变量猜）。
 * 3. **数字只有一处来源**：面板与 tab 文案里的百分比都来自宿主同一次端点，界面不自己算。
 *
 * tab 的显隐（只在研究工作区出现）不在这里 —— 由 `./convfusion-tab.js` 的闸门决定
 * 注册与否；tab 文案里的百分比同样由闸门从宿主答案里取（面板没挂载时也要有数）。
 */
export declare function ResearchProgressPanel({ sessionId, t }: PanelProps): JSX.Element;
/**
 * 会话 Tab「研究进展」的正文（`conversation.view` 的占用者）。
 *
 * 整页容器：`conversation.view` 的容器是 `flex: 1; min-height: 0`，**没有 overflow**，
 * 外层的 `.centerCol` 还是 `overflow: hidden` —— 所以滚动必须自己给，否则长内容被裁掉。
 * 列宽用固定的居中列（会话正文那条可拖拽宽度是**对话**的排版，不适合卡片列表）。
 */
export declare function ResearchProgressView({ sessionId, t }: PanelProps): JSX.Element;
export {};
