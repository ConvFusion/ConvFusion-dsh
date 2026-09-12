/**
 * ConvFusion 2.0 — Paper Gap Detection 与 Capability Recommendation（Stage 5）
 *
 * ## 为什么 Gap 是 Stage 5 的关键（§14 / §15）
 *
 * Paper 不只是记录已有成果，还要能回答 **"这篇论文目前缺什么？"**。
 * 但 §15 有一条**硬约束**：
 *
 * ```text
 * Gap ──✗──▶ Agent 自动执行
 *
 * Gap ──▶ Capability Recommendation ──▶ Skill ──▶ Plan ──▶ User Review ──▶ Harness
 * ```
 *
 * 因此本模块**只做检测与推荐**，绝不执行任何东西。推荐输出的是 **Skill id**，
 * 由 Agent/用户决定是否据此形成 Plan（Stage 3）。
 *
 * ## 检测方式（Task 8）
 *
 * 第一版 = **规则检查 + Agent 建议**。本模块实现规则部分：全部判据都来自
 * Stage 4 的资产（Claim / Evidence / Research State）与正文引用，因此**可复核**。
 * Agent 建议走 `research_paper_gap` 工具（`detectedBy: 'agent'`）。
 */
import { normalizeSectionName, type GapPriority, type PaperDocument, type PaperGap, type PaperGapType } from './paper-data.js';
/**
 * 读已记录的 Gap（`gaps.md`）。
 *
 * ⚠️ 这里**不能**用「按 `\n## G` 切分」的写法：文件开头是 `# Research Gaps` 标题与
 * 说明注释，第一个 `## G001` 前面不一定有我们需要的那种分隔，结果会解析出 0 条 ——
 * 而 0 条会让"重复检测"每次都当成全新缺口重复追加。改为**按标题位置切片**。
 */
export declare function listPaperGaps(workspace: string, paperId: string): PaperGap[];
/** 序列化 Gap 列表（Markdown，§14 的结构）。 */
export declare function serializePaperGaps(gaps: readonly PaperGap[]): string;
/** 写回 Gap 列表。 */
export declare function writePaperGaps(workspace: string, paperId: string, gaps: readonly PaperGap[]): string;
/** 下一个 Gap id。 */
export declare function nextGapId(existing: readonly PaperGap[]): string;
/**
 * 规则 → 推荐能力（Skill id）的映射。
 *
 * ⚠️ 值是 **Skill id**（Stage 2 系统库中的能力），不是命令、不是步骤。
 * 这里只是"哪类缺口适合用哪种研究方法"，**不表示执行顺序**。
 */
export declare const GAP_SKILL_HINTS: Record<PaperGapType, string | undefined>;
/** 规则检测的候选（尚未落盘）。 */
export interface DetectedGap {
    type: PaperGapType;
    description: string;
    relatedClaim?: string;
    relatedSection?: string;
    priority: GapPriority;
}
/**
 * 跑**规则检查**（纯函数，不写盘）。
 *
 * 判据全部来自可复核的资产：
 *   - 正文是否有必需章节（§7）；
 *   - 章节是否有实质内容（占位注释不算）；
 *   - Claim 是否有证据 / 是否有矛盾证据（Stage 4 §10）；
 *   - Evidence 是否引用了原始产物（Stage 4 §30）；
 *   - Evidence 是否真的被正文使用（§9）；
 *   - Research State 是否有未解决问题（Stage 4 §24）。
 */
export declare function detectPaperGaps(workspace: string, paperId: string): DetectedGap[];
/**
 * 把检测结果**并入** Gap 列表（去重：同类型 + 同关联对象视为同一条）。
 *
 * @returns `{ gaps, added }` —— 合并后的完整列表与新增条数
 */
export declare function mergeDetectedGaps(existing: readonly PaperGap[], detected: readonly DetectedGap[]): {
    gaps: PaperGap[];
    added: PaperGap[];
};
/** 检测 + 落盘（Task 8 的 `detect` + `record`）。 */
export declare function detectAndRecordGaps(workspace: string, paperId: string): {
    gaps: PaperGap[];
    added: PaperGap[];
    path: string;
};
/** 手工/Agent 记录一条 Gap（Task 8 的 `record`，`detectedBy: 'agent' | 'user'`）。 */
export declare function recordPaperGap(workspace: string, paperId: string, input: Omit<PaperGap, 'id' | 'createdAt' | 'detectedBy'> & {
    detectedBy?: PaperGap['detectedBy'];
}): {
    gap: PaperGap;
    path: string;
};
/** 标记 Gap 已解决（Task 8 `resolve`）。 */
export declare function resolvePaperGap(workspace: string, paperId: string, gapId: string, note?: string): PaperGap[] | undefined;
/** Gap 优先级排序（Task 8 `prioritize`）：high → medium → low，未解决优先。 */
export declare function prioritizeGaps(gaps: readonly PaperGap[]): PaperGap[];
/** 一条能力推荐。 */
export interface CapabilityRecommendation {
    gapId: string;
    gapType: PaperGapType;
    gapDescription: string;
    priority: GapPriority;
    /** 推荐的 Skill id（来自 Stage 2 系统库）。 */
    skillId?: string;
    /** 该 Skill 的展示名（便于阅读）。 */
    skillName?: string;
    /** 建议的 Plan 文件位置（§15：Gap → Skill → Plan）。 */
    suggestedPlanPath?: string;
    /**
     * ⚠️ 永远是 `false` —— Gap 不会自动执行（§15）。
     * 这个字段存在的意义是让调用方**显式**看到这条约束。
     */
    executed: false;
}
/**
 * Gap → Skill 推荐（Task 9）。
 *
 * **不执行任何东西**：只给出"这类缺口适合用哪种研究方法"，
 * 并给出建议的 Plan 路径（Stage 3 的资产位置），由 Agent/用户决定是否创建。
 */
export declare function recommendCapabilities(workspace: string, paperId: string, knownSkillIds: readonly string[]): CapabilityRecommendation[];
/** 供 Paper 状态摘要使用的 gap 统计。 */
export declare function gapSummary(gaps: readonly PaperGap[]): {
    total: number;
    open: number;
    high: number;
    byType: Record<string, number>;
};
/** 确认 Paper 目录存在（供工具层给出友好错误）。 */
export declare function paperExists(workspace: string, paperId: string): boolean;
/** 供工具层：把 Paper 标题读出来做展示。 */
export declare function paperTitle(paper: PaperDocument): string;
/** 供工具层：章节名归一（外部也要用）。 */
export { normalizeSectionName };
//# sourceMappingURL=paper-gaps.d.ts.map