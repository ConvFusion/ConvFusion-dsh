/**
 * ConvFusion 2.0 — 研究方法导出（`/research 导出研究方法`）
 *
 * ## 它做什么
 *
 * 把**全部研究方法（技能）及其提示词**拼成一个 Markdown 文件，按 `CxxPyy` 编号排序：
 *
 * ```text
 * ## C02 · 文献（Literature）
 *
 * ### C02P01 · 文献 · Literature Search
 *
 * #### Purpose
 * …
 * ```
 *
 * ## 三个用途（设计目标）
 *
 * 1. **查阅 / 归档**：一个文件看完全部方法，且顺序符合研究进程（不是字母序）。
 * 2. **分享给他人**：专家可以照着这个格式写自己的方法集。
 * 3. **将来按编号合并（导入）**：`### CxxPyy` 是**唯一锚点**，合并时按编号对齐，
 *    因此编号必须稳定 —— 这也是 {@link skill-codes.ts} 把它当常量表维护的原因。
 *
 * ## 导出的是什么内容
 *
 * - 默认：**6 个可定制章节**（Purpose / When to Use / Research Method / Reasoning Guidance /
 *   Evidence Requirements / Expected Output）的**生效版本** —— 用户定制过的部分会被标出来。
 *   这几节正是用户会编辑、会分享的部分，体量也适中（约 150–200 KB）。
 * - `full: true`：**完整生效正文**，含 `## Source Prompts`（逐字旧提示词，历史智能）。
 *   全部技能合计约 526 KB，所以默认不导。
 */
import { type SkillCustomizationStore } from './skill-customization.js';
/** 导出文件的默认落点（相对研究根）。 */
export declare const METHODS_EXPORT_FILE = "research/methods-export.md";
/** 导出选项。 */
export interface MethodsExportOptions {
    /** 是否导出完整正文（含 Source Prompts）；缺省只导 6 个可定制章节。 */
    full?: boolean;
    /** 用户定制来源（生效版本 = 基线 + 定制）。 */
    store?: SkillCustomizationStore;
    /** 导出时间（测试可注入，缺省当前时刻）。 */
    now?: Date;
}
/** 导出结果。 */
export interface MethodsExportResult {
    markdown: string;
    skillCount: number;
    categoryCount: number;
    /** 字符数。 */
    bytes: number;
    /** 是否含完整正文。 */
    full: boolean;
}
/**
 * 生成导出 Markdown（纯函数：只读技能库与定制，不写盘）。
 */
export declare function buildMethodsExport(opts?: MethodsExportOptions): MethodsExportResult;
/** 写导出文件（默认 `research/methods-export.md`）。 */
export declare function writeMethodsExport(workspace: string, opts?: MethodsExportOptions & {
    path?: string;
}): MethodsExportResult & {
    path: string;
};
/** 类别编号表（供设置页/命令输出展示）。 */
export declare function categoryCodeTable(): Array<{
    code: string;
    label: string;
    labelEn: string;
}>;
//# sourceMappingURL=methods-export.d.ts.map