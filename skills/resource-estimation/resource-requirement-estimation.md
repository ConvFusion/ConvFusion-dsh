---
name: Resource Requirement Estimation
category: resource-estimation/resource-requirement-estimation
type: system
status: active
version: 1.0
origin: resource/resource_estimation, resource/instance_selection
---

# Skill: Resource Requirement Estimation

## Purpose

Estimate what a plan demands in hardware-agnostic terms, namely compute, storage, data, human skills and time by phase, and identify the binding bottleneck and the scaling behaviour before any vendor or part number is chosen.

## When to Use

Use this skill when:

- A pipeline exists and its feasibility must be established before committing to it.
- Someone proposes a specific GPU model before the requirement has been stated.
- You need to know which phase or resource constrains the schedule.
- A plan is being scaled up (more seeds, more data, a larger model) and the cost curve is unknown.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 资源需求由方法设计推导，而不是拍脑袋
```

## Research Method

1. **Express compute as a requirement, not a product.** Report relative compute units (A100-equivalent = 1.0), GPU-hours and required parallelism. Naming a GPU model at this stage hides whether the requirement is 40 or 40,000 GPU-hours and pre-empts the selection decision.
2. **Derive GPU-hours from the run list.** Take the run count including seeds, sweeps and ablations, multiply by hours per run from the pipeline estimate, and divide by the parallel efficiency you are willing to assume. Show the arithmetic; it is the only part of the estimate a reviewer can audit.
3. **Size storage in tiers.** Hot working storage, checkpoint storage (runs x checkpoint size x retention), cold archive, and log volume per run. Checkpoint storage is routinely the largest term and the one most often omitted.
4. **Specify the dataset requirement as an acquisition plan.** Total volume, sample count, modalities, preprocessing needs, and the source: existing corpus, synthesis, purchase, or collaboration. Each path needs an owner and a lead time; "a public dataset" is not an acquisition plan.
5. **Estimate time by phase and state the assumption each phase rests on** (data preparation, implementation, training, evaluation). Convert the pipeline critical path into wall-clock weeks, including the serialisation that cannot be removed.
6. **Name the bottleneck explicitly.** Identify the single resource that binds the plan, whether GPU-hours, a scarce dataset, one specific skill, or strictly sequential runs, and give its severity. If everything is listed as a bottleneck, none has been identified.
7. **State how the estimate scales.** Give the marginal cost of doubling runs, data or model size and the point at which the plan stops being feasible. This is what makes the estimate usable for descoping rather than merely informative.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Compute, storage and time figures must show their derivation from run counts, model sizes and dataset sizes. Dataset claims must name the actual source and its access conditions. Every phase estimate must carry the assumption it depends on. Never present a vendor-specific part number as a requirement.

## Expected Output

Produce:

- compute requirement (compute units, GPU-hours, parallelism) with its derivation
- storage requirement by tier, with checkpoint retention stated
- dataset requirement and acquisition plan with sources, owners and lead times
- time estimate by phase plus the human skills the plan assumes
- the binding bottleneck with its severity, and the scaling behaviour of the estimate

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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

### `modules/resource/prompts/instance_selection.py` — TEMPLATE

```text
You are an expert in cloud infrastructure planning.

Your task is to select suitable cloud instances that satisfy the given resource requirements.

You must NOT assume a single instance. Instead, you should SEARCH and propose MULTIPLE candidate instances for each cloud provider.

====================
INPUT REQUIREMENTS
====================
- GPU type: {gpu_type}
- GPU count: {gpu_count}
- Required GPU performance: >= {min_performance_score}
- CPU cores: >= {cpu_cores}
- Memory: >= {memory_gb} GB

====================
AVAILABLE INSTANCE CATALOG (REAL PRICING DATA)
====================
{pricing_catalog}

====================
TASK
====================
1. For each cloud provider in the catalog above:
   - Propose 2-4 candidate instances from the REAL catalog
   - Include both "best match" and "near match" options
   - Use the EXACT instance_type names from the catalog

2. For each instance:
   - Evaluate feasibility:
     - "feasible" → fully satisfies requirements
     - "scalable" → can be satisfied by increasing GPU count or extending time
     - "infeasible" → cannot be satisfied even with scaling
   - If scalable/infeasible, specify missing resources

3. DO NOT filter out partial matches (they are useful for trade-off analysis)

====================
OUTPUT FORMAT (STRICT JSON - NO MARKDOWN)
====================

**CRITICAL: You MUST output ONLY the raw JSON object. DO NOT wrap it in markdown code blocks.**

**DO NOT include ```json or ``` markers.**

**DO NOT add any text before or after the JSON.**

**The output must be a valid JSON object starting with {{ and ending with }}.**

{{
  "instance_selection": {{
    "instance_candidates": {{
      "aws": [
        {{
          "instance_type": "...",
          "gpu_type": "...",
          "gpu_count": ...,
          "cpu_cores": ...,
          "memory_gb": ...,
          "hourly_price_usd": ...,
          "feasibility": "feasible | scalable | infeasible",
          "adaptation_plan": {{
            "gpu_count_adjustment": int,
            "time_adjustment_factor": float
          }}
        }}
      ],
      "aliyun": [
        {{
          "instance_type": "...",
          "gpu_type": "...",
          "gpu_count": ...,
          "cpu_cores": ...,
          "memory_gb": ...,
          "hourly_price_cny": ...,
          "feasibility": "feasible | scalable | infeasible",
          "adaptation_plan": {{
            "gpu_count_adjustment": int,
            "time_adjustment_factor": float
          }}
        }}
      ]
    }}
  }}
}}

## PERFORMANCE MODEL RULES (MANDATORY):
**You are InstanceSelectorAgent. Your goal is not exact matching, but determining "whether requirements can be met through adjustments".**

========================

【RULES】

1. Do NOT use GPU model mismatch as the sole reason for rejection

2. Use performance model:

GPU performance benchmarks:
- H100 = 1.5
- A100 = 1.0
- V100 = 0.6
- A10G/A10 = 0.5
- T4 = 0.3
- P100 = 0.4
- RTX 4090 = 0.85
- RTX 4080 = 0.7
- RTX 3090 = 0.55
- Radeon Pro V520 = 0.25

required_compute = gpu_compute_units * gpu_hours

candidate_compute = gpu_performance * gpu_count * available_hours

------------------------

3. Feasibility classification:

- feasible:
  candidate_compute >= required_compute

- scalable:
  Can be satisfied by increasing GPU count or extending time

- infeasible:
  Cannot be satisfied (even with scaling)

------------------------

4. Output must include:

{{
  "feasibility": "...",
  "adaptation_plan": {{
    "gpu_count_adjustment": int,
    "time_adjustment_factor": float
  }}
}}
```
