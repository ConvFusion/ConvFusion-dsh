---
name: Research Strategy Portfolio
category: research-management/research-planning
type: system
status: active
version: 1.0
origin: planning/plan_initializer, planning/research_strategy_synthesis
---

# Skill: Research Strategy Portfolio

## Purpose

Decide which research strategies the project should actually pursue, as a deliberate risk-diversified portfolio rather than one bet, and then consolidate the surviving plans into a single committed strategy with a validation protocol and a reproducibility contract.

## When to Use

Use this skill when:

- A research direction has been chosen but not yet translated into committable strategies.
- You cannot tell whether the plan is a safe incremental study or a high-risk, high-reward bet.
- Several candidate plans exist and must be reduced to the ones worth executing.
- The experiment graph, validation protocol or target venue is still undefined.

## Research Method

1. **Anchor every plan to a named gap.** Each strategy must cite the gap or opportunity it addresses, drawn from the knowledge state or innovation state. A plan whose motivation is "this would be interesting" cannot be compared against the others.
2. **Make risk posture explicit and non-redundant.** Assign each plan a posture: conservative (established components, fast falsification), balanced (one unproven component), innovative (a new mechanism with a real chance of not working). If two plans share a posture, they are one plan with variants.
3. **Hold the comparison fixed across the portfolio.** Datasets, metrics and baselines must be identical across plans, otherwise the comparison measures the evaluation protocol rather than the strategy.
4. **Write the experiment graph before spending anything.** Express each plan as a dependency graph of stages (data, model build, training, evaluation) with inputs, outputs and edges. A plan whose evaluation step does not consume its own training output is not yet a plan.
5. **Design the ablation plan up front.** For every unproven component, state the ablation or control that would show it matters and the observable difference expected. A component with no possible ablation is either not novel or not testable.
6. **Commit to one strategy and keep the others on record.** Select the plan to execute now and say why; record each rejected plan with the condition under which it would be revived. Rejected plans with no revival condition should be deleted rather than archived.
7. **Fix the reproducibility and publication contract at commitment time**, not after results arrive: seeds, hyperparameter tables, hardware and software environment, code-release scope, target venue, and the timeline phases the venue imposes.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every plan must trace to a documented gap or knowledge-state claim. Baselines and metrics must be justified against the literature rather than assumed. The ablation plan must name the component and the expected observable difference. Rejected plans must record the reason for rejection and the condition for revival.

## Expected Output

Produce:

- two to four strategies, each with its posture, the gap it targets and its falsification condition
- the selected strategy, the reason for selection, and the rejected alternatives on record
- a validation protocol (datasets, metrics, baselines) shared across the portfolio
- an experiment graph and an ablation plan for the unproven components
- a reproducibility and publication contract (seeds, hyperparameters, hardware, environment, venue, timeline)

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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

### `modules/planning/prompts/research_strategy_synthesis.py` — TEMPLATE

