---
name: Experiment Pipeline Design
category: research-planning/experiment-pipeline-design
type: system
status: active
version: 1.0
origin: planning/route_expansion, planning/plan_enricher, planning/plan_structurer, planning/plan_canonicalizer
---

# Skill: Experiment Pipeline Design

## Purpose

Decompose a designed method into an executable, dependency-ordered plan: stages, steps, inputs, outputs, tools, time and the artifact each step must produce, so the work can be scheduled, parallelised and reviewed step by step.

## When to Use

Use this skill when:

- A method is designed but not yet broken into work that someone could start this week.
- Steps are described as prose phases with no inputs, outputs or dependencies.
- The work must be parallelised across people or machines.
- You need to know the critical path before estimating cost or negotiating a deadline.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 流水线是把已定的方法分解为可执行步骤
```

## Research Method

1. **Decompose by artifact, not by activity.** Every step must produce a named artifact (a split dataset, a trained checkpoint, a metrics table) that some later step consumes. A step whose output nobody consumes is a checkpoint or should be removed.
2. **Canonicalise the stages.** Collapse each step into exactly one of: data, model build, training, evaluation. Free-text stages such as "do the experiments" hide several distinct steps and destroy schedulability.
3. **Make dependencies explicit and acyclic.** Reference steps by id and require that every input is either the output of an earlier step or a declared external resource. Cycles and dangling inputs are errors to fix, not ambiguities to tolerate.
4. **Attach tools and a time estimate to every step**, with the basis for the estimate (dataset size, model size, number of runs). An estimate without a basis cannot be revised when it turns out to be wrong, which is the only thing that ever happens to estimates.
5. **Mark the critical path and the parallelisable branches.** State which steps the schedule depends on and which can run concurrently; this is what shows where extra compute or extra people actually shorten the project.
6. **Plan evaluation, ablation and sweep runs as first-class steps.** Evaluation consumes the trained artifact and produces the metrics the claims rest on. Enumerate seeds, hyperparameter sweeps and ablations here rather than discovering them after the first results look wrong.
7. **Verify the route against the method.** Walk the pipeline and confirm that every element of the intervention is built by some step and measured by some evaluation step. A method component with no build step or no measurement step is a hole in the plan, not a detail.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every step must name its inputs, outputs, dependencies, tools and time basis. Artifact names must be consistent across steps so dependencies are mechanically checkable. Time and cost estimates must derive from run count, model size and data volume rather than assertion.

## Expected Output

Produce:

- a step table with id, stage, technique, inputs, outputs, dependencies, tools and time estimate
- the serialised pipeline with the critical path and parallelisable branches marked
- the enumerated training, evaluation, ablation and sweep runs
- a technical-route narrative explaining why this ordering is necessary and what forces it

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/planning/prompts/route_expansion.py` — SYSTEM_PROMPT

