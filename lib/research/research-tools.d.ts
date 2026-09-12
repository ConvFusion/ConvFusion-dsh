/**
 * ConvFusion 2.0 — 研究资产工具（Stage 4）
 *
 * ## 为什么需要这一层
 *
 * Stage 4 的资产（Evidence / Claim / Decision / Research State）必须由 **Agent 在科研
 * 过程中记录**。如果只让模型用原生 `write` 工具直接改 Markdown，会出两个问题：
 *
 * 1. **ID 与引用关系会漂移**：`E001` 的分配、`supports` 与 `evidence` 的双向引用、
 *    `supersedes` 关系，靠模型手写迟早不一致；
 * 2. **State 会被直接覆盖**：§20 明确要求 Agent **只能提出 proposal**，
 *    由用户 `Accept / Edit / Reject`。若模型直接写 `research-state.md`，这个控制点就没了。
 *
 * 因此本模块提供一组**窄接口**工具，让正确的事容易做、错误的事做不出来：
 *
 * | 工具 | 能做什么 | 关键限制 |
 * |---|---|---|
 * | `research_evidence` | 记录/验证/取代 Evidence | 取代走 `superseded`，**不能删已引用的证据** |
 * | `research_claim` | 建立 Claim 并关联证据 | 状态由证据汇总（不凭感觉标 verified） |
 * | `research_decision` | 记录研究决策 | **必须有 reason 或 evidence** |
 * | `research_state_read` | 读取当前研究状态 | 只读 |
 * | `research_state_propose` | **提出**状态更新 | **只提案，绝不自动应用**（§20 / §21） |
 *
 * ## 不允许出现的工具（重要的"没有"）
 *
 * - **没有** `research_state_apply`：应用必须由用户处置（§21）。
 *   用户在接受时通过 `/research` 或直接编辑文件完成。
 * - **没有**任何执行类工具：真实执行仍走 Harness 原生工具（§42 Native Harness）。
 */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { openQuestions } from './research-state.js';
/** 工具名（`research_` 命名空间，与 Skill/Plan 资产一致）。 */
export declare const EVIDENCE_TOOL = "research_evidence";
export declare const CLAIM_TOOL = "research_claim";
export declare const DECISION_TOOL = "research_decision";
export declare const STATE_READ_TOOL = "research_state_read";
export declare const STATE_PROPOSE_TOOL = "research_state_propose";
export declare const PAPER_TOOL = "research_paper";
export declare const OUTPUT_TOOL = "research_output";
export declare const LITERATURE_TOOL = "research_literature_search";
/**
 * 构造研究资产工具集。
 *
 * @param resolveWorkspace 读取当前会话 workspace
 */
/**
 * @param resolveWorkspace 当前研究 workspace
 * @param literatureDeps 文献检索依赖（API Key 解析）；缺省时不注册检索工具
 */
export declare function defineResearchTools(resolveWorkspace: () => string, literatureDeps?: {
    apiKey: () => string;
    mailto?: () => string | undefined;
    fetchImpl?: import('./literature.js').FetchLike;
    timeoutMs?: number;
}): ToolDefinition[];
/** 供测试/调试：Open Questions（不经过工具层）。 */
export { openQuestions };
//# sourceMappingURL=research-tools.d.ts.map