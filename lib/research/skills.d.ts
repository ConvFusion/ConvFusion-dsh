/**
 * ConvFusion 2.0 — Skill 定义与解析（Stage 2 建立，架构收敛后重写）
 *
 * ## Skill 是什么
 *
 * > 一种可复用、可解释、可修改、可组合的**研究方法**。
 *
 * **Prompt 是 Skill 的执行表达，不是 Skill 本身** —— 所以 Skill 是一份 Markdown 文档。
 *
 * ## 架构（用户拍板，与初版 Stage 2 不同）
 *
 * ```text
 * 系统 Skill Library = 包内资产 skills/<category>/<skill>.md，**我们维护、只读**
 * 用户定制           = 【设置】-【ConvFusion】-【本地设置】→ 独立文件（拼接覆盖）
 * ```
 *
 * 因此本模块**没有写操作**：
 *   - 系统库文件随发行版提供，运行时不改；
 *   - 用户的个性化不写进库，而是作为**覆盖层**在合成时拼接
 *     （见 `skill-customization.ts`）。
 *
 * 早期版本曾有 `skills/user/`、`skills/derived/`、`forkSkill`、`reviseSkill` 等
 * "workspace 内可写 Skill" 的概念 —— 那与"我们维护 Skill Library、用户只做覆盖"的
 * 设计冲突，已移除。
 *
 * ## 两条边界
 *
 * 1. **Markdown-first**：frontmatter 只是轻量元数据，正文才是语义来源。
 * 2. **不是 DSL**：章节用宽松匹配解析，缺章节不报错。
 */
import type { SkillOrigin } from './taxonomy.js';
/**
 * Skill 来源。
 *
 * 新架构里系统库全是 `system`（由我们维护）；`user`/`derived` 保留在类型里是为了
 * 兼容历史归档与将来的扩展，运行时不再产生。
 */
export type SkillType = SkillOrigin | 'derived';
/** Skill 生命周期状态。 */
export type SkillStatus = 'active' | 'draft' | 'archived';
/**
 * 一个 Skill 的完整内容。
 *
 * `sections` 保存**全部**章节（含我们不认识的），因此不会因为"只认识某几个标题"而丢内容。
 */
export interface SkillDocument {
    /** 稳定 id（文件名去 `.md`）。 */
    id: string;
    /** 展示名（正文 `# Skill: X`，回退 frontmatter `name`，回退 id）。 */
    name: string;
    /** 分类（规范 id，如 `literature/research-gap`）。 */
    category?: string;
    type: SkillType;
    status: SkillStatus;
    version: string;
    /** 正文全部章节。 */
    sections: Array<{
        title: string;
        body: string;
    }>;
    /** 完整正文（不含 frontmatter）。 */
    body: string;
    /** 文件绝对路径。 */
    path: string;
    /** 相对包根的路径（如 `skills/literature/research-gap-analysis.md`）。 */
    relPath: string;
    /** 是否可编辑（系统库恒为 false）。 */
    editable: boolean;
}
/** 系统 Skill Library 的目录名（包内）。 */
export declare const SKILLS_DIR = "skills";
/** `## Purpose` 内容。 */
export declare function skillPurpose(doc: SkillDocument): string;
/** `## When to Use` 内容。 */
export declare function skillWhenToUse(doc: SkillDocument): string;
/** `## Research Method` 内容（方法论主体）。 */
export declare function skillMethod(doc: SkillDocument): string;
/** `## Expected Output` 内容。 */
export declare function skillExpectedOutput(doc: SkillDocument): string;
/** 受限 YAML frontmatter 解析（标量；保持轻量）。 */
export declare function parseSkillFrontmatter(source: string): Record<string, string>;
/** 去掉 frontmatter。 */
export declare function stripSkillFrontmatter(source: string): string;
/** 解析一个 Skill Markdown（正文优先）。 */
export declare function parseSkillDocument(absPath: string, relPath: string, typeDefault?: SkillType): SkillDocument | null;
/** 序列化 Skill（供导出/归档使用；运行时不会写系统库）。 */
export declare function serializeSkillDocument(input: {
    name: string;
    category?: string;
    type?: SkillType;
    status?: SkillStatus;
    version?: string;
    sections: Array<{
        title: string;
        body: string;
    }>;
}): string;
/** 包内系统库根目录（兼容 `src/` 直跑与 `lib/` 构建产物）。 */
export declare function systemSkillRoot(): string;
/**
 * 系统 Skill 的**基线**文档（纯包内资产，不含用户定制）。
 *
 * 用户定制在消费侧拼接（`composeSkillContent`），因此这里永远是"我们发布的样子"。
 */
export declare function listSystemSkills(root?: string): SkillDocument[];
/**
 * 列出全部 Skill。
 *
 * ⚠️ `_workspace` 参数在新架构下**不用于定位 Skill**（Skill 不在 workspace 里）。
 * 保留它是为了不改动既有调用点；正文合成请用 `composeSkillContent`。
 */
export declare function listSkillDocuments(_workspace: string, options?: {
    types?: readonly SkillType[];
}): SkillDocument[];
/** 读一个 Skill（按 id）。 */
export declare function readSkill(_workspace: string, id: string): SkillDocument | undefined;
export interface SkillQuery {
    search?: string;
    category?: string;
    types?: readonly SkillType[];
    status?: readonly SkillStatus[];
    ids?: readonly string[];
}
/** 纯函数过滤（便于测试与复用）。 */
export declare function filterSkills(docs: readonly SkillDocument[], query: SkillQuery): SkillDocument[];
//# sourceMappingURL=skills.d.ts.map