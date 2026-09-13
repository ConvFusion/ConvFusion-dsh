/**
 * 迁移映射表（分段）：research output transformation（Stage 5.1 §15 / Task 4）
 *
 * ⚠️ 这三个 Skill **没有旧提示词来源** —— 旧 ConvFusion 的 Paper 模块只做论文，
 * 没有专利 / 技术报告 / 演讲的提示词。因此它们的 `method` 是**新写的**，
 * `sources` 为空（生成器不会为它们写逐字来源章节）。
 *
 * 它们的依据是 Stage 5.1 的 Profile 约束（`src/research/output-profiles.ts`）：
 * Profile 说明"这种成果长什么样、要满足什么"，Skill 说明"如何做这种转换"。
 */

export const SKILLS = [
  {
    id: 'patent-drafting',
    category: 'academic-writing/technical-writing',
    name: 'Patent Drafting',
    origin: 'stage5.1/output-transformation',
    purpose:
      'Transform a research result into a patent draft: restate it as a technical problem, a technical solution with features, the effects it produces, and embodiments a skilled person could carry out.',
    whenToUse: [
      'A research result is mature enough that its mechanism could be protected.',
      'A paper exists and a patent is being derived from it (or directly from the research state).',
      'You need to decide whether the contribution is a protectable technical solution or only a finding.',
    ],
    method: [
      '1. **Start from the research state, not from the paper text.** A patent is organised around a technical problem and its solution; the paper is organised around a scientific argument. Re-derive the technical content rather than renaming sections.',
      '2. **State the technical problem independently.** Describe the deficiency of the prior art in technical terms (what fails, under what conditions), without the paper\'s framing about gaps or contributions.',
      '3. **Express the solution as technical features.** The solution must be describable as a method or apparatus composed of steps/components. If a claim cannot be written as features, the idea is not yet a patentable solution.',
      '4. **Distinguish patent claims from research claims.** A research claim says something true about the world; a patent claim defines the boundary of an exclusive right. Never copy a research claim into a claim set — restate the feature combination.',
      '5. **State the technical effects as consequences of the solution**, each traceable to a feature that produces it. Effects that come from the evaluation rather than the mechanism are not technical effects.',
      '6. **Describe embodiments in implementable detail.** A skilled person must be able to carry out the solution from the description alone; "as described in the paper" is not an embodiment.',
      '7. **Check the draft is not a renamed paper**: it must contain implementation/embodiment content and claim features that the paper never needed.',
    ],
    reasoning: {
      focus: [
        'Which part of the contribution is a mechanism rather than a measurement.',
        'The broadest feature set that still solves the technical problem.',
        'Whether an alternative implementation would fall outside the claim (scope).',
        'What the prior art already discloses, so the solution is delimited against it.',
      ],
      avoid: [
        'Reusing paper headings as patent sections — it produces a draft that cannot be examined.',
        'Copying research claims into patent claims; they limit no technical feature.',
        'Claiming effects that were measured rather than produced by the mechanism.',
        'Omitting embodiments; a draft without them is not enabling.',
      ],
    },
    evidenceRequirements:
      'Each technical effect stated should be traceable to evidence that the mechanism produces it. The prior-art statements should be traceable to literature evidence. Record which research claims and evidence the draft draws on, so the source research stays answerable.',
    expectedOutput: [
      'technical field and the technical problem of the prior art',
      'the technical solution stated as features (method/apparatus)',
      'technical effects, each tied to the feature producing it',
      'embodiments with implementable detail',
      'a numbered claim set expressed as feature combinations (not research claims)',
      'an abstract',
    ],
    sources: [],
  },
  {
    id: 'technical-report-writing',
    category: 'academic-writing/technical-writing',
    name: 'Technical Report Writing',
    origin: 'stage5.1/output-transformation',
    purpose:
      'Document a research result so a colleague can reproduce or build on it: what was done, how, what was found, what it does not cover, and how to rerun it.',
    whenToUse: [
      'An engineering or internal audience must act on the result rather than cite it.',
      'A result needs to be recorded before or instead of a paper (industry setting, project deliverable).',
      'Reproduction details exist but are scattered across logs, configs and plans.',
    ],
    method: [
      '1. **Lead with what the reader must do with it.** State scope first: what question this report answers and what is deliberately out of scope.',
      '2. **Record operational detail, not argument.** Exact versions, configurations, commands, paths and hardware. A report is judged by whether someone else can rerun it.',
      '3. **Report results with their setting attached.** Every number carries dataset, baseline, metric and seed policy; an unattached number is unusable.',
      '4. **State limitations explicitly.** What was not tested, which conditions were assumed, where the result is known to break.',
      '5. **Write reproduction instructions as steps someone else can follow**, referencing the actual artefacts (result files, logs) rather than describing them.',
      '6. **Do not claim novelty or priority.** A technical report documents work; establishing priority belongs to a paper. Remove "first to" / "state of the art" phrasing.',
    ],
    reasoning: {
      focus: [
        'What the reader will try to do next, and what they would need to know.',
        'The gap between what the logs contain and what a reader needs.',
        'Where the result is sensitive to a choice that is easy to get wrong.',
        'Which artefacts must be preserved for the report to stay verifiable.',
      ],
      avoid: [
        'Turning the report into a paper: no related-work argument, no contribution claims.',
        'Reporting only the runs that worked.',
        'Describing the pipeline in prose when a command or config listing would be reproducible.',
        'Summarising away the exact numbers the reader needs.',
      ],
    },
    evidenceRequirements:
      'Each reported result should reference the evidence item and the raw artefact it came from. Reproduction instructions must name real files and versions, not describe them abstractly.',
    expectedOutput: [
      'summary and scope (including what is out of scope)',
      'approach and implementation details (versions, configs, environment)',
      'results with setting attached and artefacts referenced',
      'explicit limitations and assumptions',
      'reproduction instructions a colleague can follow',
    ],
    sources: [],
  },
  {
    id: 'presentation-design',
    category: 'academic-writing/technical-writing',
    name: 'Research Presentation Design',
    origin: 'stage5.1/output-transformation',
    purpose:
      'Turn a research result into a talk that carries one argument: what problem, why prior answers fail, what was done, what was found, and what it means.',
    whenToUse: [
      'A result must be presented live (conference, group meeting, review).',
      'An existing paper needs to become a talk for audiences with different backgrounds.',
      'A result is being questioned and you need to walk an audience through the evidence.',
    ],
    method: [
      '1. **Fix the single argument first.** A talk that tries to convey the whole paper conveys nothing. Decide the one thing the audience should remember, then cut everything that does not serve it.',
      '2. **Order the narrative as problem → why existing answers fail → key insight → approach → evidence → what it means.** This is an argument order, not a summary of the paper\'s section order.',
      '3. **One idea per slide.** Text on a slide competes with the speaker; keep the slide to the claim plus the support it needs.',
      '4. **Attach the setting to every number shown.** Slides get remembered without their caveats, so dataset, baseline and metric must be visible on the slide itself.',
      '5. **State limitations in the talk**, in their own slide. It makes the rest credible and prevents the audience from drawing a stronger conclusion than the evidence supports.',
      '6. **Prepare the backup slides from the questions you expect**: the ablation, the failure cases, the alternative baseline. Anticipating the challenge is part of the design.',
    ],
    reasoning: {
      focus: [
        'What the audience already believes, and what must be shifted.',
        'Which single result is most convincing, and what setup it needs to be understood.',
        'Where the audience is likely to disbelieve, and which slide answers it.',
        'What can be removed without weakening the argument.',
      ],
      avoid: [
        'Reproducing the paper\'s structure slide by slide.',
        'Showing numbers without their setting.',
        'Unbounded claims in headlines — the caveat is never remembered with the claim.',
        'Dense slides that the speaker then reads aloud.',
      ],
    },
    evidenceRequirements:
      'Numbers shown must be traceable to evidence items; cite the evidence id on the slide or in the notes. Any comparison shown must state its setting on the same slide.',
    expectedOutput: [
      'the single argument of the talk, stated in one sentence',
      'a slide outline following problem → gap → insight → approach → evidence → implications',
      'per-slide content: the claim, its support, and the setting for any number',
      'a limitations slide',
      'backup slides for anticipated questions',
    ],
    sources: [],
  },
]

export default { SKILLS }
