/**
 * ConvFusion 2.0 — Workspace 数据规范（对齐 `v2-Workspace.md`）
 *
 * ## 会话工作区 / 研究根目录（两级，`v2-Workspace.md` §2）
 *
 * DSH 会话工作区是**用户的工作区**（放用户自己的论文、数据等）；ConvFusion 产生的
 * 全部数据文件收在会话工作区下的 **`workspace/` 子目录**（研究根目录）里：
 *
 * ```text
 * 会话工作区（用户材料可自由放置）
 * └── workspace/            ← 研究根目录：一个研究根目录 = 一个完整 Research
 *     ├── Research Definition   project.md · research-state.md
 *     ├── Research Inputs       attachments/
 *     ├── Research Assets       plans/ · experiments/ · research/
 *     ├── Research Outputs      papers/ · outputs/
 *     └── Harness Runtime       harness/
 * ```
 *
 * 兼容：早期版本直接用会话工作区当研究根目录（无 `workspace/` 一层），
 * 这类旧布局仍被识别与沿用（见 `workspace.ts` 的 `researchWorkspaceOf`）。
 *
 * ## 三个必须坚持的边界（§16）
 *
 * 1. **Skill 不属于 Workspace** —— Skill Library 与 Output Profiles 是**系统级能力层**
 *    （见 `skills.ts` / `output-profiles.ts`：包内只读资产）。
 * 2. **Plan 属于 Workspace** —— 它是针对**当前这个研究**制定的（`plans/`）。
 * 3. **Output 属于 Workspace** —— 当前研究真正产生的成果（`papers/` + `outputs/`）。
 *
 * ## 本模块的职责
 *
 * 把规范变成**可执行、可校验**的东西：
 *   - {@link WORKSPACE_LAYOUT}：规范目录清单（单一事实来源）；
 *   - {@link ensureWorkspaceLayout}：按需建立目录骨架；
 *   - {@link inspectWorkspace}：只读检查工作区是否符合规范（供测试/诊断）。
 *
 * ⚠️ 本模块**不创建内容文件**（除 `project.md` 由 `project.ts` 负责）：
 * 目录按需产生，未用到的实验/附件目录不该被凭空造出来。
 */
/** 一个目录条目的规范定义。 */
export interface LayoutEntry {
    /** 相对 workspace 的路径。 */
    path: string;
    /** 它属于哪一类数据（§1 的五类）。 */
    category: 'definition' | 'inputs' | 'assets' | 'outputs' | 'runtime';
    /** 是否属于"核心结构"（core = 研究一开始就应存在；optional = 按需产生）。 */
    kind: 'core' | 'optional';
    /** 职责（§3 的表格）。 */
    duty: string;
}
/**
 * Workspace 的规范目录清单（`v2-Workspace.md` §2）。
 *
 * `kind: 'core'` 的条目由 {@link ensureWorkspaceLayout} 建立；
 * `kind: 'optional'` 的条目**按需产生**（例如还没有实验就不该有 `experiments/`）。
 */
export declare const WORKSPACE_LAYOUT: readonly LayoutEntry[];
/** 按类别分组（供文档 / 设置面板展示）。 */
export declare function layoutByCategory(): Record<LayoutEntry['category'], LayoutEntry[]>;
/** 核心目录（研究一开始就应该存在的最小骨架）。 */
export declare function coreDirs(): string[];
/**
 * 建立**核心**目录骨架（幂等）。
 *
 * 刻意**不建立** optional 目录：没有实验就不该有 `experiments/`，
 * 没有附件就不该有 `attachments/` —— 空目录会误导（让人以为"应该往里放东西"）。
 */
export declare function ensureWorkspaceLayout(workspace: string): string[];
/** 按需建立一个 optional 目录（如实验开始时建 `experiments/<name>/`）。 */
export declare function ensureWorkspaceSubdir(workspace: string, relPath: string): string;
/** 实验工作空间的标准子目录（§6）。 */
export declare const EXPERIMENT_SUBDIRS: readonly string[];
/** 建立一个实验的工作空间（§6）。 */
export declare function ensureExperimentLayout(workspace: string, name: string): string[];
/** Paper 目录内的标准子目录（§8 / §9）。 */
export declare const PAPER_SUBDIRS: readonly string[];
/** 建立 Paper 的标准子目录（§8：history/latex/figures 与正文并列）。 */
export declare function ensurePaperLayout(workspace: string, paperId: string): string[];
/** 一个目录条目的实际状态。 */
export interface LayoutStatus extends LayoutEntry {
    present: boolean;
    /** 存在但为空（optional 目录为空是正常的；core 目录为空可能意味着还没写入）。 */
    empty: boolean;
}
/** 工作区检查结果。 */
export interface WorkspaceInspection {
    workspace: string;
    /** 是否是研究工作区（有 `project.md` 或 `research-state.md`）。 */
    isResearch: boolean;
    entries: LayoutStatus[];
    /** 规范里没有、但实际存在的顶层条目（可能是旧的/无关的）。 */
    unexpectedTopLevel: string[];
    /** 实际存在但不在规范里的 `outputs/` 子目录。 */
    unexpectedOutputDirs: string[];
}
/**
 * 只读检查工作区是否符合规范（供诊断 / 测试）。
 *
 * **不修改任何东西**；`unexpectedTopLevel` 只是提示，不代表错误
 * （用户可能在工作区放任何东西）。
 */
export declare function inspectWorkspace(workspace: string): WorkspaceInspection;
//# sourceMappingURL=workspace-layout.d.ts.map