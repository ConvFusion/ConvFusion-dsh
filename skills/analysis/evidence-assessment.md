---
name: Evidence Assessment & Claim Traceability
category: analysis/evidence-assessment
type: system
status: active
version: 1.0
origin: experiment/prompts (full-chain evaluator), experiment/summary, experiment/lab_offline
---

# Skill: Evidence Assessment & Claim Traceability

## Purpose

Judge whether the experiment as executed actually produced the evidence its claims need, and locate the weakest link when it did not — the checkpoint before results become paper text.

## When to Use

Use this skill when:

- The experiment pipeline has finished and claims are about to be written.
- A measured result departs from the pre-run prediction and needs scrutiny before it is trusted.
- A non-programmable or offline study has returned human-collected data that must be checked against the design.

## Research Method

1. **Restate each intended claim and the evidence it requires** — which run, which comparison, which threshold. A claim whose required evidence was never produced is marked unsupported regardless of how plausible it sounds.
2. **Audit the chain for consistency.** Data, method and evaluation must line up: evaluation used the intended data version and splits and the intended metric, the model evaluated is the one the config describes, and every figure traces to a run. Locate the broken link instead of averaging over it.
3. **Compare achieved against expected and investigate the gap.** Where measured results depart from the pre-run simulation or the literature, determine whether the cause is a real effect, a protocol deviation, a bug or a fallback to simulated data, and record which. A gap that cannot be explained blocks the claim.
4. **Grade the evidence per claim** as strong, indicative, insufficient or contradictory, give the reason, and state the additional run that would move it up a grade.
5. **Check offline and human-collected evidence against its protocol.** For non-programmable studies verify that the sample and population match the design, that instruments and procedure were followed, that ethical and data-handling requirements were met, and that raw data exists. Human-collected evidence with no raw record is not evidence.
6. **Issue a verdict and a gate.** Recommend proceed, revise and rerun, or stop, naming the failed elements and the minimum change that would fix them. Never pass a claim on the strength of the surrounding narrative.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

A traceable link from each claim to run artefacts and the metric computation, the code and data versions used, and an explicit record of deviations, fallbacks and excluded runs. Assessments must quote the artefact examined rather than a summary of it, and offline evidence must include the raw records and protocol compliance notes.

## Expected Output

Produce:

- claim-by-claim evidence audit against required evidence
- chain-consistency report identifying the broken link when present
- achieved-versus-expected gap analysis with causes
- evidence grade per claim and what would raise it
- offline protocol compliance check plus a proceed, revise or stop verdict with required fixes

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/experiment/prompts/full_chain_evaluator_prompt.py` — PROMPT (function-embedded)

```text
You are evaluating the full experiment chain for alignment with the experiment design.

## Experiment Design
- Name: {design_name}
- Type: {design_type}
- Evaluation Metrics: {eval_metrics}
- Quality Thresholds: {json.dumps(quality_thresholds, ensure_ascii=False) if quality_thresholds else 'N/A'}

## Simulated Expected Results (Oracle)
{json.dumps(sim_metrics, ensure_ascii=False, default=str)[:1500] if sim_metrics else 'N/A'}

## Dataset Module Output
- Status: {dataset_status}
- Has dataset_result: {bool(dataset_result)}

## Method Module Output
- Training status: {training_status}
- Metrics: {json.dumps(training_metrics, ensure_ascii=False, default=str)[:1500] if training_metrics else 'N/A'}
- Code generated: {training.get('code_generated', False) if isinstance(training, dict) else False}
- Fallback to simulation: {training.get('fallback_to_simulation', False) if isinstance(training, dict) else False}

## Analysis Module Output
- Charts generated: {chart_count}
- Chart files: {json.dumps(chart_files, ensure_ascii=False, default=str)[:800] if chart_files else 'None'}

## Previous Outer Loop Attempt
- Current attempt: {attempt + 1} / 3

## Evaluation Criteria
1. Dataset: Was data pipeline code generated? (execution may be skipped due to download time)
2. Method: Was model code generated? (execution may be skipped due to no GPU, but code must exist)
3. Analysis: Were charts actually generated and executed? (must produce real output files)
4. Consistency: Do the three modules' outputs align with the experiment design?

