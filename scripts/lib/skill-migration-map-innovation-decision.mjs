/**
 * 迁移映射表（分段）：innovation-decision
 *
 * 由模块负责人填写；`gen-skill-library.mjs` 会把所有分段合并后生成 Skill Library。
 * 字段说明见 `skill-migration-map.mjs` 顶部。
 *
 * 覆盖旧模块：conception（Innovation）、decision（Research Decision）、
 * resource（成本/资源评估，归入 Research Decision）。
 *
 * 注意：旧模块中以函数内 f-string 形式存在的提示词（conception_dialogue_prompt.py、
 * decision_dialogue_prompt.py、decision_module_prompt.py、resource_dialogue_prompt.py、
 * resource_module_prompt.py）没有模块级三引号常量，生成器无法逐字提取，因此不作为
 * `sources` 列出 —— 它们的语义体现在下面的 `method` 里。
 */

export const SKILLS = [
  /* ══════════════════════════════════════════════════════════════════
   * Innovation
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: 'innovation-gap-analysis',
    category: 'innovation/innovation-gap-analysis',
    name: 'Innovation Gap Analysis',
    origin: 'conception/understanding, conception/gap-discovery',
    purpose:
      'Turn a literature landscape into the specific unresolved problems, methodological limitations and contradictions that a contribution could target — and separate structural gaps from areas that are merely unfamiliar to you.',
    whenToUse: [
      'A literature review or landscape exists and you need to know what is still open in it.',
      'You are about to generate ideas and want them aimed at real gaps rather than at topics.',
      'A gap is being claimed in a proposal and must survive the question "has this already been done?".',
    ],
    method: [
      '1. **Re-derive the gap from the landscape, not from one paper.** A gap is a statement about the field, so it must rest on the multi-work picture (settled vs contested results, method families). If the search has not reached saturation, say so before claiming anything is unresolved.',
      '2. **Classify each candidate gap by type.** An untested assumption; a contradiction between works; a limitation the authors themselves admit; a capability that exists but not under this setting; a problem no method addresses at all. The type determines what evidence would close the gap.',
      '3. **Test each gap for resolution before recording it.** Search recent literature specifically for work that already addresses it. A gap that has been closed and merely not read is not a gap — record the closest existing work next to every claimed gap.',
      '4. **Separate structural from incidental gaps.** A gap that persists across many groups and settings is structural; one that exists because a single paper used a small dataset is incidental. Structural gaps support a contribution; incidental ones support at most a paper.',
      '5. **Name the mechanism that produces the gap.** "No method handles X" is a description; "existing methods assume Y, which fails when X" is a mechanism, and it predicts what a solution must change. Prefer mechanistic gap statements.',
      '6. **Rank by consequence, not by ease of filling.** For each gap state what becomes possible if it is closed and which existing result would be overturned. A gap that changes nothing measurable is not worth a project.',
      '7. **Record contradiction pairs explicitly.** When two works disagree, keep both citations and state the condition under which each could be right — that condition is frequently the research question.',
    ],
    evidenceRequirements:
      'Every gap must cite the works that define the boundary of current capability plus the closest work that approaches it. Contradiction claims must cite both sides. The search coverage that licenses the word "unresolved" must be recorded, and anything the search could not rule out must be flagged as such.',
    expectedOutput: [
      'the gap list with each gap classified by type and mechanism',
      'closest existing work per gap, with the exact difference',
      'contradiction pairs with the condition under which each side holds',
      'a consequence-based ranking of the gaps',
      'an explicit statement of what the search could not exclude',
    ],
    prerequisites: [
      "literature-evidence | 缺口是文献图景上的判断，需先有文献证据",
    ],
    sources: [
      { file: 'modules/conception/prompts/understanding_prompt.py' },
      { file: 'modules/conception/prompts/gap_discovery_prompt.py' },
    ],
  },
  {
    id: 'research-theme-generation',
    category: 'innovation/research-theme-generation',
    name: 'Research Theme Generation',
    origin: 'conception/idea-generation',
    purpose:
      'Turn a research topic and a ranked set of gaps into candidate research themes — each stated at the level of a precise research title (most often the paper title) that attacks a named gap through a stated mechanism, instead of several rewordings of one theme.',
    whenToUse: [
      'A research topic exists and the literature has been reviewed into gaps, and you need candidate themes to commit to.',
      'An existing theme list looks broad but every entry shares the same mechanism.',
      'You need cross-domain candidate themes and want their validity conditions made explicit.',
    ],
    method: [
      '1. **Fix the generation target before generating.** For each gap write the one-sentence change in capability the theme must produce. A theme that cannot state this is a restatement of existing work, however appealing it sounds.',
      '2. **Generate across mechanisms, not within one.** For each gap, produce candidates from at least three different mechanism families — change the representation, change the training signal, change the inference procedure, change the evaluation setting. Mechanism diversity is what makes the later theme decision meaningful.',
      '3. **Force cross-domain transfer to declare itself.** For at least one candidate per gap, name the source field and the imported mechanism, then state what must be re-derived for the import to be valid. Unexamined analogy is the most common source of fake novelty.',
      '4. **Check the closest work while writing the theme, not after.** If you cannot name what differs from the nearest existing method and why that difference should matter, drop the candidate rather than keeping it with vague novelty language.',
      '5. **State each theme at title level, with its falsifiable claim.** A research theme is a strict selection, normally usable as the paper title: write one sentence naming the problem, the intervention and the comparison. Then write the observation that would show it does not work — a theme whose claim cannot fail is a programme of work, not a research theme.',
      '6. **Keep the theme separate from its implementation.** Record mechanism, claim and title only. Architecture, dataset and schedule belong to planning, and committing to them now silently deletes alternatives.',
      '7. **Stop at coverage, not at a count.** Stop when every selected gap has at least one candidate from each plausible mechanism family; report the gaps that produced nothing and why, rather than padding the list.',
    ],
    evidenceRequirements:
      'Each candidate theme must reference the gap it addresses and the closest work it must be distinguished from. Any cross-domain import must name its source and what was re-derived. No theme may be justified by trend or popularity alone.',
    expectedOutput: [
      'candidate research themes, each with its gap, mechanism family and core claim',
      'a title-level statement per theme (usable as the paper title), together with its falsification condition',
      'the closest-work comparison that distinguishes each theme',
      'cross-domain imports with their validity conditions',
      'gaps that yielded no viable theme, with the reason',
    ],
    sources: [
      { file: 'modules/conception/prompts/idea_generation_prompt.py' },
      { file: 'modules/conception/prompts/gap_discovery_prompt.py' },
    ],
  },
  {
    id: 'idea-novelty-assessment',
    category: 'innovation/idea-novelty-assessment',
    name: 'Idea Novelty Assessment',
    origin: 'conception/idea-evaluation, decision/novelty-evaluation',
    purpose:
      'Judge how much of an idea is actually new by locating each claim-bearing part of it against the closest prior work, rather than scoring novelty from the proposal wording.',
    whenToUse: [
      'An idea is a candidate for commitment and its novelty must be defended.',
      'You suspect prior art exists but cannot tell which part of the idea it touches.',
      'A reviewer or collaborator claims the idea is a known technique under a new name.',
    ],
    method: [
      '1. **Never assess novelty from the proposal text alone.** Retrieve the nearest works first. Novelty is a relation between the idea and the literature, not a property of the write-up.',
      '2. **Decompose the idea into claim-bearing parts** — problem formulation, mechanism, training or evaluation procedure, and setting. Attribute each part to prior work or to the proposal. Most ideas are novel in one part and derivative in the rest; say which part is which.',
      '3. **Name the closest work per part and the exact difference.** A difference counts as a novelty claim only if you can state what it changes measurably — accuracy under a regime, cost, sample efficiency, scope of applicability.',
      '4. **Classify the novelty type:** new problem, new mechanism, new combination, new setting or regime, or new evidence about an existing method. For combination novelty, argue non-triviality: why the parts do not compose without new work.',
      '5. **Run the obvious-extension test.** Ask whether a competent researcher who had read the closest work would produce this as the next routine step. If yes, the novelty is incremental, and it is better to say so than to inflate it.',
      '6. **Compare against the current state of the art, not the field entry point.** Reviewers compare with the strongest recent result; comparing with an old baseline manufactures novelty that will not survive review.',
      '7. **Report novelty as a claim with its support**, including the prior art that could not be excluded because of search limits. Absence of evidence is not evidence of novelty.',
    ],
    evidenceRequirements:
      'Every differentiating claim must cite the specific work it differs from and the location of the relevant method or result in it. Unresolved prior art must be flagged rather than omitted. No novelty claim may rest on the result of a single search.',
    expectedOutput: [
      'per-part attribution of the idea to prior work or to the proposal',
      'the closest work per part with the exact measurable difference',
      'novelty type, including a non-triviality argument for combinations',
      'an incremental-versus-structural judgement with its reasoning',
      'prior art that could not be ruled out',
    ],
    prerequisites: [
      "literature-evidence | 评新颖性要对照最近的前人工作",
    ],
    sources: [
      { file: 'modules/decision/prompts/novelty_evaluator.py' },
      { file: 'modules/conception/prompts/idea_evaluation_prompt.py' },
      { file: 'modules/conception/prompts/innovation_state_synthesis_prompt.py' },
    ],
  },
  {
    id: 'hypothesis-formulation',
    category: 'innovation/hypothesis-formulation',
    name: 'Hypothesis Formulation',
    origin: 'conception/structuring, conception/innovation-state-synthesis',
    purpose:
      'Turn a selected idea into a hypothesis precise enough to be wrong: named variables, a comparison, a predicted effect worth caring about, and the conditions under which it holds.',
    whenToUse: [
      'A direction has been chosen and the experiment must be made testable.',
      'An aim is written as a goal ("study X", "improve Y") rather than a claim.',
      'An experiment is planned but no result could count as evidence against it.',
    ],
    method: [
      '1. **Write the hypothesis as a directional statement.** "Under condition Z, changing X raises Y relative to comparison C" — not "study X" and not "improve Y". A hypothesis with no direction cannot be wrong in an informative way.',
      '2. **Name the independent variable, the dependent measure and the comparison.** If any of the three is missing, the hypothesis cannot be tested as written, and the missing element is the real work item.',
      '3. **State the effect size that would matter.** "Better" without a magnitude cannot be separated from noise after the experiment is run; name the smallest difference that would change a decision.',
      '4. **State the boundary conditions.** Regimes, datasets, scales, hardware. The hypothesis should predict where the effect weakens or reverses; a hypothesis that must hold everywhere is untestable.',
      '5. **Split conjunctions.** A hypothesis containing "and" usually bundles two claims, so a partial failure becomes uninterpretable. Split it into separately checkable claims.',
      '6. **Make it refutable by one experiment.** Name the observation that would falsify it and verify that the planned measurement could actually produce that observation.',
      '7. **Rank the hypothesis against its alternatives.** Include the null and the trivial explanation — the effect comes from extra capacity, compute or tuning rather than from the mechanism. The experiment must be able to separate the mechanism from the confound.',
    ],
    evidenceRequirements:
      'The hypothesis must cite the gap and the closest-work analysis that motivate it. Boundary conditions must be justified from prior evidence, not asserted. The refutation test must be concrete enough that another researcher could run it.',
    expectedOutput: [
      'hypotheses written as directional statements',
      'variables, comparison and the effect size that matters',
      'boundary conditions derived from prior evidence',
      'the concrete refutation test',
      'competing trivial explanations and how the experiment separates them',
    ],
    prerequisites: [
      "literature-evidence | 假设立在文献证据之上，否则无法判断它是否已被回答",
    ],
    sources: [
      { file: 'modules/conception/prompts/structuring_prompt.py' },
      { file: 'modules/conception/prompts/innovation_state_synthesis_prompt.py' },
    ],
  },
  {
    id: 'contribution-design',
    category: 'innovation/contribution-design',
    name: 'Contribution Design',
    origin: 'conception/structuring, decision/impact-evaluation',
    purpose:
      'State what the field gains if the work succeeds, and design the evidence package that demonstrates each claim instead of merely asserting it.',
    whenToUse: [
      'An idea and its hypothesis are fixed and the claims must be made defensible.',
      'A proposal claims a contribution that no planned experiment would actually demonstrate.',
      'You need to choose baselines and controls that make the result interpretable.',
    ],
    method: [
      '1. **Name the contribution type explicitly.** New mechanism, new evidence or understanding, new benchmark or dataset, new capability, or a negative result that changes practice. Each type demands a different demonstration.',
      '2. **Write each contribution as a claim the field can reuse**, not as "we propose X". If a reader cannot take the result and apply it, it is a description of activity rather than a contribution.',
      '3. **Attach a demonstration to every claim.** A mechanism claim needs an ablation that isolates the mechanism; a capability claim needs a comparison at matched budget; a benchmark needs adoption criteria. A claim without its demonstration is a promise.',
      '4. **Choose the strongest available baselines before designing the method.** If the method is only compared with weak baselines the contribution cannot be assessed. Prefer the current state of the art plus the simplest strong alternative.',
      '5. **Plan the negative controls.** For any performance claim, include extra-compute and extra-tuning controls so that gains can be attributed to the mechanism rather than to resources.',
      '6. **State the scope of each claim** — the setting in which the collected evidence supports it — and refuse to generalise beyond it in the write-up.',
      '7. **Write the fallback contribution into the plan.** State which result would force the main claim to be restated, and what would still count as a valid contribution in that case.',
    ],
    evidenceRequirements:
      'Each contribution must be paired with the experiment or analysis that would demonstrate it. Baseline choices must be justified from the literature. The compute and tuning budget of every comparison must be stated so that gains are attributable.',
    expectedOutput: [
      'contribution statements with their type',
      'a per-claim demonstration plan',
      'the baseline set with its literature justification',
      'control conditions that isolate the mechanism',
      'the scope and limits of each claim, plus a fallback contribution',
    ],
    prerequisites: [
      "claims | 先有主张，才能设计证明它的证据包",
    ],
    sources: [
      { file: 'modules/conception/prompts/structuring_prompt.py' },
      { file: 'modules/decision/prompts/impact_evaluator.py' },
      { file: 'modules/conception/prompts/idea_generation_prompt.py' },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════
   * Research Decision
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: 'research-direction-selection',
    category: 'research-decision/research-direction-selection',
    name: 'Research Direction Selection',
    origin: 'conception/idea-evaluation, conception/idea-selection',
    purpose:
      'Choose which direction to commit to from an evaluated portfolio, with the criteria and trade-offs recorded so the choice can be defended or revisited rather than re-argued from scratch.',
    whenToUse: [
      'Several evaluated ideas compete for the same time and resources.',
      'A direction must be committed to and the rejection reasons are not written down.',
      'Two candidates look comparable and the decision keeps being reopened.',
    ],
    method: [
      '1. **Fix the criteria and their weights before looking at the ranking.** State the axes — novelty, feasibility, expected impact, cost, strategic fit — and the weight each carries, plus who set them. Criteria chosen after seeing the scores are rationalisation, not criteria.',
      '2. **Score on independent axes and keep the vector.** A single blended score hides the trade-off that the decision actually is. Report the score per axis rather than one number.',
      '3. **Check score grounding before comparing anything.** Any axis whose score cannot be tied to an artefact — a closest-work comparison, a resource estimate, a risk register — must be marked low-confidence and excluded from the deciding comparison.',
      '4. **Eliminate dominated candidates explicitly and record why:** dominated on every axis, unfalsifiable, or resting on a gap that is already closed. The rejected list is what shows the selection was principled.',
      '5. **Keep the top two or three, then choose one.** Name what the runner-up would win on and the condition under which the decision should be revisited — that condition is the trigger for reversing it later.',
      '6. **State the decision dependencies.** If the chosen direction rests on an unverified assumption (a dataset exists, a method scales, a licence permits use), record it as a decision risk rather than hiding it in optimism.',
      '7. **Write the rationale for a reader who disagrees**, listing the trade-offs accepted rather than only the winner\'s merits.',
    ],
    evidenceRequirements:
      'Every score on every axis must cite the artefact it came from. The criteria weights and their provenance must be recorded before the scores are compared. Rejected candidates must be logged with the axis or gate that eliminated them.',
    expectedOutput: [
      'the criteria and weights, fixed before scoring',
      'per-candidate score vectors with a confidence note per axis',
      'the rejected/dominated list with reasons',
      'the chosen direction and what it commits',
      'the runner-up, its winning axis, and the revisit trigger',
    ],
    prerequisites: [
      "literature-evidence | 方向选择要在文献评估之上做",
    ],
    sources: [
      { file: 'modules/conception/prompts/idea_evaluation_prompt.py' },
      { file: 'modules/conception/prompts/idea_selection_prompt.py' },
    ],
  },
  {
    id: 'feasibility-cost-and-resource-plan',
    category: 'resource-estimation/feasibility-cost-and-resource-plan',
    name: 'Feasibility, Cost and Resource Plan',
    origin: 'decision/feasibility-evaluation, decision/cost-evaluation, resource/estimation',
    purpose:
      'Determine whether a research plan can actually be executed within the available resources, and what it will cost, expressed in units that can be checked — compute, data, storage, skills, time and money.',
    whenToUse: [
      'A plan is about to be committed and its resource envelope is unknown.',
      'Two technical routes look equally good on paper and must be compared by cost and feasibility.',
      'A claim depends on resources you do not control, such as a dataset, a licence or a cluster.',
    ],
    method: [
      '1. **Estimate requirements from the plan\'s computation, not from hardware names.** Express compute as a work quantity — GPU-hours times relative compute units against a stated reference (A100 = 1.0) — plus storage tiers, data volume, parallelism and number of runs. Fix the requirement before naming any hardware.',
      '2. **Enumerate cost components separately and cite their source.** Compute, storage, network egress, data acquisition and personnel time, each with the pricing source and date. A single total without a breakdown cannot be audited, and goes stale silently when prices change.',
      '3. **Convert every requirement into a hard constraint and gate on it first.** An option that fails any single requirement — GPU-hours, storage, bandwidth, deadline — is infeasible and is removed before ranking. A strong score on one axis must never hide a failed constraint.',
      '4. **Compare at least two viable options**, including the local or self-hosted alternative and the cheapest credible provider, and report the total for each rather than only for the winner.',
      '5. **Report the bottleneck and the scaling regime.** State which resource binds first and how cost grows with scale — runs, parameters, data, sequence length — so the estimate can be reused at a different scale instead of recomputed.',
      '6. **Validate consistency across the estimate chain.** Resource spec, chosen option and cost must describe the same configuration; a mismatch invalidates the number rather than merely looking untidy.',
      '7. **Publish the uncertainty on the dominant driver** as scenarios (optimistic, expected, pessimistic) and say which assumption would move the estimate most.',
    ],
    evidenceRequirements:
      'Prices, instance types and exchange rates must cite their source and date. Requirement estimates must show the derivation from plan parameters rather than appearing as given numbers. Infeasible options must be recorded with the constraint they failed, and assumptions about data availability or expertise must be flagged.',
    expectedOutput: [
      'a resource specification covering compute, storage, network, data, skills and time',
      'a cost breakdown per option with pricing provenance',
      'a feasibility gating table showing pass/fail per hard constraint',
      'the bottleneck and the scaling behaviour of cost',
      'a consistency check across spec, option and cost, plus an uncertainty range',
    ],
    prerequisites: [
      "method-plan | 可行性与成本估算以方法设计为对象",
    ],
    sources: [
      { file: 'modules/decision/prompts/feasibility_evaluator.py' },
      { file: 'modules/decision/prompts/cost_evaluator.py' },
      { file: 'modules/resource/prompts/resource_estimation.py' },
      { file: 'modules/resource/prompts/infra_selection.py' },
      { file: 'modules/resource/prompts/instance_selection.py' },
      { file: 'modules/resource/prompts/cost_estimation.py' },
      { file: 'modules/resource/prompts/consistency_validation.py' },
      { file: 'modules/resource/prompts/recommendation.py' },
    ],
  },
  {
    id: 'research-risk-assessment',
    category: 'research-planning/research-risk-assessment',
    name: 'Research Risk Assessment',
    origin: 'decision/risk-evaluation, decision/feasibility-evaluation, resource/estimation',
    purpose:
      'Identify what could make the plan fail or make its result unusable, separate risk from missing fact, and attach a mitigation and a detectable early signal to each risk that is kept.',
    whenToUse: [
      'A plan is being committed and its failure modes have not been written down.',
      'A risk list exists but contains unread papers and vague warnings instead of mechanisms.',
      'You need to decide at what observation the direction should be abandoned.',
    ],
    method: [
      '1. **Enumerate risks by failure mode, not by category label.** For each risk name the mechanism: the method does not scale, the result is not attributable to the mechanism, the data or licence is unavailable, a dependency slips, a regulatory or ethics constraint blocks release.',
      '2. **Separate risk from uncertainty.** A risk has a plausible mechanism and can be mitigated or monitored; an uncertainty is a missing fact that must be resolved by looking it up or by running a pilot. Do not park an unread paper as a risk.',
      '3. **Rate each risk by impact and by how early it becomes detectable.** A high-impact risk that only surfaces at the end of the project demands a different response from one a pilot would reveal next week.',
      '4. **Attach a mitigation and an owner to every risk you keep.** A mitigation must be an action with a trigger and a fallback — "if scaling to N fails, fall back to setting S" — not a sentiment such as "monitor carefully".',
      '5. **Define the kill criteria now.** State the observation at which the direction is abandoned rather than patched, while the sunk cost is still near zero.',
      '6. **Check reproducibility risks explicitly:** data licensing and availability, compute budget for re-runs, seeds and variance reporting, and whether the key comparison can be reproduced by someone else from what you intend to release.',
      '7. **Carry the residual risk forward.** Rank the risks and hand the go/no-go decision the risk that remains after mitigation, not the risk as first stated.',
    ],
    evidenceRequirements:
      'Each risk must name the mechanism that would produce the failure and the evidence or precedent for it. Mitigations must specify trigger and fallback. Resource risks must cite the resource estimate, and unresolved external constraints such as licences or ethics approval must be flagged rather than assumed away.',
    expectedOutput: [
      'a risk register with mechanism, impact and detectability',
      'the split between true risks and open uncertainties',
      'a mitigation with trigger and fallback per retained risk',
      'kill criteria stated in advance',
      'residual risk after mitigation, plus reproducibility risks',
    ],
    prerequisites: [
      "method-plan | 评研究风险要先有方法与计划",
    ],
    sources: [
      { file: 'modules/decision/prompts/risk_evaluator.py' },
      { file: 'modules/decision/prompts/feasibility_evaluator.py' },
      { file: 'modules/resource/prompts/resource_estimation.py' },
    ],
  },
  {
    id: 'go-no-go-decision',
    category: 'research-decision/go-no-go-decision',
    name: 'Go / No-Go Decision',
    origin: 'decision/decision-synthesis',
    purpose:
      'Convert the multi-dimensional evaluations into a committed go, no-go or conditional go — with gates checked first, risk weighed against reward, and next actions whose progress can be observed.',
    whenToUse: [
      'The novelty, feasibility, cost and risk assessments exist and a commitment must be made.',
      'A project is continuing by momentum and nobody has stated the grounds for continuing.',
      'The decision depends on a missing fact and the right answer is currently neither go nor no-go.',
    ],
    method: [
      '1. **Assemble the dimensions side by side before judging** — novelty, feasibility, cost, risk, impact — each with its provenance and its confidence. Do not average dimensions that carry different confidence into one number.',
      '2. **Apply the hard gates first.** A failed gate — unfalsifiable claim, infeasible resource requirement, unresolved ethics or licence, novelty destroyed by the closest work — forces a no-go or a re-scope. A high average must never rescue a failed gate.',
      '3. **Weigh risk against reward explicitly.** State the upside if it works, the downside if it fails, and the residual risk after mitigation. A favourable ratio with unresolvable uncertainty is a conditional go, not a go.',
      '4. **Prefer a conditional decision to a vague one.** If the decision depends on a missing fact, name the check, its cost, and the decision rule — "go if the pilot reaches X, otherwise no-go" — instead of deciding on optimism.',
      '5. **State what is being committed:** compute, people, time and the opportunity cost of the alternatives that are now not being pursued.',
      '6. **Assign prioritised next actions** with an owner, a first step and the observable that marks progress. The first action should retire the largest uncertainty soonest.',
      '7. **Record the decision as an auditable artefact** with the evidence snapshot it used, so that a later reversal can be traced to a changed fact rather than to a changed mood.',
    ],
    evidenceRequirements:
      'The decision must reference the underlying assessments rather than restate them. Every condition and threshold must be checkable. The go/no-go, its date, its weights and the evidence snapshot must be recorded, and evidence that argued against the decision must be kept rather than dropped.',
    expectedOutput: [
      'gate check results with the gate that failed, if any',
      'a risk-versus-reward assessment with residual risk',
      'a go, no-go or conditional go, with the decision rule when conditional',
      'what is being committed and the opportunity cost',
      'prioritised next actions with owners and progress signals',
    ],
    prerequisites: [
      "resource-estimate | 决定继续/放弃，要先知道投入的资源代价",
    ],
    sources: [{ file: 'modules/decision/prompts/decision_synthesizer.py' }],
  },
]

export default { SKILLS }
