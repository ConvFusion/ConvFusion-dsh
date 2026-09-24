---
name: Research Topic Ranking
category: research-decision/research-topic-ranking
type: system
status: active
version: 1.0
origin: initiation/incubation
---

# Skill: Research Topic Ranking

## Purpose

Rank candidate research topics on separated dimensions and state the reasoning, so that the choice can be revisited rather than re-argued.

## When to Use

Use this skill when:

- Several candidate topics exist and one must be chosen.
- A topic is being questioned and it is unclear whether to continue or change.
- The user has stated preferences (risk, timeline, venue) that should constrain the choice.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 候选主题的排序要对照文献，而不是凭印象
```

## Research Method

1. **Enumerate all candidates first**, including weak ones — a candidate never written down cannot be compared.
2. **Score on separated dimensions**: novelty, feasibility, expected impact, cost, risk. A single blended score hides exactly the trade-off the decision turns on.
3. **Apply the user's preferences as constraints, not tie-breakers.** If low risk is prioritised, a high-ceiling high-variance topic fails regardless of ceiling — and say so.
4. **Find the critical path** for each candidate: the single dependency that, if unavailable, kills it.
5. **Prefer topics that survive their own failure** — a negative result that still informs beats a failure that yields nothing.
6. **Record the ranking with its reasoning and the preferences that drove it**, so it can be reconsidered when assumptions change.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Feasibility claims should reference what makes them feasible. Risk claims should name the specific failure. Novelty claims should cite the gap analysis or literature that establishes them.

## Expected Output

Produce:

- all candidates, including rejected ones
- per-dimension scores rather than one aggregate
- critical path and fallback per leading candidate
- the ranking with the reasoning and driving preferences

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/incubation/prompts/rank_topics_prompt.py` — TEMPLATE

```text
You are a research topic ranker. Evaluate and rank the generated research topics.

Generated Topics:
{generated_topics}

Evaluate each topic on:
1. Scientific significance
2. Feasibility
3. Novelty
4. Alignment with user interests

Return the top topics sorted by overall quality.

CRITICAL OUTPUT FORMAT RULES:
1. Output ONLY valid JSON. No markdown, no explanation, no extra text.
2. DO NOT wrap JSON in code blocks or any other markers.
3. candidate_topics must be an array of topic objects.
4. Each topic object must have exactly these 4 fields: title, motivation, research_question, confidence.
5. confidence must be a FLOAT between 0.0 and 1.0 inclusive, where 1.0 = highest quality.

EXAMPLE OUTPUT:
{{
    "incubation_state": {{
        "candidate_topics": [
            {{
                "title": "Efficient Vision Transformer Optimization for Mobile Edge Devices",
                "motivation": "Mobile edge devices have limited computing resources, but require real-time AI inference capabilities. Current ViT models are too computationally heavy for edge deployment.",
                "research_question": "How can we design a lightweight ViT architecture that achieves 80% of the performance of full-size ViT with less than 20% of the computational cost on edge devices?",
                "confidence": 0.92
            }},
            {{
                "title": "Cross-lingual Knowledge Diffusion Barriers in Reinforcement Learning Research",
                "motivation": "There is a significant citation gap between Chinese and English RL research communities, hindering global collaboration and knowledge sharing.",
                "research_question": "What are the key institutional, methodological, and linguistic factors driving citation asymmetry in 2020–2025 RL research?",
                "confidence": 0.87
            }}
        ]
    }}
}}
```

### `modules/initiation/incubation/prompts/identify_opportunities_prompt.py` — TEMPLATE

```text
You are a research opportunity analyst. Analyze the research seed and identify research opportunities.

Research Seed:
{research_seed}

Identify specific research opportunities based on:
1. Problems mentioned and their significance
2. Limitations of current approaches
3. Future work directions suggested
4. Research signals detected

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "opportunities": [
        {{
            "title": "opportunity title",
            "description": "detailed description",
            "rationale": "why this is a good opportunity"
        }}
    ]
}}
```
