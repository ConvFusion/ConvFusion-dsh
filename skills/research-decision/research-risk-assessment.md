---
name: Research Risk Assessment
category: research-decision/risk-assessment
type: system
status: active
version: 1.0
origin: decision/risk-evaluation, decision/feasibility-evaluation, resource/estimation
---

# Skill: Research Risk Assessment

## Purpose

Identify what could make the plan fail or make its result unusable, separate risk from missing fact, and attach a mitigation and a detectable early signal to each risk that is kept.

## When to Use

Use this skill when:

- A plan is being committed and its failure modes have not been written down.
- A risk list exists but contains unread papers and vague warnings instead of mechanisms.
- You need to decide at what observation the direction should be abandoned.

## Research Method

1. **Enumerate risks by failure mode, not by category label.** For each risk name the mechanism: the method does not scale, the result is not attributable to the mechanism, the data or licence is unavailable, a dependency slips, a regulatory or ethics constraint blocks release.
2. **Separate risk from uncertainty.** A risk has a plausible mechanism and can be mitigated or monitored; an uncertainty is a missing fact that must be resolved by looking it up or by running a pilot. Do not park an unread paper as a risk.
3. **Rate each risk by impact and by how early it becomes detectable.** A high-impact risk that only surfaces at the end of the project demands a different response from one a pilot would reveal next week.
4. **Attach a mitigation and an owner to every risk you keep.** A mitigation must be an action with a trigger and a fallback — "if scaling to N fails, fall back to setting S" — not a sentiment such as "monitor carefully".
5. **Define the kill criteria now.** State the observation at which the direction is abandoned rather than patched, while the sunk cost is still near zero.
6. **Check reproducibility risks explicitly:** data licensing and availability, compute budget for re-runs, seeds and variance reporting, and whether the key comparison can be reproduced by someone else from what you intend to release.
7. **Carry the residual risk forward.** Rank the risks and hand the go/no-go decision the risk that remains after mitigation, not the risk as first stated.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Each risk must name the mechanism that would produce the failure and the evidence or precedent for it. Mitigations must specify trigger and fallback. Resource risks must cite the resource estimate, and unresolved external constraints such as licences or ethics approval must be flagged rather than assumed away.

## Expected Output

Produce:

- a risk register with mechanism, impact and detectability
- the split between true risks and open uncertainties
- a mitigation with trigger and fallback per retained risk
- kill criteria stated in advance
- residual risk after mitigation, plus reproducibility risks

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/decision/prompts/risk_evaluator.py` — SYSTEM_PROMPT

```text
Evaluate the risks associated with the following research proposal:

Idea:
{idea}

Method:
{method}

Experiment:
{experiment}

Please consider:
1. Technical risks (methodology limitations, implementation challenges)
2. Resource risks (computational, data, equipment availability)
3. Timeline risks (schedule delays, unexpected obstacles)
4. Scientific risks (hypothesis validation, reproducibility issues)
5. External risks (regulatory, ethical, market factors)

You MUST follow this EXACT JSON schema:
{{
    "risk_score": 0.3,
    "technical_risks": {{
        "methodology_risks": "risks related to the methodology",
        "implementation_risks": "implementation challenges",
        "validation_risks": "validation and verification risks"
    }},
    "resource_risks": {{
        "computational_risks": "computational resource risks",
        "data_risks": "data-related risks",
        "equipment_risks": "equipment availability risks"
    }},
    "timeline_risks": {{
        "schedule_risks": "schedule-related risks",
        "dependency_risks": "dependency-related risks",
        "contingency_needs": "contingency planning needs"
    }},
    "scientific_risks": {{
        "hypothesis_risks": "hypothesis validation risks",
        "reproducibility_risks": "reproducibility concerns",
        "publication_risks": "publication-related risks"
    }},
    "mitigation_strategies": "risk mitigation approaches",
    "risk_analysis": "detailed explanation of the risk assessment"
}}
```

### `modules/decision/prompts/feasibility_evaluator.py` — SYSTEM_PROMPT

```text
Evaluate the feasibility of the following research proposal:

Idea:
{idea}

Method:
{method}

Experiment:
{experiment}

