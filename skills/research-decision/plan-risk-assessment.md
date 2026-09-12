---
name: Plan Risk Assessment
category: research-decision/risk-assessment
type: system
status: active
version: 1.0
origin: planning/plan_enricher, resource/recommendation, resource/consistency_validation
---

# Skill: Plan Risk Assessment

## Purpose

Stress-test a research plan before it is executed: surface the assumptions it rests on, classify the risks that would invalidate it, and decide whether it is executable under the current constraints, including the honest answer that it is not.

## When to Use

Use this skill when:

- A plan is about to be committed and its assumptions have never been written down.
- A risk list exists but contains neither mitigation nor a trigger for acting.
- Budget, deadline, compute availability or data-access constraints may make the plan impossible.
- Two candidate plans must be compared on risk rather than on expected performance.

## Research Method

1. **Extract the assumptions before the risks.** List what must be true for the plan to work (the data is obtainable, the phenomenon reproduces, the baseline is reproducible) and mark each as testable or untestable. An untestable assumption is a risk that no experiment inside the plan can retire.
2. **Classify risks on a fixed taxonomy rather than ad hoc**, for example domain gap, technical complexity, data quality, compute intensity and convergence, or an equally explicit domain-specific set. A stable taxonomy is what lets two plans be compared at all.
3. **Assign severity and mitigation to each risk.** Every risk carries a level, a concrete mitigation, an owner, and a trigger stating which observation means the mitigation must be executed. A risk with no mitigation is a plan defect rather than a risk entry.
4. **Apply hard constraints as gates, not scores.** Budget, deadline, compute availability, licensing and data governance are pass or fail. A plan that fails a gate is infeasible regardless of how well it scores elsewhere, so evaluate gates before any weighted ranking.
5. **Look for correlated failure.** Several risks that share one cause (a single dataset, one person, one cluster) are one risk with a compounded effect. Name the shared dependency; independent-looking risks that fail together are the most common cause of a dead project.
6. **Check the internal consistency of the plan artefacts.** Requirement, instance choice, infrastructure and cost must describe the same plan. A costed option that does not satisfy the stated requirement is an error rather than a rounding difference, and must be reported as one.
7. **Give a verdict with the condition that would change it.** State feasible, feasible only after a named relaxation or descope, or no feasible plan under the constraints, together with the evidence that would flip the verdict.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Assumptions must be written as checkable propositions with the artefact or experiment that would test each. Risk severities must have a stated basis. Gate failures must cite the constraint and the measured shortfall. An infeasible verdict must name the binding constraint and the relaxation that would open the option set.

## Expected Output

Produce:

- the assumptions the plan rests on, marked testable or untestable
- risks classified on a stated taxonomy with severity, mitigation, owner and trigger
- hard-constraint gate results with the measured shortfall for each failure
- shared dependencies and correlated failure modes
- a feasibility verdict with the condition that would change it

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/planning/prompts/plan_enricher.py` — SYSTEM_PROMPT

```text
You are a research plan evaluation expert. Please enrich the research plans with comprehensive assessment information.

Current Research Plans (with method and pipeline):
{plans_json}

For each plan, enrich with comprehensive assessment information including assumptions, risks, and meta information.

CRITICAL REQUIREMENTS (IR v2 Standard):
1. ALL meta fields MUST be unified (complexity, innovation, compute, data)
2. NO old meta fields allowed (data_dependency, compute_intensity, success_probability)
3. ALL values MUST use standard enumerations (low/medium/high or synthetic/real/hybrid)

