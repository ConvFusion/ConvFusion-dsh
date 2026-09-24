---
name: Literature Review
category: literature/literature-review
type: system
status: active
version: 1.0
origin: discovery/cognition
---

# Skill: Literature Review

## Purpose

Build an evidence-backed understanding of a research area — tasks, problems, methods, evidence, contradictions — rather than a list of paper summaries.

## When to Use

Use this skill when:

- You need to know what the field actually knows before proposing anything.
- A direction is being considered and its novelty depends on what already exists.
- You are assembling the related-work argument.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 综述建立在已落地的文献证据之上，而不是检索计划
```

## Research Method

1. **Extract per paper on fixed dimensions** (problem, method, evidence, limitation) so that papers become comparable rather than merely summarised.
2. **Group by mechanism, not by terminology.** Two papers with different names for the same idea are one method family.
3. **Surface contradictions explicitly.** Where two works disagree, the disagreement is the most valuable output of the review.
4. **Identify the dominant direction and why it dominates** — the field's consensus is the baseline any contribution is measured against.
5. **Separate admitted limitations from inferred ones**, and keep the inference labelled as yours.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every extracted claim must be traceable to a specific work and location. Contradictions must cite both sides. Do not generalise from a single paper to "the field".

## Expected Output

Produce:

- per-paper extraction on the fixed dimensions
- method families with their representative works
- explicit contradictions with both sides cited
- the dominant direction and the reason it dominates

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/discovery/cognition/prompts/extract_problems_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in problem extraction.

Research Topic: {research_topic}

## Papers
{papers_str}

Based on the papers above, extract the key research problems and task definitions.
Identify what specific tasks the papers address, the problem boundaries, and evaluation targets.

Output JSON:
{{
    "extracted_tasks": [
        {{
            "name": "task name",
            "description": "detailed task description",
            "example_papers": ["paper title that addresses this task"]
        }}
    ],
    "extracted_problem_definitions": ["problem definition 1", "problem definition 2"]
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/extract_methods_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in method extraction.

Research Topic: {research_topic}

## Papers
{papers_str}

Based on the papers above, identify distinct method families used across the papers,
and extract key innovations/contributions.

Output JSON:
{{
    "extracted_method_families": [
        {{
            "name": "method family name",
            "core_idea": "core idea description",
            "representative_papers": ["paper title"],
            "variations": ["variation 1", "variation 2"]
        }}
    ],
    "extracted_innovations": [
        {{
            "type": "architecture/representation/training/paradigm",
            "description": "innovation description"
        }}
    ]
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/extract_evidence_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in evidence extraction.

Research Topic: {research_topic}

## Papers
{papers_str}

Based on the papers above, extract datasets used, benchmarks, evaluation metrics,
and standard experimental settings.

Output JSON:
{{
    "extracted_datasets": [
        {{
            "name": "dataset name",
            "description": "dataset description",
            "papers_used_in": ["paper title"],
            "advantages": ["advantage 1"],
            "limitations": ["limitation 1"]
        }}
    ],
    "extracted_benchmarks": [
        {{
            "name": "benchmark name",
            "description": "benchmark description",
            "metrics": ["metric 1"],
            "standard_tasks": ["task 1"]
        }}
    ],
    "extracted_metrics": ["metric 1", "metric 2"]
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/method_cognition_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in method landscape analysis.

Research Topic: {research_topic}

## Papers
{papers_str}

## Extracted Method Families
{extracted_method_families}

## Extracted Innovations
{extracted_innovations}

Synthesize a comprehensive method landscape: method families, dominant approaches, evolution trajectory.

Output JSON:
{{
    "method_landscape": {{
        "method_families": [
            {{
                "name": "method family name",
                "core_idea": "core idea description",
                "strengths": ["strength 1"],
                "weaknesses": ["weakness 1"],
                "representative_papers": ["paper title"],
                "variations": ["variation 1"]
            }}
        ],
        "dominant_approaches": ["approach 1", "approach 2"],
        "evolution_trajectory": "description of how methods have evolved"
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/evidence_cognition_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in evidence landscape analysis.

Research Topic: {research_topic}

## Papers
{papers_str}

## Extracted Datasets
{extracted_datasets}

## Extracted Benchmarks
{extracted_benchmarks}

## Extracted Metrics
{extracted_metrics}

Synthesize a comprehensive evidence landscape: datasets, benchmarks, metrics, standard experiments.

Output JSON:
{{
    "evidence_landscape": {{
        "datasets": [
            {{
                "name": "dataset name",
                "description": "dataset description",
                "papers_used_in": ["paper title"],
                "advantages": ["advantage 1"],
                "limitations": ["limitation 1"]
            }}
        ],
        "benchmarks": [
            {{
                "name": "benchmark name",
                "description": "benchmark description",
                "metrics": ["metric 1"],
                "standard_tasks": ["task 1"]
            }}
        ],
        "evaluation_metrics": ["metric 1", "metric 2"],
        "standard_experiments": ["experiment setting 1"]
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```
