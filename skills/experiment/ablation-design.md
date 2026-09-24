---
name: Ablation & Contribution Isolation
category: experiment/ablation-design
type: system
status: active
version: 1.0
origin: experiment/design, experiment/simulation, experiment/summary
---

# Skill: Ablation & Contribution Isolation

## Purpose

Design the experiments that show which part of a method causes the effect, so a gain is attributed to a mechanism rather than to the whole system, extra capacity, or tuning luck.

## When to Use

Use this skill when:

- A method combines several components and the paper will claim each of them helps.
- A reviewer would ask which component actually drove the improvement.
- Deciding whether an extra component justifies its complexity and compute cost.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 消融要按方法的组件来拆分，否则归因不成立
```

## Research Method

1. **Enumerate contributions as removable units.** List every component or design decision the paper will claim, and define the exact variant in which it is removed or replaced by a neutral equivalent. If a component cannot be removed, say so and drop the claim attached to it.
2. **Run one factor at a time first, then interactions.** Vary one factor per run with everything else at the full configuration, and add combined-removal runs where two components plausibly interact. Keep the full model as the reference row for every comparison.
3. **Control for capacity, not only structure.** When removing a component also changes parameter count or compute, add a size-matched or compute-matched control so the effect is attributed to the mechanism rather than to added capacity.
4. **Define the measurement and decision for each ablation before running.** Reuse the primary metric and the same protocol as the main comparison, state what magnitude of drop would count as evidence that the component matters, and state what a null result would mean.
5. **Rank ablations by how much they change the interpretation and prune the rest.** Drop runs that only confirm the obvious, and report the run budget so a reader can judge coverage.
6. **Keep every result traceable to its variant.** Each ablation run must carry the config diff from the full model plus its own metrics and predictions, so the summary table is regenerable from artefacts rather than hand-assembled.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

One recorded config diff per ablation run, a full-model reference under an identical protocol, and per-run metrics for both. A claim of the form that component X contributes requires the corresponding ablation row together with its variance.

## Expected Output

Produce:

- list of claimed contributions with their exact removal definition
- ablation matrix with the full model as reference
- interaction runs and capacity-matched controls
- per-run decision criteria declared before execution
- run budget with pruning rationale

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/experiment/design/prompts/experiment_design_prompt.py` — TEMPLATE

