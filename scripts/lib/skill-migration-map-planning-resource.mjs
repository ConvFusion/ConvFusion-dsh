/**
 * 迁移映射表（分段）：planning-resource
 *
 * 旧 `modules/planning/prompts/*` 与 `modules/resource/prompts/*` 的能力重组。
 * 字段说明见 `skill-migration-map.mjs` 顶部。
 *
 * ## 重组判断（为什么不是 14 个 Skill）
 *
 * 旧 Planning 的 8 个提示词里有 5 个（initializer / normalizer / enricher /
 * canonicalizer / structurer）都是"对 plan 对象跑一遍"的管线工序，不是各自独立的
 * 科研能力：normalizer 纯粹修 JSON 字段与枚举，structurer / canonicalizer 是把自由
 * 文本搬进 IR v2 的格式转换。把它们各做一个 Skill 只会把旧管线原样搬过来。
 *
 * 因此按**能力**合并为 6 个 Skill：
 *
 * - 选题组合与策略承诺（strategy portfolio）← initializer + strategy_synthesis
 * - 方法设计（method design）← method_expansion
 * - 实验流程分解（pipeline decomposition）← route_expansion + enricher(technical_route)
 *   + structurer / canonicalizer 的 stage / step_id / depends_on 纪律
 * - 资源需求估算（requirement estimation）← resource_estimation + instance_selection 的
 *   性能模型
 * - 基础设施与成本选型（cost / infra selection）← infra_selection + cost_estimation
 *   + instance_selection + recommendation + consistency_validation
 * - 方案风险与可行性评估（risk assessment）← enricher(risks/assumptions) +
 *   recommendation(硬约束/无可行解) + consistency_validation(可行性门控)
 */

