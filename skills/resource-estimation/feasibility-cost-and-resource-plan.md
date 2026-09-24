---
name: Feasibility, Cost and Resource Plan
category: resource-estimation/feasibility-cost-and-resource-plan
type: system
status: active
version: 1.0
origin: decision/feasibility-evaluation, decision/cost-evaluation, resource/estimation
---

# Skill: Feasibility, Cost and Resource Plan

## Purpose

Determine whether a research plan can actually be executed within the available resources, and what it will cost, expressed in units that can be checked — compute, data, storage, skills, time and money.

## When to Use

Use this skill when:

- A plan is about to be committed and its resource envelope is unknown.
- Two technical routes look equally good on paper and must be compared by cost and feasibility.
- A claim depends on resources you do not control, such as a dataset, a licence or a cluster.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 可行性与成本估算以方法设计为对象
```

## Research Method

1. **Estimate requirements from the plan's computation, not from hardware names.** Express compute as a work quantity — GPU-hours times relative compute units against a stated reference (A100 = 1.0) — plus storage tiers, data volume, parallelism and number of runs. Fix the requirement before naming any hardware.
2. **Enumerate cost components separately and cite their source.** Compute, storage, network egress, data acquisition and personnel time, each with the pricing source and date. A single total without a breakdown cannot be audited, and goes stale silently when prices change.
3. **Convert every requirement into a hard constraint and gate on it first.** An option that fails any single requirement — GPU-hours, storage, bandwidth, deadline — is infeasible and is removed before ranking. A strong score on one axis must never hide a failed constraint.
4. **Compare at least two viable options**, including the local or self-hosted alternative and the cheapest credible provider, and report the total for each rather than only for the winner.
5. **Report the bottleneck and the scaling regime.** State which resource binds first and how cost grows with scale — runs, parameters, data, sequence length — so the estimate can be reused at a different scale instead of recomputed.
6. **Validate consistency across the estimate chain.** Resource spec, chosen option and cost must describe the same configuration; a mismatch invalidates the number rather than merely looking untidy.
7. **Publish the uncertainty on the dominant driver** as scenarios (optimistic, expected, pessimistic) and say which assumption would move the estimate most.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Prices, instance types and exchange rates must cite their source and date. Requirement estimates must show the derivation from plan parameters rather than appearing as given numbers. Infeasible options must be recorded with the constraint they failed, and assumptions about data availability or expertise must be flagged.

## Expected Output

Produce:

- a resource specification covering compute, storage, network, data, skills and time
- a cost breakdown per option with pricing provenance
- a feasibility gating table showing pass/fail per hard constraint
- the bottleneck and the scaling behaviour of cost
- a consistency check across spec, option and cost, plus an uncertainty range

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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

### `modules/decision/prompts/cost_evaluator.py` — SYSTEM_PROMPT

```text
Evaluate the cost of the following research proposal:

Method:
{method}

Experiment:
{experiment}

Please consider:
1. Computational requirements (GPU/CPU, memory, storage)
2. Data collection or acquisition costs
3. Storage requirements (data volume, database needs)
4. Personnel costs (researcher time, expertise required)
5. Infrastructure requirements (cloud computing, specialized hardware)