```text
You are an expert experiment designer working on a Vibe Coding-driven scientific research platform. Your role is to design a complete Data-Driven experiment plan based on the research context provided.

========================
# Research Context
========================

Research Topic: {research_topic}

Planning Results (Research Plan):
{planning_data}

Conception Results (Final Idea):
{conception_data}

========================
# Your Task as Experiment Designer
========================

Design a comprehensive Data-Driven experiment plan. Your task is to:

1. **Experiment Assessment**: Before designing the experiment, FIRST evaluate the research topic to produce TWO critical execution decisions and a general feasibility analysis:

   **Execution Decisions (these control which pipeline stages run):**
   - **needs_dataset** (true/false): Does this experiment require a dataset collection step? Set to `false` if the research is purely theoretical, analytical, or does not depend on empirical data. Set to `true` if the experiment needs training/evaluation data.
   - **is_programmable** (true/false): Can this experiment be implemented as code (Python/PyTorch)? Set to `false` if it requires special hardware (quantum computers, wet-lab equipment, robotics, particle accelerators) that CANNOT be simulated on standard CPU/GPU. Set to `true` if the core experiment can run via standard software.

   **General Feasibility Analysis:**
   - **Hardware Dependency**: Does this research require special hardware that cannot be simulated or accessed via standard cloud/GPU computing?
   - **Software Simulability**: Can the core experiment be implemented using standard software tools on commonly available computing resources?
   - **Physical World Interaction**: Does the experiment require physical-world interaction that cannot be reduced to data-driven computation?
   - **Data Availability**: Can the required data be obtained digitally (HuggingFace, public APIs, digital archives)?
   - If the experiment is NOT fully feasible, clearly state the limitations and suggest which parts CAN be implemented programmatically.
2. **Define the Research Question**: Formulate a clear, testable research question
3. **Select Datasets**: Choose appropriate datasets from HuggingFace (or other sources) for the experiment
4. **Identify Baselines**: List baseline methods to compare against
5. **Define Evaluation Metrics**: Select primary and secondary metrics for evaluation
6. **Outline Experiment Pipeline**: Describe the experiment flow
7. **Plan Ablation Studies**: Design ablation experiments to validate contributions
8. **Design Code Structure**: Define the project code structure for GitHub repository organization

========================
# Output Format
========================

CRITICAL: Your ENTIRE response MUST be a single valid JSON object. Do NOT output any thinking process, explanation, reasoning, or markdown code fences. Output the raw JSON object ONLY — nothing before it and nothing after it.

Format your response as a JSON object with TWO top-level keys: "experiment_assessment" and "experiment_design".
CRITICAL: "experiment_assessment" MUST be a top-level key, NOT nested inside "experiment_design".

{{
    "experiment_assessment": {{
        "is_programmable": true/false,
        "needs_dataset": true/false,
        "feasibility_level": "fully_feasible | partially_feasible | not_feasible",
        "hardware_dependencies": ["List any special hardware required, or empty list if none"],
        "software_simulability": "Description of whether and how the experiment can be done with standard software",
        "physical_world_requirements": ["List any physical-world requirements, or empty list if none"],
        "data_availability": "Description of data accessibility for programming-based experiment",
        "programmable_scope": "Description of which parts can be implemented programmatically",
        "limitations": ["List key limitations for programming-based implementation, or empty list if none"],
        "recommendation": "Brief recommendation: proceed with full implementation / partial implementation / not suitable for programming experiment"
    }},
    "experiment_design": {{
        "research_question": "Clear, testable research question",
        "experiment_hypothesis": "The hypothesis this experiment aims to validate",
        "experiment_name": "Descriptive name for this experiment",
        "programming_language": "Python",
        "framework": "PyTorch",
        "datasets": [
            {{
                "name": "dataset-name",
                "source": "huggingface",
                "config": "optional config name",
                "split": "train/validation/test",
                "size": "approximate data size (e.g. 100K samples)",
                "description": "Brief description of the dataset"
            }}
        ],
        "baselines": ["Baseline1", "Baseline2", "Baseline3"],
        "evaluation_metrics": ["metric1", "metric2", "metric3"],
        "primary_metric": "the most important metric for comparison",
        "experiment_pipeline": "Step-by-step experiment flow description",
        "ablation_plan": "Description of planned ablation studies to validate each contribution",
        "code_structure": {{
            "src": {{
                "dataset": [
                    "{{"name": "download_datasets.py", "purpose": "Download and preprocess datasets"}}",
                    "{{"name": "dataset_utils.py", "purpose": "Dataset utilities and helpers"}}",
                    "{{"name": "preprocessing.py", "purpose": "Data preprocessing functions"}}",
                    "{{"name": "__init__.py", "purpose": "Package init"}}""
                ],
                "method": [
                    "{{"name": "model.py", "purpose": "Main model implementation"}}",
                    "{{"name": "train.py", "purpose": "Training script"}}",
                    "{{"name": "evaluate.py", "purpose": "Evaluation script"}}",
                    "{{"name": "utils.py", "purpose": "Method utilities"}}",
                    "{{"name": "__init__.py", "purpose": "Package init"}}""
                ],
                "analysis": [
                    "{{"name": "plot_results.py", "purpose": "Result visualization and plotting"}}",
                    "{{"name": "metrics.py", "purpose": "Metric calculation functions"}}",
                    "{{"name": "analysis_utils.py", "purpose": "Analysis utilities"}}",
                    "{{"name": "__init__.py", "purpose": "Package init"}}""
                ]
            }},
            "results": [
                "figure_1_main_results.png",
                "figure_2_ablation_study.png",
                "figure_3_training_curves.png",
                "figure_4_baseline_comparison.png"
            ],
            "root_files": [
                "{{"name": "README.md", "purpose": "Project documentation"}}",
                "{{"name": "requirements.txt", "purpose": "Python dependencies"}}",
                "{{"name": ".gitignore", "purpose": "Git ignore rules"}}",
                "{{"name": "LICENSE", "purpose": "Open source license"}}",
                "{{"name": "main.py", "purpose": "Main entry point"}}",
                "{{"name": "config.py", "purpose": "Configuration settings"}}""
            ]
        }}
    }}
}}

IMPORTANT REQUIREMENTS:
1. Focus on Data-Driven experiments (deep learning, statistical analysis)
2. Prefer HuggingFace datasets for easy reproducibility
3. Include at least 3 baseline methods for rigorous comparison
4. Define clear primary and secondary evaluation metrics
5. Design meaningful ablation studies that validate each innovation
6. Define a clean code structure that follows standard Python project conventions
7. Always include src/ directory for source code and results/ directory for experiment outputs
8. ALWAYS perform experiment assessment FIRST before designing the experiment
9. **CRITICAL for needs_dataset**: Set to false ONLY if the research is purely theoretical/analytical and does not require any empirical data for training or evaluation. Most ML/DL experiments need datasets.
10. **CRITICAL for is_programmable**: Set to false ONLY if the experiment fundamentally requires non-simulable special hardware (quantum computing, wet lab, physical robotics, etc.). If it can be simulated or approximated with standard CPU/GPU computing, set to true.

# (JSON formatting policy is provided by Foundation Layer.)
```

