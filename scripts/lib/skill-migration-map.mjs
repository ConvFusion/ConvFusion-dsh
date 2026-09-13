/**
 * ConvFusion 2.0 — 旧模块提示词 → v2 Skill 的**迁移映射表**
 *
 * ## 这是什么
 *
 * 原 ConvFusion 的 8 个模块共 161 个提示词常量（`SYSTEM_PROMPT` 等）。
 * v2 不再有模块，科研能力按**能力**重新组织为 Skill（Stage 2 §26-I：
 * "不要简单做名称映射"）。本表就是那次重组的人工判断结果：
 *
 * ```text
 * 类别（Category）→ 能力（Skill）→ 逐字提示词（被保留为方法来源）
 * ```
 *
 * ## 为什么表在仓库里而不是读 ConvFusion-dev
 *
 * 迁移必须**可复现**且不依赖外部目录存在。因此映射表是本仓库的事实来源；
 * 生成器只在需要时从 ConvFusion-dev 取逐字正文，并写入 `method`。
 *
 * ## 字段
 *
 * - `id` / `category` / `name`：v2 Skill 的身份（category 用 v2 taxonomy 的规范 id）
 * - `purpose` / `whenToUse`：这个能力解决什么问题、何时该用（**人写，不是抄提示词**）
 * - `method`：研究方法正文（Markdown）
 * - `evidenceRequirements` / `expectedOutput`：证据要求与产出
 * - `sources`：逐字来源（ConvFusion-dev 相对路径 + 常量名），生成器据此取原文
 */

/** 类别（设置面板的一级分组，对应 v2 taxonomy 顶层大类）。 */
export const CATEGORY = {
  understanding: 'research-understanding',
  literature: 'literature',
  innovation: 'innovation',
  methodology: 'methodology',
  experiment: 'experiment',
  analysis: 'analysis',
  decision: 'research-decision',
  writing: 'academic-writing',
  management: 'research-management',
}

/**
 * Skill 定义表。
 *
 * `sources` 里的路径相对 ConvFusion-dev 根；`const` 缺省取文件里最长的字符串常量。
 */
