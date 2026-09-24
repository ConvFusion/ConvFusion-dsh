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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listClaims, listDecisions } from './claims.js';
import { listEvidence } from './evidence.js';
import { listPlanDocuments } from './plans.js';
import { loadProjectFile } from './project.js';
import { DEFAULT_PAPER_ID } from './paper-data.js';
import { paperDir } from './paper.js';
import { FULLTEXT_DIR } from './paper-download.js';
/**
 * 判定信号词表。
 *
 * ⚠️ 固定词表是刻意的：用户能改**过程 / 依赖图**，但改不了**判定逻辑**。
 * 允许任意表达式会让一个笔误把"当前阶段"永久判错，而且无法校验。
 */
export const STAGE_SIGNALS = [
    'topic-proposed',
    'problem-defined',
    'literature-evidence',
    'claims',
    'method-plan',
    'experiments',
    'settled-evidence',
    'decisions',
    'manuscript',
    // ── 技能前置依赖新增（阶段模型未覆盖）──
    'resource-estimate',
    'simulation-result',
    'fulltext-analyzed',
];
/** 读盘构建信号判定上下文（每次评估都重新求值以确保动态性）。 */
export function buildSignalContext(workspace) {
    const project = loadProjectFile(workspace);
    const evidence = listEvidence(workspace);
    const claims = listClaims(workspace);
    const decisions = listDecisions(workspace);
    const plans = listPlanDocuments(workspace);
    const literatureEvidence = evidence.filter((e) => e.sourceKind === 'literature');
    const settledEvidence = evidence.filter((e) => e.status === 'supported' || e.status === 'verified');
    const hasExperiments = existsSync(join(workspace, 'experiments'));
    const hasManuscript = existsSync(join(paperDir(workspace, DEFAULT_PAPER_ID), 'paper.md'));
    // 研究话题落盘（`research/topics.md`）：只数**顶层 bullet**（一条话题一个 bullet）。
    // 缩进的子项（依据 / 什么会推翻它）、标题、引用说明都不算 —— 否则一条话题会被数成好几条。
    let topicCount = 0;
    try {
        topicCount = readFileSync(join(workspace, 'research', 'topics.md'), 'utf8')
            .split(/\r?\n/)
            .filter((line) => /^(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
    }
    catch {
        topicCount = 0;
    }
    // 全文下载与分析的落地物：`research/literature/fulltext/` 下的全文文件（pdf/html/txt）
    let fulltextCount = 0;
    try {
        fulltextCount = readdirSync(join(workspace, FULLTEXT_DIR)).filter((f) => /\.(pdf|html|txt)$/i.test(f)).length;
    }
    catch {
        fulltextCount = 0;
    }
    return { project, evidence, claims, decisions, plans, literatureEvidence, settledEvidence, hasExperiments, hasManuscript, topicCount, fulltextCount };
}
/**
 * 判定一个信号是否已落地，并给出可核查的依据。
 *
 * 接受 `string` 而非仅 `StageSignal`：前置依赖里可能出现未登记信号，由 `default`
 * 分支统一处理（返回 `satisfied: true`，不判定、不造成假的未满足）。
 *
 * 信号缺省/未知 → 返回 `satisfied: true`：不参与"当前阶段"判定，也不会造成假的缺口，
 * 但仍会展示（与 `research-process` 原规则一致）。
 */
export function judgeSignal(ctx, signal) {
    switch (signal) {
        case 'topic-proposed':
            return {
                satisfied: ctx.topicCount > 0,
                evidence: ctx.topicCount > 0
                    ? `research/topics.md 记录了 ${ctx.topicCount} 条研究话题`
                    : '尚无研究话题（`research/topics.md`）',
            };
        case 'problem-defined': {
            const questions = ctx.project?.questions?.length ?? 0;
            return {
                satisfied: questions > 0 && Boolean(ctx.project?.domain),
                evidence: questions > 0 ? `${questions} 个研究问题${ctx.project?.domain ? '、已定领域' : '（缺领域）'}` : '尚无研究问题',
            };
        }
        case 'literature-evidence':
            return {
                satisfied: ctx.literatureEvidence.length > 0,
                evidence: ctx.literatureEvidence.length > 0 ? `${ctx.literatureEvidence.length} 条文献证据` : '尚无文献证据（只有检索计划不算）',
            };
        case 'claims':
            return { satisfied: ctx.claims.length > 0, evidence: ctx.claims.length > 0 ? `${ctx.claims.length} 条主张` : '尚无主张／假设' };
        case 'method-plan': {
            const methodPlans = ctx.plans.filter((p) => /method|approach|design/i.test(p.id) || /方法|设计/.test(p.name));
            return {
                satisfied: methodPlans.length > 0,
                evidence: methodPlans.length > 0 ? `方法相关 Plan：${methodPlans.map((p) => p.id).join(', ')}` : '尚无方法设计的 Plan',
            };
        }
        case 'experiments':
            return { satisfied: ctx.hasExperiments, evidence: ctx.hasExperiments ? '存在 `experiments/`' : '尚无实验目录' };
        case 'settled-evidence':
            return {
                satisfied: ctx.settledEvidence.length > 0,
                evidence: ctx.settledEvidence.length > 0
                    ? `${ctx.settledEvidence.length} 条已确认证据`
                    : `尚无 confirmed 证据（现有 ${ctx.evidence.length} 条，均未确认）`,
            };
        case 'decisions':
            return { satisfied: ctx.decisions.length > 0, evidence: ctx.decisions.length > 0 ? `${ctx.decisions.length} 条决策记录` : '尚无决策记录' };
        case 'manuscript':
            return { satisfied: ctx.hasManuscript, evidence: ctx.hasManuscript ? '存在论文正文' : '尚无论文正文' };
        // ── 技能前置依赖新增信号 ──
        case 'resource-estimate': {
            const resourcePlans = ctx.plans.filter((p) => /resource|cost|feasibility|infrastructure/i.test(p.id) || /资源|成本|可行性|基础设施/.test(p.name));
            return {
                satisfied: resourcePlans.length > 0,
                evidence: resourcePlans.length > 0 ? `资源相关 Plan：${resourcePlans.map((p) => p.id).join(', ')}` : '尚无资源/可行性 Plan',
            };
        }
        case 'simulation-result': {
            // 计算类证据即仿真/预期结果（与 research-state.ts / paper-evolution.ts 同口径）
            const simEvidence = ctx.evidence.filter((e) => e.sourceKind === 'computation');
            return {
                satisfied: simEvidence.length > 0,
                evidence: simEvidence.length > 0 ? `${simEvidence.length} 条计算/仿真证据` : '尚无计算/仿真证据',
            };
        }
        case 'fulltext-analyzed': {
            // 「全文下载与分析」：既有全文文件，又有记下来的文献证据。
            // 两者缺一都不算 —— 只有检索计划/摘要满足不了「选 SOTA、锚定已发表数字」。
            const downloaded = ctx.fulltextCount > 0;
            const analyzed = ctx.literatureEvidence.length > 0;
            return {
                satisfied: downloaded && analyzed,
                evidence: downloaded && analyzed
                    ? `${ctx.fulltextCount} 篇全文已下载、${ctx.literatureEvidence.length} 条文献证据已记录`
                    : downloaded
                        ? `已下载 ${ctx.fulltextCount} 篇全文，但尚无文献证据（摘要/计划不算分析）`
                        : '尚无全文（`research/literature/fulltext/`）',
            };
        }
        default:
            // 信号缺省/未知：**不参与判定** —— 不会造成假的缺口，但仍会展示。
            return { satisfied: true, evidence: '该阶段未声明判定信号，不参与"当前阶段"判定' };
    }
}
//# sourceMappingURL=stage-signals.js.map