### `modules/experiment/simulation/prompts/design_refinement_prompt.py` — PROMPT (function-embedded)

```text
You are an experiment design review assistant for research topic:

## Research Topic
{research_topic}

## Original Experiment Design (v1)
{_format_design(design_v1)}

## Simulated Results
{_format_sim(sim_results)}

## Simulation Quality
Confidence: {sim_quality.get('confidence', 0.5):.2f}
Rationale: {sim_quality.get('rationale', 'Not provided')}

## Baselines
{_format_baselines(baselines)}

---

## Review Criteria

Review the original experiment design against the simulated results. Consider:

1. **Feasibility**: Are the expected metrics realistic given the baselines?
2. **Improvement Margin**: Is the improvement over baselines meaningful (>5%)?
3. **Method Suitability**: Is the chosen method appropriate for the task?
4. **Data Requirements**: Are the required datasets feasible to obtain/use?
5. **Experimental Design**: Are there missing controls or comparisons?

## Refinement Guidelines

If any of these issues are found, propose refinements:

1. **If metrics are too optimistic**:
   - Adjust expected performance to be more realistic
   - Consider alternative evaluation metrics
   - Add more challenging baselines

2. **If improvement margin is small**:
   - Propose method enhancements or variations
   - Suggest hyperparameter tuning ranges
   - Consider ensemble or hybrid approaches

3. **If method is unsuitable**:
   - Recommend alternative methods from literature
   - Suggest architectural modifications
   - Propose different loss functions or training strategies

4. **If data requirements are problematic**:
   - Suggest alternative datasets
   - Propose data augmentation strategies
   - Consider synthetic data generation

5. **If experimental design is incomplete**:
   - Add ablation studies
   - Include more baselines for comparison
   - Add statistical significance tests

---

Return a JSON object with the following structure:

```json
{{
  "refined_experiment_design": {{
    // The refined experiment design (same structure as original)
    "experiment_name": "string",
    "method_spec": {{ ... }},
    "evaluation_metrics": ["..."],
    "datasets": ["..."],
    "quality_thresholds": {{ ... }}
  }},
  "refinement_summary": {{
    "changes_made": true/false,
    "refinement_reason": "Explanation of why refinement was needed",
    "changes_description": [
      "Change 1: description",
      "Change 2: description"
    ],
    "expected_impact": "Expected impact on results"
  }}
}}
```

**Important**: If the original design is adequate (realistic metrics, good improvement margin, suitable method), return it unchanged with `changes_made: false`.

Return ONLY the JSON object, no extra text or explanation.
```

### `modules/experiment/design/prompts/experiment_design_refiner_prompt.py` — PROMPT (function-embedded)

```text
You are an experiment design review assistant for research topic:

## Research Topic
{research_topic}

## Original Experiment Design (v1)
{_format_design(design_v1)}

## Simulated Results
{_format_sim(sim_results)}

## Simulation Confidence
{sim_quality}

## Baselines
{_format_baselines(baselines)}

---

Review the original experiment design against the simulated results. Determine if the design needs refinement:

1. Are the expected metrics too optimistic or too pessimistic given the baselines?
2. Should alternative methods or configurations be tested?
3. Are there missing ablation studies or comparisons?

If the design is adequate, return the original design unchanged.
If refinement is needed, output the updated design.

Return a JSON object:
```json
{{
  "refinement_needed": false,
  "experiment_design": {{ ... }},
  "refinement_reason": "Optional explanation if changes were made"
}}
```

The experiment_design field should be the final design (v2) to use for subsequent execution.
```

