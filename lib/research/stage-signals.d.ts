/**
 * ConvFusion 2.0 — 研究阶段信号（共享判定）
 *
 * 把「信号是否已落地」从 `research-process.ts` 抽出来共享：**阶段模型**
 * （research-process）与**技能前置依赖**（prerequisites）用同一份「信号 → 磁盘资产
 * 判定」表，避免两处各写一份 switch 迟早不同步。
 *
 * ## 信号词表是固定词表（刻意的）
 *
 * 用户能改**过程 / 依赖图**，但改不了**判定逻辑**（见 `research-process.ts` 头注释）：
 * 允许任意表达式会让一个笔误把判定永久判错，且无法校验。
 * 新增信号必须在这里加 `judgeSignal` 的 case 并定死「落地物」判定。
 *
 * 8 个信号与 `research-process` 的阶段一一对应（topic-proposed / literature-evidence /
 * claims / method-plan / resource-estimate / decisions / experiments / manuscript）；
 * 另外 3 个（`problem-defined`、`settled-evidence`、`simulation-result`）是技能前置依赖
 * 需要、但阶段模型未直接使用的信号。
 *
 * 为什么阶段 1 用 `topic-proposed` 而不是 `problem-defined`：研究问题是**检索之后**
 * 跟随主题确定一起出现的（主题确定即已发现科研问题），所以「问题已定」不该是第一步的
 * 判定；第一步的落地物是 `research/topics.md` 里的研究话题。
 */
import { listClaims, listDecisions } from './claims.js';
import { listEvidence } from './evidence.js';
import { listPlanDocuments } from './plans.js';
import { loadProjectFile } from './project.js';
/**
 * 判定信号词表。
 *
 * ⚠️ 固定词表是刻意的：用户能改**过程 / 依赖图**，但改不了**判定逻辑**。
 * 允许任意表达式会让一个笔误把"当前阶段"永久判错，而且无法校验。
 */
export declare const STAGE_SIGNALS: readonly ["topic-proposed", "problem-defined", "literature-evidence", "claims", "method-plan", "experiments", "settled-evidence", "decisions", "manuscript", "resource-estimate", "simulation-result", "fulltext-analyzed"];
export type StageSignal = (typeof STAGE_SIGNALS)[number];
/** 信号判定的运行时上下文（一次性读盘，供阶段评估与前置评估共用）。 */
export interface SignalContext {
    project: ReturnType<typeof loadProjectFile>;
    evidence: ReturnType<typeof listEvidence>;
    claims: ReturnType<typeof listClaims>;
    decisions: ReturnType<typeof listDecisions>;
    plans: ReturnType<typeof listPlanDocuments>;
    literatureEvidence: ReturnType<typeof listEvidence>;
    settledEvidence: ReturnType<typeof listEvidence>;
    hasExperiments: boolean;
    hasManuscript: boolean;
    /** `research/topics.md` 里记录的研究话题条数（阶段 1「提出话题」的落地物）。 */
    topicCount: number;
    /** `research/literature/fulltext/` 下的全文文件数（pdf/html/txt，不含 manifest）。 */
    fulltextCount: number;
}
/** 读盘构建信号判定上下文（每次评估都重新求值以确保动态性）。 */
export declare function buildSignalContext(workspace: string): SignalContext;
/**
 * 判定一个信号是否已落地，并给出可核查的依据。
 *
 * 接受 `string` 而非仅 `StageSignal`：前置依赖里可能出现未登记信号，由 `default`
 * 分支统一处理（返回 `satisfied: true`，不判定、不造成假的未满足）。
 *
 * 信号缺省/未知 → 返回 `satisfied: true`：不参与"当前阶段"判定，也不会造成假的缺口，
 * 但仍会展示（与 `research-process` 原规则一致）。
 */
export declare function judgeSignal(ctx: SignalContext, signal: string | undefined): {
    satisfied: boolean;
    evidence: string;
};
//# sourceMappingURL=stage-signals.d.ts.map