You MUST follow this EXACT JSON schema (Research Computation Graph IR v2):
{{
  "plans": [
    {{
      "plan_id": "A",
      "strategy": "conservative",
      "idea": "Brief core idea description",
      "method": {{
        "paradigm": "cnn|transformer|hybrid|diffusion|neural_ode",
        "learning": "supervised|self_supervised|unsupervised|reinforcement",
        "architecture": {{
          "family": "unet|resnet|vit|gan|diffusion|neural_ode|mlp",
          "backbone": "specific_backbone_name"
        }}
      }},
      "pipeline": [
        {{
          "step_id": "s1",
          "stage": "data",
          "type": "synthetic_generation",
          "inputs": ["raw_data"],
          "outputs": ["processed_data"],
          "depends_on": []
        }}
      ],
      "technical_route": "Detailed technical roadmap: 1) Implement CNN architecture with ResNet backbone, 2) Train on synthetic dataset using physics-based degradation models, 3) Validate on real aerial imagery with domain adaptation",
      "assumptions": ["assumption1", "assumption2"],
      "risks": [
        {{
          "type": "domain_gap|technical_complexity|data_quality|compute_intensity|convergence",
          "level": "low|medium|high"
        }}
      ],
      "expected_contribution": "Scientific contributions: 1) Novel physics-guided neural network architecture, 2) Improved weather degradation modeling, 3) Enhanced aerial image restoration quality. Technical contributions: 1) Open-source implementation, 2) Reproducible research pipeline, 3) Benchmark datasets",
      "meta": {{
        "complexity": "low|medium|high",
        "innovation": "low|medium|high", 
        "compute": "low|medium|high",
        "data": "synthetic|real|hybrid"
      }}
    }},
    {{
      "plan_id": "B",
      "strategy": "balanced", 
      "idea": "Brief core idea description",
      "method": {{
        "paradigm": "cnn|transformer|hybrid|diffusion|neural_ode",
        "learning": "supervised|self_supervised|unsupervised|reinforcement",
        "architecture": {{
          "family": "unet|resnet|vit|gan|diffusion|neural_ode|mlp",
          "backbone": "specific_backbone_name"
        }}
      }},
      "pipeline": [
        {{
          "step_id": "s1",
          "stage": "data",
          "type": "synthetic_generation",
          "inputs": ["raw_data"],
          "outputs": ["processed_data"],
          "depends_on": []
        }}
      ],
      "technical_route": "Hybrid technical roadmap: 1) Combine CNN and Transformer architectures, 2) Self-supervised pre-training on unlabeled aerial data, 3) Multi-task supervised fine-tuning on synthetic weather degradation dataset",
      "assumptions": ["assumption1", "assumption2"],
      "risks": [
        {{
          "type": "domain_gap|technical_complexity|data_quality|compute_intensity|convergence",
          "level": "low|medium|high"
        }}
      ],
      "expected_contribution": "Scientific contributions: 1) Hybrid CNN-Transformer architecture for aerial image restoration, 2) Self-supervised learning for domain adaptation, 3) Multi-task learning for degradation disentanglement. Technical contributions: 1) Scalable training pipeline, 2) Modular architecture design, 3) Transfer learning framework",
      "meta": {{
        "complexity": "low|medium|high",
        "innovation": "low|medium|high", 
        "compute": "low|medium|high",
        "data": "synthetic|real|hybrid"
      }}
    }},
    {{
      "plan_id": "C",
      "strategy": "innovative",
      "idea": "Brief core idea description", 
      "method": {{
        "paradigm": "cnn|transformer|hybrid|diffusion|neural_ode",
        "learning": "supervised|self_supervised|unsupervised|reinforcement",
        "architecture": {{
          "family": "unet|resnet|vit|gan|diffusion|neural_ode|mlp",
          "backbone": "specific_backbone_name"
        }}
      }},
      "pipeline": [
        {{
          "step_id": "s1",
          "stage": "data",
          "type": "synthetic_generation",
          "inputs": ["raw_data"],
          "outputs": ["processed_data"],
          "depends_on": []
        }}
      ],
      "technical_route": "Innovative technical roadmap: 1) Design Neural ODE architecture for continuous-time weather modeling, 2) Implement differentiable atmospheric rendering, 3) Train with adjoint sensitivity method for temporal dynamics",
      "assumptions": ["assumption1", "assumption2"],
      "risks": [
        {{
          "type": "domain_gap|technical_complexity|data_quality|compute_intensity|convergence",
          "level": "low|medium|high"
        }}
      ],
      "expected_contribution": "Scientific contributions: 1) Neural ODE framework for continuous-time weather dynamics, 2) Physics-constrained neural rendering, 3) Temporal interpolation and extrapolation of atmospheric effects. Technical contributions: 1) Novel ODE-based restoration system, 2) Differentiable physics integration, 3) Real-time weather simulation capability",
      "meta": {{
        "complexity": "low|medium|high",
        "innovation": "low|medium|high", 
        "compute": "low|medium|high",
        "data": "synthetic|real|hybrid"
      }}
    }}
  ]
}}

CRITICAL REQUIREMENTS (IR v2):
1. You MUST preserve all existing fields and only enrich with assessment information
2. ALL plans MUST include technical_route field with specific implementation roadmap
3. ALL plans MUST include expected_contribution field with scientific/technical contributions
4. These two fields MUST be placed at the top level of each plan object
5. If you fail to include technical_route or expected_contribution, the entire plan will be rejected
6. The technical_route MUST describe the specific technical approach and implementation roadmap
7. The expected_contribution MUST describe the expected scientific and technical contributions
8. Pay special attention to technical_route and expected_contribution - these are the most important fields
9. Risks MUST be structured with type, level, and mitigation
10. Meta fields MUST use predefined categories
11. Assumptions MUST be specific and testable
12. Output MUST be valid JSON (parsable by json.loads)
13. ALL brackets MUST be properly closed
14. NO trailing commas
15. DO NOT output partial JSON
16. DO NOT include markdown or explanations

IMPORTANT: Before output, check that each plan has:
- technical_route: A detailed technical implementation roadmap
- expected_contribution: Clear scientific and technical contributions
- If missing, add them immediately!

FIELD CONSTRAINTS (IR v2):
- technical_route: Must be specific technical approach and implementation roadmap
- expected_contribution: Must describe scientific and technical contributions
- risks.type: Must be domain_gap|technical_complexity|data_quality|compute_intensity|convergence
- risks.level: Must be low/medium/high
- risks.mitigation: Must be specific mitigation strategy
- meta.complexity: Must be low/medium/high
- meta.innovation: Must be low/medium/high
- meta.compute: Must be low/medium/high
- meta.data: Must be synthetic/real/hybrid
- assumptions: Must be specific and testable statements

SELF-CHECK BEFORE OUTPUT (IR v2):
- All plans include technical_route field
- All plans include expected_contribution field
- All meta fields use unified IR v2 categories (complexity, innovation, compute, data)
- No old meta fields allowed (data_dependency, compute_intensity, success_probability)
- All risks use standard risk types
- All plans have enriched assessment information
- No natural language descriptions in structured fields

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
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
