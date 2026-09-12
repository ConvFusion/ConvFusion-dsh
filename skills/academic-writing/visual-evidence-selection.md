---
name: Visual Evidence Selection
category: academic-writing/technical-writing
type: system
status: active
version: 1.0
origin: paper/artifacts (figure_selector)
---

# Skill: Visual Evidence Selection

## Purpose

Choose which figures belong in the paper so that each one carries information the tables and prose do not, and so the figure count stays within the venue limit.

## When to Use

Use this skill when:

- More candidate figures were collected than the paper can hold.
- A candidate figure repeats the comparison a table already makes.
- A result is argued in the text but never visualised.

## Research Method

1. **Read the experiments section first** to learn which figures the argument already refers to and which narrative the text emphasises.
2. **Inventory the tables and what they already show.** A table carrying the main quantitative comparison removes the need for a figure of the same numbers.
3. **Prefer the different angle**: training curves, qualitative or case-study examples, ablations the table only summarises, or a method overview the text describes but never draws.
4. **Rank the survivors by how much of the argument they support** and cut to the venue limit, ordered most important first.
5. **Record every rejected candidate with its reason** so the selection can be defended, and list the results that still lack a visual.
6. **Check each selected figure against its caption**: the caption states what the reader should conclude, not merely what the axes are.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Selected items must be identifiers that exist in the collected candidate set — none may be invented. Each selected figure must be tied to a claim in the text and must not duplicate information a table already carries. Rejected candidates and the reason for rejection are recorded.

## Expected Output

Produce:

- the ordered list of selected figure ids, most important first
- the rejected candidates with the reason for each rejection
- a caption outline stating the intended conclusion for every selected figure
- the list of results that remain unvisualised

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/artifacts/prompts/figure_selector_prompt.py` — TEMPLATE

```text
You are an expert academic paper figure curator.

Your job: pick AT MOST {max_figures} figures out of the collected candidates that are the most useful for illustrating the paper's core narrative.

IMPORTANT constraints:
1. At MOST {max_figures} figures can be selected. Pick only the strongest / most distinctive illustrations.
2. AVOID selecting figures that present the SAME information already covered by tables. If a table already shows the main quantitative comparison, prefer a figure illustrating a different angle (e.g., training curves, case study, qualitative comparison, ablation breakdown visualization that the table does not fully convey).
3. Prefer diversity: cover different aspects of the paper if possible (method overview / main comparison / ablation / analysis / qualitative examples).

Paper context
-------------

- Research topic:
{research_topic}

- Experiment section already written (use this to know what figures the text actually references and which narrative is already emphasized):
{experiment_section}

Available figures (candidates)
------------------------------

{figure_list}

Tables already chosen (avoid redundancy with these):
-----------------------------------------------------

{table_list}

# (JSON formatting policy is provided by Foundation Layer.)
Return a JSON with exactly one field:
{{
  "selected_figure_ids": ["figure_id_1", "figure_id_2", ...]
}}

CRITICAL Requirements (MUST follow strictly):
1. The list MUST have EXACTLY BETWEEN 0 AND {max_figures} items. AT MOST {max_figures}. NO EXCEPTIONS.
2. The values MUST be artifact_id strings from the "Available figures" list exactly. Do not invent IDs.
3. Order the list by relevance (most important first).
4. If no figures are suitable, return an empty list.
5. DO NOT include figures whose content is duplicative of the tables above.
6. Return exactly one field: "selected_figure_ids" with the list of IDs.
```