Please consider:
1. Technical feasibility (current technology limitations)
2. Required resources (computational power, data availability, equipment)
3. Time requirements (realistic timeline estimation)
4. Potential technical challenges and risks
5. Availability of required expertise and skills
6. Regulatory or ethical considerations

You MUST follow this EXACT JSON schema:
{{
    "feasibility_score": 0.7,
    "technical_feasibility": {{
        "current_technology_status": "description",
        "technical_challenges": "list of challenges",
        "solution_approaches": "potential solutions"
    }},
    "resource_analysis": {{
        "computational_resources": "requirements and availability",
        "data_resources": "availability and quality",
        "equipment_resources": "required equipment availability"
    }},
    "risk_assessment": {{
        "technical_risks": "list of technical risks",
        "resource_risks": "resource-related risks",
        "mitigation_strategies": "risk mitigation approaches"
    }},
    "timeline_feasibility": "realistic timeline assessment",
    "expertise_requirements": "required skills and expertise",
    "regulatory_considerations": "any regulatory or ethical issues",
    "feasibility_analysis": "detailed explanation of the feasibility assessment"
}}
```

### `modules/resource/prompts/resource_estimation.py` — TEMPLATE

```text
You are ResourceEstimatorAgent, responsible for estimating "compute requirements", not selecting hardware.

Research Topic: {research_topic}
Research Domain: {domain}
Research Plan: {plan}
Data Profile: {data_profile}

========================
【PROHIBITED OUTPUTS】
- RTX 4090
- A100
- V100

MUST OUTPUT:

{{
  "resource_spec": {{
    "compute_requirement": {{
      "gpu_compute_units": float,   # A100 = 1.0
      "gpu_hours": float,
      "parallelism": int
    }},
    "storage": {{
      "hot_storage_gb": float,
      "cold_storage_gb": float,
      "checkpoint_gb": float,
      "storage_days": int
    }},
    "experiment": {{
      "num_runs": int,
      "log_per_run_gb": float,
      "data_processing_gb": int,
      "model_size_gb": float
    }},
    "dataset_requirements": {{
      "total_size_gb": float,
      "num_samples": int,
      "data_types": [str],
      "preprocessing_needs": str,
      "data_acquisition_plan": str,
      "data_sources": [str]
    }},
    "human_skills": [
      {{
        "skill": str,
        "level": str,
        "reason": str
      }}
    ],
    "time_cost": {{
      "total_weeks": float,
      "phase_breakdown": {{
        "data_preparation_weeks": float,
        "implementation_weeks": float,
        "training_weeks": float,
        "evaluation_weeks": float
      }}
    }},
    "bottlenecks": [
      {{
        "resource": str,
        "severity": str,
        "description": str
      }}
    ],
    "scaling_risks": [
      {{
        "risk": str,
        "impact": str,
        "mitigation": str
      }}
    ]
  }}
}}

========================

Examples:

DO NOT:
"gpu_type": "RTX 4090"

DO:
"gpu_compute_units": 0.8

========================

Please provide detailed resource estimation including:

1. **Compute Requirements (Performance-based)**:
   - GPU compute units (relative to A100 = 1.0)
   - Required GPU hours
   - Parallelism level

2. **Storage Requirements**:
   - Active data storage
   - Archive/backup storage
   - Model checkpoint storage
   - Storage duration

3. **Network Requirements**:
   - Data transfer volumes
   - Bandwidth requirements

4. **Dataset Requirements**:
   - Total dataset size
   - Number of samples
   - Data types involved
   - Preprocessing needs
   - Data acquisition plan (how to obtain the data, including public datasets, synthetic generation, or collaboration)
   - Data sources (specific dataset names, URLs, or generation methods)

5. **Human Skill Requirements**:
   - Required skills and expertise levels
   - Reason for each skill requirement

6. **Time Cost Estimation**:
   - Total project duration in weeks
   - Phase-by-phase breakdown

7. **Resource Bottlenecks**:
   - Potential resource constraints
   - Severity assessment

8. **Scaling Risks**:
   - Potential scaling challenges
   - Impact assessment
   - Mitigation strategies

9. **Experiment Metadata**:
   - Number of experimental runs
   - Log storage per run
   - Data processing volumes
   - Model size estimation

Provide comprehensive resource estimation based on research topic, domain, plan, and data profile. Output must be in English JSON format only.
```
