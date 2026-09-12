---
name: Experiment Design & Feasibility
category: experiment/experiment-design
type: system
status: active
version: 1.0
origin: experiment/design, experiment/simulation
---

# Skill: Experiment Design & Feasibility

## Purpose

Decide whether a research question can be tested experimentally at all, then fix a design whose outcome would be interpretable: what is manipulated, what is held fixed, what is measured, and what result would falsify the hypothesis.

## When to Use

Use this skill when:

- A hypothesis exists but no executable experiment stands behind it yet.
- You must decide whether the work is programmable, needs new data, or can only be done offline.
- Compute or lab time is about to be committed and the design should be stress-tested first.

## Research Method

1. **Test feasibility before designing.** Classify the experiment on three axes: can the core manipulation be implemented in software, does it need data that exists or can be obtained, and does it need physical-world access (hardware, participants, wet lab). Name the specific non-simulable dependency behind any not-programmable verdict, and state which sub-parts remain programmable.
2. **State the question as a comparison with a falsification condition.** Write the research question, the hypothesis, and the observation that would show the hypothesis false. If no possible outcome would count against it, the design is not an experiment.
3. **Fix the manipulation and the controls.** Specify the independent variables and their levels, everything held constant, and the controls that rule out the obvious alternative explanations (data, capacity, tuning budget). A design with no controls cannot attribute an effect.
4. **Choose outcome measures and the split protocol before running.** Name the primary metric, the secondary metrics and the data splits, and decide when test data may be touched. Measurements picked after seeing results are not measurements.
5. **Stress-test the design by pre-run simulation.** Predict expected values and their plausible spread from published numbers and the baselines, then judge whether the predicted effect is large enough to be distinguishable from run-to-run variation. If it is not, revise the design rather than proceeding.
6. **Record the refinement as a versioned design.** When simulation or review changes the design, keep the change, the reason and the resulting version. The design handed to implementation must be the refined one, and predicted values must stay labelled as predictions.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Feasibility verdicts must name the concrete dependency (dataset id, hardware, population). Each design choice — metric, split, control, baseline — must cite literature or a pilot rather than preference. Pre-run simulated values must be labelled as predictions and must never appear later as measured results.

## Expected Output

Produce:

- feasibility verdict per axis, with the non-programmable dependency named
- research question, hypothesis and falsification condition
- variables, levels, controls and constant factors
- primary and secondary metrics with the split protocol
- versioned design plus the recorded refinements and their reasons

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

### `modules/experiment/simulation/prompts/experiment_simulation_prompt.py` — PROMPT (function-embedded)

```text
You are a scientific research simulation engine for the research topic below.

## Research Topic
{research_topic}

## Experiment Name
{experiment_name}

## Research Question
{research_question or 'Not explicitly specified'}

## Hypothesis
{experiment_hypothesis or 'Not explicitly specified'}

## Evaluation Metrics
{_stringify_list(evaluation_metrics)}

## Datasets
{_stringify_list(datasets_val)}

## Method Specification
{method_spec_str}

## Baseline Results
{_format_baselines(baselines)}

## Quality Thresholds (if any)
{thresholds_str}

---

Based on the above experiment design, your task is to SIMULATE the expected experimental results. You MUST output a JSON object with the following structure (top-level keys MUST be exactly `simulated_experiment_results` and `simulation_quality`):

```json
{{
  "simulated_experiment_results": {{
    "experiment_name": "{experiment_name}",
    "task_type": "classification|regression|generation|segmentation|detection|other",
    "simulated_metrics": {{
      "{primary_metric}": 0.85
    }},
    "comparison_with_baselines": {{
      "improvement_summary": "Brief description of improvement over baselines",
      "relative_improvement_pct": 3.5
    }},
    "key_findings": [
      "Finding 1",
      "Finding 2"
    ],
    "chart_descriptions": [
      {{
        "title": "Main Result Comparison",
        "type": "bar|line|scatter|heatmap|table",
        "description": "What this chart should show"
      }}
    ],
    "has_metrics": true
  }},
  "simulation_quality": {{
    "confidence": 0.7,
    "quality_notes": "Brief note on confidence justification",
    "risks": ["Potential risk 1"],
    "suggestions": ["Suggestion for improving the experiment"]
  }}
}}
```

Guidelines:
1. Fill in realistic metric values based on the state-of-the-art in this domain.
2. For `simulation_quality.confidence`: 0.0-1.0. Higher when standard benchmarks exist, lower for novel tasks.
3. `has_metrics`: true if quantitative metrics can be reasonably estimated.
4. `key_findings`: 2-5 concise scientific findings.
5. `chart_descriptions`: 1-3 expected charts for the paper.
6. The TOP-LEVEL keys of your JSON MUST be exactly `simulated_experiment_results` and `simulation_quality` — do NOT place `simulated_metrics` or `confidence` at the top level.

Return ONLY the JSON object, no extra text or explanation.
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