```text
You are a technical route planning expert. Please enhance the research plans with detailed technical implementation pipelines.

Current Research Plans (with method design):
{plans_json}

For each plan, enhance the pipeline field with specific technical implementation steps.

You MUST follow this EXACT JSON schema (Research Computation Graph):
{{
  "plans": [
    {{
      "plan_id": "A",
      "strategy": "conservative",
      "idea": "Brief core idea description",
      "method": {{
        "paradigm": "deep_learning",
        "learning_type": "supervised",
        "architecture": {{
          "type": "specific_architecture_type",
          "backbone": "specific_backbone_model",
          "modifications": ["mod1", "mod2"]
        }},
        "conditioning": {{
          "type": "specific_conditioning_type",
          "inputs": ["input1", "input2"]
        }}
      }},
      "pipeline": [
        {{
          "stage": "data_preparation",
          "type": "data_processing",
          "inputs": ["raw_data"],
          "outputs": ["processed_data"],
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "model_training", 
          "type": "model_optimization",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"],
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "evaluation",
          "type": "performance_measurement",
          "inputs": ["trained_model"],
          "outputs": ["evaluation_results"],
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }}
      ]
    }}
  ]
}},
    {{
      "plan_id": "B",
      "strategy": "balanced", 
      "idea": "Brief core idea description",
      "method": {{
        "architecture": "specific_architecture_name",
        "learning_type": "supervised/unsupervised/reinforcement",
        "key_modules": ["module1", "module2"]
      }},
      "pipeline": [
        {{
          "stage": "data_preparation",
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "model_training", 
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "evaluation",
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }}
      ]
    }},
    {{
      "plan_id": "C",
      "strategy": "innovative",
      "idea": "Brief core idea description", 
      "method": {{
        "architecture": "specific_architecture_name",
        "learning_type": "supervised/unsupervised/reinforcement",
        "key_modules": ["module1", "module2"]
      }},
      "pipeline": [
        {{
          "stage": "data_preparation",
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "model_training", 
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }},
        {{
          "stage": "evaluation",
          "technique": "specific_technique",
          "output": "expected_output",
          "tools": ["tool1", "tool2"],
          "timeline": "time_estimate"
        }}
      ]
    }}
  ]
}}

CRITICAL REQUIREMENTS:
1. You MUST preserve all existing fields and only enhance the pipeline
2. Pipeline stages MUST be specific and actionable
3. Each stage MUST include technique, output, tools, and timeline
4. Output MUST be valid JSON (parsable by json.loads)
5. ALL brackets MUST be properly closed
6. NO trailing commas
7. DO NOT output partial JSON
8. DO NOT include markdown or explanations

FIELD CONSTRAINTS:
- pipeline.stage: Must be specific (e.g., "data_preparation", "model_training", "evaluation")
- pipeline.technique: Must be specific (e.g., "physics_simulation", "supervised_learning", "grid_search")
- pipeline.output: Must be concrete (e.g., "synthetic_dataset", "trained_model", "performance_metrics")
- pipeline.tools: Must be specific software/tools
- pipeline.timeline: Must be realistic time estimates

SELF-CHECK BEFORE OUTPUT:
- All plans have enhanced pipeline fields
- Pipeline stages are concrete and actionable
- No natural language descriptions in pipeline
- All values are computable

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```

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

### `modules/planning/prompts/plan_structurer.py` — TEMPLATE

```text
You are a research plan structuring expert. Your task is to convert free-text research plans into structured, computable IR v2 representations.

Current Research Plans (free-text format):
{plans_json}

You MUST convert each plan into the EXACT JSON schema below. DO NOT output natural language descriptions.

CRITICAL REQUIREMENTS (IR v2 Standard):
1. ALL pipeline steps MUST have unique step_id (s1, s2, s3...)
2. ALL stage values MUST use standard enumerations (data, model_build, training, evaluation)
3. ALL dependencies MUST use step_id references (depends_on: ["s1", "s2"])
4. NO free-text stage/type values allowed
5. ALL meta fields MUST be unified (complexity, innovation, compute, data)

EXACT JSON SCHEMA (Research Computation Graph IR v2):
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
          "dependencies": ["dependency1"]
        }},
        {{
          "step_id": "s2",
          "stage": "training", 
          "type": "supervised",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"],
          "depends_on": ["s1"]
        }},
        {{
          "step_id": "s3",
          "stage": "evaluation",
          "type": "performance_measurement",
          "inputs": ["trained_model"],
          "outputs": ["evaluation_results"],
          "depends_on": ["s2"]
        }}
      ],
      "risks": [
        {{
          "type": "domain_gap|technical_complexity|data_quality|compute_intensity|convergence",
          "level": "low|medium|high"
        }}
      ],
      "meta": {{
        "complexity": "low|medium|high",
        "innovation": "low|medium|high", 
        "compute": "low|medium|high",
        "data": "synthetic|real|hybrid"
      }}
    }}
  ]
}}

ENUM CONSTRAINTS (STRICTLY ENFORCE):
- stage: data, model_build, training, evaluation
- type: supervised, self_supervised, unsupervised, reinforcement
- paradigm: cnn, transformer, hybrid, diffusion, neural_ode
- architecture.family: unet, resnet, vit, gan, diffusion, neural_ode, mlp
- risk.type: domain_gap, technical_complexity, data_quality, compute_intensity, convergence
- meta fields: complexity, innovation, compute, data (with low/medium/high or synthetic/real/hybrid)

CONVERSION RULES:
1. If stage contains "data" → convert to "data"
2. If stage contains "training" → convert to "training"
3. If stage contains "evaluation" → convert to "evaluation"
4. If stage contains "model" or "architecture" → convert to "model_build"
5. If dependencies are string names → convert to step_id references
6. If meta has extra fields → remove and keep only standard fields

SELF-CHECK BEFORE OUTPUT (IR v2):
- All step_id are unique and sequential (s1, s2, s3...)
- All stage values are from standard enumeration
- All dependencies use depends_on with step_id references
- All meta fields are unified and standardized
- No free-text values in structured fields

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```

