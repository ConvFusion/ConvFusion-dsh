/**
 * ConvFusion 2.0 — `project.md`：研究定义（`v2-Workspace.md` §3）
 *
 * ## 它和 `research-state.md` 的分工
 *
 * ```text
 * project.md         定义研究**是什么**     ← 目标、问题、范围（相对稳定）
 * research-state.md  描述研究**到了哪一步** ← 知道什么、相信什么、缺什么（持续变化）
 * ```
 *
 * 二者共同构成 Workspace 的 **Research Definition** 层（§1），放在工作区根目录。
 *
 * ## 不存在第二份定义
 *
 * v1 用 `research.json` 存 `work_id` 等机器可读字段。v2 **推倒**这条线：
 * `v2-Workspace.md` §2 的最终目录结构里没有 `research.json`，因为
 * **workspace 路径本身就是研究身份**，不需要额外锚文件。所以研究定义只有 `project.md` 一份。
 */
import type { ResearchProject } from './data.js';
/** `project.md` 的推荐章节（**弱结构**：缺章节不报错）。 */
export declare const PROJECT_SECTIONS: readonly string[];
/** `project.md` 的绝对路径。 */
export declare function projectPath(workspace: string): string;
/** 从 `project.md` 解析研究定义；不存在/损坏 → null。 */
export declare function loadProjectFile(workspace: string): ResearchProject | null;
/** 序列化 `project.md`（研究定义）。 */
export declare function serializeProject(input: {
    topic: string;
    initialTopic?: string;
    domain?: string;
    goal?: string;
    questions?: readonly string[];
    scope?: string;
    createdAt?: string;
    updatedAt?: string;
}): string;
/**
 * 写入研究定义（幂等）。
 *
 * @returns 实际写入的字段
 */
export declare function saveProjectFile(workspace: string, input: {
    topic: string;
    domain?: string;
    goal?: string;
    questions?: readonly string[];
}): ResearchProject;
/** 主题变更记录。 */
export interface TopicChange {
    /**
     * 改的是哪个字段。缺省 = `topic`（历史记录里旧条目没有这个键，读作 topic）。
     */
    field?: 'topic' | 'statement' | 'questions' | 'scope' | 'domain' | 'motivation';
    from: string;
    to: string;
    /** ISO 8601。 */
    at: string;
    /** 为什么主题演进（依据哪个裁定 / 发现）。 */
    reason?: string;
    /** 新主题所依据的决策 / 证据 id（如 `D001`）。 */
    evidence?: string[];
    by: 'agent' | 'user';
}
/** 主题演进历史（与 `project.md` 同层的结构化资产，放 `research/` 下）。 */
export declare const TOPIC_HISTORY_FILE = "research/topic-history.json";
/** 读取主题演进历史；缺失 / 损坏 → 空列表。 */
export declare function listTopicChanges(workspace: string): TopicChange[];
export type TopicUpdateResult = {
    changed: true;
    previous: string;
    current: string;
    initial: string;
} | {
    changed: false;
    previous: string;
    current: string;
} | {
    changed: false;
    error: string;
};
/**
 * 把项目主题更新为最后采纳的主题（**外科手术式**，只动 frontmatter 指定行）。
 *
 * - 主题相同 → 幂等 no-op；
 * - 首次更新时（旧项目没有 `initial_topic`）把**当前**主题固化为初始输入；
 * - 变更追加到 `research/topic-history.json`。
 */
export declare function updateProjectTopic(workspace: string, input: {
    topic: string;
    reason?: string;
    evidence?: readonly string[];
    by?: 'agent' | 'user';
}): TopicUpdateResult;
/** 研究定义是否存在（即 `project.md`）。 */
export declare function hasProjectDefinition(workspace: string): boolean;
/** 供工具/命令：取研究主题。 */
export declare function projectTopic(workspace: string): string | undefined;
/**
 * 读一个 `## 章节` 的正文（去掉注释；章节不存在 → null）。
 *
 * ⚠️ `Research Statement` 的"上一版"**必须**这样读：`loadProjectFile` 的 `topic` 优先取
 * frontmatter，主题演进后它与正文那段就不一致了 —— 拿 `topic` 当 statement 的现值，
 * 会永远判成"没变化"，正文于是永远停在初始输入（这个 bug 已经修过一次）。
 */
export declare function readProjectSection(workspace: string, section: string): string | null;
/** 一个章节的正文是否还是"空占位"（没有人类内容）。 */
export declare function isPlaceholderSection(workspace: string, section: string): boolean;
export type DefinitionField = Exclude<NonNullable<TopicChange['field']>, 'topic'>;
export type DefinitionUpdateResult = {
    changed: true;
    field: DefinitionField;
    previous: string;
    current: string;
} | {
    changed: false;
    field: DefinitionField;
    current: string;
} | {
    changed: false;
    field: DefinitionField;
    error: string;
};
/**
 * 更新研究定义的一个章节（外科手术式，只动那一段）。
 *
 * @param input.field `statement` / `questions` / `scope` / `domain` / `motivation`
 * @param input.force 章节里已有手写内容时是否仍覆盖（默认 false = 只填占位）
 */
export declare function updateProjectDefinition(workspace: string, input: {
    field: DefinitionField;
    value: string | readonly string[];
    reason?: string;
    force?: boolean;
}): DefinitionUpdateResult;
//# sourceMappingURL=project.d.ts.map