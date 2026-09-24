/**
 * 迁移映射表（分段）：experiment-analysis
 *
 * 由模块负责人填写；`gen-skill-library.mjs` 会把所有分段合并后生成 Skill Library。
 * 字段说明见 `skill-migration-map.mjs` 顶部。
 *
 * 覆盖旧 Experiment 模块（design / simulation / dataset / method / analysis /
 * summary / lab_offline / 顶层共享 prompt）的提示词，按**能力**重组为 10 个 Skill。
 * 旧模块里只负责“让编码 Agent 写代码”的 prompt（*_code、coding_planning、
 * code_reuse_check）不作为独立 Skill，而是化为实现类 Skill 中的约束条目。
 */

export const SKILLS = [
  {
    id: 'experiment-design',
    category: 'experiment/experiment-design',
    name: 'Experiment Design & Feasibility',
    origin: 'experiment/design, experiment/simulation',
    purpose:
      'Decide whether a research question can be tested experimentally at all, then fix a design whose outcome would be interpretable: what is manipulated, what is held fixed, what is measured, and what result would falsify the hypothesis.',
    whenToUse: [
      'A hypothesis exists but no executable experiment stands behind it yet.',
      'You must decide whether the work is programmable, needs new data, or can only be done offline.',
      'Compute or lab time is about to be committed and the design should be stress-tested first.',
    ],
    method: [
      '1. **Test feasibility before designing.** Classify the experiment on three axes: can the core manipulation be implemented in software, does it need data that exists or can be obtained, and does it need physical-world access (hardware, participants, wet lab). Name the specific non-simulable dependency behind any not-programmable verdict, and state which sub-parts remain programmable.',
      '2. **State the question as a comparison with a falsification condition.** Write the research question, the hypothesis, and the observation that would show the hypothesis false. If no possible outcome would count against it, the design is not an experiment.',
      '3. **Fix the manipulation and the controls.** Specify the independent variables and their levels, everything held constant, and the controls that rule out the obvious alternative explanations (data, capacity, tuning budget). A design with no controls cannot attribute an effect.',
      '4. **Choose outcome measures and the split protocol before running.** Name the primary metric, the secondary metrics and the data splits, and decide when test data may be touched. Measurements picked after seeing results are not measurements.',
      '5. **Stress-test the design by pre-run simulation.** Predict expected values and their plausible spread from published numbers and the baselines, then judge whether the predicted effect is large enough to be distinguishable from run-to-run variation. If it is not, revise the design rather than proceeding.',
      '6. **Record the refinement as a versioned design.** When simulation or review changes the design, keep the change, the reason and the resulting version. The design handed to implementation must be the refined one, and predicted values must stay labelled as predictions.',
    ],
    evidenceRequirements:
      'Feasibility verdicts must name the concrete dependency (dataset id, hardware, population). Each design choice — metric, split, control, baseline — must cite literature or a pilot rather than preference. Pre-run simulated values must be labelled as predictions and must never appear later as measured results.',
    expectedOutput: [
      'feasibility verdict per axis, with the non-programmable dependency named',
      'research question, hypothesis and falsification condition',
      'variables, levels, controls and constant factors',
      'primary and secondary metrics with the split protocol',
      'versioned design plus the recorded refinements and their reasons',
    ],
    prerequisites: [
      "method-plan | 实验设计要有已定的方法来检验",
    ],
    sources: [
      { file: 'modules/experiment/design/prompts/experiment_design_prompt.py' },
      { file: 'modules/experiment/design/prompts/experiment_design_refiner_prompt.py' },
      { file: 'modules/experiment/simulation/prompts/experiment_simulation_prompt.py' },
      { file: 'modules/experiment/simulation/prompts/design_refinement_prompt.py' },
    ],
  },
  {
    id: 'simulation-baseline',
    category: 'experiment/simulation-baseline',
    name: 'Simulation-First Results & Baseline Reference',
    origin: 'experiment/simulation, experiment/design, experiment/lab_offline',
    purpose:
      'Produce expected results when the real experiment cannot be run yet — hardware, data or lab access unavailable — as explicit, labelled predictions anchored on published numbers and the baselines, so that design decisions and the expected margin over baselines can be judged before execution, and so that no simulated value ever masquerades as a measurement.',
    whenToUse: [
      'The experiment needs hardware, a dataset or lab access that is not available yet, but the design depends on the expected magnitude of the effect.',
      'Baselines cannot be reimplemented yet, so expected baseline values are needed to judge whether the expected gain justifies the work.',
      'A pre-registered expectation is wanted before execution, so that later interpretation of real runs stays honest.',
    ],
    avoidWhen: [
      'The experiment can actually be run — a simulation is never a substitute for an available measurement.',
      'The question is whether the method works rather than what magnitude is plausible; only real runs can answer that.',
      'A simulated value would enter an abstract, result table, figure or claim without a simulated label.',
    ],
    method: [
      '1. **Anchor every number on the frozen design and the literature.** Take the design version, the primary metric and the baseline set. For each baseline use values reported under a comparable setting (data version, split, metric definition, compute) and record the citation. Where no comparable value exists, say so instead of inventing one.',
      '2. **Predict a band, not a point.** For every metric give expected, optimistic and pessimistic values, and name the assumption that separates them (tuning budget, data scale, compute). A single number hides exactly the uncertainty the design needs to see.',
      '3. **State the generative assumption so each number is recomputable.** Write what is extrapolated, from which anchor, under which scaling assumption. A prediction nobody can recompute or refute is an opinion, not a simulation.',
      '4. **Assess simulation quality explicitly and honestly.** Report confidence together with its justification and the risks: how close the anchor setting is, whether the claimed mechanism is even representable in that anchor, and what would make the extrapolation invalid. Confidence is high only when closely comparable published results exist, and must be low for a novel task, metric or domain.',
      '5. **Compare against the baselines and pre-declare the decision.** Give the predicted margin and state whether it clears the run-to-run variation threshold fixed in the evaluation protocol. If it does not, revise the design instead of proceeding — the simulation exists to stop a weak experiment before it consumes resources.',
      '6. **Label simulated values at creation, everywhere.** File names, frontmatter, table headers, axis labels and figure captions must say simulated or predicted. Simulated values live in their own artefacts and are never merged into a table of measured runs.',
      '7. **Plan the replacement and the falsification.** For each simulated value state which pilot or full run will replace it and what observed result would falsify the prediction. Once real runs exist the simulation is superseded, and a superseded prediction must not remain in a claim.',
    ],
    reasoning: {
      focus: [
        'What the simulation is for: sizing the effect, choosing the design, pre-registering expectations, and giving the paper a baseline reference before real runs exist.',
        'Where each anchor number came from and how comparable that setting really is to yours.',
        'Which parts of the design remain uncertain after the simulation, and which pilot run would reduce that uncertainty most.',
      ],
      avoid: [
        'Presenting a predicted value as a result, or letting a simulated number survive into a results table, figure or claim once real runs exist.',
        'Confidence that is not justified by a comparable published benchmark.',
        'Using simulation to avoid an experiment that is actually feasible with the available resources.',
      ],
    },
    evidenceRequirements:
      'The design version, primary metric and baseline set the prediction was derived from; per-metric predicted ranges with the anchor citation behind each baseline; the generative assumption that makes each number recomputable; an explicit quality assessment giving confidence, justification and risks; the simulated label present on every artefact carrying a predicted value; and the replacement plan mapping each simulated value to the run that will supersede it. A simulated value supports no claim about whether the method works.',
    expectedOutput: [
      'predicted metric ranges with the assumption behind each bound',
      'per-baseline expected values with sources, each marked as measured anchor or estimate',
      'predicted margin against the pre-declared decision threshold, with the go/no-go it implies',
      'simulation quality: confidence, justification and risks',
      'expected chart and table descriptions, marked as expected rather than observed',
      'label policy applied to artefacts plus the sim-to-real replacement plan',
    ],
    prerequisites: [
      "method-plan | 仿真为方法设计服务（要先有设计好的方法）",
    ],
    sources: [
      { file: 'modules/experiment/simulation/prompts/experiment_simulation_prompt.py' },
      { file: 'modules/experiment/simulation/prompts/design_refinement_prompt.py' },
      { file: 'modules/experiment/simulation/runtime/path_decision.py', const: 'decision contract (module docstring)' },
      { file: 'modules/experiment/lab_offline/prompts/offline_guidance_prompt.py' },
    ],
  },
  {
    id: 'dataset-selection',
    category: 'experiment/dataset-selection',
    name: 'Dataset Selection & Data Pipeline Specification',
    origin: 'experiment/dataset, experiment/method (data collection)',
    purpose:
      'Choose datasets that can actually support the claim — right construct, right scale, right licence, obtainable — and specify the preprocessing, splitting and statistics the pipeline must produce so the data is auditable.',
    whenToUse: [
      'The design is fixed and the open question is which data can answer it.',
      'A candidate dataset is popular in the field but its domain, splits or licence may not match the claim.',
      'You need a data pipeline whose processed outputs can be regenerated and inspected.',
    ],
    method: [
      '1. **Derive dataset requirements from the claim, not from habit.** List the constructs that must be present (labels, modalities, domains, languages), the required scale, and any distribution the claim depends on. A dataset missing a required construct cannot support the claim no matter how standard it is.',
      '2. **Survey candidates and record provenance.** For each candidate record source, version or commit, licence and terms, size, available splits, known biases, and the works that use it. Prefer version-pinned, publicly downloadable, well-documented sources so the pipeline can be rerun.',
      '3. **Check comparability with the baselines.** Use the same data version, splits and preprocessing that produced the baseline numbers; where you deviate, state the deviation and why the comparison remains valid.',
      '4. **Design the split and guard against leakage.** Fix ratios and a seed, split by the correct unit (subject, document, time) so near-duplicates cannot cross splits, and verify that no test material informed training or tuning.',
      '5. **Specify preprocessing and statistics as requirements for the implementation.** The pipeline must be deterministic, must report per-split sample counts, class balance, missing-value and length distributions, and must write processed data in a documented format while retaining the raw source.',
      '6. **State the fallback when data is unavailable.** If a source cannot be downloaded or licensed, either substitute a documented alternative or generate a clearly-labelled synthetic dataset for dry runs. Never let fabricated values be presented later as measurements.',
    ],
    evidenceRequirements:
      'Dataset identity (source, version, licence, access date), per-split counts, and a hash or checksum of the processed artefacts. Any claim about data scale or distribution must point at a computed statistic, not an estimate. Simulated or synthetic data must be labelled at every downstream use.',
    expectedOutput: [
      'dataset requirement list derived from the research question',
      'selected datasets with provenance, licence and comparability notes',
      'split protocol with the splitting unit and a deterministic seed',
      'preprocessing and statistics requirements handed to implementation',
      'fallback plan for unavailable or unusable data',
    ],
    prerequisites: [
      "method-plan | 需要什么数据由方法决定",
    ],
    sources: [
      { file: 'modules/experiment/dataset/prompts/dataset_planning_prompt.py' },
      { file: 'modules/experiment/dataset/prompts/dataset_code_requirements_prompt.py' },
      { file: 'modules/experiment/method/prompts/data_collection_prompt.py' },
      { file: 'modules/experiment/dataset/prompts/dataset_code_prompt.py' },
      { file: 'modules/experiment/prompts/baseline_builder_prompt.py' },
    ],
  },
  {
    id: 'baseline-selection',
    category: 'experiment/baseline-selection',
    name: 'Baseline Selection & Comparison Protocol',
    origin: 'experiment/design, experiment/method',
    purpose:
      'Choose the comparisons that make a result meaningful: the strongest published methods on the same task plus trivial and structural controls, each run under one protocol so differences are attributable to the method.',
    whenToUse: [
      'A new method is proposed and must be placed against the state of the art.',
      'The candidate baseline list consists of whatever was easiest to reimplement.',
      'Expected baseline numbers are needed before implementation to judge whether the expected gain justifies the work.',
    ],
    method: [
      '1. **Derive the comparison from the claim.** The baseline must differ from your method in exactly the factor the contribution claims. If it differs in data, tuning budget or compute, the comparison does not test the claim.',
      '2. **Cover the tiers.** Include at least a trivial reference (majority class, random, last value), a standard strong method, the current state of the art in this exact setting, and a variant of your own method with the contribution removed. A baseline set that omits the strongest published method is not a comparison.',
      '3. **Source each baseline from a paper, not from intuition.** Record the paper, its reported values and the exact setting (data version, split, metric definition, compute), and flag every mismatch with your setting. Values you had to estimate must be marked as estimates.',
      '4. **Freeze one evaluation protocol.** Same data version, splits, preprocessing, metric implementation and tuning budget for every method. Unequal tuning is the most common way comparisons become unfair; state the protocol once and apply it verbatim.',
      '5. **Pre-compute expected results and a decision margin.** Give each baseline realistic expected values with a plausible range, and decide in advance how large a gap counts as a real improvement rather than run-to-run variation. If the predicted margin is not clearly above that threshold, revisit the design before implementing.',
      '6. **Specify what the implementation must guarantee.** Each baseline must run from a documented config, use the shared data pipeline and metric code, and emit raw predictions so the comparison can be recomputed. Anything not faithfully reimplementable is reported as cited-only rather than silently approximated.',
    ],
    evidenceRequirements:
      'For every baseline: the source paper or implementation with a link, the protocol it was run under, its config, and its raw outputs. Reported baseline numbers must be either reproduced locally or explicitly attributed to the source with setting differences noted.',
    expectedOutput: [
      'baseline set organised by tier, with the justification for each member',
      'per-baseline source and expected metric range',
      'one frozen comparison protocol applied to all methods',
      'the pre-declared improvement margin',
      'implementation requirements per baseline, including cited-only entries',
    ],
    prerequisites: [
      "method-plan | 基线要与方法可比",
    ],
    sources: [
      { file: 'modules/experiment/design/prompts/baseline_design_prompt.py' },
      { file: 'modules/experiment/method/prompts/baseline_requirements_prompt.py' },
      { file: 'modules/experiment/prompts/baseline_builder_prompt.py' },
    ],
  },
  {
    id: 'evaluation-protocol',
    category: 'experiment/evaluation-protocol',
    name: 'Evaluation Protocol & Metric Design',
    origin: 'experiment/design, experiment/analysis, experiment/method',
    purpose:
      'Decide what is measured, how each metric is computed, and what counts as success, so that a number produced by the pipeline can be trusted as evidence about the hypothesis.',
    whenToUse: [
      'The design names metrics but not their definitions or computation.',
      'The same metric name is computed differently across the works you compare against.',
      'Before implementation, to make sure the code will emit the quantities the claims need.',
    ],
    method: [
      '1. **Map each claim to a metric.** For every statement the paper will make, name the quantity that would support or refute it. Claims with no measurable quantity are either dropped or explicitly marked qualitative.',
      '2. **Fix the primary metric before seeing results**, and treat secondary metrics as supporting only. Choosing the primary after seeing results is post-hoc selection by another name.',
      '3. **Pin each metric to an implementation.** State the formula, averaging mode (micro or macro), label handling, thresholds and reference implementation. Ambiguous names such as accuracy or F1 must be disambiguated, and the computing library version recorded.',
      '4. **Specify the evaluation loop and reporting granularity.** State which splits are used, how often evaluation runs, whether selection is per-seed or best-epoch, and that test data is touched once at the end. Report per-seed values, not only the best.',
      '5. **Declare success and failure thresholds in advance**, including the minimum effect worth claiming and any absolute floor such as beating the trivial baseline. Thresholds belong to the design, not to the later narrative.',
      '6. **Require machine-readable outputs from the implementation.** Evaluation code must write metrics and per-example predictions in a documented schema, one row per run, seed and example, so that later comparison, significance testing and error analysis work from artefacts rather than from prose.',
    ],
    evidenceRequirements:
      'Metric definitions with reference implementation and version, per-run and per-seed raw outputs, the claim-to-metric mapping, and thresholds declared before the run. A metric value is not evidence unless the code, data version and config that produced it are identifiable.',
    expectedOutput: [
      'claim-to-metric mapping with qualitative claims marked',
      'primary and secondary metric definitions with reference implementations',
      'evaluation schedule and split usage',
      'pre-declared success, failure and minimum-effect thresholds',
      'required output schema for the implementation',
    ],
    prerequisites: [
      "method-plan | 评测协议服务于方法要检验的主张",
    ],
    sources: [
      { file: 'modules/experiment/analysis/prompts/metric_analysis_prompt.py' },
      { file: 'modules/experiment/method/prompts/training_code_prompt.py' },
      { file: 'modules/experiment/design/prompts/experiment_design_prompt.py' },
      { file: 'modules/experiment/prompts/baseline_builder_prompt.py' },
    ],
  },
  {
    id: 'ablation-design',
    category: 'experiment/ablation-design',
    name: 'Ablation & Contribution Isolation',
    origin: 'experiment/design, experiment/simulation, experiment/summary',
    purpose:
      'Design the experiments that show which part of a method causes the effect, so a gain is attributed to a mechanism rather than to the whole system, extra capacity, or tuning luck.',
    whenToUse: [
      'A method combines several components and the paper will claim each of them helps.',
      'A reviewer would ask which component actually drove the improvement.',
      'Deciding whether an extra component justifies its complexity and compute cost.',
    ],
    method: [
      '1. **Enumerate contributions as removable units.** List every component or design decision the paper will claim, and define the exact variant in which it is removed or replaced by a neutral equivalent. If a component cannot be removed, say so and drop the claim attached to it.',
      '2. **Run one factor at a time first, then interactions.** Vary one factor per run with everything else at the full configuration, and add combined-removal runs where two components plausibly interact. Keep the full model as the reference row for every comparison.',
      '3. **Control for capacity, not only structure.** When removing a component also changes parameter count or compute, add a size-matched or compute-matched control so the effect is attributed to the mechanism rather than to added capacity.',
      '4. **Define the measurement and decision for each ablation before running.** Reuse the primary metric and the same protocol as the main comparison, state what magnitude of drop would count as evidence that the component matters, and state what a null result would mean.',
      '5. **Rank ablations by how much they change the interpretation and prune the rest.** Drop runs that only confirm the obvious, and report the run budget so a reader can judge coverage.',
      '6. **Keep every result traceable to its variant.** Each ablation run must carry the config diff from the full model plus its own metrics and predictions, so the summary table is regenerable from artefacts rather than hand-assembled.',
    ],
    evidenceRequirements:
      'One recorded config diff per ablation run, a full-model reference under an identical protocol, and per-run metrics for both. A claim of the form that component X contributes requires the corresponding ablation row together with its variance.',
    expectedOutput: [
      'list of claimed contributions with their exact removal definition',
      'ablation matrix with the full model as reference',
      'interaction runs and capacity-matched controls',
      'per-run decision criteria declared before execution',
      'run budget with pruning rationale',
    ],
    prerequisites: [
      "method-plan | 消融要按方法的组件来拆分，否则归因不成立",
    ],
    sources: [
      { file: 'modules/experiment/design/prompts/experiment_design_prompt.py' },
      { file: 'modules/experiment/simulation/prompts/design_refinement_prompt.py' },
      { file: 'modules/experiment/design/prompts/experiment_design_refiner_prompt.py' },
      { file: 'modules/experiment/analysis/prompts/metric_analysis_prompt.py' },
      { file: 'modules/experiment/summary/prompts/summary_prompt.py' },
    ],
  },
  {
    id: 'reproducible-implementation-spec',
    category: 'experiment/reproducible-implementation-spec',
    name: 'Reproducible Implementation Specification',
    origin: 'experiment/method, experiment/dataset, experiment/analysis',
    purpose:
      'Turn a settled design into implementation requirements precise enough that an independent run reproduces the numbers: pinned environment, controlled randomness, deterministic data handling, complete configuration, and a fixed artefact layout.',
    whenToUse: [
      'The design is settled and code must be written by a person or a coding agent.',
      'Results exist but cannot be regenerated from the repository and its documentation.',
      'A baseline or component must be reimplemented faithfully rather than approximately.',
    ],
    method: [
      '1. **Freeze the environment.** Record language and runtime, framework and library versions or a lockfile, hardware assumptions, and external data or pretrained checkpoints with their identifiers. Latest version is not a specification.',
      '2. **Make randomness explicit and controlled.** Enumerate every stochastic source — shuffling, splitting, initialisation, dropout, sampling, augmentation, library defaults — and require one seed to control all of them, so a run is reproducible per seed and varied deliberately across seeds.',
      '3. **Specify deterministic data handling.** Load from pinned sources, preprocess deterministically, store split assignments instead of recomputing them differently each run, and ensure caching never silently changes the data.',
      '4. **Specify the training and evaluation contract.** Entry points, config schema, metric computation, checkpoint selection rule, and output layout: one run directory per method, config and seed, containing config, log, metrics and predictions. A rerun must not depend on mutable state left by earlier runs.',
      '5. **Require smoke tests and fail-loud behaviour.** A short subset run before the full run, assertions on data shapes, splits and metric ranges, and hard failure on missing data or diverging loss instead of silent fallback. Any simulated or fallback result must be flagged in the artefacts, never mixed with real runs.',
      '6. **Verify by re-execution, not by inspection.** Reproduction means a clean checkout plus the documented command regenerates the reported metrics within a stated tolerance. Record that comparison, including any deviation, as the reproducibility evidence.',
    ],
    evidenceRequirements:
      'Pinned dependency versions, exact commands, seeds, config files, checkpoint identifiers and per-run metric logs. The artefact layout must let a third party map every reported number to a run directory, and any rerun that fails to match must be reported with the observed difference rather than dropped.',
    expectedOutput: [
      'environment and lockfile specification with hardware assumptions',
      'seed and determinism policy covering every stochastic source',
      'deterministic data pipeline requirements',
      'run-directory layout, config schema, smoke-test and fail-loud requirements',
      're-execution comparison record with tolerances and deviations',
    ],
    prerequisites: [
      "method-plan | 复现规范锁定的是方法的实现",
    ],
    sources: [
      { file: 'modules/experiment/method/prompts/model_design_prompt.py' },
      { file: 'modules/experiment/method/prompts/training_code_prompt.py' },
      { file: 'modules/experiment/method/prompts/data_collection_prompt.py' },
      { file: 'modules/experiment/dataset/prompts/dataset_code_requirements_prompt.py' },
      { file: 'modules/experiment/dataset/prompts/dataset_code_prompt.py' },
      { file: 'modules/experiment/analysis/prompts/plot_code_prompt.py' },
    ],
  },
  {
    id: 'result-analysis',
    category: 'experiment/result-analysis',
    name: 'Result Analysis & Finding Extraction',
    origin: 'experiment/analysis, experiment/summary',
    purpose:
      'Turn raw run outputs into defensible findings: what the numbers say against the pre-declared thresholds, which figures the argument needs, and what the study cannot conclude.',
    whenToUse: [
      'Runs finished and metrics and predictions exist, but a narrative is still needed.',
      'Deciding which figures and tables the paper actually requires.',
      'Consolidating several sub-experiments into one coherent result set.',
    ],
    method: [
      '1. **Assemble results from artefacts.** Build the run table from run directories (config, seed, metrics, predictions) and reconcile it against the design: every planned run present, every reported number traceable. Missing or extra runs are findings in themselves.',
      '2. **Read results against the pre-declared thresholds.** Compare the primary metric with the declared success margin and the strongest baseline, and state the outcome as supported, not supported or inconclusive rather than narrating the best-looking number.',
      '3. **Separate stable findings from single-run observations.** A difference seen once, or only at the best epoch, is not a finding. For every finding state the evidence it rests on and its spread across seeds and settings.',
      '4. **Explain mechanism, not only ordering.** For each finding give the result that makes it plausible — ablation row, error pattern, training curve — and mark any explanation that is inference rather than measurement.',
      '5. **Choose figures from the argument.** One figure per claim: main comparison, contribution ablation, behavioural evidence. Specify data source, chart type and message, and drop figures that decorate without carrying an argument. Figure values must be generated from run artefacts, never retyped.',
      '6. **State limitations and negative results.** Enumerate what the evidence does not cover — settings, scales, failure modes — including runs that did not work. An honest limitation section is part of the result, not an afterthought.',
    ],
    evidenceRequirements:
      'Every reported number maps to a run directory and a metric computation, and every figure regenerates from artefacts. Findings must state the comparison and variance they rest on, inferred explanations must be labelled as inference, and no value may come from a pre-run simulation once real runs exist.',
    expectedOutput: [
      'reconciled results table by run and seed',
      'findings with the evidence and spread each rests on',
      'figure and table plan with data sources and captions',
      'limitations and negative results',
      'claim-support verdict per intended claim',
    ],
    prerequisites: [
      "experiments | 没有实验产物就没有可分析的结果",
    ],
    sources: [
      { file: 'modules/experiment/analysis/prompts/metric_analysis_prompt.py' },
      { file: 'modules/experiment/analysis/prompts/chart_planning_prompt.py' },
      { file: 'modules/experiment/summary/prompts/summary_prompt.py' },
    ],
  },
  {
    id: 'comparative-analysis',
    category: 'experiment/comparative-analysis',
    name: 'Comparative Analysis & Significance',
    origin: 'experiment/analysis, experiment/simulation, experiment/prompts (baseline builder)',
    purpose:
      'Decide whether observed differences between methods are real and meaningful — same protocol, quantified uncertainty, significance where the design supports it — instead of reading a ranking off a single table.',
    whenToUse: [
      'A results table exists and you must say which differences matter.',
      'The improvement over the strongest baseline is small relative to run-to-run variation.',
      'Some baseline numbers come from papers run under a different setting.',
    ],
    method: [
      '1. **Verify comparability before comparing.** Confirm every row used the same data version, splits, preprocessing, metric implementation and tuning budget. Rows that did not are marked not-directly-comparable and excluded from claims until reproduced.',
      '2. **Report uncertainty with every number.** Give per-seed values, a mean with standard deviation or confidence interval, and the number of runs. A bare mean cannot support a difference claim; prefer uncertainty on the difference over uncertainty on each method separately.',
      '3. **Test the difference where the design allows.** Use paired comparisons across seeds or splits, report effect size alongside the test statistic, correct for multiple comparisons when many pairs are tested, and use non-parametric tests when the sample is small or normality is doubtful. If the design cannot support a test, say so rather than quoting a number.',
      '4. **Check the robustness of the ranking.** Repeat under secondary metrics, across seeds, and on the hardest and easiest subsets. A ranking that flips under reasonable variation is reported as a tie, not a win.',
      '5. **Quantify practical significance.** Relate the delta to the meaningful range of the metric, the spread of the baseline and the added compute. A statistically real but negligible gain is described as such.',
      '6. **Attribute every comparison to its source.** For reproduced baselines cite the run directory; for cited numbers state the paper, its setting and the direction of any mismatch. Never mix reproduced and cited values in one column without labelling.',
    ],
    evidenceRequirements:
      'The per-run values behind every aggregate, the test used with its assumptions, the number of comparisons corrected for, and the run or paper source of each row. Comparison tables must separate reproduced from cited numbers and state the comparability of every row.',
    expectedOutput: [
      'comparability-checked comparison table with uncertainty',
      'significance and effect-size results with the test and corrections used',
      'robustness checks across metrics, seeds and subsets',
      'practical-significance statement relative to cost and metric range',
      'explicit list of rows excluded from comparison and why',
    ],
    prerequisites: [
      "experiments | 对比分析基于实验产物",
    ],
    sources: [
      { file: 'modules/experiment/prompts/baseline_builder_prompt.py' },
      { file: 'modules/experiment/analysis/prompts/metric_analysis_prompt.py' },
      { file: 'modules/experiment/simulation/prompts/design_refinement_prompt.py' },
      { file: 'modules/experiment/design/prompts/experiment_design_refiner_prompt.py' },
      { file: 'modules/experiment/summary/prompts/summary_prompt.py' },
    ],
  },
  {
    id: 'evidence-assessment',
    category: 'experiment/evidence-assessment',
    name: 'Evidence Assessment & Claim Traceability',
    origin: 'experiment/prompts (full-chain evaluator), experiment/summary, experiment/lab_offline',
    purpose:
      'Judge whether the experiment as executed actually produced the evidence its claims need, and locate the weakest link when it did not — the checkpoint before results become paper text.',
    whenToUse: [
      'The experiment pipeline has finished and claims are about to be written.',
      'A measured result departs from the pre-run prediction and needs scrutiny before it is trusted.',
      'A non-programmable or offline study has returned human-collected data that must be checked against the design.',
    ],
    method: [
      '1. **Restate each intended claim and the evidence it requires** — which run, which comparison, which threshold. A claim whose required evidence was never produced is marked unsupported regardless of how plausible it sounds.',
      '2. **Audit the chain for consistency.** Data, method and evaluation must line up: evaluation used the intended data version and splits and the intended metric, the model evaluated is the one the config describes, and every figure traces to a run. Locate the broken link instead of averaging over it.',
      '3. **Compare achieved against expected and investigate the gap.** Where measured results depart from the pre-run simulation or the literature, determine whether the cause is a real effect, a protocol deviation, a bug or a fallback to simulated data, and record which. A gap that cannot be explained blocks the claim.',
      '4. **Grade the evidence per claim** as strong, indicative, insufficient or contradictory, give the reason, and state the additional run that would move it up a grade.',
      '5. **Check offline and human-collected evidence against its protocol.** For non-programmable studies verify that the sample and population match the design, that instruments and procedure were followed, that ethical and data-handling requirements were met, and that raw data exists. Human-collected evidence with no raw record is not evidence.',
      '6. **Issue a verdict and a gate.** Recommend proceed, revise and rerun, or stop, naming the failed elements and the minimum change that would fix them. Never pass a claim on the strength of the surrounding narrative.',
    ],
    evidenceRequirements:
      'A traceable link from each claim to run artefacts and the metric computation, the code and data versions used, and an explicit record of deviations, fallbacks and excluded runs. Assessments must quote the artefact examined rather than a summary of it, and offline evidence must include the raw records and protocol compliance notes.',
    expectedOutput: [
      'claim-by-claim evidence audit against required evidence',
      'chain-consistency report identifying the broken link when present',
      'achieved-versus-expected gap analysis with causes',
      'evidence grade per claim and what would raise it',
      'offline protocol compliance check plus a proceed, revise or stop verdict with required fixes',
    ],
    prerequisites: [
      "experiments | 要评估证据是否支撑主张，先得有实验结果",
    ],
    sources: [
      { file: 'modules/experiment/prompts/full_chain_evaluator_prompt.py' },
      { file: 'modules/experiment/summary/prompts/summary_prompt.py' },
      { file: 'modules/experiment/lab_offline/prompts/offline_guidance_prompt.py' },
    ],
  },
]

export default { SKILLS }
