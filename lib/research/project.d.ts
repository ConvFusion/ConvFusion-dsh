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
//# sourceMappingURL=project.d.ts.map