### `modules/experiment/analysis/prompts/metric_analysis_prompt.py` — TEMPLATE

```text
You are a scientific experiment analysis expert.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Training Results:
{training_result}

Your Task:
Analyze the experimental results and produce structured data for visualization.

Return a JSON with the following structure.
The top-level JSON must contain exactly ONE key: "metric_analysis" (all content goes inside it):
{{
  "metric_analysis": {{
  "key_findings": [
    "Finding 1: Description of key result",
    "Finding 2: Description of baseline comparison"
  ],
  "metrics_summary": {{
    "our_method": {{
      "accuracy": 0.0,
      "f1_score": 0.0,
      "precision": 0.0,
      "recall": 0.0
    }},
    "baselines": {{
      "baseline_name": {{
        "accuracy": 0.0,
        "f1_score": 0.0
      }}
    }}
  }},
  "comparison_data": {{
    "metric_names": ["accuracy", "f1_score", "precision", "recall"],
    "our_values": [0.0, 0.0, 0.0, 0.0],
    "baseline_values": {{
      "baseline_name": [0.0, 0.0, 0.0, 0.0]
    }}
  }},
  "ablation_data": {{
    "components": ["component_a", "component_b"],
    "performance": [0.0, 0.0],
    "descriptions": ["w/o component A", "w/o component B"]
  }},
  "statistical_significance": "Description of statistical significance",
  "paper_discussion_points": ["Discussion point 1", "Discussion point 2"]
  }}
}}

Rules:
1. Output ONLY valid JSON, no markdown
2. Extract actual numbers from training results where possible
3. Include comparison_data and ablation_data for chart generation
4. Focus on quantitative data that can be visualized

Start with {{, end with }}
```

### `modules/experiment/summary/prompts/summary_prompt.py` — PROMPT (function-embedded)

```text
# 实验结果汇总任务
## 研究主题
{research_topic}

## 实验设计
{_format_dict(experiment_design)}

## 基线方法
{_format_list(baselines)}

## 指标分析结果
{_format_dict(metric_analysis)}

## 可视化结果
{_format_dict(chart_result)}

## 研究规划
{_format_dict(planning_data)}

## 核心创新点
{_format_dict(conception_data)}

## 仿真结果参考
{_format_dict(simulated_results)}

## 任务要求
你需要综合以上所有信息，生成结构化的实验结果汇总和论文写作支持内容。
输出**一个**JSON对象，顶层必须恰好包含两个键：`"experiment_results"` 和 `"paper_writing_support"`，
各自的内容结构如下（不要把下面的字段直接放在顶层）：

### 1. experiment_results 键（实验结果汇总，其值为以下结构的对象）
```json
{{
  "key_findings": ["3-5个核心实验发现，每点100字以内"],
  "best_performance": "本研究的最佳性能结果，包含核心指标数值和对比优势",
  "performance_comparison": "与所有基线方法的性能对比，突出提升幅度",
  "statistical_analysis": "统计显著性分析结果，说明结果的可靠性",
  "ablation_study_results": "消融实验结果（如果有），说明各组件的贡献",
  "qualitative_findings": "定性分析结果，如可视化案例分析",
  "limitations": "实验存在的局限性和不足",
  "future_work": "基于当前结果的未来工作方向建议"
}}
```

### 2. paper_writing_support 键（论文写作支持，其值为以下结构的对象）
```json
{{
  "experiment_section": "完整的实验章节草稿，包含实验设置、结果、分析三个部分，约1000-1500字",
  "main_conclusion": "实验的核心结论，100-200字",
  "discussion_points": ["3-5个讨论要点，可用于论文讨论部分"],
  "table_captions": ["所有需要的表格标题，对应实验结果中的数据"],
  "figure_captions": ["所有需要的图表标题，对应生成的可视化结果"],
  "result_highlights": ["3-5个可以放在摘要/引言中的亮点结果"]
}}
```

## 输出要求
- 严格遵循JSON格式，不要添加任何额外解释性文字
- 内容必须基于提供的输入信息，不要编造不存在的数据
- 结论要客观准确，突出研究的贡献和创新点
- 语言符合学术论文写作规范，专业术语准确
```
