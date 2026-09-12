---
name: Comparative Analysis & Significance
category: analysis/comparative-analysis
type: system
status: active
version: 1.0
origin: experiment/analysis, experiment/simulation, experiment/prompts (baseline builder)
---

# Skill: Comparative Analysis & Significance

## Purpose

Decide whether observed differences between methods are real and meaningful — same protocol, quantified uncertainty, significance where the design supports it — instead of reading a ranking off a single table.

## When to Use

Use this skill when:

- A results table exists and you must say which differences matter.
- The improvement over the strongest baseline is small relative to run-to-run variation.
- Some baseline numbers come from papers run under a different setting.

## Research Method

1. **Verify comparability before comparing.** Confirm every row used the same data version, splits, preprocessing, metric implementation and tuning budget. Rows that did not are marked not-directly-comparable and excluded from claims until reproduced.
2. **Report uncertainty with every number.** Give per-seed values, a mean with standard deviation or confidence interval, and the number of runs. A bare mean cannot support a difference claim; prefer uncertainty on the difference over uncertainty on each method separately.
3. **Test the difference where the design allows.** Use paired comparisons across seeds or splits, report effect size alongside the test statistic, correct for multiple comparisons when many pairs are tested, and use non-parametric tests when the sample is small or normality is doubtful. If the design cannot support a test, say so rather than quoting a number.
4. **Check the robustness of the ranking.** Repeat under secondary metrics, across seeds, and on the hardest and easiest subsets. A ranking that flips under reasonable variation is reported as a tie, not a win.
5. **Quantify practical significance.** Relate the delta to the meaningful range of the metric, the spread of the baseline and the added compute. A statistically real but negligible gain is described as such.
6. **Attribute every comparison to its source.** For reproduced baselines cite the run directory; for cited numbers state the paper, its setting and the direction of any mismatch. Never mix reproduced and cited values in one column without labelling.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The per-run values behind every aggregate, the test used with its assumptions, the number of comparisons corrected for, and the run or paper source of each row. Comparison tables must separate reproduced from cited numbers and state the comparability of every row.

## Expected Output

Produce:

- comparability-checked comparison table with uncertainty
- significance and effect-size results with the test and corrections used
- robustness checks across metrics, seeds and subsets
- practical-significance statement relative to cost and metric range
- explicit list of rows excluded from comparison and why

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

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
