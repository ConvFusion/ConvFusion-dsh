---
name: Literature Screening
category: literature/literature-screening
type: system
status: active
version: 1.0
origin: discovery/curation
---

# Skill: Literature Screening

## Purpose

Decide which retrieved works actually belong in the corpus, using stated criteria rather than relevance impressions, so that later synthesis rests on a defensible set.

## When to Use

Use this skill when:

- A retrieval pass returned more works than can be read or cited.
- You must justify why a work was included or excluded.
- Duplicate or near-duplicate works from different queries need resolving.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 先有检索并记录下的文献证据才能筛
```

## Research Method

1. **Fix the inclusion criteria before screening** — venue tier, recency window, task/setting match, whether the work reports results at all. Criteria chosen after looking at the results are not criteria.
2. **Score on separate axes** (quality, relevance, diversity) rather than one blended score. A highly relevant weak work and a weakly relevant strong work fail for different reasons.
3. **Resolve duplicates at the work level**, not the record level: preprints, venue versions and extended versions are one contribution.
4. **Verify before trusting.** If a work is load-bearing for a gap claim, check that it says what the abstract implies — abstracts overstate.
5. **Record every exclusion with its reason.** The excluded set is what shows the screening was principled.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Each retained work needs its inclusion basis; each excluded work needs its exclusion reason. Any claim attributed to a work must be traceable to a specific location in it, not to its abstract.

## Expected Output

Produce:

- the inclusion/exclusion criteria, stated in advance
- per-work scores on the separate axes
- the retained corpus with the basis for each retention
- the exclusion log with reasons

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/discovery/curation/prompts/quality_assessment_prompt.py` — TEMPLATE

```text
You are a scientific paper curator.

Research Topic: {research_topic}

Evaluate the following papers for quality assessment.
Output raw JSON only, no markdown blocks.

Output format:
{{
    "_batch_quality_scores": {{
        "scores": [
            {{
                "paper_index": 1,
                "quality_score": 0.0-1.0,
                "rationale": "brief quality rationale"
            }}
        ],
        "average_quality": 0.0
    }}
}}

Papers:
{papers_str}
```

### `modules/discovery/curation/prompts/relevance_assessment_prompt.py` — TEMPLATE

```text
You are a scientific paper curator.

Research Topic: {research_topic}

Evaluate each paper's relevance to the research topic.

Papers:
{papers_str}

Output JSON:
{{
    "_batch_relevance_scores": [
        {{
            "paper_index": 1,
            "score": 0-5,
            "rationale": "brief reason"
        }}
    ]
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/curation/prompts/diversity_assessment_prompt.py` — TEMPLATE

