/**
 * ConvFusion — **Research State 的自进化**（产物 → 状态维度的自动同步）
 *
 * ## 为什么有它
 *
 * 架构定的那条环是：
 *
 * ```text
 * Evidence is produced → Paper evolves → Research State changes → Harness decides again
 * ```
 *
 * 而 Research State 的定义是"**当前整个研究对象的可持续、可更新状态表示**"（State Space）。
 * 但中间那一环以前**没有任何机制**：技能只产出对话正文，产物（`research/decisions/`、
 * `research/claims/`、`research/evidence/`…）与状态之间没人接 —— 实测后果：
 * `research/decisions/` 里有 8 条决策，而 `research-state.md` **连 Decisions 维度都没有**。
 *
 * 这个模块就是那一环：**把已有产物汇总成各维度的"自动段"并写进状态**。
 *
 * ## 三条纪律（都很要紧）
 *
 * ### ① 只写"自动段"，绝不碰人手写的内容
 *
 * 每个维度里，插件维护的部分固定以这一行开头：
 *
 * ```markdown
 * ### Auto-synced artifacts
 * ```
 *
 * 约定：**从这一行到该维度章节末尾，都是插件的地盘，每次同步整段重写**；
 * 人手写的内容放在这一行**之前**，永远不动。
 *
 * 为什么用 `###` 小标题而不是 HTML 注释：**解析器会把注释剥掉**
 * （`extractDimensions` 用 `<!--[\s\S]*?-->` 清洗后存进 `dimensions`），
 * 注释标记过一轮"读-写"就消失了，第二次同步就找不到自己的段、会重复追加。
 * `###` 小标题是正文文本，能活过整个读写循环。
 *
 * ### ② 有变化才写；写就归档旧版本
 *
 * - 汇总结果与现状**逐字相同 → 不写**（否则每次工具调用都涨版本号）；
 * - 要写就**先归档旧版本**（`archiveStateVersion`，带 note）再升版本号 ——
 *   与 `applyStateUpdate` 走同一条路，所以自动写入**同样可回退**（`research/state-history/`）。
 * - 每次写入在 `research/state-proposals/applied.json` 留一条 `auto-synced` 记录。
 *
 * ### ③ 只汇总，不发明
 *
 * 自动段里只有**产物本身的事实**（id、名称、状态、路径、条数）。**不**替研究者写结论、
 * 不判断成熟度、不改 `maturity_*` —— 那是研究方法与人的判断（走 `research_state_propose`）。
 *
 * ## 谁能被自动汇总
 *
 * | 维度 | 产物 |
 * |---|---|
 * | `Decisions` | `research/decisions/D*.md` |
 * | `Claims` | `research/claims/C*.md` |
 * | `Evidence` | `research/evidence/E*.md` |
 * | `Literature` | 来源为文献的 Evidence + `research/literature/fulltext/` 的全文数 |
 * | `Experiments` | `experiments/<name>/results/` 的结果文件 |
 *
 * 其余维度（Problem / Research Questions / Current Knowledge / Innovation / Hypotheses /
 * Method / Risks / Open Questions）**没有结构化产物**，靠方法技能把结论写回
 * （`research_state_propose`；阶段定义里的 `state=` 字段会告诉 Agent 该写哪个）。
 */
import { type StateDimension } from './research-data.js';
/** 自动段的起始小标题（**稳定契约**：改它就等于让所有旧状态里的自动段失联）。 */
export declare const STATE_AUTO_HEADING = "### Auto-synced artifacts";
/** 每个维度最多列多少条（超出只报个数，免得状态被产物清单淹没）。 */
export declare const STATE_AUTO_MAX_ITEMS = 40;
/** 一次自动同步的结果。 */
export interface StateSyncResult {
    /** 这次真正被重写的维度（空的 = 没有任何变化，没有写盘）。 */
    synced: StateDimension[];
    /** 旧版本号 → 新版本号（没写盘时为 `undefined`）。 */
    version?: {
        from: string;
        to: string;
    };
    /** 归档出来的旧版本路径（可回退）。 */
    archived?: string;
    /** 抄了哪些产物（诊断/日志用）。 */
    sources: string[];
}
/**
 * 汇总一个维度的**自动段内容**（不含小标题；空串 = 这个维度没有可汇总的产物）。
 *
 * 纯读盘、不抛。顺序固定（按 id 排序），所以同一份产物永远得到同一段文本 ——
 * 这是"没变化就不写盘"能成立的前提。
 */
