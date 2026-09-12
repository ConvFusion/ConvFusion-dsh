---
name: Literature Search
category: literature/literature-search
type: system
status: active
version: 1.0
origin: discovery/retrieval
---

# Skill: Literature Search

## Purpose

Turn a research question into an executable retrieval strategy, and judge when the retrieved corpus is sufficient — rather than stopping at the first page of results.

## When to Use

Use this skill when:

- You need literature coverage for a question that is not yet precise enough to search.
- A previous search returned results that look plausible but you cannot tell whether coverage is adequate.
- You are about to claim a gap and need to know the search was broad enough to support that claim.

## Research Method

0. **Execute the queries — do not recall papers from memory.** Call the `research_literature_search` tool (OpenAlex) to obtain an actual retrieved set. It returns structured records **and a `provenance` block** (query, source, retrieval time, de-identified request URL, total hits) — a literature finding recorded without that provenance is not traceable, so record it. `total` is the number of matches and `returned` is only this page: a coverage claim needs the query set, not one page. If the tool reports a failure (missing key, HTTP error, timeout), say so — never present an empty result as "nothing was found". Without an API key it still works through OpenAlex's public pool at lower rate limits; the key lives in Settings → ConvFusion → Retrieval source.
1. **Rewrite the question into query terms.** Separate the concept terms from the setting terms (dataset, metric, domain). A query that mixes them returns either too much or too little.
2. **Expand deliberately, then constrain.** Expand along method synonyms and adjacent terminology; constrain by the setting. Record which expansions produced usable results — that is what makes the search reproducible.
3. **Assess coverage before curating.** For each sub-area the question implies, check whether it is represented in the retrieved set. Missing sub-areas mean the search is incomplete, not that the literature is thin.
4. **Iterate on the gaps**, not on the volume. A second pass driven by "which facet is under-represented" is worth more than a broader first query.
5. **Stop on saturation, and say so.** State the criterion you used (new queries stop adding new sub-areas) and record the queries that were run, so a later reviewer can re-run them.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Record the queries, the databases/sources, the retrieval dates and the filtering rules. A coverage claim without the query set is not checkable. Never present your own summary of what the literature says as the evidence — cite the works.

## Expected Output

Produce:

- the query set with the expansion rationale
- a coverage assessment per sub-area the question implies
- the saturation criterion and whether it was reached
- the retrieval provenance (sources, dates, filters)

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/discovery/retrieval/prompts/query_understanding_prompt.py` — TEMPLATE_ITERATIVE

```text
You are a research query analyst specializing in academic concept extraction.

Research Topic: {research_topic}

This is retrieval round {iteration_num}. Previous rounds already found {num_used_queries} queries.

## Previously Used Queries (AVOID these)
{used_queries_list}

## Task
Analyze the research topic from a FRESH perspective and extract:
1. Core search queries (2-3 concise academic search queries) — must be DIFFERENT from the previously used queries above
2. Core keywords (5-8 key terms) — can overlap with prior keywords but prioritize new angles
3. Structured core concepts, categorized into:
   - problem: research problems being addressed
   - method: technical methods/approaches used
   - data: data/datasets/noise types involved
   - evaluation: evaluation methods/metrics/benchmarks used
   - setting: experimental settings/conditions

Focus on under-explored angles, alternative methodologies, or different sub-domains
that were not covered by previous retrieval rounds.

All extracted concepts must be real academic terms that exist in research papers.

