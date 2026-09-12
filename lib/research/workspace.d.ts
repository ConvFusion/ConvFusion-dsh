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
 *   1. **定位**当前研究的 workspace（= 会话工作区下的 **`workspace/` 子目录**；
 *      v2 不引入锚文件，而是用"存在 `project.md` / `research-state.md`"来识别研究项目
 *      —— `v2-Workspace.md` §2）。为什么多一层 `workspace/`：DSH 会话工作区是**用户的
 *      工作区**，用户会先放进去自己检索到的论文、数据集等原始材料（或任何其它文件）
 *      再开始研究；ConvFusion 产生的全部数据文件收进 `workspace/`，两边互不污染。
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
/** 解析**会话工作区**：显式配置优先，否则用会话 cwd（非研究目录也返回，由上层决定渲染）。 */
export declare function resolveWorkspace(cwd: string | undefined | null, configured?: string): string;
/**
 * ConvFusion 全部数据文件所在目录（**相对会话工作区**的名字）。
 *
 * 为什么多这一层：DSH 会话工作区是**用户的工作区** —— 用户会先放进自己检索到的
 * 论文、数据集等原始材料（或其它任何文件）再开始研究。ConvFusion 产生的
 * project.md / research-state.md / plans/ / research/ / papers/ / outputs/ 全部
 * 收进 `workspace/`，用户材料与研究成果互不污染。
 */
export declare const RESEARCH_ROOT_DIR = "workspace";
/**
 * 由**会话工作区**解析**研究根目录**（ConvFusion 数据文件所在目录）。
 *
 * 优先级：
 *   1. `<ws>/workspace` 有研究定义 → **新布局**，用 `<ws>/workspace`；
 *   2. 否则 `<ws>` 本身有研究定义 → **旧布局**（早期版本直接用会话工作区当研究
 *      workspace），为兼容仍用 `<ws>`，旧项目无损延续；
 *   3. 尚无定义 → 返回 `<ws>/workspace`（创建流程会按需建立，新研究一律新布局）。
 *
 * 判据复用 {@link isResearchWorkspace}（存在 `project.md` / `research-state.md`）。
 */
export declare function researchWorkspaceOf(sessionWorkspace: string): string;
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