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
/** 研究定义是否存在（即 `project.md`）。 */
export declare function hasProjectDefinition(workspace: string): boolean;
/** 供工具/命令：取研究主题。 */
export declare function projectTopic(workspace: string): string | undefined;
//# sourceMappingURL=project.d.ts.map