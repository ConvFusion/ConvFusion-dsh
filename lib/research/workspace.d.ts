/**
 * ConvFusion 2.0 — Research Workspace 布局与只读读取（Stage 1）
 *
 * ## 为什么有这一层
 *
 * v2-Stage1 §16 要求 **Harness Session 与 Research Project 可分离**：
 *
 * ```text
 * One Research Project → Many Harness Sessions → Many Turns → Many Steps
 * ```
 *
 * 所以"研究项目在哪"不能等于"当前会话在哪"。本文件负责回答这个问题：
 *
 *   1. **定位**当前研究的 workspace（默认 = 会话 cwd；v2 不引入锚文件，
 *      而是用"存在 `project.md` / `research-state.md`"来识别研究项目 —— `v2-Workspace.md` §2）；
 *   2. **读取**研究数据（只读；Stage 1 不写任何研究数据文件）。
 *
 * ## 与旧实现的关键差异
 *
 * 旧实现在 `<cwd>/.research.json` 写入 `work_id` 锚文件、并按 `stepN<Module>.json`
 * 组织产物。v2 **推倒**这条线（v2-Stage0 §6.3）：
 *
 *   - 没有 `work_id` 概念，workspace 路径本身就是研究身份；
 *   - 没有 `stepN*.json`，进展由 Research State / Plan 生命周期表达；
 *   - 不写锚文件 —— 只读探测。
 */
export { loadProjectFile as loadProject } from './project.js';
/** Plan 目录（相对 workspace；v2-Workspace.md §5）。 */
export declare const PLANS_DIR = "plans";
/**
 * 取 Markdown 的**第一个**一级标题（frontmatter 之后，跳过代码围栏）。
 *
 * 用共享的围栏感知解析器：论文正文里 `#` 常是 LaTeX 注释，绝不能当标题。
 */
export declare function firstHeading(source: string): string | null;
/** 去掉 frontmatter 的正文。 */
export declare function stripFrontmatter(source: string): string;
/** 解析 Markdown 顶部的受限 YAML frontmatter（标量键值，不做嵌套）。 */
export declare function parseFrontmatter(source: string): Record<string, string>;
/**
 * 该目录是否是一个 ConvFusion 研究项目（只读探测，绝不创建文件）。
 *
 * 判据（`v2-Workspace.md` §1/§2）：Research Definition 存在，即
 * **`project.md`** 或 **`research-state.md`**。
 *
 * 为什么不用"目录存在"当判据：空骨架不构成研究项目；用户的工作区里也可能碰巧有
 * `plans/` 这类目录。用定义文件判定，语义明确且不会误触发研究上下文注入。
 */
export declare function isResearchWorkspace(dir: string): boolean;
/** 解析研究 workspace：显式配置优先，否则用会话 cwd（非研究目录也返回，由上层决定渲染）。 */
export declare function resolveWorkspace(cwd: string | undefined | null, configured?: string): string;
/**
 * Paper 摘要：标题 + 正文节选（`papers/<id>/paper.md`，`v2-Workspace.md` §8）。
 *
 * 只读的**轻量**读取：完整 Paper 语义由 Stage 5 的 `paper.ts` 负责。
 */
export declare function loadPaper(workspace: string, excerptChars?: number, paperId?: string): {
    title: string | null;
    excerpt: string | null;
};
//# sourceMappingURL=workspace.d.ts.map