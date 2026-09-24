/**
 * ConvFusion 2.0 — 技能前置依赖（嵌入式编排器）
 *
 * ## 它是什么
 *
 * 每个技能在自己的 `## Prerequisites` 节里声明「做这一步前，哪些**信号**应已落地」。
 * 本模块把这些声明聚合成一张依赖图，按磁盘资产判定「前置是否满足」，**只做提示**，
 * 不驱动执行、不阻塞操作（与 `research-process` 的阶段模型同一条边界）。
 *
 * ```text
 * ① 机器可读围栏块    —— 技能正文里 `requires:` 块（与 `stage:` 块同款）
 * ② 用户定制覆盖层    —— composeSkillContent 用户文本拼前 + 「取第一个块」解析 → 用户优先
 * ③ 代码固定判定      —— 复用 stage-signals.ts 的 STAGE_SIGNALS + judgeSignal，用户改图改不了判定
 * ```
 *
 * ## 依赖顶点用信号、不用 Skill id
 *
 * 「做 X 前 Y 落地了吗」看的是**磁盘资产**（信号），不是「跑没跑过某技能」：信号单调
 * （落地后不再消失），依赖图天然无环；且与 v2「只看资产」的判定哲学一致。
 *
 * ## 格式
 *
 * ```text
 * requires: <signal>[/<signal>] | <说明>
 * ```
 *
 * - 行内 `/` = OR（任一落地即满足该行）；多行 = AND（全部满足）。
 * - 未知信号 → 不判定、不阻塞（与 stage 信号「留空/写错 → 不判定」一致）。
 * - 缺 `## Prerequisites` 节 = 该技能无前置。
 */
import { type SignalContext, type StageSignal } from './stage-signals.js';
/** 一条前置依赖：一行 `requires:`，含一个 OR 信号组。 */
export interface PrerequisiteLine {
    /** OR 信号组（未知信号保留用于展示）。 */
    signals: string[];
    /** 说明（行尾 `|` 之后的文字，不参与判定）。 */
    note: string;
}
/** 一个技能的全部前置依赖（行间 = AND）。 */
export type Prerequisites = PrerequisiteLine[];
/**
 * 从技能正文里解析前置依赖块。
 *
 * 取**第一个**含 `requires:` 行的连续块（与 `parseStages` 同规则）：用户定制在合成时
 * 拼在前，故用户的块天然优先。
 */
export declare function parsePrerequisites(content: string | undefined): Prerequisites | undefined;
/** 一个技能的前置依赖评估结果。 */
export interface SkillPrerequisiteStatus {
    skillId: string;
    /** 该技能声明的前置依赖（无则空数组）。 */
    prerequisites: Prerequisites;
    /** 未满足的依赖行（行内 OR 任一落地即满足，整行未满足才进这里）。 */
    unmet: Array<{
        signals: string[];
        note: string;
        missingSignals: string[];
    }>;
    /** 是否全部前置已满足（无前置 → true）。 */
    satisfied: boolean;
}
/** 信号是否在固定词表内（未知信号不判定、不阻塞）。 */
export declare function isKnownSignal(signal: string): signal is StageSignal;
/**
 * 评估一组技能的前置依赖。
 *
 * @param skills 技能 id 与**生效正文**（含用户定制）的配对
 * @param ctx 信号判定上下文（用 `buildSignalContext` 构建，复用阶段评估的同一份读盘）
 */
export declare function assessPrerequisites(skills: ReadonlyArray<{
    id: string;
    content: string | undefined;
}>, ctx: SignalContext): SkillPrerequisiteStatus[];
/**
 * 便捷：评估单个技能的前置依赖（内部用 buildSignalContext 读盘）。
 *
 * 用于「只看某个技能」的场景；批量评估请用 `assessPrerequisites` 并复用同一份 ctx。
 */
export declare function assessPrerequisitesForSkill(workspace: string, skill: {
    id: string;
    content: string | undefined;
}): SkillPrerequisiteStatus;
/** 把未满足的前置渲染成一行简洁提示（供 Research Context 注释）。 */
export declare function renderUnmetPrerequisites(status: SkillPrerequisiteStatus): string;
//# sourceMappingURL=prerequisites.d.ts.map