```text
You are a Scientific Literature Selection System.

Your goal is to construct a minimal, high-density scientific knowledge structure.

====================================================
[KEY SHIFT]
====================================================

You must prioritize:

    scientific value > structural completeness > classification correctness

====================================================
[NARRATIVE-CONSTRAINED PAPER SELECTION]
====================================================

You are not selecting papers based only on relevance.

You are selecting papers based on their ability to support a scientific narrative structure.

Each paper must be evaluated for its narrative utility.

====================================================
[THREE NARRATIVE ROLES]
====================================================

Each paper must be assigned ONE primary narrative role:

1. BACKGROUND ROLE
- Explains why the research area exists
- Provides global motivation or system context
- Used in introduction paragraph 1
- **Review/Survey papers can ONLY be assigned to this role**

2. DOMAIN ROLE
- Defines the specific problem space
- Establishes task setting, benchmarks, and formulation
- Used in introduction paragraph 2

3. CORE ROLE
- Explains limitations, gaps, and failure cases of existing methods
- Provides justification for new research direction
- Used for problem motivation

====================================================
[SELECTION RULE]
====================================================

A paper must NOT be selected only because it is relevant.

It must be selected ONLY if it contributes to at least one narrative role.

If a paper does not improve the narrative structure:
→ it MUST be removed

====================================================
[CRITICAL RULE 1: YOU MUST DROP GOOD BUT UNIMPORTANT PAPERS]
====================================================

Even if a paper is:
- relevant
- transferable
- or in-domain

If it does NOT improve the scientific structure OR narrative:
→ YOU MUST REMOVE IT

====================================================
[CRITICAL RULE 2: STRUCTURE IS MAX LIMIT]
====================================================

Allowed maximum structure:

- background: 3-8
- domain: 8-15
- core: 5-10

If selection is smaller:
→ DO NOT expand artificially
→ BUT DO NOT leave any narrative role unsupported

====================================================
[CRITICAL RULE 3: SCIENTIFIC CONTRIBUTION IS KING]
====================================================

Papers that receive high scores MUST:
- Define a new research problem OR
- Propose a canonical method OR
- Establish a widely-used benchmark OR
- Make a foundational theoretical contribution OR
- Support a key narrative role

NOT:
- Simply apply existing methods
- Simply survey existing work without insight
- Simply describe a toolkit

====================================================
[CRITICAL RULE 4: REVIEW/SURVEY PAPER LIMIT]
====================================================

Review papers and survey papers (papers whose primary contribution is
summarizing existing work rather than proposing new methods or findings)
are subject to strict limits:

- Maximum 3 review/survey papers in total across ALL roles
- Review/survey papers can ONLY be assigned to the BACKGROUND ROLE
- They must NOT be assigned to DOMAIN or CORE roles
- If more than 3 review/survey papers exist, keep only the 3 most
  comprehensive, authoritative, and recent ones
- Prefer original research papers over review/survey papers whenever
  an original paper can serve the same narrative purpose

====================================================
[CRITICAL RULE 5: HANDLE INCOMPLETE METADATA]
====================================================

Some papers in the list may have incomplete metadata (missing abstract,
authors, or keywords). This is common for papers retrieved from graph storage.

When evaluating such papers:
- Judge relevance primarily by TITLE and VENUE first
- If the title suggests any relevance to the research topic, KEEP the paper
  even if its abstract is empty
- Do NOT exclude a paper solely because its abstract or author list is missing
- Use available information (title, year, venue, citation count) to make the
  best possible judgment
- A paper with a relevant title but no abstract is PREFERABLE over excluding it

====================================================
[ANALYSIS TASK]
====================================================

Research Topic: {research_topic}

Please analyze the diversity of the following paper list:

{papers_str}

Analysis dimensions:
1. Methodological diversity (CNN, Transformer, Diffusion, Physics-based, Frequency-based, GAN, etc.)
2. Research perspective diversity (theoretical, empirical, application-driven)
3. Dataset diversity
4. Application scenario diversity
5. Narrative role coverage (background, domain, core/gap)

Key principles:
- Avoid keeping 10 papers with nearly identical methods
- Preserve at least one representative from each method family ONLY if it improves scientific structure AND narrative
- Keep benchmark papers that define evaluation standards ONLY if truly foundational AND narrative-relevant
- Retain foundational works even if older ONLY if they define the field AND support a narrative role
- Remove toolkit/infrastructure papers (R, Python, SciPy, Fiji, etc.)
- REMOVE papers that are "good" but NOT "essential" to the narrative or structure

Please identify which papers belong to similar method families and suggest which papers to keep for maintaining scientific density AND narrative completeness.

**CRITICAL: Even if you believe some papers are not fully relevant, you MUST still keep at least 50% of the provided papers. Never output an empty _batch_filtered_papers list. If you are unsure, keep all papers and mark them as "background" narrative role.**

Use the standard output format below:

IMPORTANT: Output MUST be in ENGLISH only.

Output format:
{{
    "clusters": [
        {{
            "method_family": "method family name",
            "papers": [paper_index_list],
            "recommended_to_keep": [recommended_paper_indices],
            "reason": "why keep these papers (focus on scientific value AND narrative utility)",
            "narrative_role": "background/domain/core - which role does this paper serve?"
        }}
    ],
    "_batch_diversity_score": 0.0-1.0,
    "narrative_coverage_score": 0.0-1.0,
    "curation_meta": {{
        "source": "paper_curator",
        "input_count": {total_paper_count},
        "output_count": 0,
        "_batch_diversity_score": 0.0-1.0,
        "narrative_coverage_score": 0.0-1.0
    }},
    "toolkit_papers_to_remove": [paper_indices_to_remove],
    "weak_scientific_signal_papers_to_remove": [paper_indices_that_are_good_but_not_essential_to_narrative],
    "narrative_gaps": ["description of any narrative roles that are not sufficiently covered"],
    "_batch_filtered_papers": [
        {{
            "index": paper_index,
            "title": "paper title",
            "narrative_role": "background/domain/core",
            "keep_reason": "why this paper is kept"
        }}
    ]
}}
```

### `modules/discovery/curation/prompts/core_paper_selection_prompt.py` — TEMPLATE