export const SKILLS = [
  /* ══════════════════════════════════════════════════════════════════
   * Research Understanding
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: 'topic-understanding',
    category: 'research-understanding/topic-understanding',
    name: 'Topic Understanding',
    purpose:
      'Turn an unstructured input — a paper, repository, dataset, conversation, half-formed idea — into a precise statement of what is actually being researched: its source type, domain, and substantive content.',
    whenToUse: [
      'A new piece of material enters the project and you do not yet know how to treat it.',
      'The user describes an interest in vague terms and you must find the research inside it.',
      'You are about to search the literature but the question itself is still unclear.',
    ],
    method: [
      "1. **Classify the input\'s source type.** Paper, patent, code, dataset, conversation, experiment log, report, or other. Treatment differs: a dataset claim needs different support from a conversation claim. If ambiguous, say so rather than defaulting silently.",
      '2. **Identify the domain at the level a researcher would name it** (e.g. "Robotics (Embodied AI)", not "Computer Science"). The domain determines which literature is relevant and which baselines count.',
      '3. **Separate what the input states from what it implies.** List explicitly: stated problems, methods, results, limitations, claimed future work. Do not merge these into one summary — their differences are where research questions come from.',
      '4. **Extract research signals.** A signal is something that could become a research direction: an admitted limitation, a contradiction with another work, a missing evaluation dimension, an untested assumption.',
      '5. **Assemble a research seed** — domain + problem + signals — expressed so a later step can build a direction from it. If the material cannot support a seed, state what is missing.',
    ],
    evidenceRequirements:
      'Every claim about what the material says must be traceable to the material (section, figure, file path). Domain and source-type judgements should state their basis. Never let an agent-generated summary become the only record of a source.',
    expectedOutput: [
      'source type and domain, with the basis for each',
      'a problem / method / limitation / future-work breakdown that keeps them separate',
      'extracted research signals',
      'a research seed, or an explicit statement of what is missing to form one',
    ],
    sources: [
      { file: 'modules/initiation/trigger/prompts/detect_source_prompt.py' },
      { file: 'modules/initiation/trigger/prompts/extract_content_prompt.py' },
      { file: 'modules/initiation/trigger/prompts/extract_research_signals_prompt.py' },
      { file: 'modules/initiation/trigger/prompts/build_seed_prompt.py' },
    ],
  },
  {
    id: 'problem-definition',
    category: 'research-understanding/problem-definition',
    name: 'Problem Definition',
    origin: 'initiation/conversation, incubation',
    purpose:
      'Convert a research interest into a falsifiable research problem: a question whose answer would change what we do, and which could turn out to be false.',
    whenToUse: [
      'A domain and some signals exist, but no committable research question does.',
      'A direction is stated so broadly that any result could be claimed to support it.',
      'You need to decide whether two candidate directions are actually the same problem.',
    ],
    method: [
      '1. **State the problem as a question, not a topic.** "Geometry-conditioned adaptation" is a topic; "does conditioning the adapter on egocentric geometry change navigation performance when topology is held fixed?" is a problem.',
      '2. **Name the comparison.** Every research problem implies a baseline or a null. If you cannot name what the answer is compared against, the problem is not yet defined.',
      '3. **Specify the setting.** Dataset, model class, metric, deployment constraint — whatever the answer is conditional on. A problem that is true in every setting is usually not research.',
      '4. **State the falsification condition.** What observation would show the answer is "no"? If nothing could, the problem is unfalsifiable and should be rewritten.',
      '5. **Check separability.** If the problem bundles two independent questions, split it — bundled questions produce uninterpretable results.',
      '6. **Write the seed down**, with topic, question, setting and falsification condition, so planning can act on it.',
    ],
    evidenceRequirements:
      'The setting you specify should be justified: if you claim a dataset or metric is the standard one, that claim needs a literature basis. Falsification conditions must be concrete enough that someone else could check them.',
    expectedOutput: [
      'the research question, stated as a question',
      'the comparison / baseline it is against',
      'the setting it is conditional on',
      'the falsification condition',
      'a note on whether it needed splitting into sub-questions',
    ],
    sources: [
      { file: 'modules/initiation/conversation/prompts/clarify_goal_prompt.py' },
      { file: 'modules/initiation/conversation/prompts/analyze_interest_prompt.py' },
      { file: 'modules/initiation/conversation/prompts/analyze_pain_points_prompt.py' },
    ],
  },
  {
    id: 'research-intent-assessment',
    category: 'research-understanding/research-question',
    name: 'Research Intent Assessment',
    origin: 'initiation/gate',
    purpose:
      'Judge whether an input is a genuine research request, a direction suggestion, or ordinary dialogue — and decide how much research machinery it warrants.',
    whenToUse: [
      'It is unclear whether the user wants research work or just conversation.',
      'A message could be read as either a new research direction or a passing remark.',
      'You are about to spend significant effort and want to confirm the intent first.',
    ],
    method: [
      '1. **Read the input against the current research state.** A remark about a limitation is often a direction suggestion, not a request to run analysis.',
      '2. **Classify explicitly** into: dialogue (answer and continue), suggestion (offer candidate directions), or activation (commit to research work). Name the evidence for the classification.',
      '3. **Calibrate confidence honestly.** A confident misclassification costs more than an explicit "this is ambiguous, here are the two readings".',
      '4. **Check scientific-ness.** Not every request is answerable by research; say when it is an engineering or writing request instead.',
      '5. **Match effort to intent.** Do not start a full literature search for a passing question; do not answer a real research request with a paragraph of prose.',
    ],
    evidenceRequirements:
      'The classification should quote the specific part of the input that drove it. When intent is ambiguous, record both readings rather than silently choosing.',
    expectedOutput: [
      'the intent class, with confidence and the evidence for it',
      'whether the request is scientific at all',
      'what the next research action would be, if the intent is activation',
    ],
    sources: [{ file: 'modules/initiation/prompts/evaluate_intent_prompt.py' }],
  },
  {
    id: 'research-domain-profiling',
    category: 'research-understanding/context-analysis',
    name: 'Research Domain Profiling',
    origin: 'initiation/profile',
    purpose:
      "Infer a researcher's domains and their confidence from how they describe their own work, so that direction choice can be matched to real strengths.",
    whenToUse: [
      'Onboarding a new research project.',
      'The research context lacks a clear domain profile.',
      'Choosing between directions that demand different kinds of expertise.',
    ],
    method: [
      '1. **Read the description for demonstrated work, not claimed labels.** "I have published on calibration" outweighs "I am interested in robotics".',
      '2. **Assign per-domain confidence**, and say what raised or lowered it. A flat list of domains with equal weight is not a profile.',
      '3. **Describe the foundation**, not the job title: what methods the researcher can actually execute unaided.',
      '4. **Separate adjacent-domain competence from primary domain.** Adjacency determines which collaborations or literature transfers.',
      '5. **Record preferences that constrain direction choice** (risk appetite, theory vs systems, time budget, venue target).',
    ],
    evidenceRequirements:
      'Domain confidence should be tied to evidence in the description or in prior artefacts. Do not infer seniority from writing style.',
    expectedOutput: [
      'domains with per-domain confidence and the basis for it',
      'a foundation description (what can be executed unaided)',
      'adjacent competences',
      'preferences that should constrain direction choice',
    ],
    sources: [
      { file: 'modules/initiation/profile/prompts/domain_analysis_prompt.py' },
      { file: 'modules/initiation/profile/prompts/foundation_analysis_prompt.py' },
    ],
  },
  {
    id: 'research-foundation-assessment',
    category: 'research-understanding/context-analysis',
    name: 'Research Foundation Assessment',
    origin: 'initiation/profile',
    purpose:
      "Assess the methodological foundation behind a researcher's stated skills, distinguishing claimed skills from demonstrated ones.",
    whenToUse: [
      'Deciding how much scaffolding a research plan needs.',
      "Matching a direction to a researcher\'s real strengths.",
      'Reviewing an artefact (paper, code, report) to infer the level of method.',
    ],
    method: [
      '1. **Extract the concrete methods used in the artefact** (not the topic it is about).',
      '2. **Classify depth per method**: can use, can modify, can design from scratch. These are different capabilities.',
      '3. **Note dependencies the researcher does not control** — a method that requires unavailable infrastructure is not a strength for planning purposes.',
      '4. **Estimate the level of methodological rigour** visible in the artefact: baselines chosen, controls run, ablation logic.',
      '5. **Translate into planning implications**: which parts of a plan can be delegated and which need support.',
    ],
    evidenceRequirements:
      'Every capability claim must point at a specific artefact location (section, file, figure) that demonstrates it.',
    expectedOutput: [
      'methods with a depth classification each',
      'external dependencies that limit what can be assumed',
      'an assessment of methodological rigour with its basis',
      'planning implications',
    ],
    sources: [
      { file: 'modules/initiation/profile/prompts/profile_paper_analysis_prompt.py' },
      { file: 'modules/initiation/profile/prompts/foundation_analysis_prompt.py' },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════
   * Literature
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: 'literature-search',
    category: 'literature/literature-search',
    name: 'Literature Search',
    purpose:
      'Turn a research question into an executable retrieval strategy, and judge when the retrieved corpus is sufficient — rather than stopping at the first page of results.',
    whenToUse: [
      'You need literature coverage for a question that is not yet precise enough to search.',
      'A previous search returned results that look plausible but you cannot tell whether coverage is adequate.',
      'You are about to claim a gap and need to know the search was broad enough to support that claim.',
    ],
    method: [
      '0. **Execute the queries — do not recall papers from memory.** Call the `research_literature_search` tool (OpenAlex) to obtain an actual retrieved set. It returns structured records **and a `provenance` block** (query, source, retrieval time, de-identified request URL, total hits) — a literature finding recorded without that provenance is not traceable, so record it. `total` is the number of matches and `returned` is only this page: a coverage claim needs the query set, not one page. If the tool reports a failure (missing key, HTTP error, timeout), say so — never present an empty result as "nothing was found". Without an API key it still works through OpenAlex\'s public pool at lower rate limits; the key lives in Settings → ConvFusion → Retrieval source.',
      '1. **Rewrite the question into query terms.** Separate the concept terms from the setting terms (dataset, metric, domain). A query that mixes them returns either too much or too little.',
      '2. **Expand deliberately, then constrain.** Expand along method synonyms and adjacent terminology; constrain by the setting. Record which expansions produced usable results — that is what makes the search reproducible.',
      '3. **Assess coverage before curating.** For each sub-area the question implies, check whether it is represented in the retrieved set. Missing sub-areas mean the search is incomplete, not that the literature is thin.',
      '4. **Iterate on the gaps**, not on the volume. A second pass driven by "which facet is under-represented" is worth more than a broader first query.',
      '5. **Stop on saturation, and say so.** State the criterion you used (new queries stop adding new sub-areas) and record the queries that were run, so a later reviewer can re-run them.',
    ],
    evidenceRequirements:
      'Record the queries, the databases/sources, the retrieval dates and the filtering rules. A coverage claim without the query set is not checkable. Never present your own summary of what the literature says as the evidence — cite the works.',
    expectedOutput: [
      'the query set with the expansion rationale',
      'a coverage assessment per sub-area the question implies',
      'the saturation criterion and whether it was reached',
      'the retrieval provenance (sources, dates, filters)',
    ],
    origin: 'discovery/retrieval',
    sources: [
      { file: 'modules/discovery/retrieval/prompts/query_understanding_prompt.py' },
      { file: 'modules/discovery/retrieval/prompts/query_expansion_prompt.py' },
      { file: 'modules/discovery/retrieval/prompts/query_refinement_prompt.py' },
      { file: 'modules/discovery/retrieval/prompts/coverage_analysis_prompt.py' },
    ],
  },
  {
    id: 'literature-screening',
    category: 'literature/literature-screening',
    name: 'Literature Screening',
    purpose:
      'Decide which retrieved works actually belong in the corpus, using stated criteria rather than relevance impressions, so that later synthesis rests on a defensible set.',
    whenToUse: [
      'A retrieval pass returned more works than can be read or cited.',
      'You must justify why a work was included or excluded.',
      'Duplicate or near-duplicate works from different queries need resolving.',
    ],
    method: [
      '1. **Fix the inclusion criteria before screening** — venue tier, recency window, task/setting match, whether the work reports results at all. Criteria chosen after looking at the results are not criteria.',
      '2. **Score on separate axes** (quality, relevance, diversity) rather than one blended score. A highly relevant weak work and a weakly relevant strong work fail for different reasons.',
      '3. **Resolve duplicates at the work level**, not the record level: preprints, venue versions and extended versions are one contribution.',
      '4. **Verify before trusting.** If a work is load-bearing for a gap claim, check that it says what the abstract implies — abstracts overstate.',
      '5. **Record every exclusion with its reason.** The excluded set is what shows the screening was principled.',
    ],
    evidenceRequirements:
      'Each retained work needs its inclusion basis; each excluded work needs its exclusion reason. Any claim attributed to a work must be traceable to a specific location in it, not to its abstract.',
    expectedOutput: [
      'the inclusion/exclusion criteria, stated in advance',
      'per-work scores on the separate axes',
      'the retained corpus with the basis for each retention',
      'the exclusion log with reasons',
    ],
    origin: 'discovery/curation',
    sources: [
      { file: 'modules/discovery/curation/prompts/quality_assessment_prompt.py' },
      { file: 'modules/discovery/curation/prompts/relevance_assessment_prompt.py' },
      { file: 'modules/discovery/curation/prompts/diversity_assessment_prompt.py' },
      { file: 'modules/discovery/curation/prompts/core_paper_selection_prompt.py' },
      { file: 'modules/discovery/retrieval/prompts/paper_filter_prompt.py' },
    ],
  },
  {
    id: 'literature-review',
    category: 'literature/literature-review',
    name: 'Literature Review',
    purpose:
      'Build an evidence-backed understanding of a research area — tasks, problems, methods, evidence, contradictions — rather than a list of paper summaries.',
    whenToUse: [
      'You need to know what the field actually knows before proposing anything.',
      'A direction is being considered and its novelty depends on what already exists.',
      'You are assembling the related-work argument.',
    ],
    method: [
      '1. **Extract per paper on fixed dimensions** (problem, method, evidence, limitation) so that papers become comparable rather than merely summarised.',
      '2. **Group by mechanism, not by terminology.** Two papers with different names for the same idea are one method family.',
      '3. **Surface contradictions explicitly.** Where two works disagree, the disagreement is the most valuable output of the review.',
      "4. **Identify the dominant direction and why it dominates** — the field's consensus is the baseline any contribution is measured against.",
      '5. **Separate admitted limitations from inferred ones**, and keep the inference labelled as yours.',
    ],
    evidenceRequirements:
      'Every extracted claim must be traceable to a specific work and location. Contradictions must cite both sides. Do not generalise from a single paper to "the field".',
    expectedOutput: [
      'per-paper extraction on the fixed dimensions',
      'method families with their representative works',
      'explicit contradictions with both sides cited',
      'the dominant direction and the reason it dominates',
    ],
    origin: 'discovery/cognition',
    sources: [
      { file: 'modules/discovery/cognition/prompts/extract_problems_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/extract_methods_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/extract_evidence_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/method_cognition_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/evidence_cognition_prompt.py' },
    ],
  },
  {
    id: 'research-landscape',
    category: 'literature/research-landscape',
    name: 'Research Landscape',
    purpose:
      'Synthesise the reviewed literature into a landscape: what is settled, what is contested, what is moving — the picture a newcomer needs to place a contribution.',
    whenToUse: [
      'The reviewed corpus needs to become a navigable picture rather than a pile of extractions.',
      'You need to place a proposed contribution relative to the field.',
      'You are deciding which sub-area is worth entering.',
    ],
    method: [
      '1. **Map the sub-areas** and the works that define each. A landscape with undefined regions is a reading list, not a landscape.',
      '2. **Mark what is settled vs contested.** Settled results constrain the contribution; contested ones are where work is possible.',
      '3. **Track trends as direction of movement**, and say what evidence supports the trend — a trend asserted from one paper is a guess.',
      '4. **Identify challenges and their persistence.** A challenge that has survived several attempts is a different opportunity from a newly appeared one.',
      '5. **State the unexploited combinations** where two mature lines have not been combined, and why the combination is not trivial.',
    ],
    evidenceRequirements:
      'Sub-area boundaries and settled/contested labels must cite the works that justify them. Trend claims need multiple supporting works and a time basis.',
    expectedOutput: [
      'sub-areas with defining works',
      'settled vs contested results',
      'trends with their supporting evidence',
      'persistent challenges and unexploited combinations',
    ],
    origin: 'discovery/cognition, synthesis',
    sources: [
      { file: 'modules/discovery/cognition/prompts/understanding_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/landscape_cognition_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/trend_cognition_prompt.py' },
      { file: 'modules/discovery/cognition/prompts/challenge_cognition_prompt.py' },
      { file: 'modules/discovery/synthesis/prompts/knowledge_state_synthesis_prompt.py' },
    ],
  },

  {
    id: 'research-direction-steering',
    category: 'research-decision/research-direction',
    name: 'Research Direction Steering',
    purpose:
      "Guide a researcher from a vague interest toward concrete, researchable directions — without prescribing a workflow, and without pretending the first candidate is the answer.",
    whenToUse: [
      "The user expresses interest but no well-formed direction.",
      "Several candidate directions exist but none has been made precise.",
      "The user is choosing between directions and needs the trade-offs surfaced.",
    ],
    method: [
      "1. **Extract what actually interests the user** from how they describe the problem, not from the labels they use. Interest in 'robustness' may mean evaluation methodology rather than model design.",
      "2. **Expand into distinct directions**, each stated as something that could be researched. Directions that differ only in dataset or scale are the same direction.",
      "3. **Make each direction concrete enough to judge**: what would be built, what would be compared, what result would matter.",
      "4. **Surface the trade-offs** — novelty against feasibility, ceiling against variance — and let the user's stated preferences decide rather than an aggregate score.",
      "5. **Identify what would have to be true** for each direction to succeed, so the user can judge which assumptions they are willing to bet on.",
      "6. **Rank with reasoning retained.** A ranking whose reasoning is discarded cannot be revisited when the situation changes.",
    ],
    evidenceRequirements:
      "Novelty or feasibility claims about a direction need a basis (a gap in the literature, an available artefact). Do not assert that a direction is unexplored without saying what was searched.",
    expectedOutput: [
      "the user's actual interests, restated precisely",
      "candidate directions that are genuinely distinct",
      "per-direction what-would-be-built / what-would-be-compared / what-result-matters",
      "the trade-offs and the assumptions each direction bets on",
      "a ranking with its reasoning",
    ],
    origin: 'initiation/conversation, incubation',
    sources: [
      { file: 'modules/initiation/conversation/prompts/steering_prompt.py' },
      { file: 'modules/initiation/conversation/prompts/build_exploration_state_prompt.py' },
      { file: 'modules/initiation/incubation/prompts/expand_directions_prompt.py' },
      { file: 'modules/initiation/incubation/prompts/generate_topics_prompt.py' },
    ],
  },
  {
    id: 'research-topic-ranking',
    category: 'research-decision/research-direction',
    name: "Research Topic Ranking",
    purpose:
      "Rank candidate research topics on separated dimensions and state the reasoning, so that the choice can be revisited rather than re-argued.",
    whenToUse: [
      "Several candidate topics exist and one must be chosen.",
      "A topic is being questioned and it is unclear whether to continue or change.",
      "The user has stated preferences (risk, timeline, venue) that should constrain the choice.",
    ],
    method: [
      "1. **Enumerate all candidates first**, including weak ones — a candidate never written down cannot be compared.",
      "2. **Score on separated dimensions**: novelty, feasibility, expected impact, cost, risk. A single blended score hides exactly the trade-off the decision turns on.",
      "3. **Apply the user's preferences as constraints, not tie-breakers.** If low risk is prioritised, a high-ceiling high-variance topic fails regardless of ceiling — and say so.",
      "4. **Find the critical path** for each candidate: the single dependency that, if unavailable, kills it.",
      "5. **Prefer topics that survive their own failure** — a negative result that still informs beats a failure that yields nothing.",
      "6. **Record the ranking with its reasoning and the preferences that drove it**, so it can be reconsidered when assumptions change.",
    ],
    evidenceRequirements:
      "Feasibility claims should reference what makes them feasible. Risk claims should name the specific failure. Novelty claims should cite the gap analysis or literature that establishes them.",
    expectedOutput: [
      "all candidates, including rejected ones",
      "per-dimension scores rather than one aggregate",
      "critical path and fallback per leading candidate",
      "the ranking with the reasoning and driving preferences",
    ],
    origin: 'initiation/incubation',
    sources: [
      { file: 'modules/initiation/incubation/prompts/rank_topics_prompt.py' },
      { file: 'modules/initiation/incubation/prompts/identify_opportunities_prompt.py' },
    ],
  },

  {
    id: 'research-direction',
    category: 'research-decision/research-direction',
    name: 'Research Direction',
    purpose:
      'Move from a set of candidate directions to one committed direction, with the reasoning recorded so later decisions can be understood in their original context.',
    whenToUse: [
      'Several candidate directions exist and one must be chosen.',
      'A direction is being questioned and you must decide whether to continue or change.',
      'The user has given preferences (risk appetite, time budget, venue target) that should shape the choice.',
    ],
    method: [
      '1. **Enumerate the candidates explicitly** before evaluating any of them. Candidates never written down cannot be compared.',
      '2. **Evaluate on separated dimensions**: novelty, feasibility, expected impact, cost, risk. Score independently — a single overall score hides exactly the trade-off the decision turns on.',
      "3. **Apply the user's stated preferences as constraints, not tie-breakers.** If the user prioritises low risk, a high-ceiling high-variance direction fails regardless of its ceiling. Say so rather than letting the score quietly decide.",
      '4. **Identify the critical path** for each candidate: which single dependency, if unavailable, kills it. Prefer a direction whose critical path you can actually walk.',
      '5. **Look for the option that survives its own failure.** A direction whose negative result is still informative is usually better than one whose failure yields nothing.',
      '6. **Record the decision** with alternatives considered and the reason, naming the evidence and preferences that drove it.',
    ],
    reasoning: {
      focus: [
        'Whether the candidate is falsifiable within the available resources.',
        'What happens if the central hypothesis is wrong — is there a fallback result?',
        'Whether the direction depends on an external capability you do not control.',
        'Honest cost: not just compute, but time to obtain the data and baselines.',
      ],
      avoid: [
        'Letting a single aggregate score decide; report the per-dimension picture.',
        'Selecting the theoretically most elegant direction when its critical path is unavailable.',
        "Treating the user's preferences as soft suggestions to be overridden by a higher score.",
        'Leaving the rejected candidates unrecorded — they are the context for the decision.',
      ],
    },
    evidenceRequirements:
      'Feasibility claims should reference what makes them feasible (existing code, available data, prior results). Risk claims should name the specific thing that could fail. Novelty claims should cite the gap analysis or literature that establishes them.',
    expectedOutput: [
      'the candidate directions',
      'per-dimension evaluation for each, not a single score',
      'the critical path and fallback for the leading candidates',
      'the decision, alternatives considered, and the reason',
      'explicit note of which user preference drove the outcome',
    ],
    origin: 'initiation/incubation, decision',
    sources: [
      { file: 'modules/initiation/incubation/prompts/rank_topics_prompt.py' },
      { file: 'modules/decision/prompts/decision_synthesizer.py' },
    ],
  },
]

export default { CATEGORY, SKILLS }
