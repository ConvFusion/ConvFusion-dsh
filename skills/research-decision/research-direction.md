---
name: Research Direction
category: research-decision/research-direction
type: system
status: active
version: 1.0
origin: initiation/incubation, decision
---

# Skill: Research Direction

## Purpose

Move from a set of candidate directions to one committed direction, with the reasoning recorded so later decisions can be understood in their original context.

## When to Use

Use this skill when:

- Several candidate directions exist and one must be chosen.
- A direction is being questioned and you must decide whether to continue or change.
- The user has given preferences (risk appetite, time budget, venue target) that should shape the choice.

## Research Method

1. **Enumerate the candidates explicitly** before evaluating any of them. Candidates never written down cannot be compared.
2. **Evaluate on separated dimensions**: novelty, feasibility, expected impact, cost, risk. Score independently — a single overall score hides exactly the trade-off the decision turns on.
3. **Apply the user's stated preferences as constraints, not tie-breakers.** If the user prioritises low risk, a high-ceiling high-variance direction fails regardless of its ceiling. Say so rather than letting the score quietly decide.
4. **Identify the critical path** for each candidate: which single dependency, if unavailable, kills it. Prefer a direction whose critical path you can actually walk.
5. **Look for the option that survives its own failure.** A direction whose negative result is still informative is usually better than one whose failure yields nothing.
6. **Record the decision** with alternatives considered and the reason, naming the evidence and preferences that drove it.

## Reasoning Guidance

Focus on:

- Whether the candidate is falsifiable within the available resources.
- What happens if the central hypothesis is wrong — is there a fallback result?
- Whether the direction depends on an external capability you do not control.
- Honest cost: not just compute, but time to obtain the data and baselines.

Avoid:

- Letting a single aggregate score decide; report the per-dimension picture.
- Selecting the theoretically most elegant direction when its critical path is unavailable.
- Treating the user's preferences as soft suggestions to be overridden by a higher score.
- Leaving the rejected candidates unrecorded — they are the context for the decision.

## Evidence Requirements

Feasibility claims should reference what makes them feasible (existing code, available data, prior results). Risk claims should name the specific thing that could fail. Novelty claims should cite the gap analysis or literature that establishes them.

## Expected Output

Produce:

- the candidate directions
- per-dimension evaluation for each, not a single score
- the critical path and fallback for the leading candidates
- the decision, alternatives considered, and the reason
- explicit note of which user preference drove the outcome

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

### `modules/decision/prompts/decision_synthesizer.py` — SYSTEM_PROMPT

```text
You are a Scientific Decision Intelligence system. Based on comprehensive multi-dimensional evaluations, make a final research decision.

## Research Context
- Research Topic: {research_topic}
- Domain: {domain}
- Innovation Level: {innovation_level}

## Candidate Tasks
{candidate_tasks}

## Multi-Dimension Evaluation Results

### Novelty Evaluation
{novelty_evaluations}

### Feasibility Evaluation
{feasibility_evaluations}

### Impact Evaluation
{impact_evaluations}

### Cost Evaluation
{cost_evaluations}

### Risk Evaluation
{risk_evaluations}

## Resource Context
- Estimated Cost: {estimated_cost}

## Instructions
Based on ALL the above evaluation dimensions, make a final scientific decision.

You MUST follow this EXACT JSON schema:
{{
    "scientific_decision_state": {{
        "research_topic": "the research topic from context",
        "domain": "the research domain from context",
        "go_no_go_decision": "go or no_go",
        "priority_score": 0.0 to 1.0,
        "justification": "detailed decision reasoning",
        "risk_reward_analysis": {{
            "potential_upside": "description of potential benefits",
            "potential_downside": "description of potential risks",
            "risk_mitigation_strategies": ["strategy1", "strategy2"],
            "risk_level": "low/medium/high/critical",
            "reward_level": "low/medium/high/breakthrough"
        }},
        "strategic_alignment": "how this aligns with research strategy",
        "expected_impact": {{
            "academic_impact": 0.0 to 1.0,
            "practical_impact": 0.0 to 1.0,
            "innovation_degree": "incremental/transformative/paradigm_shift",
            "estimated_citations": 0
        }},
        "resource_roi": {{
            "estimated_total_cost": 0,
            "expected_value": 0,
            "roi_ratio": 0.0,
            "cost_efficiency": "low/medium/high"
        }},
        "publication_probability": 0.0 to 1.0,
        "recommended_next_actions": [
            {{
                "action": "action description",
                "priority": "high/medium/low",
                "timeline": "time estimate",
                "responsible": "who",
                "expected_outcome": "expected result"
            }}
        ]
    }}
}}
```
