---
name: Dataset Selection & Data Pipeline Specification
category: experiment/dataset-selection
type: system
status: active
version: 1.0
origin: experiment/dataset, experiment/method (data collection)
---

# Skill: Dataset Selection & Data Pipeline Specification

## Purpose

Choose datasets that can actually support the claim — right construct, right scale, right licence, obtainable — and specify the preprocessing, splitting and statistics the pipeline must produce so the data is auditable.

## When to Use

Use this skill when:

- The design is fixed and the open question is which data can answer it.
- A candidate dataset is popular in the field but its domain, splits or licence may not match the claim.
- You need a data pipeline whose processed outputs can be regenerated and inspected.

## Research Method

1. **Derive dataset requirements from the claim, not from habit.** List the constructs that must be present (labels, modalities, domains, languages), the required scale, and any distribution the claim depends on. A dataset missing a required construct cannot support the claim no matter how standard it is.
2. **Survey candidates and record provenance.** For each candidate record source, version or commit, licence and terms, size, available splits, known biases, and the works that use it. Prefer version-pinned, publicly downloadable, well-documented sources so the pipeline can be rerun.
3. **Check comparability with the baselines.** Use the same data version, splits and preprocessing that produced the baseline numbers; where you deviate, state the deviation and why the comparison remains valid.
4. **Design the split and guard against leakage.** Fix ratios and a seed, split by the correct unit (subject, document, time) so near-duplicates cannot cross splits, and verify that no test material informed training or tuning.
5. **Specify preprocessing and statistics as requirements for the implementation.** The pipeline must be deterministic, must report per-split sample counts, class balance, missing-value and length distributions, and must write processed data in a documented format while retaining the raw source.
6. **State the fallback when data is unavailable.** If a source cannot be downloaded or licensed, either substitute a documented alternative or generate a clearly-labelled synthetic dataset for dry runs. Never let fabricated values be presented later as measurements.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Dataset identity (source, version, licence, access date), per-split counts, and a hash or checksum of the processed artefacts. Any claim about data scale or distribution must point at a computed statistic, not an estimate. Simulated or synthetic data must be labelled at every downstream use.

## Expected Output

Produce:

- dataset requirement list derived from the research question
- selected datasets with provenance, licence and comparability notes
- split protocol with the splitting unit and a deterministic seed
- preprocessing and statistics requirements handed to implementation
- fallback plan for unavailable or unusable data

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/experiment/dataset/prompts/dataset_planning_prompt.py` — TEMPLATE

```text
You are a dataset collection expert for scientific experiments.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Planning Data:
{planning_data}

Your Task:
Plan the datasets needed for the experiment.

Return a JSON with the following structure.
The top-level JSON must contain exactly ONE key: "dataset_planning" (all content goes inside it):
{{
  "dataset_planning": {{
  "datasets": [
    {{
      "dataset_id": "unique_id_1",
      "name": "Dataset Name",
      "source": "HuggingFace / Kaggle / Custom / etc.",
      "description": "What this dataset contains",
      "access_url": "https://huggingface.co/datasets/...",
      "preprocessing": "Required preprocessing steps",
      "usage": "How to use this dataset in the experiment"
    }}
  ],
  "overall_strategy": "Brief description of data collection strategy",
  "preprocessing_pipeline": "Step-by-step preprocessing workflow"
  }}
}}

Rules:
1. Output ONLY valid JSON, no markdown
2. Focus on standard public datasets (HuggingFace preferred)
3. Include preprocessing requirements specific to the experiment
4. Ensure datasets are appropriate for the research topic

Start with {{, end with }}
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