Output JSON:
{{
    "initial_queries": ["query 1", "query 2", "query 3"],
    "core_keywords": ["keyword 1", "keyword 2", "..."],
    "core_concepts": {{
        "problem": ["problem 1", "problem 2", "..."],
        "method": ["method 1", "method 2", "..."],
        "data": ["data 1", "data 2", "..."],
        "evaluation": ["evaluation 1", "evaluation 2", "..."],
        "setting": ["setting 1", "setting 2", "..."]
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/retrieval/prompts/query_expansion_prompt.py` — TEMPLATE_ITERATIVE

```text
You are an academic search query expert specializing in OpenAlex boolean query composition.

Research Topic: {research_topic}
Core Keywords: {core_keywords}
Structured Core Concepts: {core_concepts}

This is retrieval round {iteration_num}.

## Previously Used Queries (DO NOT repeat these or generate similar ones)
{used_queries_list}

Task 1: Expand each core concept into related academic terms that:
- Are real, commonly used terms in the research field
- Are synonyms, subclasses, or closely related terms of the original concept
- Appear frequently in academic papers
- Each term MUST be at most 3 words — longer phrases fail to match papers
- Prioritize terms that were NOT used in previous retrieval rounds

Task 2: Generate 2 focused boolean search queries for OpenAlex that:
- Use OpenAlex boolean syntax: AND, OR, NOT, parentheses, phrase quotes ("")
- Each query targets a DISTINCT research angle from previous rounds
- Queries are concise (at most 2-3 concept groups)
- Use OR to group synonyms/related terms of the same concept
- Use AND to combine different concept categories
- QUALITY over quantity: produce only 2 queries
- MUST be different from ALL previously used queries listed above
- Each individual search term MUST be at most 3 words

Example boolean queries (note: each quoted term is ≤3 words):
- ("sparse coding" OR "dictionary learning") AND (denoising OR "noise reduction")
- ("deep learning" AND "image segmentation") AND (transformer OR CNN)

Output JSON:
{{
    "expanded_queries": [
        "boolean query 1",
        "boolean query 2"
    ],
    "expanded_concepts": {{
        "original_concept_1": ["expanded_term_1", "expanded_term_2", "..."],
        "original_concept_2": ["expanded_term_1", "expanded_term_2", "..."],
        "...": "..."
    }}
}}

IMPORTANT:
- Each individual search term must be ≤3 words (e.g. "image segmentation" OK, "deep learning for medical image segmentation" NOT OK)
- Generate EXACTLY 2 boolean queries, not more
- All expanded terms must be real academic terms
- Queries must use proper OpenAlex boolean syntax
- Use phrase quotes ("") for multi-word terms
- CRITICAL: Your queries must explore NEW angles not covered by previous rounds
- Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/retrieval/prompts/query_refinement_prompt.py` — TEMPLATE

```text
You are an academic search query composition specialist for OpenAlex.

Research Topic: {research_topic}
Coverage Gaps: {coverage_state}
Expanded Concepts: {expanded_concepts}

Generate high-quality boolean search queries that fill the coverage gaps using the expanded concepts.

OpenAlex boolean query rules:
- Use AND to combine different concept categories
- Use OR to group synonyms/related terms of the same concept
- Use phrase quotes ("") for multi-word terms
- Use parentheses for grouping
- Each query should combine 2-4 concept groups (not individual terms)
- Keep queries concise and focused
- Generate 2-3 refined queries total, each targeting a specific gap

Example boolean queries:
- ("sparse representation" OR "sparse coding" OR "dictionary learning") AND (denoising OR "noise reduction")
- ("deep learning" AND "image segmentation") AND (transformer OR CNN)
- ("cross-modal" OR multimodal) AND ("sparse representation" AND "noise robust")

Output JSON:
{{
    "refined_queries": ["boolean query 1", "boolean query 2", "boolean query 3", "..."],
    "query_rationale": {{
        "query_1": "Combines [method concept] AND [data concept] AND [evaluation concept] to address gap X",
        "...": "..."
    }},
    "refinement_strategy": "Overall strategy for boolean query composition and gap filling"
}}

IMPORTANT:
- Strictly follow OpenAlex boolean syntax
- 2-4 concept groups per query (each group is an OR of synonyms)
- Use OR within each concept group, AND between concept groups
- Use phrase quotes for multi-word terms
- Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/retrieval/prompts/coverage_analysis_prompt.py` — TEMPLATE

```text
You are a search coverage analyst.

Research Topic: {research_topic}
Retrieval Round: {iteration_num}

## Retrieval Statistics
Total Papers: {total_papers}
Year Distribution: {year_distribution}
Top Venues: {top_venues}

## High-Frequency Keywords
{top_keywords}

## Task
Based on the above statistics, analyze what aspects of the research topic
are NOT adequately covered by the current paper collection:
1. Missing sub-topics or research domains
2. Missing key keywords or terminology (compare to high-frequency keywords)
3. Missing paradigms, frameworks, or methodological approaches
4. Missing time periods (check year distribution)

Output JSON:
{{
    "coverage_state": {{
        "coverage_score": 0-100,
        "missing_domains": ["domain 1", "domain 2", "..."],
        "missing_keywords": ["keyword 1", "keyword 2", "..."],
        "missing_paradigms": ["paradigm 1", "paradigm 2", "..."],
        "missing_years": ["year range 1", "..."],
        "summary": "brief summary of coverage status"
    }}
}}

IMPORTANT:
- coverage_score: 0-100 (higher = better coverage)
- If all aspects are well-covered, return empty arrays and a high score
- Base your analysis on the statistics above, NOT on memory of the field
- Be honest — if coverage is poor, give a low score and detailed gaps
- Output ONLY raw JSON. No markdown blocks.
```