export const SKILLS = [
  {
    id: 'research-strategy-portfolio',
    category: 'research-management/research-planning',
    name: 'Research Strategy Portfolio',
    origin: 'planning/plan_initializer, planning/research_strategy_synthesis',
    purpose:
      'Decide which research strategies the project should actually pursue, as a deliberate risk-diversified portfolio rather than one bet, and then consolidate the surviving plans into a single committed strategy with a validation protocol and a reproducibility contract.',
    whenToUse: [
      'A research direction has been chosen but not yet translated into committable strategies.',
      'You cannot tell whether the plan is a safe incremental study or a high-risk, high-reward bet.',
      'Several candidate plans exist and must be reduced to the ones worth executing.',
      'The experiment graph, validation protocol or target venue is still undefined.',
    ],
    method: [
      '1. **Anchor every plan to a named gap.** Each strategy must cite the gap or opportunity it addresses, drawn from the knowledge state or innovation state. A plan whose motivation is "this would be interesting" cannot be compared against the others.',
      '2. **Make risk posture explicit and non-redundant.** Assign each plan a posture: conservative (established components, fast falsification), balanced (one unproven component), innovative (a new mechanism with a real chance of not working). If two plans share a posture, they are one plan with variants.',
      '3. **Hold the comparison fixed across the portfolio.** Datasets, metrics and baselines must be identical across plans, otherwise the comparison measures the evaluation protocol rather than the strategy.',
      '4. **Write the experiment graph before spending anything.** Express each plan as a dependency graph of stages (data, model build, training, evaluation) with inputs, outputs and edges. A plan whose evaluation step does not consume its own training output is not yet a plan.',
      '5. **Design the ablation plan up front.** For every unproven component, state the ablation or control that would show it matters and the observable difference expected. A component with no possible ablation is either not novel or not testable.',
      '6. **Commit to one strategy and keep the others on record.** Select the plan to execute now and say why; record each rejected plan with the condition under which it would be revived. Rejected plans with no revival condition should be deleted rather than archived.',
      '7. **Fix the reproducibility and publication contract at commitment time**, not after results arrive: seeds, hyperparameter tables, hardware and software environment, code-release scope, target venue, and the timeline phases the venue imposes.',
    ],
    evidenceRequirements:
      'Every plan must trace to a documented gap or knowledge-state claim. Baselines and metrics must be justified against the literature rather than assumed. The ablation plan must name the component and the expected observable difference. Rejected plans must record the reason for rejection and the condition for revival.',
    expectedOutput: [
      'two to four strategies, each with its posture, the gap it targets and its falsification condition',
      'the selected strategy, the reason for selection, and the rejected alternatives on record',
      'a validation protocol (datasets, metrics, baselines) shared across the portfolio',
      'an experiment graph and an ablation plan for the unproven components',
      'a reproducibility and publication contract (seeds, hyperparameters, hardware, environment, venue, timeline)',
    ],
    sources: [
      { file: 'modules/planning/prompts/plan_initializer.py' },
      { file: 'modules/planning/prompts/research_strategy_synthesis.py' },
    ],
  },
  {
    id: 'research-method-design',
    category: 'methodology/method-design',
    name: 'Research Method Design',
    origin: 'planning/method_expansion',
    purpose:
      'Convert a committed research strategy into a concrete, testable method: the paradigm, the learning setting, the intervention, the training protocol and the data it requires, stated so that a third party could implement it and know what would falsify it.',
    whenToUse: [
      'A strategy exists at the level of an idea but has no implementable method behind it.',
      'The method is named but its intervention is not stated (for example "a diffusion model" with no stated change).',
      'You need to check that the planned evaluation could actually falsify the mechanism.',
      'Data requirements must be settled before resources are estimated.',
    ],
    method: [
      '1. **State the paradigm and learning setting first.** Supervised, self-supervised, unsupervised, reinforcement, or a non-learning analytical method. The setting determines which data may legitimately be used and which comparisons are fair; everything downstream is conditional on it.',
      '2. **Name the intervention precisely.** State what changes relative to the closest existing method. "Add conditioning" is a direction, not an intervention; "condition the denoiser on per-pixel transmission estimated by a physics model" is one.',
      '3. **Fix what is held constant.** Backbone, data split, optimiser, schedule and compute budget. A design in which every component moves at once cannot attribute any result to any component.',
      '4. **Specify the training protocol to the level of reproducibility**: objective, schedule, augmentation, regularisation, stopping rule, and the number of seeds. State the cost of a single run, since this becomes the input to resource estimation.',
      '5. **State the data requirement as properties, not dataset names.** Modality, resolution, label type, volume, licensing, and whether the data exists, must be acquired, or must be synthesised. A method needing data that does not exist is a data-collection project first.',
      '6. **Predict the observable difference and the failure signature.** Say which metric should improve, by roughly how much, and what result would show the central mechanism does not work. A method with no failure signature cannot be falsified by its own evaluation.',
      '7. **Check the method against the strategy posture.** If the method quietly requires a component the chosen posture excludes, such as a new module inside a conservative plan, either the method or the posture must change now rather than mid-project.',
    ],
    evidenceRequirements:
      'Claims about what existing methods do must cite the works. Data requirements must distinguish existing datasets from data to be acquired and must state access conditions. Training cost figures must show their basis (model size, dataset size, epochs, hardware class). The intervention must be described in enough detail that an independent researcher could implement it.',
    expectedOutput: [
      'the paradigm and learning setting, with its implications for data and comparison',
      'the named intervention and the components held constant',
      'a reproducible training protocol with a per-run cost estimate',
      'data requirements as properties (modality, volume, labels, licensing, acquisition path)',
      'the expected observable difference and the failure signature',
    ],
    sources: [
      { file: 'modules/planning/prompts/method_expansion.py' },
      { file: 'modules/planning/prompts/plan_initializer.py' },
    ],
  },
  {
    id: 'experiment-pipeline-design',
    category: 'research-management/task-decomposition',
    name: 'Experiment Pipeline Design',
    origin:
      'planning/route_expansion, planning/plan_enricher, planning/plan_structurer, planning/plan_canonicalizer',
    purpose:
      'Decompose a designed method into an executable, dependency-ordered plan: stages, steps, inputs, outputs, tools, time and the artifact each step must produce, so the work can be scheduled, parallelised and reviewed step by step.',
    whenToUse: [
      'A method is designed but not yet broken into work that someone could start this week.',
      'Steps are described as prose phases with no inputs, outputs or dependencies.',
      'The work must be parallelised across people or machines.',
      'You need to know the critical path before estimating cost or negotiating a deadline.',
    ],
    method: [
      '1. **Decompose by artifact, not by activity.** Every step must produce a named artifact (a split dataset, a trained checkpoint, a metrics table) that some later step consumes. A step whose output nobody consumes is a checkpoint or should be removed.',
      '2. **Canonicalise the stages.** Collapse each step into exactly one of: data, model build, training, evaluation. Free-text stages such as "do the experiments" hide several distinct steps and destroy schedulability.',
      '3. **Make dependencies explicit and acyclic.** Reference steps by id and require that every input is either the output of an earlier step or a declared external resource. Cycles and dangling inputs are errors to fix, not ambiguities to tolerate.',
      '4. **Attach tools and a time estimate to every step**, with the basis for the estimate (dataset size, model size, number of runs). An estimate without a basis cannot be revised when it turns out to be wrong, which is the only thing that ever happens to estimates.',
      '5. **Mark the critical path and the parallelisable branches.** State which steps the schedule depends on and which can run concurrently; this is what shows where extra compute or extra people actually shorten the project.',
      '6. **Plan evaluation, ablation and sweep runs as first-class steps.** Evaluation consumes the trained artifact and produces the metrics the claims rest on. Enumerate seeds, hyperparameter sweeps and ablations here rather than discovering them after the first results look wrong.',
      '7. **Verify the route against the method.** Walk the pipeline and confirm that every element of the intervention is built by some step and measured by some evaluation step. A method component with no build step or no measurement step is a hole in the plan, not a detail.',
    ],
    evidenceRequirements:
      'Every step must name its inputs, outputs, dependencies, tools and time basis. Artifact names must be consistent across steps so dependencies are mechanically checkable. Time and cost estimates must derive from run count, model size and data volume rather than assertion.',
    expectedOutput: [
      'a step table with id, stage, technique, inputs, outputs, dependencies, tools and time estimate',
      'the serialised pipeline with the critical path and parallelisable branches marked',
      'the enumerated training, evaluation, ablation and sweep runs',
      'a technical-route narrative explaining why this ordering is necessary and what forces it',
    ],
    sources: [
      { file: 'modules/planning/prompts/route_expansion.py' },
      { file: 'modules/planning/prompts/plan_enricher.py' },
      { file: 'modules/planning/prompts/plan_structurer.py' },
      { file: 'modules/planning/prompts/plan_canonicalizer.py' },
    ],
  },
  {
    id: 'resource-requirement-estimation',
    category: 'research-management/resource-planning',
    name: 'Resource Requirement Estimation',
    origin: 'resource/resource_estimation, resource/instance_selection',
    purpose:
      'Estimate what a plan demands in hardware-agnostic terms, namely compute, storage, data, human skills and time by phase, and identify the binding bottleneck and the scaling behaviour before any vendor or part number is chosen.',
    whenToUse: [
      'A pipeline exists and its feasibility must be established before committing to it.',
      'Someone proposes a specific GPU model before the requirement has been stated.',
      'You need to know which phase or resource constrains the schedule.',
      'A plan is being scaled up (more seeds, more data, a larger model) and the cost curve is unknown.',
    ],
    method: [
      '1. **Express compute as a requirement, not a product.** Report relative compute units (A100-equivalent = 1.0), GPU-hours and required parallelism. Naming a GPU model at this stage hides whether the requirement is 40 or 40,000 GPU-hours and pre-empts the selection decision.',
      '2. **Derive GPU-hours from the run list.** Take the run count including seeds, sweeps and ablations, multiply by hours per run from the pipeline estimate, and divide by the parallel efficiency you are willing to assume. Show the arithmetic; it is the only part of the estimate a reviewer can audit.',
      '3. **Size storage in tiers.** Hot working storage, checkpoint storage (runs x checkpoint size x retention), cold archive, and log volume per run. Checkpoint storage is routinely the largest term and the one most often omitted.',
      '4. **Specify the dataset requirement as an acquisition plan.** Total volume, sample count, modalities, preprocessing needs, and the source: existing corpus, synthesis, purchase, or collaboration. Each path needs an owner and a lead time; "a public dataset" is not an acquisition plan.',
      '5. **Estimate time by phase and state the assumption each phase rests on** (data preparation, implementation, training, evaluation). Convert the pipeline critical path into wall-clock weeks, including the serialisation that cannot be removed.',
      '6. **Name the bottleneck explicitly.** Identify the single resource that binds the plan, whether GPU-hours, a scarce dataset, one specific skill, or strictly sequential runs, and give its severity. If everything is listed as a bottleneck, none has been identified.',
      '7. **State how the estimate scales.** Give the marginal cost of doubling runs, data or model size and the point at which the plan stops being feasible. This is what makes the estimate usable for descoping rather than merely informative.',
    ],
    evidenceRequirements:
      'Compute, storage and time figures must show their derivation from run counts, model sizes and dataset sizes. Dataset claims must name the actual source and its access conditions. Every phase estimate must carry the assumption it depends on. Never present a vendor-specific part number as a requirement.',
    expectedOutput: [
      'compute requirement (compute units, GPU-hours, parallelism) with its derivation',
      'storage requirement by tier, with checkpoint retention stated',
      'dataset requirement and acquisition plan with sources, owners and lead times',
      'time estimate by phase plus the human skills the plan assumes',
      'the binding bottleneck with its severity, and the scaling behaviour of the estimate',
    ],
    sources: [
      { file: 'modules/resource/prompts/resource_estimation.py' },
      { file: 'modules/resource/prompts/instance_selection.py' },
    ],
  },
  {
    id: 'infrastructure-cost-selection',
    category: 'research-management/resource-planning',
    name: 'Infrastructure and Cost Selection',
    origin:
      'resource/instance_selection, resource/infra_selection, resource/cost_estimation, resource/recommendation, resource/consistency_validation',
    purpose:
      'Turn an audited resource requirement into costed, feasibility-checked infrastructure options and one recommended plan that respects budget, deadline and data-governance constraints, with the rejected options and their prices kept on record.',
    whenToUse: [
      'A resource estimate exists and must become something purchasable or bookable.',
      'Several providers, or a cloud-versus-on-prem choice, are plausible and the decision is contested.',
      'A budget or deadline is fixed and you must show whether the plan fits inside it.',
      'A quoted cost looks too low and you suspect storage, checkpoints or egress were ignored.',
    ],
    method: [
      '1. **Gate on feasibility before ranking on price.** Check each candidate against the full requirement, namely GPU-hours, CPU, memory, storage tiers, network and the deadline, and mark it feasible, scalable (meets the need after a stated adjustment) or infeasible. Drop infeasible candidates before any score is computed; free tiers are infeasible by default unless they demonstrably satisfy the requirement.',
      '2. **Keep near-misses as candidates.** A candidate that fits after increasing GPU count or extending the deadline is a real option and belongs in the comparison with its adaptation plan stated. Do not reject it on GPU-model mismatch alone when the performance model says the compute requirement can be met.',
      '3. **Price the whole plan, not the GPU-hour.** Include compute, storage at each tier, checkpoints, network egress and data transfer, and the human time to operate the setup. State the pricing source and date. A total that omits storage and egress is not a total and will not survive contact with the invoice.',
      '4. **Normalise heterogeneous options onto one basis.** Convert on-demand, reserved or spot cloud pricing and amortised on-prem hardware into a common currency and period, and state which cost model was used. Comparing a monthly reservation against an hourly rate without normalisation is a category error.',
      '5. **Score cost, time and risk explicitly, with weights fixed in advance.** Report per-criterion scores alongside the aggregate so a reviewer can see whether the winner won on price or on risk. An aggregate score with invisible weights cannot be argued with and therefore cannot be trusted.',
      '6. **Cross-check the chain.** Verify that providers in the infrastructure set have corresponding instances, that every priced instance traces back to a requirement, and that the recommended option appears in the feasible set. Mismatches are errors to surface, not to repair silently.',
      '7. **Recommend with the trade-off stated, or return an explicit no-feasible-option verdict.** If nothing satisfies the constraints, say so and name the binding constraint and the relaxation that would open the option set. Do not introduce a fallback that the constraints already exclude.',
    ],
    evidenceRequirements:
      'Every price must cite its source and date. Each rejected option must carry its price and the reason it lost. Feasibility verdicts must show the requirement-versus-capacity comparison. When no feasible option exists, the binding constraint and the required relaxation must be stated explicitly.',
    expectedOutput: [
      'feasibility-gated candidate instances and infrastructure options per provider',
      'a full cost breakdown (compute, storage, egress, human time) with pricing provenance',
      'a ranked shortlist with per-criterion scores, stated weights and the recommended option',
      'the trade-off rationale plus rejected options with their prices',
      'a consistency report across requirement, instances, infrastructure and cost, or an explicit no-feasible-option verdict',
    ],
    sources: [
      { file: 'modules/resource/prompts/infra_selection.py' },
      { file: 'modules/resource/prompts/cost_estimation.py' },
      { file: 'modules/resource/prompts/instance_selection.py' },
      { file: 'modules/resource/prompts/recommendation.py' },
      { file: 'modules/resource/prompts/consistency_validation.py' },
    ],
  },
  {
    id: 'plan-risk-assessment',
    category: 'research-decision/risk-assessment',
    name: 'Plan Risk Assessment',
    origin: 'planning/plan_enricher, resource/recommendation, resource/consistency_validation',
    purpose:
      'Stress-test a research plan before it is executed: surface the assumptions it rests on, classify the risks that would invalidate it, and decide whether it is executable under the current constraints, including the honest answer that it is not.',
    whenToUse: [
      'A plan is about to be committed and its assumptions have never been written down.',
      'A risk list exists but contains neither mitigation nor a trigger for acting.',
      'Budget, deadline, compute availability or data-access constraints may make the plan impossible.',
      'Two candidate plans must be compared on risk rather than on expected performance.',
    ],
    method: [
      '1. **Extract the assumptions before the risks.** List what must be true for the plan to work (the data is obtainable, the phenomenon reproduces, the baseline is reproducible) and mark each as testable or untestable. An untestable assumption is a risk that no experiment inside the plan can retire.',
      '2. **Classify risks on a fixed taxonomy rather than ad hoc**, for example domain gap, technical complexity, data quality, compute intensity and convergence, or an equally explicit domain-specific set. A stable taxonomy is what lets two plans be compared at all.',
      '3. **Assign severity and mitigation to each risk.** Every risk carries a level, a concrete mitigation, an owner, and a trigger stating which observation means the mitigation must be executed. A risk with no mitigation is a plan defect rather than a risk entry.',
      '4. **Apply hard constraints as gates, not scores.** Budget, deadline, compute availability, licensing and data governance are pass or fail. A plan that fails a gate is infeasible regardless of how well it scores elsewhere, so evaluate gates before any weighted ranking.',
      '5. **Look for correlated failure.** Several risks that share one cause (a single dataset, one person, one cluster) are one risk with a compounded effect. Name the shared dependency; independent-looking risks that fail together are the most common cause of a dead project.',
      '6. **Check the internal consistency of the plan artefacts.** Requirement, instance choice, infrastructure and cost must describe the same plan. A costed option that does not satisfy the stated requirement is an error rather than a rounding difference, and must be reported as one.',
      '7. **Give a verdict with the condition that would change it.** State feasible, feasible only after a named relaxation or descope, or no feasible plan under the constraints, together with the evidence that would flip the verdict.',
    ],
    evidenceRequirements:
      'Assumptions must be written as checkable propositions with the artefact or experiment that would test each. Risk severities must have a stated basis. Gate failures must cite the constraint and the measured shortfall. An infeasible verdict must name the binding constraint and the relaxation that would open the option set.',
    expectedOutput: [
      'the assumptions the plan rests on, marked testable or untestable',
      'risks classified on a stated taxonomy with severity, mitigation, owner and trigger',
      'hard-constraint gate results with the measured shortfall for each failure',
      'shared dependencies and correlated failure modes',
      'a feasibility verdict with the condition that would change it',
    ],
    sources: [
      { file: 'modules/planning/prompts/plan_enricher.py' },
      { file: 'modules/resource/prompts/recommendation.py' },
      { file: 'modules/resource/prompts/consistency_validation.py' },
    ],
  },
]
