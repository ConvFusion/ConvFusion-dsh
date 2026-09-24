---
name: Paper Architecture
category: academic-writing/paper-architecture
type: system
status: active
version: 1.0
origin: paper/writing (outline, chapter_writer)
---

# Skill: Paper Architecture

## Purpose

Decide the section skeleton, the scope and length budget of each section, and the order in which sections are written — before any prose exists, so that sections cannot overlap or drift in length.

## When to Use

Use this skill when:

- Starting a manuscript, or re-targeting an existing one from a conference template to an IEEE Transactions template.
- Section drafts exist but their scopes overlap, or the manuscript is under or over the page limit.
- You are about to write sections and need to know which evidence each one is allowed to use.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments/simulation-result | 架构要有可组织的结果（真实或仿真）
```

## Research Method

1. **Fix the venue template before the skeleton.** A 4-6 page EI conference paper merges sections and stays terse; an 8-12 page IEEE Transactions paper expects subsections and depth. Choose the template first — it determines the section count, not the reverse.
2. **Write the outline as one line per section, each naming the question it answers and the artefact it draws on** (problem statement, method, results table, literature corpus). A section that cannot name its evidence is not ready to be planned.
3. **Assign an explicit length budget per section** and keep a running total against the page or word limit. Record the budget numerically, because every later length check is measured against it.
4. **Decide which sections split into subsections and which merge** (method: architecture, components, formulation; experiments: setup, comparison, ablation, analysis), and state the reason next to the decision.
5. **Fix the writing order and the carry-forward rule.** Write in an order that satisfies dependencies, and pass already-written text forward so terminology, claims and citation keys stay consistent instead of being re-invented per section.
6. **Audit the outline for duplication and omission** before drafting: two sections covering the same claim, or a claim from the narrative that no section owns, mean the skeleton is wrong.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The outline must be derived from the actual research state — problem, method and experiment artefacts — not from a generic template; each section line must name the artefact it will use. Section budgets must be recorded as numbers so compliance can be checked rather than argued.

## Expected Output

Produce:

- the section skeleton with each section's question, scope and word budget
- the subsection map, with each merge or split decision and its reason
- the writing order plus the cross-section context that must be carried forward
- an outline audit listing duplicated claims and claims no section covers

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/writing/prompts/outline_prompt.py` — IEEE_SYSTEM_PROMPT

```text
You are an expert academic writer targeting IEEE journals.

Given the research information:

Topic: {research_topic}
Problem: {problem}
Method: {method_name}

Generate a detailed paper outline with section structure for a full-length IEEE Transactions paper.

Requirements:
- Follow standard IEEE Transactions format
- Include subsection suggestions
- Ensure logical flow
- Target 8-12 pages

Standard section structure (IEEE Transactions):
1. Abstract (180-250 words)
2. Introduction (1200-1800 words)
   2.1 Background and Motivation
   2.2 Problem Statement
   2.3 Contributions
3. Related Work (1500-2200 words)
   3.1 Traditional Approaches
   3.2 Deep Learning Methods
   3.3 Limitations and Gap
4. Method (2000-3000 words)
   4.1 Overall Architecture
   4.2 Component 1
   4.3 Component 2
   4.4 Component 3
   4.5 Mathematical Formulation
5. Experiments (1500-2500 words)
   5.1 Experimental Setup
   5.2 Comparison with Baselines
   5.3 Ablation Study
   5.4 Analysis and Discussion
6. Conclusion (300-500 words)
   6.1 Summary of Contributions
   6.2 Future Work

Provide the outline with brief descriptions for each section.

STRICT OUTPUT FORMAT — FOLLOW EXACTLY:
Output must be valid JSON with the following structure only:
{{
  "outline": [
    "Section title 1: brief description of what this section covers",
    "Section title 2: brief description of what this section covers",
    "Section title 3: brief description ..."
  ]
}}

CRITICAL RULES (NON-NEGOTIABLE):
1. Wrap all output in {{{{ ... }}}} braces — this is the ONLY format accepted
2. The key MUST be exactly "outline"
3. The value MUST be a JSON array of strings
4. Each string is one section title with a brief description
5. 6-10 items total for an IEEE journal paper
6. Include high-level sections (Abstract, Introduction, Related Work, Method, Experiments, Conclusion)
7. Do NOT add text before or after the JSON
8. Do NOT use markdown code fences
9. Do NOT include explanations — output ONLY the JSON
10. Ensure all quotes are properly escaped
11. Output must be parseable by Python json.loads()

Example valid output:
{{
  "outline": [
    "Abstract: A concise summary of the research problem, method, and key findings",
    "Introduction: Background, motivation, research gap, contributions, and paper organization overview",
    "Related Work: Review of traditional approaches and deep learning methods, with discussion of their limitations",
    "Method: Detailed description of the overall architecture, key components, and mathematical formulation",
    "Experiments: Experimental setup, datasets, comparison with baselines, ablation study, and analysis",
    "Conclusion: Summary of technical contributions, implications, and potential future work directions"
  ]
}}

Now output ONLY the JSON object.
```

### `modules/paper/writing/prompts/chapter_writer_prompt.py` — PROMPT (function-embedded)

```text
Chapter Writer Prompt — 统一章节写作提示词分发器

根据 _current_chapter 动态调度到对应的章节专用 prompt builder，
实现单节点处理所有章节类型。

各章节的专用 prompt:
  - intro → intro_prompt.build_prompt
  - method → method_prompt.build_prompt
  - experiment → experiment_prompt.build_prompt
  - related_work → related_work_prompt.build_prompt
  - conclusion → conclusion_prompt.build_prompt

输出 key 统一为 _chapter_output（由 chapter_progress 持久化到 canonical key）。
```