## Output Format
Return ONLY a JSON object (no markdown, no explanation):
{{
  "_chain_assessment": {{
    "is_satisfied": true/false,
    "score": 0-100,
    "gaps": ["gap1", "gap2"],
    "feedback": "improvement suggestions",
    "failed_modules": ["dataset" or "method" or "analysis"]
  }},
  "_outer_loop_continue": true/false,
  "_outer_loop_attempt": {attempt + 1}
}}

## Scoring Guide
- 90-100: Excellent — all modules produce expected outputs, metrics align with simulation
- 70-89: Good — minor gaps, but core results are valid
- 40-69: Partial — significant gaps in one or more modules, retry recommended
- 0-39: Poor — major issues, retry required

## Decision Rules
- is_satisfied=true AND score>=80 → _outer_loop_continue=false (exit loop)
- is_satisfied=false AND attempt<2 → _outer_loop_continue=true (retry)
- is_satisfied=false AND attempt>=2 → _outer_loop_continue=false (max retries reached)
- failed_modules: list modules that need to be reset for retry (subset of ["dataset", "method", "analysis"])

Return ONLY the JSON object.
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

### `modules/experiment/lab_offline/prompts/offline_guidance_prompt.py` — PROMPT (function-embedded)

```text
You are an experiment guidance assistant for offline research experiments.

## Research Topic
{research_topic}

## Experiment Name
{experiment_name}

## Research Objective
{research_objective}

## Method Specification
{method_spec.get('description', str(method_spec)[:1000]) if isinstance(method_spec, dict) else str(method_spec)[:1000]}

## Evaluation Metrics
{', '.join(evaluation_metrics) if isinstance(evaluation_metrics, list) else str(evaluation_metrics)}

## Quality Thresholds
{_format_quality(quality_thresholds)}

## Simulated Expected Results
{sim_metrics if sim_metrics else 'Not available'}

## Expected Key Findings (from simulation)
{chr(10).join(f'- {f}' for f in key_findings[:5]) if key_findings else 'No findings available'}

---

Your task is to generate a detailed offline experiment guidance document. This experiment CANNOT be implemented programmatically and requires human researchers to conduct it offline (e.g., user studies, field research, qualitative analysis, human evaluation).

Generate a JSON object with the following structure to guide the researcher:

```json
{{
  "offline_guidance": {{
    "experiment_name": "{experiment_name}",
    "experiment_type": "user_study | field_study | qualitative | survey | human_evaluation",
    "overview": "Clear description of what the experiment entails and why it must be done offline",
    "preparation": {{
      "materials_needed": ["List of materials, tools, or instruments needed"],
      "participant_requirements": "Required participant profile, sample size, recruitment method",
      "environment_setup": "Physical or virtual environment requirements"
    }},
    "procedure": {{
      "steps": ["Step-by-step instructions for conducting the experiment"],
      "estimated_duration": "Expected time to complete the experiment",
      "ethical_considerations": "Consent forms, privacy, data handling procedures"
    }},
    "required_data": ["List of data points that must be collected"],
    "recommended_instruments": ["Questionnaires, survey forms, observation templates"],
    "analysis_guidance": "How the collected data should be analyzed",
    "expected_outcomes": "What the researcher should expect to observe",
    "quality_criteria": "How to assess whether the experiment was conducted properly"
  }},
  "expected_result_template": {{
    "experiment_name": "{experiment_name}",
    "participants": {{
      "total": 0,
      "demographics": {{}}
    }},
    "data_collection_date": "YYYY-MM-DD",
    "metrics": {{}},
    "key_findings": ["finding 1", "finding 2"],
    "qualitative_observations": "Important observations from the experiment",
    "limitations": ["limitation 1", "limitation 2"],
    "raw_data_location": "Path or reference to raw data files"
  }}
}}
```

Guidelines:
1. Be practical and actionable — the researcher should know exactly what to do
2. Include specific templates for data collection (surveys, observation forms)
3. Reference the simulated expected results as benchmarks for comparison
4. Consider ethical review requirements if applicable
5. Provide realistic time and resource estimates

Return ONLY the JSON object, no extra text or explanation.
```
