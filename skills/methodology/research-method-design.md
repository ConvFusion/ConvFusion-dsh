---
name: Research Method Design
category: methodology/method-design
type: system
status: active
version: 1.0
origin: planning/method_expansion
---

# Skill: Research Method Design

## Purpose

Convert a committed research strategy into a concrete, testable method: the paradigm, the learning setting, the intervention, the training protocol and the data it requires, stated so that a third party could implement it and know what would falsify it.

## When to Use

Use this skill when:

- A strategy exists at the level of an idea but has no implementable method behind it.
- The method is named but its intervention is not stated (for example "a diffusion model" with no stated change).
- You need to check that the planned evaluation could actually falsify the mechanism.
- Data requirements must be settled before resources are estimated.

## Research Method

1. **State the paradigm and learning setting first.** Supervised, self-supervised, unsupervised, reinforcement, or a non-learning analytical method. The setting determines which data may legitimately be used and which comparisons are fair; everything downstream is conditional on it.
2. **Name the intervention precisely.** State what changes relative to the closest existing method. "Add conditioning" is a direction, not an intervention; "condition the denoiser on per-pixel transmission estimated by a physics model" is one.
3. **Fix what is held constant.** Backbone, data split, optimiser, schedule and compute budget. A design in which every component moves at once cannot attribute any result to any component.
4. **Specify the training protocol to the level of reproducibility**: objective, schedule, augmentation, regularisation, stopping rule, and the number of seeds. State the cost of a single run, since this becomes the input to resource estimation.
5. **State the data requirement as properties, not dataset names.** Modality, resolution, label type, volume, licensing, and whether the data exists, must be acquired, or must be synthesised. A method needing data that does not exist is a data-collection project first.
6. **Predict the observable difference and the failure signature.** Say which metric should improve, by roughly how much, and what result would show the central mechanism does not work. A method with no failure signature cannot be falsified by its own evaluation.
7. **Check the method against the strategy posture.** If the method quietly requires a component the chosen posture excludes, such as a new module inside a conservative plan, either the method or the posture must change now rather than mid-project.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Claims about what existing methods do must cite the works. Data requirements must distinguish existing datasets from data to be acquired and must state access conditions. Training cost figures must show their basis (model size, dataset size, epochs, hardware class). The intervention must be described in enough detail that an independent researcher could implement it.

## Expected Output

Produce:

- the paradigm and learning setting, with its implications for data and comparison
- the named intervention and the components held constant
- a reproducible training protocol with a per-run cost estimate
- data requirements as properties (modality, volume, labels, licensing, acquisition path)
- the expected observable difference and the failure signature

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/planning/prompts/method_expansion.py` — SYSTEM_PROMPT

```text
You are a research methodology design expert. Please design specific research methods for the following research plans.

Current Research Plans:
{plans_json}

For each plan, enhance the structured method description with specific technical details.

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
        }},
        "training_strategy": "strategy_name",
        "data_requirements": "data_type_and_volume"
      }}
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
        "key_modules": ["module1", "module2"],
        "training_strategy": "strategy_name",
        "data_requirements": "data_type_and_volume"
      }}
    }},
    {{
      "plan_id": "C",
      "strategy": "innovative",
      "idea": "Brief core idea description", 
      "method": {{
        "architecture": "specific_architecture_name",
        "learning_type": "supervised/unsupervised/reinforcement",
        "key_modules": ["module1", "module2"],
        "training_strategy": "strategy_name",
        "data_requirements": "data_type_and_volume"
      }}
    }}
  ]
}}

CRITICAL REQUIREMENTS:
1. You MUST preserve the original plan_id and strategy values
2. Method design MUST match the strategy type
3. Provide specific, actionable method descriptions
4. Output MUST be valid JSON (parsable by json.loads)
5. ALL brackets MUST be properly closed
6. NO trailing commas
7. DO NOT omit any fields

SELF-CHECK BEFORE OUTPUT:
- JSON is syntactically valid
- All arrays are properly closed
- No missing brackets
- Original plan_id and strategy values are preserved

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```

### `modules/planning/prompts/plan_initializer.py` — SYSTEM_PROMPT

```text
You are an expert research planning specialist. Based on the following research context and innovation state, generate multiple research plans with different strategies.

Research Topic: {research_topic}
Research Domain: {domain}

Knowledge State (from Discovery):
{knowledge_state}

Innovation State (from Conception):
{innovation_state}
{user_input_section}

Generate 3 research plans (Plan A/B/C), each using a different research strategy:

- Plan A (Conservative): Use mature methods, low risk, suitable for quick validation
- Plan B (Balanced): Combine mature and innovative methods, medium risk
- Plan C (Innovative): Use cutting-edge methods, high risk, high innovation

IMPORTANT: The plans should be based on the research gaps and innovation opportunities identified in the Knowledge State and Innovation State above.

Each plan must contain the following information:
- plan_id: Plan identifier (A/B/C)
- strategy: Strategy type (conservative/balanced/innovative)
- idea: Specific research idea description that addresses the identified research gaps

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
        }},
        {{
          "step_id": "s2",
          "stage": "training", 
          "type": "supervised",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"],
          "depends_on": ["s1"]
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
        }},
        {{
          "step_id": "s2",
          "stage": "training", 
          "type": "supervised",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"],
          "depends_on": ["s1"]
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
        }},
        {{
          "step_id": "s2",
          "stage": "training", 
          "type": "supervised",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"],
          "depends_on": ["s1"]
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

CRITICAL REQUIREMENTS:
1. You MUST output ALL fields in the JSON schema above. DO NOT omit any fields.
2. Output MUST be valid JSON (parsable by json.loads)
3. ALL brackets MUST be properly closed
4. NO trailing commas
5. DO NOT output partial JSON
6. DO NOT include markdown or explanations
7. ALL values MUST be computable (no natural language descriptions)
8. Pipeline MUST be concrete execution steps
9. Risks MUST be structured with type and level
10. Meta fields MUST use predefined categories

FIELD CONSTRAINTS:
- method.architecture: Must be specific (e.g., "U-Net", "Vision Transformer", "ResNet-50")
- method.learning_type: Must be one of: supervised, unsupervised, reinforcement, self-supervised
- pipeline.stage: Must be specific (e.g., "data_preparation", "model_training", "evaluation")
- pipeline.technique: Must be specific (e.g., "physics_simulation", "supervised_learning", "grid_search")
- risks.type: Must be specific risk category
- risks.level: Must be low/medium/high
- meta fields: All must be low/medium/high or specific categories

SELF-CHECK BEFORE OUTPUT:
- JSON is syntactically valid
- All arrays are properly closed
- No missing brackets

If not valid → FIX IT before output

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```
