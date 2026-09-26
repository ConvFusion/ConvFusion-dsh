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

/** 系统基础分类（v2-Stage2 §6 的 taxonomy；叶子与系统技能 1:1，导航与库一致）。 */
const SYSTEM_TAXONOMY: ReadonlyArray<{ group: string; name: string; leaves: ReadonlyArray<[string, string]> }> = [
  {
    /*
     * C00 全局能力：不专属任何研究阶段，作用域是**整项研究**（跨阶段的前置），
     * 所以置首而不是置末（对比 C09 工作评阅：它作用于已有资产，故置末）。
     * 目前只有「研究过程定义」：它规定这套研究怎么推进，也决定进展面板的阶段。
     */
    group: 'global-capabilities',
    name: 'Global Capabilities',
    leaves: [['research-process', 'Research Process']],
  },
  {
    group: 'research-understanding',
    name: 'Research Understanding',
    leaves: [
      ['input-understanding', 'Input Understanding'],
      ['research-intent-assessment', 'Research Intent Assessment'],
      ['research-topic-proposal', 'Research Topic Proposal'],
      ['research-domain-profiling', 'Research Domain Profiling'],
      ['research-foundation-assessment', 'Research Foundation Assessment'],
      ['research-direction-steering', 'Research Direction Steering'],
    ],
  },
  {
    group: 'literature',
    name: 'Literature',
    leaves: [
      ['literature-search', 'Literature Search'],
      ['literature-screening', 'Literature Screening'],
      ['paper-fulltext-download', 'Paper Full-Text Download'],
      ['literature-review', 'Literature Review'],
      ['research-landscape', 'Research Landscape'],
    ],
  },
  {
    group: 'innovation',
    name: 'Innovation',
    leaves: [
      ['research-theme-generation', 'Research Theme Generation'],
      ['innovation-gap-analysis', 'Innovation Gap Analysis'],
      ['idea-novelty-assessment', 'Idea Novelty Assessment'],
      ['hypothesis-formulation', 'Hypothesis Formulation'],
      ['contribution-design', 'Contribution Design'],
    ],
  },
  {
    group: 'research-planning',
    name: 'Research Planning',
    leaves: [
      ['research-strategy-portfolio', 'Research Strategy Portfolio'],
      ['research-method-design', 'Research Method Design'],
      ['experiment-pipeline-design', 'Experiment Pipeline Design'],
      ['plan-risk-assessment', 'Plan Risk Assessment'],
      ['research-risk-assessment', 'Research Risk Assessment'],
    ],
  },
  {
    group: 'resource-estimation',
    name: 'Resource Estimation',
    leaves: [
      ['resource-requirement-estimation', 'Resource Requirement Estimation'],
      ['infrastructure-cost-selection', 'Infrastructure Cost Selection'],
      ['feasibility-cost-and-resource-plan', 'Feasibility, Cost and Resource Plan'],
    ],
  },
  {
    group: 'research-decision',
    name: 'Research Decision',
    leaves: [
      ['research-topic-ranking', 'Research Topic Ranking'],
      ['research-direction', 'Research Direction'],
      ['research-direction-selection', 'Research Direction Selection'],
      ['go-no-go-decision', 'Go / No-Go Decision'],
    ],
  },
  {
    group: 'experiment',
    name: 'Experiment',
    leaves: [
      ['experiment-design', 'Experiment Design'],
      ['simulation-baseline', 'Simulation Baseline'],
      ['dataset-selection', 'Dataset Selection'],
      ['baseline-selection', 'Baseline Selection'],
      ['evaluation-protocol', 'Evaluation Protocol'],
      ['ablation-design', 'Ablation Design'],
      ['reproducible-implementation-spec', 'Reproducible Implementation Spec'],
      ['result-analysis', 'Result Analysis'],
      ['comparative-analysis', 'Comparative Analysis'],
      ['evidence-assessment', 'Evidence Assessment'],
    ],
  },
  {
    group: 'academic-writing',
    name: 'Academic Writing',
    leaves: [
      ['venue-fit-decision', 'Venue Fit Decision'],
      ['paper-architecture', 'Paper Architecture'],
      ['research-narrative', 'Research Narrative'],
      ['section-drafting', 'Section Drafting'],
      ['equation-formalization', 'Equation Formalization'],
      ['visual-evidence-selection', 'Visual Evidence Selection'],
      ['manuscript-revision', 'Manuscript Revision'],
      ['submission-compile-and-format', 'Submission Compile and Format'],
      ['technical-report-writing', 'Technical Report Writing'],
      ['patent-drafting', 'Patent Drafting'],
      ['presentation-design', 'Presentation Design'],
    ],
  },
  {
    /*
     * C09 工作评阅：对**已有的**研究做系统诊断（`ConvFusion-dsh-Skill-Review.md`）。
     *
     * 为什么排在最后而不是插在实验/写作之间：评阅是**横切能力** —— 它作用于某一轮
     * 研究已经产出的资产（state / evidence / claims / paper），不专属某个阶段。真要在
     * 中间插一个，就必须重编 C06–C08，而编号是常量表、被导出与界面引用。
     *
     * 粒度按该文档 §8「不过度拆分」：只做五个，而不是把 problem/literature/novelty/
     * evidence/claim/... 拆成一堆微技能 —— 那些是这些技能**内部的方法维度**。
     */
    group: 'review',
    name: 'Review',
    leaves: [
      // 顺序 = **评阅场合从早到晚**：只有方向 → 有研究状态 → 证据链 → 正文 → 投稿包
      ['research-direction-review', 'Research Direction Review'],
      ['research-quality-review', 'Research Quality Review'],
      ['experimental-evidence-review', 'Experimental Evidence Review'],
      ['paper-claim-review', 'Paper and Claim Review'],
      ['pre-submission-review', 'Pre-submission Review'],
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
