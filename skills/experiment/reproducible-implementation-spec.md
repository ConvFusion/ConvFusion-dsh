---
name: Reproducible Implementation Specification
category: experiment/reproducible-implementation-spec
type: system
status: active
version: 1.0
origin: experiment/method, experiment/dataset, experiment/analysis
---

# Skill: Reproducible Implementation Specification

## Purpose

Turn a settled design into implementation requirements precise enough that an independent run reproduces the numbers: pinned environment, controlled randomness, deterministic data handling, complete configuration, and a fixed artefact layout.

## When to Use

Use this skill when:

- The design is settled and code must be written by a person or a coding agent.
- Results exist but cannot be regenerated from the repository and its documentation.
- A baseline or component must be reimplemented faithfully rather than approximately.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 复现规范锁定的是方法的实现
```

## Research Method

1. **Freeze the environment.** Record language and runtime, framework and library versions or a lockfile, hardware assumptions, and external data or pretrained checkpoints with their identifiers. Latest version is not a specification.
2. **Make randomness explicit and controlled.** Enumerate every stochastic source — shuffling, splitting, initialisation, dropout, sampling, augmentation, library defaults — and require one seed to control all of them, so a run is reproducible per seed and varied deliberately across seeds.
3. **Specify deterministic data handling.** Load from pinned sources, preprocess deterministically, store split assignments instead of recomputing them differently each run, and ensure caching never silently changes the data.
4. **Specify the training and evaluation contract.** Entry points, config schema, metric computation, checkpoint selection rule, and output layout: one run directory per method, config and seed, containing config, log, metrics and predictions. A rerun must not depend on mutable state left by earlier runs.
5. **Require smoke tests and fail-loud behaviour.** A short subset run before the full run, assertions on data shapes, splits and metric ranges, and hard failure on missing data or diverging loss instead of silent fallback. Any simulated or fallback result must be flagged in the artefacts, never mixed with real runs.
6. **Verify by re-execution, not by inspection.** Reproduction means a clean checkout plus the documented command regenerates the reported metrics within a stated tolerance. Record that comparison, including any deviation, as the reproducibility evidence.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Pinned dependency versions, exact commands, seeds, config files, checkpoint identifiers and per-run metric logs. The artefact layout must let a third party map every reported number to a run directory, and any rerun that fails to match must be reported with the observed difference rather than dropped.

## Expected Output

Produce:

- environment and lockfile specification with hardware assumptions
- seed and determinism policy covering every stochastic source
- deterministic data pipeline requirements
- run-directory layout, config schema, smoke-test and fail-loud requirements
- re-execution comparison record with tolerances and deviations

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/experiment/method/prompts/model_design_prompt.py` — TEMPLATE

```text
You are an expert deep learning architect. Your role is to specify the model architecture requirements for a research experiment.

You do NOT generate code. You produce a structured design specification that will be handed to a coding system for implementation.

========================
# Research Context
========================

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Dataset Info:
{dataset_info}

========================
# Your Task
========================

Design a model architecture specification. Describe:

1. **Objective**: What problem does the model solve? What task does it perform?
2. **Architecture Description**: High-level description of the architecture (backbone, neck, head, etc.)
3. **Components**: List each major component/module and its purpose
4. **Constraints**: Implementation constraints (framework, compute, compatibility)

Preferred Framework: PyTorch

========================
# Output Format
========================

Format your response as a JSON object:
{{
    "model_architecture": {{
        "objective": "Clear one-sentence description of what the model does",
        "architecture_description": "High-level description of the overall architecture",
        "components": [
            "Component 1: description and purpose",
            "Component 2: description and purpose"
        ],
        "constraints": [
            "PyTorch",
            "Modular design",
            "Single GPU compatible"
        ]
    }}
}}

# (JSON formatting policy is provided by Foundation Layer.)
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

### `modules/experiment/method/prompts/data_collection_prompt.py` — TEMPLATE

```text
You are an expert data engineer working with a Code Agent, an AI-assisted coding tool. Your role is to generate Python code for downloading and preprocessing datasets for a deep learning experiment.

========================
# Research Context
========================

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Planning Data (selected plan):
{planning_data}

========================
# Your Task as Code Agent Data Collector
========================

Generate Python code for data collection and preprocessing. The code should:

1. **Download the Dataset**: Use HuggingFace `datasets` library to load the specified dataset(s)
2. **Data Exploration**: Print dataset statistics (size, features, class distribution)
3. **Preprocessing**: Apply necessary preprocessing steps (tokenization, normalization, encoding)
4. **Train/Validation/Test Split**: Split the data appropriately
5. **DataLoader Creation**: Create PyTorch DataLoader or TensorFlow Dataset objects
6. **Data Statistics**: Compute and display key statistics about the processed data

IMPORTANT: Use only well-known libraries: `datasets`, `torch`, `transformers`, `numpy`, `pandas`, `sklearn`.

