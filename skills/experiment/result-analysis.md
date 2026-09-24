---
name: Result Analysis & Finding Extraction
category: experiment/result-analysis
type: system
status: active
version: 1.0
origin: experiment/analysis, experiment/summary
---

# Skill: Result Analysis & Finding Extraction

## Purpose

Turn raw run outputs into defensible findings: what the numbers say against the pre-declared thresholds, which figures the argument needs, and what the study cannot conclude.

## When to Use

Use this skill when:

- Runs finished and metrics and predictions exist, but a narrative is still needed.
- Deciding which figures and tables the paper actually requires.
- Consolidating several sub-experiments into one coherent result set.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments | 没有实验产物就没有可分析的结果
```

## Research Method

1. **Assemble results from artefacts.** Build the run table from run directories (config, seed, metrics, predictions) and reconcile it against the design: every planned run present, every reported number traceable. Missing or extra runs are findings in themselves.
2. **Read results against the pre-declared thresholds.** Compare the primary metric with the declared success margin and the strongest baseline, and state the outcome as supported, not supported or inconclusive rather than narrating the best-looking number.
3. **Separate stable findings from single-run observations.** A difference seen once, or only at the best epoch, is not a finding. For every finding state the evidence it rests on and its spread across seeds and settings.
4. **Explain mechanism, not only ordering.** For each finding give the result that makes it plausible — ablation row, error pattern, training curve — and mark any explanation that is inference rather than measurement.
5. **Choose figures from the argument.** One figure per claim: main comparison, contribution ablation, behavioural evidence. Specify data source, chart type and message, and drop figures that decorate without carrying an argument. Figure values must be generated from run artefacts, never retyped.
6. **State limitations and negative results.** Enumerate what the evidence does not cover — settings, scales, failure modes — including runs that did not work. An honest limitation section is part of the result, not an afterthought.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every reported number maps to a run directory and a metric computation, and every figure regenerates from artefacts. Findings must state the comparison and variance they rest on, inferred explanations must be labelled as inference, and no value may come from a pre-run simulation once real runs exist.

## Expected Output

Produce:

- reconciled results table by run and seed
- findings with the evidence and spread each rests on
- figure and table plan with data sources and captions
- limitations and negative results
- claim-support verdict per intended claim

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

### `modules/experiment/analysis/prompts/chart_planning_prompt.py` — TEMPLATE

```text
You are a scientific figure design expert for academic papers.

Research Topic: {research_topic}

Experiment Design:
{experiment_design}

Metric Analysis:
{metric_analysis}

Training Results:
{training_result}

Your Task:
Design publication-quality figures for the paper. Produce structured chart specifications.

Return a JSON with the following structure.
The top-level JSON must contain exactly ONE key: "chart_planning" (all content goes inside it):
{{
  "chart_planning": {{
  "charts": [
    {{
      "figure_id": "fig1_ablation_study",
      "title": "Figure title for paper",
      "chart_type": "bar_chart / line_chart / heatmap / scatter_plot / box_plot",
      "description": "What this figure shows",
      "data_source": "comparison_data / ablation_data / training_curves",
      "x_label": "X-axis label",
      "y_label": "Y-axis label",
      "latex_caption": "Detailed caption for LaTeX figure",
      "width_inches": 6.0,
      "height_inches": 4.0,
      "dpi": 300
    }}
  ],
  "figure_design": {{
    "style": "seaborn-v0_8-whitegrid / ggplot / default",
    "color_palette": "Set2 / Paired / muted / deep",
    "font_size": 12,
    "legend_position": "upper right / best / lower right",
    "save_format": "pdf, png"
  }},
  "latex_requirements": {{
    "figure_placement": "tbp",
    "label_format": "fig:figure_name",
    "width": "0.48\\\\textwidth",
    "format": "pdf"
  }}
  }}
}}

# (JSON formatting policy is provided by Foundation Layer.)

Rules:
2. Specify chart_types that are suitable for the data
3. Include LaTeX caption and label format
4. Design for publication-quality (300 dpi, proper sizing)
5. **figure_id naming**: ALL figure_id values MUST start with fig1_, fig2_, fig3_ (sequential numbering), followed by a descriptive short name in snake_case (e.g. "fig1_ablation_study", "fig2_comparison", "fig3_curves"). The number MUST start from 1 for the first chart and increment by 1 for each subsequent chart. This prefix is REQUIRED for every chart.

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
