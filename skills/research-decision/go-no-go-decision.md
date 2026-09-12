---
name: Go / No-Go Decision
category: research-decision/go-no-go
type: system
status: active
version: 1.0
origin: decision/decision-synthesis
---

# Skill: Go / No-Go Decision

## Purpose

Convert the multi-dimensional evaluations into a committed go, no-go or conditional go — with gates checked first, risk weighed against reward, and next actions whose progress can be observed.

## When to Use

Use this skill when:

- The novelty, feasibility, cost and risk assessments exist and a commitment must be made.
- A project is continuing by momentum and nobody has stated the grounds for continuing.
- The decision depends on a missing fact and the right answer is currently neither go nor no-go.

## Research Method

1. **Assemble the dimensions side by side before judging** — novelty, feasibility, cost, risk, impact — each with its provenance and its confidence. Do not average dimensions that carry different confidence into one number.
2. **Apply the hard gates first.** A failed gate — unfalsifiable claim, infeasible resource requirement, unresolved ethics or licence, novelty destroyed by the closest work — forces a no-go or a re-scope. A high average must never rescue a failed gate.
3. **Weigh risk against reward explicitly.** State the upside if it works, the downside if it fails, and the residual risk after mitigation. A favourable ratio with unresolvable uncertainty is a conditional go, not a go.
4. **Prefer a conditional decision to a vague one.** If the decision depends on a missing fact, name the check, its cost, and the decision rule — "go if the pilot reaches X, otherwise no-go" — instead of deciding on optimism.
5. **State what is being committed:** compute, people, time and the opportunity cost of the alternatives that are now not being pursued.
6. **Assign prioritised next actions** with an owner, a first step and the observable that marks progress. The first action should retire the largest uncertainty soonest.
7. **Record the decision as an auditable artefact** with the evidence snapshot it used, so that a later reversal can be traced to a changed fact rather than to a changed mood.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The decision must reference the underlying assessments rather than restate them. Every condition and threshold must be checkable. The go/no-go, its date, its weights and the evidence snapshot must be recorded, and evidence that argued against the decision must be kept rather than dropped.

## Expected Output

Produce:

- gate check results with the gate that failed, if any
- a risk-versus-reward assessment with residual risk
- a go, no-go or conditional go, with the decision rule when conditional
- what is being committed and the opportunity cost
- prioritised next actions with owners and progress signals

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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
