---
name: Evaluation Protocol & Metric Design
category: experiment/evaluation
type: system
status: active
version: 1.0
origin: experiment/design, experiment/analysis, experiment/method
---

# Skill: Evaluation Protocol & Metric Design

## Purpose

Decide what is measured, how each metric is computed, and what counts as success, so that a number produced by the pipeline can be trusted as evidence about the hypothesis.

## When to Use

Use this skill when:

- The design names metrics but not their definitions or computation.
- The same metric name is computed differently across the works you compare against.
- Before implementation, to make sure the code will emit the quantities the claims need.

## Research Method

1. **Map each claim to a metric.** For every statement the paper will make, name the quantity that would support or refute it. Claims with no measurable quantity are either dropped or explicitly marked qualitative.
2. **Fix the primary metric before seeing results**, and treat secondary metrics as supporting only. Choosing the primary after seeing results is post-hoc selection by another name.
3. **Pin each metric to an implementation.** State the formula, averaging mode (micro or macro), label handling, thresholds and reference implementation. Ambiguous names such as accuracy or F1 must be disambiguated, and the computing library version recorded.
4. **Specify the evaluation loop and reporting granularity.** State which splits are used, how often evaluation runs, whether selection is per-seed or best-epoch, and that test data is touched once at the end. Report per-seed values, not only the best.
5. **Declare success and failure thresholds in advance**, including the minimum effect worth claiming and any absolute floor such as beating the trivial baseline. Thresholds belong to the design, not to the later narrative.
6. **Require machine-readable outputs from the implementation.** Evaluation code must write metrics and per-example predictions in a documented schema, one row per run, seed and example, so that later comparison, significance testing and error analysis work from artefacts rather than from prose.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Metric definitions with reference implementation and version, per-run and per-seed raw outputs, the claim-to-metric mapping, and thresholds declared before the run. A metric value is not evidence unless the code, data version and config that produced it are identifiable.

## Expected Output

Produce:

- claim-to-metric mapping with qualitative claims marked
- primary and secondary metric definitions with reference implementations
- evaluation schedule and split usage
- pre-declared success, failure and minimum-effect thresholds
- required output schema for the implementation

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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

### `modules/experiment/method/prompts/training_code_prompt.py` — TEMPLATE

```text
You are an expert ML engineer. Your role is to specify the training pipeline requirements for a research experiment.

You do NOT generate code. You produce a structured specification that will be handed to a coding system for implementation.

========================
# Research Context
========================

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Dataset Info:
{dataset_info}

Model Architecture Requirements:
{model_architecture}

========================
# Your Task
========================

Define a training pipeline specification. Describe:

1. **Objective**: What should the training achieve?
2. **Training Pipeline**: List each component of the training system (data loader, training loop, checkpointing, etc.)
3. **Evaluation Pipeline**: List each evaluation component (metrics, validation loop, testing, etc.)
4. **Logging Requirements**: What should be logged during training?
5. **Constraints**: Implementation constraints (single GPU, mixed precision, etc.)

========================
# Output Format
========================

Format your response as a JSON object:
{{
    "training_code": {{
        "objective": "Clear one-sentence description of the training goal",
        "training_pipeline": [
            "Component 1: description",
            "Component 2: description"
        ],
        "evaluation_pipeline": [
            "Evaluation metric 1: description",
            "Evaluation metric 2: description"
        ],
        "logging_requirements": [
            "Requirement 1: description",
            "Requirement 2: description"
        ],
        "constraints": [
            "PyTorch",
            "single GPU",
            "mixed precision"
        ]
    }}
}}

# (JSON formatting policy is provided by Foundation Layer.)
```

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

### `modules/experiment/prompts/baseline_builder_prompt.py` — TEMPLATE

```text
You are an expert baseline result generator for scientific experiments. Your task has TWO parts:

**Part 1**: Generate simulated baseline results based on core papers from the literature review
**Part 2**: Create test cases that will guide code implementation and verify results against baselines

========================
# Research Context
========================

Research Topic: {research_topic}

Core Papers (from Discovery module):
{core_papers}

Experiment Design:
{experiment_design}

========================
# Part 1: Generate Baseline Results
========================

{full_text_context}

Baseline Methods to simulate:
{baseline_methods}

Evaluation Metrics:
{primary_metric} (primary) + {evaluation_metrics}

For each baseline method, generate results that:
1. Are realistic and consistent with the paper descriptions
2. Follow the expected format of experiment results
3. Include the primary metric and all secondary metrics

========================
# Part 2: Generate Dataset Information
========================

Based on the research topic and core papers, identify key datasets used in this research area.
For each dataset, provide:
1. Dataset name and description
2. Key characteristics (size, domain, language, etc.)
3. Relevant paper references (if available in core papers)
4. How each baseline method typically uses this dataset

Common datasets in this field: {common_datasets}

========================
# Part 3: Create Test Cases
========================

Create Python test cases that verify the implementation can achieve results comparable to these baselines.
These test cases will be used by the coding environment to guide code development.

Each test case should specify:
1. What to test (functionality, metric achievement)
2. Input data format (referencing the datasets above)
3. Expected output threshold compared to baseline
4. How to validate the result

========================
# Output Format
========================

Format your response as a SINGLE JSON object with the following structure:
{{
    "baselines": [
        {{
            "method": "Method name (e.g. BERT-base)",
            "{primary_metric}": 0.0,
            "secondary_metrics": {{
                "metric1": 0.0,
                "metric2": 0.0
            }},
            "paper_id": "OpenAlex ID or paper identifier",
            "paper_title": "Title of the source paper",
            "comment": "Brief note about this baseline result",
            "datasets_used": ["Dataset1", "Dataset2"]  # Which datasets this baseline typically uses
        }}
    ],
    "datasets": [
        {{
            "name": "Dataset name (e.g. LibriSpeech)",
            "description": "Detailed description of the dataset",
            "size": "Number of samples/hours",
            "domain": "Research domain (e.g. speech recognition, NLP)",
            "language": "Primary language(s)",
            "key_characteristics": ["characteristic1", "characteristic2"],
            "paper_references": [
                {{
                    "paper_id": "OpenAlex ID if available",
                    "citation": "Citation text for the dataset paper"
                }}
            ],
            "usage_in_baselines": ["Baseline1", "Baseline2"]  # Which baselines use this dataset
        }}
    ],
    "test_cases": [
        {{
            "test_name": "Descriptive test name",
            "description": "What this test verifies",
            "target_metric": "Name of the primary metric",
            "target_threshold": 0.0,
            "baseline_to_beat": "Method name to compare against",
            "input_data": "Description of required input data (reference datasets above)",
            "expected_output": "Description of expected output format",
            "validation_logic": "Pseudo-code or logic for validation"
        }}
    ],
    "summary": {{
        "strongest_baseline": "Method name of the strongest baseline",
        "performance_gap": "Description of the gap our method should close",
        "test_coverage": "Brief description of what the test cases cover",
        "dataset_coverage": "Summary of datasets used across all baselines"
    }}
}}

IMPORTANT REQUIREMENTS:
1. Generate results for 3-5 baseline methods
2. Metrics must be realistic for the research topic
3. Test cases must be actionable for code generation
4. The primary metric key MUST match the one from experiment design

# (JSON formatting policy is provided by Foundation Layer.)
```
