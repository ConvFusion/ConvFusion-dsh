/**
 * ConvFusion 2.0 — Output Profiles（Stage 5.1 Task 2）
 *
 * ## Profile 是什么（§7）
 *
 * 「输出类型 / 目标受众 / 推荐结构 / 内容约束 / 来源对象 / 格式要求」的描述。
 *
 * **不是 Workflow**：Profile 里没有执行顺序，也没有"必须先做 A 再做 B"。
 * 它只说明"这种成果长什么样、要满足什么"，执行仍由 Harness 的 Agent 决定。
 *
 * ## 为什么 Profile 是数据而不是 Prompt
 *
 * §14 明确：**Output Transformation 不是 summarization**。
 * Patent 不等于"把 Paper 的标题换掉" —— 它要重新组织成
 * 技术问题 / 技术方案 / 技术效果 / 实施方式（§9）。
 * 这类差异必须**可复核地表达**（结构 + 约束 + 质量规则），而不是藏在某段提示词里。
 */
import type { OutputProfile, OutputType } from './output-data.js';
/** 第一版实现的四个 Profile（§6）。 */
export declare const OUTPUT_PROFILES: Record<OutputType, OutputProfile>;
/** 取一个 Profile。 */
export declare function getOutputProfile(type: OutputType): OutputProfile;
/** 列出全部 Profile（供设置面板 / 工具展示）。 */
export declare function listOutputProfiles(): OutputProfile[];
/**
 * Patent claim 与 Research claim 的区别说明（§10）。
 *
 * 这是本阶段最容易做错的地方，因此**单独成文**，供 Patent Profile 的审核者阅读，
 * 也供工具在自检时引用。
 */
export declare const PATENT_CLAIM_NOTE: string;
//# sourceMappingURL=output-profiles.d.ts.map