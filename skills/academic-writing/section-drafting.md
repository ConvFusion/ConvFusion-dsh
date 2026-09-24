---
name: Section Drafting from Evidence
category: academic-writing/section-drafting
type: system
status: active
version: 1.0
origin: paper/writing (title, abstract, intro, method, experiment, conclusion)
---

# Skill: Section Drafting from Evidence

## Purpose

Turn the research state into complete section prose that respects each section's function, length budget and citation contract, with every quantitative statement traceable to a result.

## When to Use

Use this skill when:

- The outline and narrative exist and a specific section must now be produced as prose.
- A section note, method sketch or results table must become publishable text.
- A section is outside its length budget or repeats another section.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments/simulation-result | 起草前要有真实实验结果，或有仿真结果（草稿可基于仿真先行）
```

## Research Method

1. **Fix the section contract first**: the reader question it answers, the evidence it may use, its length budget, and whether citations are allowed — the abstract and conclusion introduce no new citations, the introduction and related work are citation-dense.
2. **Title and abstract are compression, not summary.** The title names the method and the problem in 10-15 words; the abstract states problem, method, one quantitative result and its significance, defines acronyms at first use, and carries no citations.
3. **The introduction follows the narrative arc and commits early**: state the problem quickly, place the gap within the first paragraphs, introduce the method before the contributions, then close with the contributions and a short paper-organisation paragraph that matches the real outline.
4. **Method explains why before what.** Describe the architecture, then each component, then the formulation and design rationale; every design choice needs a justification and enough implementation detail to reproduce it. Keep simple symbols inline in the prose and whole formulas as named equation placeholders — never emit raw display math.
5. **Experiments report claim, number, interpretation.** Give a reproducible setup (data, metrics, hardware, hyperparameters), compare fairly against baselines, explain why the method wins rather than only by how much, and include an ablation that isolates each component.
6. **The conclusion answers the question the introduction posed**, restates what was demonstrated, and gives concrete next steps; it introduces no new result and no new analysis.
7. **Self-check before emitting**: length inside budget, every citation key present in the curated corpus, no number that contradicts the result artefacts, and no paragraph that duplicates another section.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every quantitative statement must trace to a result artefact (table, figure, run log) and every citation to a curated work. Claims about design choices must trace to a decision actually taken or an experiment actually run. Numbers in the abstract must appear in the body with the same value. Anything the section needed but the research state lacked is reported as a gap rather than filled in.

## Expected Output

Produce:

- section prose at the target length, depth and paragraph granularity
- inline citations on exact curated cite_keys, at logically correct locations
- equation placeholders and figure cross-references for the apparatus step
- a note of any evidence the section required but the research state did not contain

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/writing/prompts/title_prompt.py` — CONF_SYSTEM_PROMPT

```text
Generate a concise and informative title for an EI conference paper.

Requirements:
- Be specific and informative
- Include key method and problem
- 10-15 words maximum
- Use technical terms appropriately
- Avoid vague phrases
- Return JSON format: {{"title": "Your title here"}}

Content:
Problem: {problem}
Method: {method_name}
Method Overview: {method_overview}
Key Results: {results}

Return JSON only, no extra text.

CRITICAL: Output ONLY valid JSON. Do NOT add any text before or after the JSON object.
```

### `modules/paper/writing/prompts/abstract_prompt.py` — IEEE_SYSTEM_PROMPT

```text
Write an IEEE Transactions abstract.

Example valid output:
{{
  "abstract": "<your abstract section text here>"
}}

Structure (must follow this exact order):
1. Problem: What problem are we solving?
2. Method: What is our proposed solution?
3. Results: What did we achieve (quantitative)?
4. Significance: Why does this matter?

Length:
- 180-250 words (strict)
- Approximately 5-7 sentences

Rules:
- No vague claims or empty statements
- Include at least one numerical result (e.g., "improves accuracy by 5.2%")
- Be specific about the methodology
- Clearly state the contribution
- Follow IEEE abstract format
- No citations or references
- No acronyms without definition on first use

Tone:
- Formal and concise
- IEEE Transactions style
- Technical and precise

Content:
Problem: {problem}
Method: {method_name} with {method_overview}
Key results: {results}
Significance: {motivation}
```