export declare function deriveAutoBlock(workspace: string, dimension: StateDimension): string;
/**
 * **把产物汇总进 Research State**（自进化的那一环）。
 *
 * @param workspace 研究根
 * @param options.dimensions 只同步这些维度（缺省 = 所有**能自动汇总**且有产物的维度）
 * @param options.reason 归档说明（进 `state-history` 的快照头，便于回退时知道为什么）
 * @returns 同步结果（`synced` 为空 = 没有任何变化，**没有写盘**）
 */
export declare function syncStateFromArtifacts(workspace: string, options?: {
    dimensions?: readonly StateDimension[];
    reason?: string;
}): StateSyncResult | {
    error: string;
};
/**
 * **产物 ↔ 状态**的对账：哪些产物还没反映进状态。
 *
 * 自动同步之后正常情况下应该恒为空 —— 它存在是为了两件事：
 *   ① 老工作区（还没跑过同步）一眼看出落后在哪；
 *   ② 同步本身出错时能验证（"说同步了但状态里没有"是必须能发现的事）。
 */
export interface StateReconciliationRow {
    dimension: StateDimension;
    /** 有没有可自动汇总的产物。 */
    hasArtifacts: boolean;
    /** 状态里这一维**已经有自动段**了吗。 */
    hasAutoBlock: boolean;
    /** 状态里这一维（含人手写内容）是否为空。 */
    stateEmpty: boolean;
    /** 产物比状态新（只有能拿到文件时才有值）。 */
    stale: boolean;
}
export declare function reconcileStateWithArtifacts(workspace: string): StateReconciliationRow[];
/** 这个维度能不能被自动汇总（给工具/界面用）。 */
export declare function isAutoSyncedDimension(dimension: StateDimension): boolean;
/** 全部能自动汇总的维度（按状态维度顺序）。 */
export declare const AUTO_SYNCED_DIMENSIONS: readonly StateDimension[];
/** 主题自动收敛的结果。 */
export interface TopicSyncResult {
    /** 这次改了没有。 */
    changed: boolean;
    /** 依据（论文目录）；`null` = 没有论文标题 → 未触碰主题。 */
    source: string | null;
    previous?: string;
    current?: string;
    reason?: string;
    error?: string;
}
/**
 * **主题自动收敛**：研究已有论文标题时，把 `project.md` 的 topic 跟上去。
 *
 * 只在 `researchWorkName` 的结论来自**论文标题**时才动主题 —— 没有论文就不改：
 * 那时"主题"是研究者自己的陈述，插件没有事实可依据（宁可不动，也不拿兜底名覆盖它）。
 */
export declare function syncProjectTopic(workspace: string): TopicSyncResult;
/**
 * **一次自进化**：状态维度 + 项目主题。
 *
 * 所有触发点都调这一个入口 —— 分开调的话迟早有人只调一半，
 * 而"状态更新了、主题没跟上"正是这一轮要修的东西。
 */
export declare function selfEvolve(workspace: string, options?: {
    dimensions?: readonly StateDimension[];
    reason?: string;
}): {
    state: StateSyncResult | {
        error: string;
    };
    topic: TopicSyncResult;
    definition: DefinitionSyncResult;
};
/** 研究定义章节自动填充的结果。 */
export interface DefinitionSyncResult {
    filled: Array<{
        field: string;
        reason: string;
    }>;
    /** 有来源但没填的原因（章节里已有人手写内容等）。 */
    skipped: Array<{
        field: string;
        reason: string;
    }>;
}
/**
 * 把"有来源"的研究定义章节从状态/主题补上（**只补占位**）。
 *
 * 不处理的字段（本机没有可靠来源）：`Scope`（范围判断）、`Domain`（领域判断）——
 * 它们要用 `research_project action=set` 显式写，且要带 reason。
 */
export declare function syncProjectDefinition(workspace: string): DefinitionSyncResult;
/**
 * **一次自进化**：状态维度 + 项目主题 + 研究定义章节。
 */
export declare function selfEvolveFull(workspace: string, options?: {
    dimensions?: readonly StateDimension[];
    reason?: string;
}): {
    state: StateSyncResult | {
        error: string;
    };
    topic: TopicSyncResult;
    definition: DefinitionSyncResult;
};
//# sourceMappingURL=state-sync.d.ts.map