========================
# Output Format
========================

Format your response as a JSON object with the following structure:
{{
    "data_collection": {{
        "code": "Complete, runnable Python code for data downloading and preprocessing",
        "dataset_name": "Primary dataset name",
        "dataset_source": "huggingface",
        "data_format": "Description of data format after preprocessing",
        "preprocessing_steps": ["Step 1", "Step 2", "..."],
        "train_test_split": {{
            "train_size": 1000,
            "validation_size": 200,
            "test_size": 300,
            "split_ratio": "80/10/10 or appropriate ratio"
        }},
        "data_statistics": {{
            "num_classes": 0,
            "feature_dim": "description",
            "class_distribution": "balanced/imbalanced description"
        }},
        "notes": "Additional notes about the data collection process"
    }}
}}

# (JSON formatting policy is provided by Foundation Layer.)
```

### `modules/experiment/dataset/prompts/dataset_code_requirements_prompt.py` — TEMPLATE

```text
You are a data pipeline architect for scientific experiments.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Dataset Plan:
{dataset_planning}

Your Task:
Define structured requirements for the data pipeline code. Do NOT write the actual code.

Directory Structure for generated code:
  github-repo/datasets/     ← Data pipeline code and downloaded datasets go HERE
  github-repo/src/          ← Research method code (separate)
  github-repo/results/      ← Experiment results (separate)

Return a JSON with the following structure.
The top-level JSON must contain exactly ONE key: "dataset_code_requirements" (all content goes inside it):
{{
  "dataset_code_requirements": {{
  "objective": "Overall objective of the data pipeline code",
  "pipeline_steps": [
    {{
      "step": "Step name (e.g. download, load, preprocess, split)",
      "description": "What this step should do",
      "libraries": ["required Python libraries for this step"],
      "expected_output": "What this step produces"
    }}
  ],
  "expected_output_formats": ["parquet", "csv", "huggingface_dataset", ...],
  "statistics_to_compute": [
    {{
      "statistic": "Name of statistic",
      "description": "How to compute it"
    }}
  ],
  "dataset_sources": [
    {{
      "name": "Dataset name",
      "source_type": "huggingface / local / url",
      "access_info": "How to access",
      "expected_size": "Estimated size",
      "features": ["list of features/columns"]
    }}
  ],
  "target_directory": "github-repo/datasets/"
  }}
}}

Rules:
1. Output ONLY valid JSON, no markdown
2. Specify requirements, NOT the actual code
3. If datasets cannot be downloaded (no internet), specify generating simulated dataset statistics
4. Focus on what the code should achieve, not how
5. Generated code files MUST be placed under the target_directory

Start with {{, end with }}
```

### `modules/experiment/dataset/prompts/dataset_code_prompt.py` — TEMPLATE

```text
You are a Python data engineering expert.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Dataset Plan:
{dataset_planning}

Your Task:
Generate complete Python code to download, load, and preprocess the planned datasets.

Requirements:
1. Use HuggingFace Datasets library for public datasets
2. Include proper error handling
3. Save processed data to standard formats (Parquet / CSV)
4. Include train/validation/test splits as needed
5. Generate code as a single runnable script
6. Save all outputs to the 'data/' directory (create if needed)
7. Include clear comments

Return the Python code in JSON format:
{{
  "dataset_code": "Complete Python code as a single string"
}}

Rules:
1. Output ONLY valid JSON
2. The code should be runnable (include all imports)
3. Use standard libraries (datasets, pandas, numpy, etc.)
4. Use descriptive variable names
5. Include data validation steps

Start with {{, end with }}
```

### `modules/experiment/analysis/prompts/plot_code_prompt.py` — TEMPLATE

```text
You are a Python visualization expert for scientific papers.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Chart Plan:
{chart_planning}

Training Results:
{training_result}

Your Task:
Generate complete Python code using matplotlib and seaborn to generate all planned figures.

Requirements:
1. Use professional academic styling (seaborn preferred)
2. Generate high-resolution figures (dpi=300)
3. Use LaTeX rendering for labels where appropriate
4. Include proper figure titles, labels, legends, and captions
5. Save all figures directly to the 'results/' directory (do NOT create figures subdirectory) (create if needed)
6. Generate both PNG (300dpi) and PDF formats
7. Include comments and make code runnable
8. Use the actual metrics from training_results

Return the Python code in JSON format:
{{
  "plot_code": "Complete Python code as a single string"
}}

Rules:
1. Output ONLY valid JSON
2. The code should be runnable (include all imports)
3. Use standard libraries (matplotlib, seaborn, numpy, pandas)
4. Generate publication-quality figures suitable for IEEE/ACM papers
5. Ensure proper color schemes and contrast
6. No watermarks or non-professional elements

Start with {{, end with }}
```