### `modules/paper/writing/prompts/intro_prompt.py` — IEEE_SYSTEM_PROMPT

```text
You are writing the Introduction section for an IEEE Transactions paper.

Content:
Problem: {problem}
Motivation: {motivation}
Research Gap: {gap}
Method Overview: {method_overview}

Academic Storyline (use this as the narrative backbone):
{academic_storyline}

Papers to Cite (cite these papers at appropriate locations in the introduction):
{cited_papers_info}

Paper Outline (overall structure of the paper):
{paper_outline_info}

Example valid output:
{{
  "intro": "<your intro section text here>"
}}

Citation Requirements (CRITICAL):
- Cite papers using [cite_key] format (e.g., "as demonstrated by [pickering2013integrated]" or "prior work [nakov2012improving, zampieri2017findings]")
- Use the exact cite_key provided for each paper in the cited_papers list
- Cite at least 5-8 papers from the list above
- Each citation must appear at a logically correct location
- Spread citations across the introduction: 1-2 in opening, 2-3 in motivation/gap, 2-3 in method context
- Do NOT cite papers that are not in the provided list

Narrative Requirements (VERY IMPORTANT):
- Follow the academic storyline provided above as the narrative backbone
- Build a strong storyline following this structure:
  1. Broad background and importance (real-world impact) — with citations
  2. Existing approaches and their limitations — with citations
  3. Identify a clear research gap (logical contradiction or missing capability) — with citations
  4. Introduce our solution as a necessity (not just an option)
  5. Summarize contributions as specific technical achievements

- The writing must feel like a logical argument, not a list of facts.
- Use transition sentences between paragraphs to maintain flow.
- Avoid repetitive phrasing and generic statements.

PAPER ORGANIZATION PARAGRAPH (CRITICAL — MUST BE THE LAST PARAGRAPH):
After the contributions paragraph, add a dedicated "Paper Organization" paragraph. This is the final paragraph of the introduction.

In this paragraph, describe the structure of the paper by referencing the paper outline above. Follow these conventions:
- Write sentences like: "The rest of this paper is organized as follows." or "This paper is structured as follows."
- Summarize what each section (after Introduction) covers. Use the paper outline above to ensure you reference the actual section structure.
- For each subsequent section: describe its purpose and content in 1-2 sentences. Do NOT enumerate with bullet points — write in full prose.
- Style example: "Section II reviews related work and discusses the limitations of existing approaches. Section III presents the proposed method in detail. Section IV reports experimental results and analysis. Section V concludes this paper."
- IMPORTANT: Use "Section II", "Section III" (roman numerals) for section references if the paper follows IEEE format. Alternatively use "Section 2", "Section 3" if the outline uses Arabic numerals.

Length Requirements:
- Target length: 1200-1800 words
- Minimum paragraphs: 8-12 paragraphs
- Each paragraph: 120-180 words

Writing Rules:
- Use full paragraphs (no bullet points)
- Start each paragraph with a clear topic sentence
- End with effective transitions to the next paragraph

Contributions Requirements:
- List 3-5 precise and technical contributions
- Each contribution must be specific and verifiable
- Align contributions with the experimental validation

Tone:
- Formal, persuasive, IEEE Transactions style
- Technical and precise
- Confident but not overclaiming

Narrative Flow:
1. Opening paragraphs: Establish broad context and importance with citations
2. Problem Definition paragraphs: Narrow down to specific challenge with citations
3. Existing Work & Limitations paragraphs: Review relevant approaches with citations
4. Research Gap paragraphs: Clearly articulate what is missing with citations
5. Our Approach paragraphs: Present solution as necessary
6. Contributions paragraphs: Summarize key contributions
7. Paper Organization paragraph (LAST): Describe paper structure referencing the paper outline above
```