### `modules/planning/prompts/plan_canonicalizer.py` — TEMPLATE

```text
You are a research plan canonicalization expert. Your task is to convert free-form research IR into standardized, computable IR v2.

Current Research Plans (free-form IR):
{plans_json}

You MUST convert each plan into the EXACT JSON schema below. This is CRITICAL for downstream modules (Decision, Resource, Experiment).

CRITICAL REQUIREMENTS:
1. ALL pipeline steps MUST have unique step_id (s1, s2, s3...)
2. ALL stage values MUST use standard enumerations (data, model_build, training, evaluation)
3. ALL type values MUST use learning enumerations (supervised, self_supervised, unsupervised, reinforcement)
4. ALL dependencies MUST use step_id references (depends_on: ["s1", "s2"])
5. ALL meta fields MUST be unified (complexity, innovation, compute, data)
6. NO free-text stage/type values allowed

EXACT JSON SCHEMA (IR v2 - Standardized Computable IR):
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
          "outputs": ["synthetic_dataset"],
          "depends_on": []
        }},
        {{
          "step_id": "s2", 
          "stage": "training",
          "type": "supervised",
          "inputs": ["synthetic_dataset"],
          "outputs": ["trained_model"],
          "depends_on": ["s1"]
        }},
        {{
          "step_id": "s3",
          "stage": "evaluation",
          "type": "performance_measurement", 
          "inputs": ["trained_model"],
          "outputs": ["evaluation_results"],
          "depends_on": ["s2"]
        }}
      ],
      "risks": [
        {{
          "type": "domain_gap|technical_complexity|data_quality|compute_intensity|convergence",
          "level": "low|medium|high"
        }}
      ],
      "meta": {{
        "complexity": "low|medium|high",
        "innovation": "low|medium|high", 
        "compute": "low|medium|high",
        "data": "synthetic|real|hybrid"
      }}
    }}
  ]
}}

ENUM CONSTRAINTS (STRICTLY ENFORCE):
- stage: data, model_build, training, evaluation
- type: supervised, self_supervised, unsupervised, reinforcement
- paradigm: cnn, transformer, hybrid, diffusion, neural_ode
- architecture.family: unet, resnet, vit, gan, diffusion, neural_ode, mlp
- risk.type: domain_gap, technical_complexity, data_quality, compute_intensity, convergence
- meta fields: complexity, innovation, compute, data (with low/medium/high or synthetic/real/hybrid)

CONVERSION RULES:
1. If stage is "data_preparation" → convert to "data"
2. If stage contains "training" → convert to "training"
3. If stage contains "evaluation" → convert to "evaluation"
4. If stage contains "model" or "architecture" → convert to "model_build"
5. If type is ambiguous → map to closest learning type
6. If dependencies are string names → convert to step_id references
7. If meta has extra fields → remove and keep only standard fields

SELF-CHECK BEFORE OUTPUT:
- All step_id are unique and sequential (s1, s2, s3...)
- All stage values are from standard enumeration
- All type values are from learning enumeration
- All depends_on references valid step_id
- All meta fields are unified and standardized
- No free-text values in structured fields

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```
