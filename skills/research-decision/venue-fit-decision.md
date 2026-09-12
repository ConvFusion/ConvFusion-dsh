---
name: Venue Fit Decision
category: research-decision/go-no-go
type: system
status: active
version: 1.0
origin: paper/venue (paper_decision)
---

# Skill: Venue Fit Decision

## Purpose

Decide whether the assembled evidence supports a full-length journal submission or only a focused conference paper, and commit to the template and effort that follow from that decision.

## When to Use

Use this skill when:

- Before fixing the section skeleton, because the venue choice determines it.
- A project sits between conference and journal ambition and a choice must be made.
- Experiments are complete but weaker than hoped, and the submission target must be re-decided.

## Research Method

1. **Audit the evidence before judging the idea**: count datasets, baselines and ablations, and check whether improvements exceed run-to-run variation. Novelty does not compensate for thin validation.
2. **Score the criteria separately** — novelty, technical depth, experimental completeness, result significance, paper completeness — instead of collapsing them into one impression.
3. **Apply the venue bar as a rule**: a journal submission normally needs several datasets, a large baseline set, ablations, comprehensive results and a non-incremental method; a focused conference paper needs one or two datasets, a few baselines and solid validation.
4. **Default downwards when uncertain.** An over-claimed submission costs a review cycle; an under-claimed one can be upgraded later.
5. **Convert the shortfall into a plan**: if the answer is conference, list exactly which additional experiments would justify a journal version and what each would cost.
6. **Emit a typed decision** with confidence, reasoning, the template it implies, and the actions that would change it.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The decision must cite the concrete experiment inventory — datasets, baselines, ablations, effect sizes — rather than the method description. Confidence must be reported, and must be low when ablations are missing or a single dataset was used. Suggested upgrades must name the evidence each would require.

## Expected Output

Produce:

- the decision (journal or conference) with confidence and reasoning grounded in the evidence inventory
- the template type the decision implies
- concrete upgrade actions, each with the evidence it would require
- the named evidence gaps that drove the decision

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/venue/prompts/paper_decision_prompt.py` — CONF_SYSTEM_PROMPT

```text
You are a senior academic reviewer for top-tier conferences.

Your task is to evaluate whether the research project described below is suitable for:
(A) IEEE Transactions-level journal paper (full-length, comprehensive)
(B) EI-indexed conference paper (shorter, focused)

You must be critical and realistic. If the experimental evidence is thin or the contribution is incremental, prefer conference.

----------------------
Research Information:

Research Topic: {research_topic}
Problem Statement: {problem}
Method: {method_name}
Method Overview: {method_overview}
Method Steps: {method_steps}

Datasets Used: {datasets}
Evaluation Metrics: {metrics}
Baselines Compared: {baselines}
Experiment Design: {experiment_design}
Experiment Results: {experiment_results}

----------------------

Evaluation Criteria:
1. **Novelty**: Is the method significantly new or just incremental?
2. **Technical Depth**: Is the method complex and well-designed?
3. **Experimental Completeness**: Multiple datasets? Strong baselines? Ablation studies?
4. **Result Significance**: Are improvements clear and meaningful?
5. **Paper Completeness**: Is the evidence sufficient for a full-length journal paper?

Decision Guidelines:
- **Journal (IEEE)**: Multiple datasets (3+), many baselines (5+), ablation studies, significant improvements, comprehensive experiments, novel method
- **Conference (EI)**: 1-2 datasets, 3-4 baselines, solid but focused contribution, standard experimental validation

# (JSON formatting policy is provided by Foundation Layer.)
{{
    "paper_decision": {{
        "decision": "journal" or "conference",
        "confidence": 0.0-1.0,
        "reasoning": "Detailed explanation of why this fits journal or conference",
        "suggestions": [
            "Actionable suggestions to improve paper quality or upgrade to journal level"
        ]
    }},
    "template_type": "ieee" if decision is journal, else "conf"
}}

IMPORTANT:
- Be conservative. If unsure, prefer "conference".
- Focus on experimental evidence, not just method novelty.
- Journal papers require significant contributions and comprehensive validation.
- template_type must be exactly "ieee" (uppercase IEEE journal) or "conf" (for conference).
```
