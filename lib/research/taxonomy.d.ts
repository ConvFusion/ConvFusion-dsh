/**
 * ConvFusion 2.0 — Research Skill Category Taxonomy（Stage 2）
 *
 * ## 最重要的一条边界
 *
 * v2-Stage2 §5 / §6 / §25 反复强调：
 *
 * ```text
 * Category ≠ Workflow        Category ≠ Execution Order        Category ≠ Module
 * ```
 *
 * Category **只回答**"这个 Skill 属于什么研究能力领域"（导航体系），
 * **绝不**表示执行顺序。系统**绝对不能**根据 Category 自动建立固定 Workflow。
 *
 * 因此本文件的类型里刻意**没有** `order` / `stage` / `next` / `dependsOn` 之类字段 ——
 * 一旦加进去，就又把 Module 请回来了。这是 Stage 0 §6.3 的同一条硬约束。
 *
 * ## 用户可扩展
 *
 * §7：Category 不能由系统锁死。System Categories 提供基础导航，
 * 用户可自建 Category（如"我的研究方法 / 论文选题 / 创新判断"）。
 * 两类 Category 用 `origin` 区分，**不混在同一个可变列表里**。
 */
/** 来源：系统提供 / 用户自己的（Category 与 Skill 共用这一对词汇）。 */
export type SkillOrigin = 'system' | 'user';
/** Category 来源：系统基础分类 / 用户自定义分类。 */
export type CategoryOrigin = SkillOrigin;
/**
 * 一个小类（leaf）或大类（group）。
 *
 * 大类与子类都是 Category —— 不引入第二套概念，避免又变成层级化的流程结构。
 */
export interface SkillCategory {
    /** 唯一 id（kebab-case；系统类用 `group/leaf` 形式消歧）。 */
    id: string;
    /** 人类可读名。 */
    name: string;
    /** 一句话说明该领域包含什么能力（**不描述顺序**）。 */
    description?: string;
    /** 父类 id（顶层为 undefined）。 */
    parent?: string;
    origin: CategoryOrigin;
}
/** 展平后的系统分类表（大类 + 子类）。 */
export declare const SYSTEM_CATEGORIES: readonly SkillCategory[];
/** 顶层大类列表（导航第一级）。 */
export declare function systemGroups(): SkillCategory[];
/**
 * 解析 Category 文本 → 规范 id。
 *
 * 用户手写 frontmatter 时可能写 `Literature`（大类名）或 `literature/research-gap`
 * （完整 id）或 `Research Gap`（子类名）。这里做**宽松归一**：命中即返回规范 id，
 * 否则返回 `undefined`（调用方决定归入 "Uncategorized" 还是拒绝）。
 */
export declare function normalizeCategoryId(input: string | undefined): string | undefined;
/** 取 Category 的展示名（未知 id 原样返回，便于显示用户自定义分类）。 */
export declare function categoryName(id: string | undefined, userCategories?: readonly SkillCategory[]): string;
/** 取 Category 的顶层大类 id（用于两级导航）。 */
export declare function categoryGroup(id: string | undefined): string | undefined;
//# sourceMappingURL=taxonomy.d.ts.map