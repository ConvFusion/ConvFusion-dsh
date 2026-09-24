/**
 * 迁移映射表（分段）：paper
 *
 * 由模块负责人填写；`gen-skill-library.mjs` 会把所有分段合并后生成 Skill Library。
 * 字段说明见 `skill-migration-map.mjs` 顶部。
 *
 * ## 本分段的判断依据（Paper 模块，61 个提示词常量）
 *
 * 旧 Paper 模块的提示词是**按章节**切分的：8 个章节各一份「写这一节」的提示词，
 * 外加 storyline / quality_check / reference / polishing / latex / figure / venue。
 * 按章节切分不是**能力**切分——"写 Method" 和 "写 Abstract" 是同一种能力的两个实例。
 * 因此本表把 8 个章节 writer 合并为一个能力，把 storyline + contribution + related_work
 * 合并为"论证与定位"，把 latex + reference 合并为"提交格式化与编译修复"。
 *
 * **未**列入任何 Skill 的：各 `prompts/common_prompt.py`（LANGUAGE_MANDATE /
 * OUTPUT_RULE_BASE / CITATION_RULE / LENGTH_RULE / TONE_BASE）是跨章节共享的样板，
 * 不是能力；`paper_module_prompt.py` / `paper_dialogue_prompt.py` 是模块级与进度播报
 * 文本，同样不是能力。
 *
 * 分类学里没有用到的叶子：`academic-writing/response-to-reviewers` —— 旧 Paper 模块
 * 不存在任何审稿意见回复提示词（只有内部 quality_check 迭代），凭空造一个 Skill 会
 * 违反"sources 必须是真实提示词文件"的约束。
 */

