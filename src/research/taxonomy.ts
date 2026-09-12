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
export type SkillOrigin = 'system' | 'user'

/** Category 来源：系统基础分类 / 用户自定义分类。 */
export type CategoryOrigin = SkillOrigin

/**
 * 一个小类（leaf）或大类（group）。
 *
 * 大类与子类都是 Category —— 不引入第二套概念，避免又变成层级化的流程结构。
 */
export interface SkillCategory {
  /** 唯一 id（kebab-case；系统类用 `group/leaf` 形式消歧）。 */
  id: string
  /** 人类可读名。 */
  name: string
  /** 一句话说明该领域包含什么能力（**不描述顺序**）。 */
  description?: string
  /** 父类 id（顶层为 undefined）。 */
  parent?: string
  origin: CategoryOrigin
}

/** 系统基础分类（v2-Stage2 §6 的 taxonomy，第一版不过细）。 */
const SYSTEM_TAXONOMY: ReadonlyArray<{ group: string; name: string; leaves: ReadonlyArray<[string, string]> }> = [
  {
    group: 'research-understanding',
    name: 'Research Understanding',
    leaves: [
      ['topic-understanding', 'Topic Understanding'],
      ['context-analysis', 'Context Analysis'],
      ['problem-definition', 'Problem Definition'],
      ['research-question', 'Research Question'],
    ],
  },
  {
    group: 'literature',
    name: 'Literature',
    leaves: [
      ['literature-search', 'Literature Search'],
      ['literature-screening', 'Literature Screening'],
      ['literature-review', 'Literature Review'],
      ['literature-comparison', 'Literature Comparison'],
      ['research-gap', 'Research Gap'],
      ['research-landscape', 'Research Landscape'],
    ],
  },
  {
    group: 'innovation',
    name: 'Innovation',
    leaves: [
      ['idea-generation', 'Idea Generation'],
      ['innovation-analysis', 'Innovation Analysis'],
      ['novelty-assessment', 'Novelty Assessment'],
      ['hypothesis', 'Hypothesis'],
      ['contribution-design', 'Contribution Design'],
    ],
  },
  {
    group: 'methodology',
    name: 'Methodology',
    leaves: [
      ['method-design', 'Method Design'],
      ['model-design', 'Model Design'],
      ['algorithm-design', 'Algorithm Design'],
      ['system-design', 'System Design'],
      ['theoretical-analysis', 'Theoretical Analysis'],
    ],
  },
  {
    group: 'experiment',
    name: 'Experiment',
    leaves: [
      ['experiment-design', 'Experiment Design'],
      ['dataset-selection', 'Dataset Selection'],
      ['baseline-selection', 'Baseline Selection'],
      ['evaluation', 'Evaluation'],
      ['ablation', 'Ablation'],
      ['reproducibility', 'Reproducibility'],
    ],
  },
  {
    group: 'analysis',
    name: 'Analysis',
    leaves: [
      ['result-analysis', 'Result Analysis'],
      ['error-analysis', 'Error Analysis'],
      ['statistical-analysis', 'Statistical Analysis'],
      ['comparative-analysis', 'Comparative Analysis'],
      ['evidence-assessment', 'Evidence Assessment'],
    ],
  },
  {
    group: 'research-decision',
    name: 'Research Decision',
    leaves: [
      ['research-direction', 'Research Direction'],
      ['method-selection', 'Method Selection'],
      ['experiment-decision', 'Experiment Decision'],
      ['go-no-go', 'Go / No-Go'],
      ['risk-assessment', 'Risk Assessment'],
    ],
  },
  {
    group: 'academic-writing',
    name: 'Academic Writing',
    leaves: [
      ['paper-structure', 'Paper Structure'],
      ['technical-writing', 'Technical Writing'],
      ['argumentation', 'Argumentation'],
      ['revision', 'Revision'],
      ['response-to-reviewers', 'Response to Reviewers'],
      ['final-editing', 'Final Editing'],
    ],
  },
  {
    group: 'research-management',
    name: 'Research Management',
    leaves: [
      ['research-planning', 'Research Planning'],
      ['task-decomposition', 'Task Decomposition'],
      ['resource-planning', 'Resource Planning'],
      ['collaboration', 'Collaboration'],
      ['progress-assessment', 'Progress Assessment'],
    ],
  },
]

/** 展平后的系统分类表（大类 + 子类）。 */
export const SYSTEM_CATEGORIES: readonly SkillCategory[] = (() => {
  const out: SkillCategory[] = []
  for (const g of SYSTEM_TAXONOMY) {
    out.push({ id: g.group, name: g.name, origin: 'system' })
    for (const [leaf, leafName] of g.leaves) {
      out.push({
        id: `${g.group}/${leaf}`,
        name: leafName,
        parent: g.group,
        origin: 'system',
      })
    }
  }
  return out
})()

/** 顶层大类列表（导航第一级）。 */
export function systemGroups(): SkillCategory[] {
  return SYSTEM_CATEGORIES.filter((c) => !c.parent)
}

/**
 * 解析 Category 文本 → 规范 id。
 *
 * 用户手写 frontmatter 时可能写 `Literature`（大类名）或 `literature/research-gap`
 * （完整 id）或 `Research Gap`（子类名）。这里做**宽松归一**：命中即返回规范 id，
 * 否则返回 `undefined`（调用方决定归入 "Uncategorized" 还是拒绝）。
 */
export function normalizeCategoryId(input: string | undefined): string | undefined {
  if (!input) return undefined
  const raw = input.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()

  // 1) 完整 id 直接命中
  const byId = SYSTEM_CATEGORIES.find((c) => c.id === lower)
  if (byId) return byId.id

  // 2) 名称命中（大小写不敏感；先子类后大类，避免 "Literature" 抢走 "Literature Review"）
  const byName =
    SYSTEM_CATEGORIES.find((c) => c.parent && c.name.toLowerCase() === lower) ??
    SYSTEM_CATEGORIES.find((c) => c.name.toLowerCase() === lower)
  if (byName) return byName.id

  // 3) kebab 化的名称命中（"Research Gap" → "research-gap"）
  const kebab = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const byKebab = SYSTEM_CATEGORIES.find((c) => c.id.endsWith(`/${kebab}`) || c.id === kebab)
  if (byKebab) return byKebab.id

  return undefined
}

/** 取 Category 的展示名（未知 id 原样返回，便于显示用户自定义分类）。 */
export function categoryName(id: string | undefined, userCategories: readonly SkillCategory[] = []): string {
  if (!id) return 'Uncategorized'
  const hit = [...SYSTEM_CATEGORIES, ...userCategories].find((c) => c.id === id)
  return hit ? hit.name : id
}

/** 取 Category 的顶层大类 id（用于两级导航）。 */
export function categoryGroup(id: string | undefined): string | undefined {
  if (!id) return undefined
  return id.includes('/') ? id.split('/')[0] : id
}