You MUST follow this EXACT JSON schema:
{{
    "cost_score": 0.5,
    "cost_analysis": "detailed explanation of the cost assessment",
    "computational_requirements": {{
        "gpu_requirements": "description",
        "cpu_requirements": "description",
        "memory_requirements": "description",
        "storage_requirements": "description"
    }},
    "data_requirements": {{
        "data_volume": "estimated size",
        "data_collection_cost": "description",
        "storage_cost": "description"
    }},
    "hardware_requirements": "specific hardware needed",
    "software_requirements": "specific software needed",
    "personnel_requirements": "expertise and time needed",
    "additional_cost_factors": "any other relevant factors"
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

### `modules/resource/prompts/infra_selection.py` — TEMPLATE

```text
You are an expert infrastructure selection advisor for research projects. Analyze the resource requirements and constraints to recommend the best infrastructure options.

## INPUT DATA

### Resource Specifications:
{resource_spec}

### Pricing Reference Data (Real Cloud Pricing):
{pricing_data}

### Constraints:
{constraints}

### Environment:
{environment}

## TASK REQUIREMENTS

You MUST analyze and recommend infrastructure options based on COMPLETE resource integrity constraints:
1. **Compute resource integrity** - Ensure ALL compute requirements are met (GPU, CPU, memory)
2. **Storage resource integrity** - Ensure ALL storage requirements are met (hot, cold, checkpoint storage)
3. **Network resource integrity** - Ensure ALL network requirements are met (egress, bandwidth)
4. **Budget constraints** - Stay within the specified budget
5. **Deadline constraints** - Meet the project timeline
6. **Performance requirements** - Ensure adequate compute power
7. **Environmental factors** - Consider location, data sensitivity, etc.

RESOURCE INTEGRITY VALIDATION:
- Any recommendation MUST validate that ALL resource requirements are fully satisfied
- Storage requirements must be explicitly checked and validated
- Network requirements must be explicitly checked and validated
- DO NOT ignore storage or network requirements in favor of compute-only optimization

## INPUT VALIDATION REQUIREMENTS (MANDATORY):

Before executing selection, you MUST validate input data:

1. **Pricing data validation** - Valid pricing data must exist for aws / aliyun
2. **Resource specification validation** - resource_spec must contain complete compute, storage, network specifications

**Validation failure handling rules:**
- If pricing data is missing or unavailable, fallback rules are prohibited
- Selection can only be executed after all validations pass

## FEASIBILITY GATING REQUIREMENTS (MANDATORY):

Before considering any options, you MUST perform feasibility checks:

1. **GPU resource check** - Option must provide sufficient GPU hours: GPU hours >= required_gpu_hours
2. **Storage resource check** - Option must provide sufficient storage space: storage >= required_storage
3. **Network resource check** - Option must provide sufficient network bandwidth: network >= required_network
4. **Time constraint check** - Option must complete within deadline: estimated_time <= deadline_days

**Feasibility determination rules:**
- If an option fails any condition above, mark as infeasible
- Remove infeasible options from candidate set
- Infeasible options are not allowed to participate in ranking or recommendation

**Special rules:**
- Free tier is considered infeasible by default unless explicitly meeting all resource requirements
- If all options are infeasible, must clearly state the reason

## CRITICAL JSON OUTPUT REQUIREMENTS:
1. You MUST return ONLY a JSON object, no additional text before or after the JSON
2. The JSON structure MUST exactly match the template below with ALL fields completed
3. All field names MUST be exactly as specified (case-sensitive)
4. All brackets and braces MUST be properly closed and balanced
5. The JSON MUST be valid and parseable by Python's json.loads() function
6. You MUST NOT truncate or omit any fields from the JSON structure
7. You MUST provide realistic numerical values (0.0-1.0) for all suitability scores
8. You MUST use actual provider names (aws, aliyun, colab, kaggle, etc.)

Return ONLY a JSON object with this EXACT structure (wrapped under "infra_selection" key):
{{
  "infra_selection": {{
    "cloud": [
      {{
        "provider": "aws",
        "suitability_score": 0.85,
        "reason": "Detailed explanation of why this option is suitable based on budget, performance, and timeline constraints",
        "cost_analysis": "Breakdown of costs including instance type, storage, and network costs based on pricing data",
        "constraint_compliance": "How this option meets the budget, deadline, and performance requirements"
      }},
      {{
        "provider": "aliyun",
        "suitability_score": 0.75,
        "reason": "Detailed explanation of why this option is suitable",
        "cost_analysis": "Breakdown of costs and value based on pricing data",
        "constraint_compliance": "How this option meets the constraints"
      }}
    ],
    "local": {{
      "feasibility": "medium",
      "reason": "Analysis of local infrastructure feasibility based on available hardware and software",
      "requirements": "Specific hardware/software requirements for local setup including GPU, memory, and storage"
    }},
    "free": [
      {{
        "provider": "colab",
        "suitability_score": 0.4,
        "reason": "Analysis of free option viability considering resource limitations",
        "limitations": "Key limitations including session timeouts, GPU availability, and data privacy"
      }},
      {{
        "provider": "kaggle",
        "suitability_score": 0.3,
        "reason": "Analysis of free option viability",
        "limitations": "Key limitations and constraints"
      }}
    ],
    "recommendations": [
      {{
        "priority": "high",
        "option_type": "cloud",
        "provider": "aws",
        "reason": "Detailed justification for this recommendation based on cost-effectiveness and performance",
        "implementation_plan": "Step-by-step implementation guidance including instance selection, configuration, and deployment"
      }},
      {{
        "priority": "medium",
        "option_type": "local",
        "provider": "local_cluster",
        "reason": "Detailed justification for this recommendation",
        "implementation_plan": "Step-by-step implementation guidance"
      }}
    ],
    "constraint_analysis": {{
      "budget": {{
        "status": "satisfied",
        "analysis": "Detailed budget constraint analysis showing how costs fit within the budget"
      }},
      "deadline": {{
        "status": "satisfied",
        "analysis": "Detailed deadline constraint analysis showing timeline feasibility"
      }},
      "performance": {{
        "status": "satisfied",
        "analysis": "Detailed performance requirement analysis showing adequate compute power"
      }}
    }}
  }}
}}

## CRITICAL REQUIREMENTS

1. **MUST provide detailed analysis** - Not just simple scores, include specific reasoning
2. **MUST consider all constraints** - Budget, deadline, performance, environmental factors
3. **MUST provide realistic recommendations** - Based on actual resource needs and pricing data
4. **MUST include implementation guidance** - Practical step-by-step next steps
5. **MUST output valid JSON** - Follow the exact structure above with ALL fields completed
6. **MUST provide complete JSON** - Do not truncate or omit any fields
7. **MUST use realistic numerical values** - Provide actual suitability scores (0.0-1.0)
8. **MUST include specific provider names** - Use actual cloud provider names (aws, aliyun, etc.)
9. **MUST ensure JSON is properly closed** - Make sure all brackets and braces are properly closed

IMPORTANT: The JSON output MUST be complete and properly formatted. Do not truncate the response. Ensure all fields are filled with realistic values.
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

### `modules/resource/prompts/cost_estimation.py` — TEMPLATE

```text
You are a cloud cost estimation expert.

Your task is to estimate cost and select the best instance from candidates.

====================
INPUT
====================
Instance candidates: {instance_candidates}
Resource specification: {resource_spec}
Pricing reference data: {pricing_data}

====================
RULES
====================
1. ONLY consider instances with feasibility = "feasible" or "scalable"
2. Use the pricing reference data to calculate accurate costs
3. Estimate cost for EACH feasible instance considering:
   - Hourly price from pricing data
   - Required GPU hours from resource specification
   - Number of parallel instances needed
   - Storage costs (from pricing data storage section)
   - Network egress costs (from pricing data network section)

4. Select the most cost-effective one considering:
   - Total cost (primary factor)
   - Performance requirements
   - Resource specifications
   - Cost-effectiveness ratio

5. If no feasible instance exists: return "no feasible instance"

====================
SELECTION CRITERIA
====================
1. **Cost optimization** - Choose the instance with lowest total cost
2. **Performance matching** - Ensure the instance meets performance requirements
3. **Resource adequacy** - Verify CPU, memory, and GPU resources are sufficient
4. **Cost-effectiveness** - Balance cost vs performance

====================
OUTPUT FORMAT (STRICT JSON)
====================
{{
  "cost_estimation": {{
    "selected_instance": "specific instance type",
    "total_cost_usd": 12345.67,
    "cost_breakdown": {{
      "compute_cost_usd": 10000.00,
      "storage_cost_usd": 2000.00,
      "network_cost_usd": 345.67
    }},
    "currency": "USD",
    "alternatives": [
      {{
        "instance_type": "alternative instance type",
        "total_cost_usd": 15000.00,
        "reason": "why this alternative was not selected"
      }}
    ],
    "reason": "detailed explanation of selection"
  }}
}}
```

### `modules/resource/prompts/consistency_validation.py` — TEMPLATE

```text
You are ConsistencyValidatorAgent, responsible for consistency validation of the resource decision process.

**CRITICAL: You must output ONLY JSON format, no additional text.**

========================
【INPUT DATA】
You will receive the following structured data:
- Infrastructure selection: {infra_selection}
- Cost estimation: {cost_estimation}
- Resource specification: {resource_spec}
- Instance selection: {instance_selection}

**Note: The recommendation phase has not been generated yet, so the recommendation field is not included.**

========================
【VALIDATION RULES】

1. Infrastructure Feasibility Check
- infrastructure_selection must contain valid cloud provider options
- At least one provider must have feasibility (feasibility ∈ ["feasible", "scalable"])

Otherwise:
→ Mark as error: NO_FEASIBLE_INFRASTRUCTURE

------------------------

2. Instance Selection Consistency
- instance_selection must contain valid instance candidates
- At least one provider must have feasible instances

Otherwise:
→ Mark as error: NO_FEASIBLE_INSTANCES

------------------------

3. Cost Data Completeness
- cost_estimation must contain valid cost data
- Must contain total_cost field

Otherwise:
→ Mark as error: INCOMPLETE_COST_DATA

------------------------

4. Resource Specification Match
- resource_spec must contain complete resource requirements
- Must contain gpu_type, gpu_count, cpu_cores, memory_gb and other fields

Otherwise:
→ Mark as error: INCOMPLETE_RESOURCE_SPEC

------------------------

5. Cross-data consistency
- Providers in infrastructure_selection must have corresponding instances in instance_selection
- Instance types in instance_selection must have corresponding costs in cost_estimation

Otherwise:
→ Mark as error: DATA_CONSISTENCY_ISSUE

------------------------
【输出格式（严格JSON - 直接输出，不要包装）】

**CRITICAL: You MUST output ONLY the raw JSON object. DO NOT wrap it in markdown code blocks.**

**The output must start with {{ and end with }}.**

If all validations pass:
{{
  "validation": {{
    "status": "valid",
    "checks": [
      {{
        "rule": "infrastructure_feasibility",
        "passed": true
      }},
      {{
        "rule": "instance_selection_consistency",
        "passed": true
      }},
      {{
        "rule": "cost_data_completeness",
        "passed": true
      }},
      {{
        "rule": "resource_spec_completeness",
        "passed": true
      }},
      {{
        "rule": "cross_data_consistency",
        "passed": true
      }}
    ]
  }}
}}

If errors are found:
{{
  "validation": {{
    "status": "invalid",
    "errors": [
      {{
        "code": "ERROR_CODE",
        "message": "detailed error description",
        "suggestion": "fix suggestion"
      }}
    ]
  }}
}}

If no feasible solution exists:
{{
  "validation": {{
    "status": "no_feasible_solution"
  }}
}}

**Remember: Output only JSON, no wrapping!**
```

### `modules/resource/prompts/recommendation.py` — TEMPLATE

```text
You are an expert infrastructure recommendation system for research projects. Analyze the infrastructure options and provide detailed recommendations using multi-objective optimization with STRICT CONSTRAINT ENFORCEMENT.

Infrastructure selection: {infrastructure_selection}
Cost estimation: {cost_estimation}
Resource specification: {resource_spec}
Validation result: {validation}

CRITICAL CONSTRAINT RULES (HARD CONSTRAINTS):
1. **You MUST only recommend from feasible infrastructure options**
2. **You MUST NOT introduce new providers (e.g., free, local) if they are infeasible**
3. **If no feasible solution exists, return {{ 'status': 'no_feasible_solution' }}**
4. **Recommendations MUST be based on actual cost analysis from cost_estimation**
5. **Do not recommend options with cost=0 unless they are explicitly free resources**

MULTI-OBJECTIVE OPTIMIZATION REQUIREMENTS:
You MUST perform multi-objective optimization considering:
1. **Cost optimization** (40% weight): Minimize total cost while meeting requirements
2. **Time optimization** (30% weight): Consider project deadlines and time constraints
3. **Risk optimization** (30% weight): Evaluate reliability, availability, and technical risks

SCORING FORMULA:
Overall Score = (0.4 × normalized_cost_score) + (0.3 × normalized_time_score) + (0.3 × normalized_risk_score)

Provide a comprehensive recommendation that includes:
1. Overall best option with detailed multi-objective reasoning
2. Cost-performance analysis with specific optimization scores
3. Trade-offs between different options with weighted analysis
4. Specific recommendations based on multi-objective optimization
5. Implementation considerations with step-by-step guidance
6. Top-3 ranking with detailed scoring breakdown

Return your response in JSON format with this EXACT structure (wrapped under "recommendation" key):
{{
  "recommendation": {{
    "multi_objective_optimization": {{
      "optimization_weights": {{
        "cost": 0.4,
        "time": 0.3,
        "risk": 0.3
      }},
      "scoring_methodology": "weighted_sum_normalized"
    }},
    "top_ranking": [
      {{
        "rank": 1,
        "provider": "specific provider and configuration",
        "overall_score": 0.0,
        "cost_score": 0.0,
        "time_score": 0.0,
        "risk_score": 0.0,
        "reasoning": "detailed explanation"
      }}
    ],
    "best_option": "specific provider and configuration",
    "implementation_steps": [
      "step 1",
      "step 2"
    ],
    "risk_mitigation": "risk mitigation strategies",
    "cost_breakdown": "detailed cost analysis",
    "feasibility_validation": {{
      "constraints_satisfied": true,
      "feasibility_verified": true,
      "cost_verified": true
    }}
  }}
}}

If no feasible solution exists:
{{
  "recommendation": {{
    "status": "no_feasible_solution",
    "reasoning": "detailed explanation of why no solution exists"
  }}
}}

IMPORTANT: You MUST strictly follow the JSON structure above. Do not modify field names or structure.
```
