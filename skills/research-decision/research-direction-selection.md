---
name: Research Direction Selection
category: research-decision/research-direction-selection
type: system
status: active
version: 1.0
origin: conception/idea-evaluation, conception/idea-selection
---

# Skill: Research Direction Selection

## Purpose

Choose which direction to commit to from an evaluated portfolio, with the criteria and trade-offs recorded so the choice can be defended or revisited rather than re-argued from scratch.

## When to Use

Use this skill when:

- Several evaluated ideas compete for the same time and resources.
- A direction must be committed to and the rejection reasons are not written down.
- Two candidates look comparable and the decision keeps being reopened.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 方向选择要在文献评估之上做
```

## Research Method

1. **Fix the criteria and their weights before looking at the ranking.** State the axes — novelty, feasibility, expected impact, cost, strategic fit — and the weight each carries, plus who set them. Criteria chosen after seeing the scores are rationalisation, not criteria.
2. **Score on independent axes and keep the vector.** A single blended score hides the trade-off that the decision actually is. Report the score per axis rather than one number.
3. **Check score grounding before comparing anything.** Any axis whose score cannot be tied to an artefact — a closest-work comparison, a resource estimate, a risk register — must be marked low-confidence and excluded from the deciding comparison.
4. **Eliminate dominated candidates explicitly and record why:** dominated on every axis, unfalsifiable, or resting on a gap that is already closed. The rejected list is what shows the selection was principled.
5. **Keep the top two or three, then choose one.** Name what the runner-up would win on and the condition under which the decision should be revisited — that condition is the trigger for reversing it later.
6. **State the decision dependencies.** If the chosen direction rests on an unverified assumption (a dataset exists, a method scales, a licence permits use), record it as a decision risk rather than hiding it in optimism.
7. **Write the rationale for a reader who disagrees**, listing the trade-offs accepted rather than only the winner's merits.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every score on every axis must cite the artefact it came from. The criteria weights and their provenance must be recorded before the scores are compared. Rejected candidates must be logged with the axis or gate that eliminated them.

## Expected Output

Produce:

- the criteria and weights, fixed before scoring
- per-candidate score vectors with a confidence note per axis
- the rejected/dominated list with reasons
- the chosen direction and what it commits
- the runner-up, its winning axis, and the revisit trigger

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/conception/prompts/idea_evaluation_prompt.py` — SYSTEM_PROMPT

```text
You are an expert in research evaluation and scientific assessment. Evaluate each of the candidate research ideas based on multiple dimensions:

Research Topic: {research_topic}

1. Novelty (0.0-1.0): How innovative and original is this idea?
2. Feasibility (0.0-1.0): How realistic and implementable is this approach?
3. Scientific Value (0.0-1.0): What is the potential scientific impact?
4. Publication Potential (0.0-1.0): What is the likelihood of publication?
5. Implementation Complexity (0.0-1.0): How complex is the implementation?
6. Overall Score (0.0-1.0): Weighted combination of the above

Candidate Ideas:
{candidate_ideas}

Innovation Opportunities:
{innovation_opportunities}

Research Understanding:
{research_understanding}

Please return the evaluation in JSON format:
{{
    "evaluated_ideas": [
        {{
            "id": "idea_1",
            "title": "brief title",
            "motivation": "motivation",
            "core_innovation": "core innovation",
            "expected_contribution": "expected contribution",
            "technical_direction": "technical direction",
            "novelty": 0.0,
            "feasibility": 0.0,
            "scientific_value": 0.0,
            "publication_potential": 0.0,
            "implementation_complexity": 0.0,
            "overall_score": 0.0,
            "evaluation_rationale": "brief rationale for scores"
        }}
    ]
}}

IMPORTANT REQUIREMENTS:
1. Evaluate ALL provided ideas
2. Provide realistic, well-justified scores
3. Scores should be between 0.0 and 1.0
4. Overall score should be a weighted combination (e.g., novelty=0.3, scientific_value=0.3, feasibility=0.2, publication_potential=0.2)
5. Include clear rationale for the evaluation
6. Consider both strengths and weaknesses of each idea
7. Be critical but constructive in evaluation
```

### `modules/conception/prompts/idea_selection_prompt.py` — TEMPLATE

```text
You are an expert in research strategy and idea prioritization. Select the most promising research ideas from the evaluated candidates:

Research Topic: {research_topic}

1. Select the top 2-3 most promising ideas
2. Choose the single best idea for final selection
3. Justify your selection based on the evaluation scores and research context
4. Balance innovation potential with practical feasibility

Evaluated Ideas:
{evaluated_ideas}

Candidate Ideas:
{candidate_ideas}

Research Understanding:
{research_understanding}

Please return the selection in JSON format:
{{
    "selected_ideas": [
        {{
            "id": "idea_1",
            "title": "brief title",
            "motivation": "motivation",
            "core_innovation": "core innovation",
            "expected_contribution": "expected contribution",
            "technical_direction": "technical direction",
            "novelty": 0.0,
            "feasibility": 0.0,
            "scientific_value": 0.0,
            "publication_potential": 0.0,
            "implementation_complexity": 0.0,
            "overall_score": 0.0
        }}
    ],
    "final_idea": {{
        "id": "idea_1",
        "title": "brief title",
        "motivation": "motivation",
        "core_innovation": "core innovation",
        "expected_contribution": "expected contribution",
        "technical_direction": "technical direction",
        "novelty": 0.0,
        "feasibility": 0.0,
        "scientific_value": 0.0,
        "publication_potential": 0.0,
        "implementation_complexity": 0.0,
        "overall_score": 0.0
    }},
    "selection_reasoning": "detailed explanation of why this idea was selected, including trade-offs considered, innovation potential, feasibility, and alignment with research opportunities"
}}

IMPORTANT REQUIREMENTS:
1. Select the top 2-3 ideas as selected_ideas
2. Choose ONE idea as final_idea (the best of the selected ideas)
3. Provide detailed, well-reasoned selection_reasoning
4. Balance innovation with practical feasibility
5. Consider the research context and opportunities
6. Justify trade-offs and decision criteria
7. Ensure final_idea is also present in selected_ideas

(JSON formatting policy is provided by Foundation Layer.)
```