export const SKILLS = [
  {
    id: 'paper-architecture',
    category: 'academic-writing/paper-architecture',
    name: 'Paper Architecture',
    origin: 'paper/writing (outline, chapter_writer)',
    purpose:
      'Decide the section skeleton, the scope and length budget of each section, and the order in which sections are written — before any prose exists, so that sections cannot overlap or drift in length.',
    whenToUse: [
      'Starting a manuscript, or re-targeting an existing one from a conference template to an IEEE Transactions template.',
      'Section drafts exist but their scopes overlap, or the manuscript is under or over the page limit.',
      'You are about to write sections and need to know which evidence each one is allowed to use.',
    ],
    method: [
      '1. **Fix the venue template before the skeleton.** A 4-6 page EI conference paper merges sections and stays terse; an 8-12 page IEEE Transactions paper expects subsections and depth. Choose the template first — it determines the section count, not the reverse.',
      '2. **Write the outline as one line per section, each naming the question it answers and the artefact it draws on** (problem statement, method, results table, literature corpus). A section that cannot name its evidence is not ready to be planned.',
      '3. **Assign an explicit length budget per section** and keep a running total against the page or word limit. Record the budget numerically, because every later length check is measured against it.',
      '4. **Decide which sections split into subsections and which merge** (method: architecture, components, formulation; experiments: setup, comparison, ablation, analysis), and state the reason next to the decision.',
      '5. **Fix the writing order and the carry-forward rule.** Write in an order that satisfies dependencies, and pass already-written text forward so terminology, claims and citation keys stay consistent instead of being re-invented per section.',
      '6. **Audit the outline for duplication and omission** before drafting: two sections covering the same claim, or a claim from the narrative that no section owns, mean the skeleton is wrong.',
    ],
    evidenceRequirements:
      'The outline must be derived from the actual research state — problem, method and experiment artefacts — not from a generic template; each section line must name the artefact it will use. Section budgets must be recorded as numbers so compliance can be checked rather than argued.',
    expectedOutput: [
      "the section skeleton with each section's question, scope and word budget",
      'the subsection map, with each merge or split decision and its reason',
      'the writing order plus the cross-section context that must be carried forward',
      'an outline audit listing duplicated claims and claims no section covers',
    ],
    prerequisites: [
      "experiments/simulation-result | 架构要有可组织的结果（真实或仿真）",
    ],
    sources: [
      { file: 'modules/paper/writing/prompts/outline_prompt.py' },
      { file: 'modules/paper/writing/prompts/chapter_writer_prompt.py' },
    ],
  },
  {
    id: 'research-narrative',
    category: 'academic-writing/research-narrative',
    name: 'Research Narrative and Positioning',
    origin: 'paper/narrative (storyline, quality_check), paper/writing (contribution, related_work)',
    purpose:
      'Build the single argument the paper makes — problem, prior limitations, gap, insight, solution — and bind every cited work and every claimed contribution to a specific role in that argument.',
    whenToUse: [
      'Results exist but no defensible statement of novelty has been written yet.',
      'The list of contributions reads as a list of activities rather than as verifiable claims.',
      'Related work reads as a paper-by-paper summary, or the gap is asserted without support.',
      'A storyline draft exists and you need to know which part of it is weak before writing sections from it.',
    ],
    method: [
      '1. **State the arc as five linked claims**: problem context, what existing approaches do and cannot do, the specific gap, the insight that closes it, and the solution that follows. If a link needs more than one sentence, it is not yet an argument.',
      '2. **Use the gap to choose the literature, not the reverse.** Work backwards from the gap to the works that establish it, and drop works that only decorate the narrative.',
      '3. **Assign every citation a role** — establishes context, identifies the problem, shows a limitation, motivates the approach, supplies a baseline, supports a claim, establishes theory, or provides a benchmark — plus the place in the text where it is used. A citation with no role is removed.',
      '4. **Convert contributions into verifiable claims.** Each one must name what is new, what it is compared against, and which experiment or ablation demonstrates it. Drop anything that cannot be checked.',
      '5. **Write related work thematically, by mechanism family, not chronologically.** Synthesise several works per paragraph, state what the family cannot do, and reserve the closing paragraph for why existing methods do not solve the stated problem.',
      '6. **Score the narrative on explicit criteria** (arc completeness, logical coherence, citation coverage, specificity) and iterate on the lowest-scoring criterion rather than on the passages that already read well.',
      '7. **Re-check that the gap claim survives the corpus.** If a cited work already closes the gap, the contribution must be re-positioned, not re-worded.',
    ],
    evidenceRequirements:
      'Every limitation attributed to prior work must cite the specific work and the location that supports it; the gap must rest on more than one work. Every contribution must map to a concrete experiment, ablation or analysis artefact. Citation keys must exist in the curated corpus — none may be invented. Contradictions between cited works are reported, not smoothed over.',
    expectedOutput: [
      'the narrative arc as five explicitly linked claims',
      'a citation table mapping cite_key to narrative role and to the location where it is used',
      'three to five verifiable contributions, each tied to the evidence that demonstrates it',
      'a thematically organised related-work draft ending in an explicit positioning statement',
      'a scored quality assessment naming the weakest criterion and the planned fix',
    ],
    prerequisites: [
      "experiments/simulation-result | 叙事要有可讲述的结果（真实或仿真）",
    ],
    sources: [
      { file: 'modules/paper/narrative/prompts/storyline_prompt.py' },
      { file: 'modules/paper/narrative/prompts/quality_check_prompt.py' },
      { file: 'modules/paper/writing/prompts/contribution_prompt.py' },
      { file: 'modules/paper/writing/prompts/related_work_prompt.py' },
    ],
  },
  {
    id: 'section-drafting',
    category: 'academic-writing/section-drafting',
    name: 'Section Drafting from Evidence',
    origin: 'paper/writing (title, abstract, intro, method, experiment, conclusion)',
    purpose:
      "Turn the research state into complete section prose that respects each section's function, length budget and citation contract, with every quantitative statement traceable to a result.",
    whenToUse: [
      'The outline and narrative exist and a specific section must now be produced as prose.',
      'A section note, method sketch or results table must become publishable text.',
      'A section is outside its length budget or repeats another section.',
    ],
    method: [
      '1. **Fix the section contract first**: the reader question it answers, the evidence it may use, its length budget, and whether citations are allowed — the abstract and conclusion introduce no new citations, the introduction and related work are citation-dense.',
      '2. **Title and abstract are compression, not summary.** The title names the method and the problem in 10-15 words; the abstract states problem, method, one quantitative result and its significance, defines acronyms at first use, and carries no citations.',
      '3. **The introduction follows the narrative arc and commits early**: state the problem quickly, place the gap within the first paragraphs, introduce the method before the contributions, then close with the contributions and a short paper-organisation paragraph that matches the real outline.',
      '4. **Method explains why before what.** Describe the architecture, then each component, then the formulation and design rationale; every design choice needs a justification and enough implementation detail to reproduce it. Keep simple symbols inline in the prose and whole formulas as named equation placeholders — never emit raw display math.',
      '5. **Experiments report claim, number, interpretation.** Give a reproducible setup (data, metrics, hardware, hyperparameters), compare fairly against baselines, explain why the method wins rather than only by how much, and include an ablation that isolates each component.',
      '6. **The conclusion answers the question the introduction posed**, restates what was demonstrated, and gives concrete next steps; it introduces no new result and no new analysis.',
      '7. **Self-check before emitting**: length inside budget, every citation key present in the curated corpus, no number that contradicts the result artefacts, and no paragraph that duplicates another section.',
    ],
    evidenceRequirements:
      'Every quantitative statement must trace to a result artefact (table, figure, run log) and every citation to a curated work. Claims about design choices must trace to a decision actually taken or an experiment actually run. Numbers in the abstract must appear in the body with the same value. Anything the section needed but the research state lacked is reported as a gap rather than filled in.',
    expectedOutput: [
      'section prose at the target length, depth and paragraph granularity',
      'inline citations on exact curated cite_keys, at logically correct locations',
      'equation placeholders and figure cross-references for the apparatus step',
      'a note of any evidence the section required but the research state did not contain',
    ],
    prerequisites: [
      "experiments/simulation-result | 起草前要有真实实验结果，或有仿真结果（草稿可基于仿真先行）",
    ],
    sources: [
      { file: 'modules/paper/writing/prompts/title_prompt.py' },
      { file: 'modules/paper/writing/prompts/abstract_prompt.py' },
      { file: 'modules/paper/writing/prompts/intro_prompt.py' },
      { file: 'modules/paper/writing/prompts/method_prompt.py' },
      { file: 'modules/paper/writing/prompts/experiment_prompt.py' },
      { file: 'modules/paper/writing/prompts/conclusion_prompt.py' },
    ],
  },
  {
    id: 'manuscript-revision',
    category: 'academic-writing/manuscript-revision',
    name: 'Manuscript Revision and Style',
    origin: 'paper/polishing (chapter_polisher, style)',
    purpose:
      'Raise a complete draft to a consistent, formal academic register without changing a single claim, number, citation or placeholder — and keep the change set auditable.',
    whenToUse: [
      'All sections are drafted and the prose quality is uneven across them.',
      'Terminology, notation or metric names drift between sections, tables and captions.',
      'A self-check or reviewer report lists clarity problems while the scientific content is settled.',
    ],
    method: [
      '1. **Revise in a fixed order: terminology and notation, then paragraph-level flow, then sentence register.** Fixing sentences before the term set is settled means doing the work twice.',
      '2. **Standardise the term set first** — method name, dataset names, metric names, symbols — and apply the chosen form everywhere, including tables and figure captions.',
      '3. **Rewrite for flow with explicit connectives**, replacing implicit jumps between sentences with contrast, consequence or addition, and giving each paragraph one topic sentence.',
      '4. **Strip generated-text artefacts** such as "Firstly, Secondly, Thirdly", "In conclusion", empty intensifiers and rhetorical triplets, and replace informal phrasing with the formal equivalent.',
      '5. **Protect the invariants.** Numbers, metrics, citation keys, equation placeholders and figure or table labels must survive unchanged; a polishing pass that alters one of them is a defect, not an edit.',
      '6. **Constrain length to roughly ten percent of the original** and re-measure after each pass, so revision never silently expands or truncates the paper.',
      '7. **Record the diff** — what changed and why — and flag any place where clarity would have required a content decision instead of deciding it unilaterally.',
    ],
    evidenceRequirements:
      'Revision must preserve meaning: every number, metric, citation key, equation placeholder and cross-reference label stays unchanged, and the revision record shows what was altered. When a sentence cannot be made clear without changing its claim, the claim returns to the narrative step rather than being quietly rewritten.',
    expectedOutput: [
      'polished section text with the technical content intact',
      'the list of terminology and notation standardisations applied',
      'the list of places where clarity would have required a content decision',
      'the measured length change per section',
    ],
    prerequisites: [
      "manuscript | 修订的对象是已有正文",
    ],
    sources: [
      { file: 'modules/paper/polishing/prompts/chapter_polisher_prompt.py' },
      { file: 'modules/paper/polishing/prompts/style_prompt.py' },
    ],
  },
  {
    id: 'equation-formalization',
    category: 'academic-writing/equation-formalization',
    name: 'Equation Formalization',
    origin: 'paper/writing (equation), paper/equation (equation)',
    purpose:
      'Convert prose descriptions of mathematics into a typed, uniquely labelled equation set that renders deterministically and stays consistent with the notation used in the surrounding text.',
    whenToUse: [
      'The method describes computations in words but the paper needs numbered equations.',
      'The same quantity is written several different ways across sections.',
      'Equations must be referenced by number, or rendered from a deterministic template rather than as free-form LaTeX.',
    ],
    method: [
      '1. **Inventory the mathematics the method actually performs**: core computation, objective or loss, optimisation or update rule, normalisation or activation, aggregation, and any complexity statement. Each is a candidate equation — do not invent ones the text does not describe.',
      '2. **Map each candidate to the closest standard equation type**, using a custom type only when nothing fits, so standard structures render deterministically instead of being re-typed.',
      '3. **Give every equation a unique id and a unique label** of the form eq:name, and keep them stable once the text references them.',
      '4. **Declare the variables** — symbol, meaning, dimension — taking definitions from the method text rather than inventing them.',
      '5. **Emit structured objects, never raw display math.** Simple symbols stay inline in the prose; whole formulas become named placeholders that the renderer resolves.',
      '6. **Cross-check in both directions**: every placeholder used in the text exists in the equation set, and every equation in the set is referenced from the text at least once.',
      '7. **Verify naming consistency** so a symbol means the same thing in every section and in every figure caption.',
    ],
    evidenceRequirements:
      'Each equation must be traceable to the sentence of the method text that describes it, and variable definitions must come from the method or the notation list. Custom LaTeX may use only standard commands and must not introduce notation the surrounding text does not define.',
    expectedOutput: [
      'the equation set: id, type, description, variables, label and section for each entry',
      'a mapping from each prose sentence to the equation it produced',
      'the inline-versus-placeholder decision for each symbol',
      'a consistency report between the equation set and the text',
    ],
    prerequisites: [
      "method-plan | 公式来自方法设计",
    ],
    sources: [
      { file: 'modules/paper/writing/prompts/equation_prompt.py' },
      { file: 'modules/paper/equation/prompts/equation_prompt.py' },
    ],
  },
  {
    id: 'visual-evidence-selection',
    category: 'academic-writing/visual-evidence-selection',
    name: 'Visual Evidence Selection',
    origin: 'paper/artifacts (figure_selector)',
    purpose:
      'Choose which figures belong in the paper so that each one carries information the tables and prose do not, and so the figure count stays within the venue limit.',
    whenToUse: [
      'More candidate figures were collected than the paper can hold.',
      'A candidate figure repeats the comparison a table already makes.',
      'A result is argued in the text but never visualised.',
    ],
    method: [
      '1. **Read the experiments section first** to learn which figures the argument already refers to and which narrative the text emphasises.',
      '2. **Inventory the tables and what they already show.** A table carrying the main quantitative comparison removes the need for a figure of the same numbers.',
      '3. **Prefer the different angle**: training curves, qualitative or case-study examples, ablations the table only summarises, or a method overview the text describes but never draws.',
      '4. **Rank the survivors by how much of the argument they support** and cut to the venue limit, ordered most important first.',
      '5. **Record every rejected candidate with its reason** so the selection can be defended, and list the results that still lack a visual.',
      '6. **Check each selected figure against its caption**: the caption states what the reader should conclude, not merely what the axes are.',
    ],
    evidenceRequirements:
      'Selected items must be identifiers that exist in the collected candidate set — none may be invented. Each selected figure must be tied to a claim in the text and must not duplicate information a table already carries. Rejected candidates and the reason for rejection are recorded.',
    expectedOutput: [
      'the ordered list of selected figure ids, most important first',
      'the rejected candidates with the reason for each rejection',
      'a caption outline stating the intended conclusion for every selected figure',
      'the list of results that remain unvisualised',
    ],
    prerequisites: [
      "experiments/simulation-result | 选图表要先有结果",
    ],
    sources: [{ file: 'modules/paper/artifacts/prompts/figure_selector_prompt.py' }],
  },
  {
    id: 'submission-compile-and-format',
    category: 'academic-writing/submission-compile-and-format',
    name: 'Submission Formatting and Compile Repair',
    origin: 'paper/latex (latex_validator, latex_llm_fixer), paper/narrative (reference)',
    purpose:
      'Turn the revised text into a venue-conformant manuscript that compiles: correct LaTeX, escaped special characters, a reference list built from real metadata, and no leftover markup artefacts.',
    whenToUse: [
      'The manuscript must leave Markdown and become a compilable LaTeX document (every paper does, eventually).',
      'The manuscript fails to compile, or the compile log reports errors that must be addressed.',
      'The text still contains Markdown artefacts such as heading hashes, emphasis markers or raw underscores.',
      'References are missing, are placeholders, or use "Anonymous" as an author.',
    ],
    method: [
      '0. **Drive the `research_paper_latex` tool — do not hand-write LaTeX.** The manuscript stays Markdown (`papers/<paperId>/paper.md`) and is converted, never re-typed:\n   - `action: "compose"` — turns `paper.md` into `papers/<paperId>/latex/main.tex` (+ `main_intermediate.tex`, which keeps raw `[cite_key]` placeholders so you can read what the converter saw). Markdown headings, inline emphasis and stray `%` are handled here; an existing `main.tex` is backed up first. Pick the template at this step: `conference` (IEEEtran, default) or `journal` (IEEEtran journal option).\n   - `action: "compile"` — runs Tectonic and produces `main.pdf`; returns `{ success, errors }`.\n   - `action: "repair"` — deterministic, LLM-free repair of `main.tex` from the last compile log (escapes stray `%`, fixes double-subscript and math-mode errors). Run it before spending your own effort.\n   - `action: "errors"` — structured errors with line numbers **and the surrounding code**, which is what you need to fix what `repair` could not. Then `compile` again.\n   - `action: "validate"` — advisory list of unrecognised commands/environments; it is not a gate and a nonzero list is not a failure.\n   - `action: "status"` — what is currently in `latex/`.\n   The loop is: `compose` → `compile` → if it fails, `repair` → `compile` → if it still fails, read `errors` and **edit `main.tex` yourself** → `compile`. Stop when `compile` returns `success: true`; do not loop indefinitely.',
      '1. **Separate syntax repair from content.** Every fix in this skill is syntactic; if a correction would change a claim, a number or a citation, stop and route it back to the writing skill.',
      '2. **Fix encoding and escaping first**, because they cascade: escape reserved characters, convert Markdown emphasis and headings into the corresponding LaTeX environments and commands, and replace Unicode math symbols with their commands.',
      '3. **Balance environments and structure** so every begin has an end, required packages are declared, and no empty environment remains.',
      '4. **Repair errors in bounded batches grouped by cause, not by symptom.** When many errors share one cause, fix a representative, recompile and re-read the log rather than patching every occurrence blindly; if the log cannot be parsed, treat the raw log as the error context instead of guessing.',
      '5. **Build the reference list from real metadata.** Format entries in the venue style, order them by citation number, and omit a missing field rather than filling it with a placeholder — never emit "Anonymous" or fabricated page ranges. Note what the converter does and does not do: it rewrites `[key]`, `[key1, key2]` and `[12]`-style citations into `\\cite{...}` from the `## References` section, but **author–year prose citations like `(Smith et al., 2024)` are left as plain text** — they need a real `.bib`/`\\citep` pass or a rewrite in the manuscript.',
      '6. **Re-verify after each pass**: the document compiles, the reference list contains exactly the cited keys, and the diff contains no change to scientific content.',
    ],
    evidenceRequirements:
      'Every reference entry must be constructed from actual captured metadata (authors, title, venue, year, pages); missing fields are omitted, never invented. Compile fixes stay syntactic — the change set must not alter a claim, number, citation key or placeholder. The end state must be a document that compiles.',
    expectedOutput: [
      'a corrected, compiling LaTeX document or a bounded set of patches',
      'a venue-style reference list built from real metadata',
      'the compile errors grouped by category, with anything unresolved listed',
      'confirmation that no scientific content changed during formatting',
    ],
    extraSections: [
      {
        title: 'Known Limits of the Converter',
        body: [
          '- **Markdown tables are passed through as plain text** (pipes and all); they must be turned into `table`/`tabular` LaTeX separately. This matches the legacy pipeline, where tables arrived pre-rendered as artifacts.',
          '- **Inline emphasis is converted** (`**x**` → `\\textbf{x}`, `*x*` → `\\textit{x}`) while math regions are protected, but an *unpaired* `*` (e.g. a footnote dagger like `f*`) is intentionally left alone.',
          '- Abstract comes from `## Abstract`; the title from the `#` heading; `## References` feeds `\\bibitem`. Everything else becomes a `\\section`.',
          "- Tectonic needs a writable cache; the tool points it inside the paper's `latex/` directory, so the first compile may download packages.",
        ].join('\n'),
      },
    ],
    prerequisites: [
      "manuscript | 先有正文才谈得上编译成稿",
    ],
    sources: [
      { file: 'modules/paper/latex/prompts/latex_validator_prompt.py' },
      { file: 'modules/paper/latex/prompts/latex_llm_fixer_prompt.py' },
      { file: 'modules/paper/narrative/prompts/reference_prompt.py' },
    ],
  },
  {
    id: 'venue-fit-decision',
    category: 'academic-writing/venue-fit-decision',
    name: 'Venue Fit Decision',
    origin: 'paper/venue (paper_decision)',
    purpose:
      'Decide whether the assembled evidence supports a full-length journal submission or only a focused conference paper, and commit to the template and effort that follow from that decision.',
    whenToUse: [
      'Before fixing the section skeleton, because the venue choice determines it.',
      'A project sits between conference and journal ambition and a choice must be made.',
      'Experiments are complete but weaker than hoped, and the submission target must be re-decided.',
    ],
    method: [
      '1. **Audit the evidence before judging the idea**: count datasets, baselines and ablations, and check whether improvements exceed run-to-run variation. Novelty does not compensate for thin validation.',
      '2. **Score the criteria separately** — novelty, technical depth, experimental completeness, result significance, paper completeness — instead of collapsing them into one impression.',
      '3. **Apply the venue bar as a rule**: a journal submission normally needs several datasets, a large baseline set, ablations, comprehensive results and a non-incremental method; a focused conference paper needs one or two datasets, a few baselines and solid validation.',
      '4. **Default downwards when uncertain.** An over-claimed submission costs a review cycle; an under-claimed one can be upgraded later.',
      '5. **Convert the shortfall into a plan**: if the answer is conference, list exactly which additional experiments would justify a journal version and what each would cost.',
      '6. **Emit a typed decision** with confidence, reasoning, the template it implies, and the actions that would change it.',
    ],
    evidenceRequirements:
      'The decision must cite the concrete experiment inventory — datasets, baselines, ablations, effect sizes — rather than the method description. Confidence must be reported, and must be low when ablations are missing or a single dataset was used. Suggested upgrades must name the evidence each would require.',
    expectedOutput: [
      'the decision (journal or conference) with confidence and reasoning grounded in the evidence inventory',
      'the template type the decision implies',
      'concrete upgrade actions, each with the evidence it would require',
      'the named evidence gaps that drove the decision',
    ],
    prerequisites: [
      "experiments/simulation-result | 投稿形态按已有结果（真实或仿真）的证据厚度定",
    ],
    sources: [{ file: 'modules/paper/venue/prompts/paper_decision_prompt.py' }],
  },
]

export default { SKILLS }