### `modules/paper/writing/prompts/method_prompt.py` — IEEE_SYSTEM_PROMPT

```text
You are writing the Method section for an IEEE Transactions paper.

Method Name: {method_name}
Overview: {method_overview}
Steps: {method_steps}
Design Choices: {design_choices}

{supported_equations}

Example valid output:
{{
  "method": "<your method section text here>"
}}

Narrative Flow (organize paragraphs in this order, do not use headings):
1. Overview of the framework (architecture-level description)
2. Detailed module descriptions (each module gets its own set of paragraphs)
3. Mathematical formulation (refer to equations using <<EQ:eq-name>> placeholders)
4. Design rationale and motivations
5. Implementation details (optional but recommended)

Length Requirements:
- Target length: 2000-3000 words
- Minimum paragraphs: 12-18 paragraphs
- Each paragraph: 120-180 words

Key Requirements:
- Each module must be explained clearly with sufficient technical depth
- Explain WHY each design choice is made (not just WHAT is done)
- Use precise technical language with proper terminology
- Avoid vague terms like "improve performance" or "better results"
- Provide justification for all architectural decisions
- Include sufficient implementation details for reproducibility

CRITICAL — Equation Reference Rule:
- Full formulas (loss functions, attention computation, complex expressions): use <<EQ:eq-name>> placeholder
  For example: "The attention mechanism <<EQ:eq-attention>> computes weighted representations"
- Simple inline mathematical notation (variable names with subscripts/superscripts like $d_k$, $Q_i$, $x^2$): wrap in $...$ inline math mode
  This ensures proper LaTeX rendering of subscripts and superscripts
- Plain text identifiers without mathematical meaning: write naturally without underscores
  For example: write "layer count" or "input dimension" instead of "layer_count" or "input_dim"
- Each equation placeholder should be a UNIQUE name describing the equation (e.g., <<EQ:eq-attention>>, <<EQ:eq-loss>>, <<EQ:eq-agg>>)
- BEFORE the equation placeholder, briefly describe the equation in words
- AFTER the equation placeholder, explain its significance or components
- NEVER write display math ($$...$$) directly — use <<EQ:>> placeholders for full equations

MANDATORY — Formula Requirements for IEEE Method Section:
- The method MUST include at least 5-8 mathematical formulas using <<EQ:eq-name>> placeholders
- Key components that MUST have formulas for IEEE Transactions:
  1. **Core computation modules** (e.g., attention mechanisms, convolution operations, message passing)
  2. **Loss functions** (primary loss, regularization terms, auxiliary losses)
  3. **Optimization procedures** (e.g., gradient updates, weight decay formulas)
  4. **Normalization and activation functions** (e.g., layer norm, softmax, GELU)
  5. **Aggregation mechanisms** (e.g., pooling operations, weighted sums, concatenation)
  6. **Complexity analysis formulas** (time/space complexity, parameter counts)
- For each formula placeholder in IEEE papers, provide:
  1. Clear mathematical formulation with proper LaTeX notation
  2. Definition of all variables, parameters, and their dimensions
  3. Theoretical justification connecting to design choices
  4. Explanation of computational and memory implications
- Example formula structure for IEEE:
  "The multi-head attention mechanism computes attention scores for each head $h \\in \\{{1,\\dots,H\\}}$ using <<EQ:eq-multihead-attention>>, where $\\mathbf{{Q}}_h = \\mathbf{{X}}\\mathbf{{W}}_h^Q$, $\\mathbf{{K}}_h = \\mathbf{{X}}\\mathbf{{W}}_h^K$, and $\\mathbf{{V}}_h = \\mathbf{{X}}\\mathbf{{W}}_h^V$ are the query, key, and value projections for head $h$, and $d_k$ is the dimension of the key vectors."

Optional:
- Include pseudo-formal descriptions or algorithmic pseudocode
- Add architectural diagrams descriptions if helpful
- Provide complexity analysis (time/space complexity)

Tone:
- Technical and precise
- Academic and formal
- IEEE Transactions style
```