```text
You are an expert research strategist. Synthesize the research plans, knowledge state, and innovation state into a comprehensive Research Strategy State.

Research Topic: {research_topic}
Research Domain: {domain}

Knowledge State (from Discovery):
{knowledge_state}

Innovation State (from Conception):
{innovation_state}
{user_input_section}

Research Plans (from Planning):
{plans}

Please synthesize the above information into a unified Research Strategy State.

IMPORTANT: You MUST wrap the entire output in a "research_strategy_state" key.

Output format:
{{
  "research_strategy_state": {{
    "research_topic": "{research_topic}",
    "domain": "{domain}",
    "selected_plans": ["A", "B", "C"],
    "experiment_graph": {{
      "nodes": [
        {{
          "id": "n1",
          "type": "data_preparation",
          "description": "数据准备步骤",
          "inputs": [],
          "outputs": ["processed_data"]
        }},
        {{
          "id": "n2",
          "type": "model_training",
          "description": "模型训练步骤",
          "inputs": ["processed_data"],
          "outputs": ["trained_model"]
        }},
        {{
          "id": "n3",
          "type": "evaluation",
          "description": "模型评估步骤",
          "inputs": ["trained_model"],
          "outputs": ["evaluation_results"]
        }}
      ],
      "edges": [
        {{
          "source": "n1",
          "target": "n2",
          "description": "数据流向训练"
        }},
        {{
          "source": "n2",
          "target": "n3",
          "description": "模型流向评估"
        }}
      ]
    }},
    "validation_protocol": {{
      "metrics": ["accuracy", "f1_score", "precision", "recall", "training_time", "inference_time"],
      "datasets": ["train", "validation", "test"],
      "baselines": ["State-of-the-art Model 1", "State-of-the-art Model 2", "Simple Baseline"]
    }},
    "technical_route": [
      {{
        "step": "1. Literature Review & Problem Formulation",
        "description": "深入研究领域文献，明确研究问题和创新点",
        "tools": ["Google Scholar", "arXiv", "Zotero"],
        "output": "Research problem statement, literature survey report"
      }},
      {{
        "step": "2. Data Collection & Preprocessing",
        "description": "收集和整理研究所需数据，进行预处理和数据增强",
        "tools": ["Pandas", "NumPy", "Data augmentation libraries"],
        "output": "Processed datasets ready for training"
      }},
      {{
        "step": "3. Model Design & Implementation",
        "description": "设计和实现研究模型，包括架构选择和创新点实现",
        "tools": ["PyTorch", "TensorFlow", "Hugging Face"],
        "output": "Implemented model codebase"
      }},
      {{
        "step": "4. Training & Validation",
        "description": "训练模型，进行超参数调优和验证",
        "tools": ["Weights & Biases", "TensorBoard", "CUDA"],
        "output": "Trained models and validation results"
      }},
      {{
        "step": "5. Evaluation & Analysis",
        "description": "全面评估模型性能，进行消融实验和结果分析",
        "tools": ["scikit-learn", "Matplotlib", "Seaborn"],
        "output": "Evaluation report and analysis"
      }},
      {{
        "step": "6. Paper Writing & Submission",
        "description": "撰写论文，准备提交材料",
        "tools": ["LaTeX", "Overleaf", "Grammarly"],
        "output": "Research paper ready for submission"
      }}
    ],
    "ablation_plan": [
      {{
        "ablation_id": "ab1",
        "description": "移除创新模块A，验证其有效性",
        "purpose": "验证创新模块A对性能的提升贡献"
      }},
      {{
        "ablation_id": "ab2",
        "description": "替换创新模块B为传统方法",
        "purpose": "对比创新模块B与传统方法的效果差异"
      }},
      {{
        "ablation_id": "ab3",
        "description": "移除特定的数据预处理步骤",
        "purpose": "验证数据预处理对模型性能的影响"
      }}
    ],
    "publication_strategy": {{
      "target_venues": ["Top Conference in Domain", "Journal of Machine Learning Research", "arXiv preprint"],
      "key_contributions": [
        "Novel architecture design",
        "Improved performance on benchmark datasets",
        "Theoretical analysis or insights",
        "Practical implications for real-world applications"
      ],
      "timeline": [
        {{
          "phase": "Initial Submission",
          "deadline": "Month X, Year Y"
        }},
        {{
          "phase": "Revision & Resubmission",
          "deadline": "Month Z, Year Y"
        }},
        {{
          "phase": "Final Acceptance",
          "deadline": "Month W, Year Z"
        }}
      ]
    }},
    "reproducibility": {{
      "code_release": true,
      "seed_management": "所有实验使用固定随机种子",
      "hyperparameters": "完整超参数配置表",
      "hardware_specs": "详细硬件规格",
      "software_env": "完整环境依赖说明"
    }},
    "knowledge_state": {knowledge_state},
    "innovation_state": {innovation_state}
  }}
}}

IMPORTANT:
1. Make sure the JSON is syntactically valid
2. Fill in specific details based on the input information
3. Ensure all fields are present and properly structured
4. The technical_route should be specific to the research topic
5. The ablation_plan should address key aspects of the research
6. The publication_strategy should be appropriate for the domain
7. The reproducibility section must be detailed, including:
   - code release (public repository)
   - random seed management (fixed seeds for all experiments)
   - hyperparameter configuration (full tables)
   - hardware specifications
   - software environment (dependencies)

OUTPUT FORMAT:
ONLY output the JSON object.
NO markdown. NO explanation.
Start with {{ and end with }}.
```
