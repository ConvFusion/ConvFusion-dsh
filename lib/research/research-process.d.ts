/**
 * ConvFusion 2.0 — 基本科研过程（阶段模型）
 *
 * ## 为什么需要它，以及它**不是**什么
 *
 * v2 推倒了「8 个模块按序执行」的固定流水线，但**基本科研过程仍然存在**：
 * 不先弄清问题就查文献、不先有假设就设计实验，得到的东西不可解释。区别在于：
 *
 * ```text
 * v0.1.x 模块流水线          ：状态机决定下一步跑哪个模块（强制）
 * v2 阶段模型（本文件）      ：从**真实研究资产**推断"现在最缺哪一步"（提示性）
 * ```
 *
 * 因此这里产出的永远是**建议**：
 *
 *   - 只用于「能力选择」与「进展展示」，不驱动执行、不阻塞任何操作；
 *   - 阶段由 `project.md` / `research/` 里的**实际内容**推断，不是由对话内容猜测；
 *   - 用户可以完全忽略它继续自由对话 —— Agent 仍按自己的判断做事。
 *
 * ## 过程定义本身是一个 Skill（用户可定制）
 *
 * 阶段列表**不再硬编码**：它来自 `research-process` 这个能力（`skills/research-management/
 * research-process.md`）里的一段机器可读围栏块。用户可以在【设置】-【ConvFusion】-【本地研究方法】
 * 里覆盖该能力的 `Research Method` 章节，**规定自己的研究进展过程** —— 不同学科的过程确实不同。
 *
 * 解析规则：取**第一个**含 `stage:` 行的块。因为用户定制在合成时排在原文**之前**，
 * 所以"取第一个"天然让用户的定义优先，不需要任何额外设置。
 *
 * 代码里保留一份 `DEFAULT_STAGES` 作为兜底：能力缺失或块被改坏时，过程评估仍然可用
 * （只是退回默认过程），绝不因为一段文本有问题就让整个进展展示失效。
 *
 * ## 判定规则（全部可核查）
 *
 * 每个阶段只看"有没有产出该阶段的**可验证研究资产**"，不看它是否"被标记完成"。
 * 判定信号取自**固定词表**（`STAGE_SIGNALS`）—— 用户可以改过程，但改不了判定逻辑，
 * 否则一个笔误就会让"当前阶段"永远判不出来。信号留空/写错 → 该阶段不参与判定。
 */
/**
 * 判定信号词表。
 *
 * ⚠️ 固定词表是刻意的：用户能改**过程**，但改不了**判定逻辑**。
 * 允许任意表达式会让一个笔误把"当前阶段"永久判错，而且无法校验。
 */
export declare const STAGE_SIGNALS: readonly ["problem-defined", "literature-evidence", "claims", "method-plan", "experiments", "settled-evidence", "decisions", "manuscript"];
export type StageSignal = (typeof STAGE_SIGNALS)[number];
/** 科研过程的一个阶段（与能力类别对应）。 */
export interface ResearchStage {
    /** 阶段 id。 */
    id: string;
    /** 阶段显示名（用于展示）。 */
    label: string;
    /** 对应的能力类别（taxonomy 顶层 id）。 */
    category: string;
    /** 判定信号（缺省/未知 → 该阶段不参与"当前阶段"判定）。 */
    signal?: StageSignal;
    /** 这个阶段要产出什么（用于"最缺什么"的说明）。 */
    produces: string;
}
/**
 * 基本科研过程的阶段顺序。
 *
 * ⚠️ 这是**过程**顺序，不是**执行**顺序：真实研究会在阶段间来回跳。
 * 它只回答"从资产上看，哪一步还没有落地的证据"。
 */
/** 默认过程（兜底）：与 `research-process` 能力里的默认块保持一致。 */
export declare const DEFAULT_STAGES: readonly ResearchStage[];
/** 过程定义能力的 id。 */
export declare const PROCESS_SKILL_ID = "research-process";
/**
 * 从能力正文里解析阶段列表。
 *
 * 格式（每行一个阶段）：
 *
 * ```text
 * stage: <id> | <显示名> | <能力类别> | <判定信号> | <产出说明>
 * ```
 *
 * 取**第一个**连续块：用户定制在合成时排在原文之前，因此用户的定义天然优先。
 *
 * @returns 解析出的阶段；没有可解析的块时返回 `undefined`（调用方退回默认过程）
 */
export declare function parseStages(content: string | undefined): ResearchStage[] | undefined;
/** 一个阶段的落地情况。 */
export interface StageStatus {
    stage: ResearchStage;
    /** 该阶段是否已有可验证资产落地。 */
    satisfied: boolean;
    /** 判定依据（一句话，可核查）。 */
    evidence: string;
}
/** 过程评估结果。 */
export interface ProcessAssessment {
    stages: StageStatus[];
    /**
     * 当前阶段 = **第一个尚未落地**的阶段。
     *
     * 全部落地时为 `undefined`（此时研究进入"持续演化"状态，没有"最缺的一步"）。
     */
    current?: StageStatus;
    /** 尚未落地的阶段（用于展示"还缺哪些"）。 */
    missing: StageStatus[];
}
/**
 * 评估科研过程走到哪一步。
 *
 * @param workspace 研究 workspace
 * @param options.skillContent 取某个能力**生效正文**（含用户定制）的函数；
 *                             缺省时只用默认过程
 * @returns 各阶段状态与当前阶段
 */
export declare function assessResearchProcess(workspace: string, options?: {
    skillContent?: (id: string) => string | undefined;
}): ProcessAssessment;
/** 用给定的阶段列表评估（与"阶段从哪来"解耦，便于测试）。 */
export declare function assessWithStages(workspace: string, stages: readonly ResearchStage[]): ProcessAssessment;
//# sourceMappingURL=research-process.d.ts.map