### `modules/paper/writing/prompts/experiment_prompt.py` — IEEE_SYSTEM_PROMPT

```text
You are writing the Experiments section for an IEEE Transactions paper.

Datasets: {datasets}
Metrics: {metrics}
Results: {results}
Baselines: {baselines}

Figures: {figures}

{supported_equations}

Example valid output:
{{
  "experiment": "<your experiment section text here>"
}}

Narrative Flow (organize paragraphs in this order, do not use headings):
1. Experimental Setup (1-2 paragraphs)
2. Comparison with Baselines (3-4 paragraphs)
3. Ablation Study (2-3 paragraphs)
4. Analysis and Discussion (3-4 paragraphs)

Length Requirements:
- Target length: 1500-2500 words
- Minimum paragraphs: 10-15 paragraphs
- Each paragraph: 120-180 words

Critical Requirements:
- Do NOT only report numbers - explain what they mean
- Analyze trends and provide reasons for observed patterns
- Highlight key improvements and their significance
- Compare fairly with baselines (don't cherry-pick)
- Provide interpretation of why the method works
- Identify limitations if any (honest and constructive)
- Include figure references using \\ref{{fig:figure_name}} syntax
- Place figures at appropriate locations in the text

Experimental Setup:
- Dataset details (size, statistics, preprocessing)
- Evaluation metrics (definition and rationale)
- Implementation details (hardware, software, hyperparameters)
- Training procedure (optimization, regularization, etc.)

Comparison with Baselines:
- Present results systematically (tables or descriptions)
- Compare across different datasets and metrics
- Highlight statistical significance
- Explain why our method outperforms baselines

Ablation Study:
- Test individual components of the method
- Analyze contribution of each module
- Validate design choices
- Show what happens when components are removed

Analysis and Discussion:
- Interpret results beyond just numbers
- Discuss strengths and weaknesses
- Analyze failure cases
- Suggest future work directions

Tone:
- Objective and analytical
- IEEE Transactions style
- Technical and precise

CRITICAL — Equation Reference Rule:
- Full formulas (loss function, metric definition, aggregation): use <<EQ:eq-name>> placeholder
  For example: "The contrastive loss <<EQ:eq-contrastive>> is used for training"
- Simple inline mathematical notation (variable names with subscripts/superscripts like $d_k$, $F_1$, $Q_i$): wrap in $...$ inline math mode
  This ensures proper LaTeX rendering of subscripts and superscripts
- Plain text identifiers without mathematical meaning: write naturally without underscores
  For example: write "accuracy score" or "F1 score" instead of "F1_score"
- Each equation placeholder should be a UNIQUE name (e.g., <<EQ:eq-loss>>, <<EQ:eq-metric>>, <<EQ:eq-accuracy>>)
- BEFORE the equation placeholder, briefly describe the equation in words
- AFTER the equation placeholder, explain its significance
- NEVER write display math ($$...$$) directly — use <<EQ:>> placeholders for full equations
```

### `modules/paper/writing/prompts/conclusion_prompt.py` — IEEE_SYSTEM_PROMPT

```text
Write the Conclusion section for an IEEE Transactions paper.

Content:
- Summary of the work
- Key contributions: {contributions}
- Main results: {results}
- Method: {method_name}

Example valid output:
{{
  "conclusion": "<your conclusion section text here>"
}}

Length Requirements:
- 300-500 words
- 3-4 paragraphs

Narrative Flow (organize paragraphs in this order, do not use headings):
1. Summary of the work and key findings (1-2 paragraphs)
2. Contributions and their significance (1 paragraph)
3. Limitations and future work directions (1 paragraph)

Requirements:
- Synthesize the main achievements
- Connect back to the problem statement in Introduction
- Provide substantive future work directions
- Avoid generic statements

Tone:
- Formal and scholarly
- Technical and precise
- IEEE Transactions style
- Forward-looking but grounded

Rules:
- Do NOT introduce new results
- Do NOT add new analysis
- Be specific about future directions
```
