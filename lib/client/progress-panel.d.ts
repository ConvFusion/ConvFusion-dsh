/**
 * ConvFusion 2.0 — 顶部「研究进展」按钮（+ 展开面板）
 *
 * ## 为什么从"对话流里的进度卡"改成"顶部按钮"（2026-09 用户拍板）
 *
 * 旧实现挂在 `conversation.chat.turnTail`（链式槽位）。链式槽位有两件事**做不到**：
 *
 * ```text
 * 1. selector 只能拿到 owner props = { turn, seq, openFile } —— **没有会话身份**，
 *    所以"这个会话是不是研究项目"只能靠一个进程级全局变量（旧的 activeSessionId
 *    + researchSessions 缓存）来猜；
 * 2. 猜出来的结果被**所有**会话共用 —— 一旦某个研究会话预热过，链式选举就在
 *    每个会话里都命中我们的条目，于是进度内容出现在**非**研究会话的对话流里。
 * ```
 *
 * 换成 `conversation.session.header.utilities` 后问题从根上消失：
 *
 * ```text
 * session 作用域的 list 槽位（追加式，replaceRisk: none）
 *   → 组件拿到**自己会话**的 `sessionId`（DSH 的 standard props）
 *   → 宿主按"这个会话自己的工作区"回答 research 与否（progress/workspace）
 *   → 非研究工作区：连按钮都不渲染（不是渲染成空，而是根本不占位）
 * ```
 *
 * ## 三条必须守住的边界
 *
 * 1. **只显示在研究会话**：`research !== true` 一律不渲染按钮 —— 判定来自宿主，且
 *    用的是会话自己的 `header.cwd`，与插件进程的启动目录无关。
 * 2. **不发明数据**：面板只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就什么都不显示，不显示 0%。
 * 3. **不动别人的槽位**：`list` 槽位是追加式，官方条目（open-in-app / session-log-export）
 *    照常显示；面板是本组件自己的浮层，不开模态、不拦截对话。
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
interface ButtonProps {
    /** 当前会话 id（DSH 的 session 作用域 standard prop）。 */
    sessionId?: string;
    /** DSH Slot 标准注入。 */
    t: Translate;
}
/** 顶部百分比的后台刷新间隔（毫秒）。见 `ResearchProgressButton` 里的说明。 */
export declare const PROGRESS_REFRESH_MS = 60000;
/**
 * 会话头部的「研究进展」按钮。
 *
 * 会话作用域 → 换会话即重挂（`sessionId` 变化），因此**不存在跨会话串味**：
 * 每个会话只问自己的宿主答案，缓存也只在组件内部。
 */
export declare function ResearchProgressButton({ sessionId, t }: ButtonProps): JSX.Element | null;
export {};