```text
You are a Scientific Reading List Generator.

Your role is NOT to do top-k ranking.

You are selecting:

    scientific representatives of the research space

====================================================
[NARRATIVE-CONSTRAINED PAPER SELECTION]
====================================================

You are not selecting papers based only on relevance.

You are selecting papers based on their ability to support a scientific narrative structure.

Each paper must be evaluated for its narrative utility.

====================================================
[KEY SHIFT: YOU ARE NOT SELECTING TOP-K]
====================================================

You are NOT selecting papers with highest scores.

You are selecting papers that:
- represent a concept
- represent a method family
- or represent a canonical benchmark role

If a paper does NOT represent one of these:
→ it must NOT be included in core

====================================================
[CORE PAPERS DEFINITION]
====================================================

Core papers are BOTH:
- The most important papers (concept-defining, method-paradigm, foundational benchmarks)
- AND the set of most relevant SOTA baseline methods used for comparison

====================================================
[STRUCTURAL LIMIT]
====================================================

Core papers should be:
- small in number
- highly task-specific
- tightly aligned with evaluation setting

====================================================
[CATEGORY DEFINITIONS]
====================================================

1. **Must-Read Papers (CORE)** (8-12):
- Papers that DEFINE the research problem space OR are CURRENT SOTA BASELINE METHODS
- Should include concept-defining papers, method-paradigm papers, AND SOTA baseline methods

2. **Foundational Papers (BACKGROUND)** (5-10):
- Classic works that LAID the research foundation
- Papers that SHAPED the field

3. **Recent SOTA Papers (SOTA)** (2-5):
- Current state-of-the-art to beat (last 2-3 years)
- Must represent distinct method families

4. **Benchmark Papers** (10-20):
- Papers that DEFINE important benchmarks or datasets
- Representative baselines for experimental comparison

5. **Trend/Emerging Papers** (3-6):
- Very recent (last 1-2 years) representing NEW directions
- Helps position the research as timely

6. **Contrasting Method Papers** (3-8):
- Papers using DISTINCT method families
- Supports discussion and analysis of methodological trade-offs

====================================================
[CURRENT SELECTION STATUS]
====================================================

{selection_status_str}

====================================================
[SELECTION TASK]
====================================================

Research Topic: {research_topic}

Please select scientific representatives from the following list:

{papers_str}

Research Landscape:
{landscape_str}

Trends:
{trends_str}

Research Gaps:
{gaps_str}

REMEMBER:
- You are NOT selecting top-K
- You are selecting scientific representatives AND experimental baselines
- MUST maintain a complete structure: background + domain + core all exist
- Target total reference count: ~40+ for journal papers, ~20+ for conference papers
- Review/Survey papers (papers whose primary contribution is summarizing existing work)
  can ONLY be placed in Foundational Papers (BACKGROUND), maximum 3 in total
- Prefer original research papers over review/survey papers whenever possible

IMPORTANT: Output MUST be in ENGLISH only.

Output format:
{{
    "core_papers": [1, 3, 7],
    "foundational_papers": [2, 4, 15],
    "sota_papers": [5, 8, 9, 10, 11],
    "benchmark_papers": [6, 12],
    "trend_papers": [13, 14],
    "contrasting_method_papers": [3, 8, 11],
    "selection_reason": "selection reason summary"
}}

Output the PAPER NUMBERS (1-based) from the numbered list above for each category.
Do NOT output paper data — output only the numbers.
Papers with no matches for a category should be an empty array [].
```

### `modules/discovery/retrieval/prompts/paper_filter_prompt.py` — SYSTEM_PROMPT

```text
You are an academic paper filtering system. Based on the given paper statistics summary and core keywords, output JSON-formatted filtering rules.

You must output a JSON object with the filtering rules in the `_filter_rules` field (do not include Markdown code block markers). Format:

{{
    "_filter_rules": {{
        "year_citation_rules": [
            // Define minimum citation thresholds by year range; can use (min_year, min_citations) pairs
            // Missing year ranges are linearly interpolated from adjacent rules
        ],
        "max_survey_ratio": 0.10,
        // Maximum ratio of survey papers to total papers (e.g., 0.10 means no more than 10%)

        "min_survey_citations": 50,
        // Minimum citation threshold for survey papers (surveys below this are removed)

        "min_keyword_matches": 1,
        // Minimum number of core_keywords a paper's title/keywords must match to be kept (0 = no limit)

        "venue_quality_rules": {{
            // Venue quality score weights
            "top_venue_weight": 2.0,
            // Weight for top conferences/journals (e.g., CVPR/NeurIPS/Nature/Science)
            "normal_venue_weight": 1.0,
            // Weight for normal SCI journals
            "no_venue_exclude": true,
            // Whether to exclude papers without venue annotation (true/false)
            "arxiv_keep_ratio": 0.2
            // Maximum ratio of arXiv papers to retain (e.g., 0.2 means no more than 20%)
        }},

        "select_top_n": 300,
        // How many papers to keep in the final selection

        "relevance_weights": {{
            // Composite score dimension weights (sum need not be 1.0; code normalizes)
            "keyword_match": 0.30,
            "citation_norm": 0.25,
            "year_recency": 0.20,
            "venue_quality": 0.20,
            "survey_penalty": 0.05
        }}
    }}
}}

Notes:
- Do not output all fields; only output the fields you judge need adjustment. Missing fields use the defaults below.
- JSON keys must remain unchanged (e.g., "year_citation_rules" cannot be changed to "year_rules").
- Ensure `_filter_rules` is the top-level key, do not omit it.

Default values (used when LLM does not output a field):
{
    "_filter_rules": {
        "year_citation_rules": [{"min_year": 2024, "min_citations": 0}, {"min_year": 2022, "min_citations": 3}, {"min_year": 2020, "min_citations": 10}, {"min_year": 2018, "min_citations": 20}, {"min_year": 2015, "min_citations": 50}],
        "max_survey_ratio": 0.10,
        "min_survey_citations": 50,
        "min_keyword_matches": 1,
        "venue_quality_rules": {"top_venue_weight": 2.0, "normal_venue_weight": 1.0, "no_venue_exclude": true, "arxiv_keep_ratio": 0.3},
        "select_top_n": 300,
        "relevance_weights": {"keyword_match": 0.30, "citation_norm": 0.25, "year_recency": 0.20, "venue_quality": 0.20, "survey_penalty": 0.05}
    }
}
```
