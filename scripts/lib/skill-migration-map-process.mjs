/**
 * 迁移映射表（分段）：研究过程定义（v2 原生，**没有旧提示词来源**）
 *
 * ## 为什么它是一个 Skill
 *
 * v2 推倒了「8 个模块按序执行」的流水线，但**基本科研过程仍然存在**：不先弄清问题就查文献、
 * 不先有假设就设计实验，得到的东西不可解释。用户明确要求：**过程本身也要是一个 Skill**，
 * 这样它可以像别的能力一样被【设置】-【ConvFusion】-【本地设置】定制 —— 用户能规定
 * 自己的研究进展过程（不同学科的过程确实不同）。
 *
 * ## 机器可读的那一段
 *
 * `method` 里有一个 ```text 围栏块，每行一个阶段：
 *
 * ```text
 * stage: <id> | <显示名> | <能力类别> | <判定信号> | <该阶段要产出什么>
 * ```
 *
 * 判定信号取自固定词表（代码里实现），因此**用户能改过程、但改不了判定逻辑** ——
 * 否则一个笔误就会让"当前阶段"永远判不出来。词表：
 *
 * ```text
 * problem-defined      有研究问题且已定领域
 * literature-evidence  存在 source_kind=literature 的证据
 * claims               存在主张
 * method-plan          存在方法相关的 Plan
 * experiments          存在 experiments/ 目录
 * settled-evidence     存在 supported/verified 证据
 * decisions            存在决策记录
 * manuscript           存在论文正文
 * ```
 *
 * 信号留空或写错 → 该阶段**不参与"当前阶段"判定**（不会造成假的缺口），但仍会展示。
 *
 * 解析规则：取 `Research Method` 里**第一个**含 `stage:` 行的围栏块。
 * 因为用户定制在合成时**排在原文之前**，所以"取第一个"天然让**用户的定义优先**。
 */

export const CATEGORY = 'research-management'

export const SKILLS = [
  {
    id: 'research-process',
    // taxonomy 里已有的叶子：这个能力做的正是「进展评估」
    category: 'research-management/progress-assessment',
    name: 'Research Process',
    origin: 'v2/native-process',
    purpose:
      'Define the stages a research project passes through, and what counts as evidence that a stage has actually landed — so capability selection and progress reporting reflect a real research process rather than a fixed pipeline.',
    whenToUse: [
      'Deciding which capabilities a research project currently needs most.',
      'Reporting what a conversation changed about the research.',
      'Adapting the process to a discipline whose order genuinely differs from the default.',
    ],
    method: [
      'The stages below are a **default**, not a pipeline: they describe what a research project must eventually produce, not the order in which it must be produced. Real work moves back and forth between them, and nothing here blocks or schedules anything.',
      'Each stage is judged by **artifacts on disk**, never by conversation content: a stage has landed only when the artifact it produces actually exists.',
      'Edit the block below to define your own process. The first block containing `stage:` lines wins, and your customisation is composed **before** the default text — so your definition takes precedence without any extra setting.',
      'Format: `stage: <id> | <display name> | <capability category> | <signal> | <what this stage produces>`. Signals come from a fixed vocabulary (see the header of this skill file in the repository); an empty or unknown signal means the stage is displayed but does not count towards the current-stage decision.',
      '',
      '```text',
      'stage: problem | 理解问题 | research-understanding | problem-defined | 可证伪的研究问题与范围（project.md）',
      'stage: literature | 文献 | literature | literature-evidence | 实际检索到的文献证据（research/evidence/）',
      'stage: innovation | 创新与假设 | innovation | claims | 可检验的假设与主张（research/claims/）',
      'stage: method | 方法 | methodology | method-plan | 可被第三方实现的方法设计',
      'stage: experiment | 实验 | experiment | experiments | 实验产物（experiments/<name>/results/）',
      'stage: analysis | 分析 | analysis | settled-evidence | 经确认的结果证据（Evidence 状态 supported/verified）',
      'stage: decision | 决策 | research-decision | decisions | 已记录理由的研究决策（research/decisions/）',
      'stage: writing | 写作 | academic-writing | manuscript | 论文正文（papers/<id>/paper.md）',
      '```',
      '',
      'A project that has landed every stage is not "finished" — research continues by evolving the same artifacts. The absence of a missing stage is not the absence of work.',
    ],
    reasoning: {
      focus: [
        'Whether the artifact a stage produces actually exists on disk.',
        'Which stage is the first one without its artifact — that is the current gap.',
        'Whether a discipline’s process really differs, or the default order is merely unfamiliar.',
      ],
      avoid: [
        'Treating the stage list as a schedule: nothing here may block, gate or order work.',
        'Inferring progress from conversation content — only artifacts count.',
        'Adding a stage whose signal is not in the vocabulary and expecting it to be judged.',
        'Reading "no missing stage" as "the research is done".',
      ],
    },
    evidenceRequirements:
      'Every stage judgement must be checkable against the workspace: it names the artifact that would satisfy it. A stage is never marked landed on the strength of a claim in conversation.',
    expectedOutput: [
      'an ordered list of stages, each naming the capability category it draws on',
      'for each stage, the artifact that would prove it has landed',
      'the current stage (the first stage without its artifact), or an explicit statement that every stage has landed',
      'a note that the list describes assets, not a procedure to follow',
    ],
    sources: [],
  },
]

export default { CATEGORY, SKILLS }
