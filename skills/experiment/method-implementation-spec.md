---
name: Method Implementation Specification
category: experiment/method-implementation-spec
type: system
status: active
version: 1.0
origin: modules/experiment/method/prompts (model_design, training_code, data_collection, baseline_requirements)
---

# Skill: Method Implementation Specification

## Purpose

Turn a settled method into the **implementation specification a coding agent can execute** — model
architecture, data interface, training contract, evaluation hook — and shape every artefact as a
**publishable open-source repository**, so that releasing the code at submission time is a `git push`,
not a rewrite.

## When to Use

Use this skill when:

- A method is settled (`method-plan` on disk) and a coding agent must produce the model and training code.
- The implementation currently exists only as prose, so the agent is free to invent structure, library
  defaults, and file layout.
- The code must become a public GitHub repository when the paper is submitted or published.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named
signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 实现规格锁定的是已定的方法，不是探索中的想法
requires: experiment-design | 训练与评测的挂点来自实验设计（条件、指标、对照）
/ requires: dataset-result | 数据接口契约要么来自数据集规格，要么方法自带数据（此时明确声明）
```

## Research Method

1. **Specify the architecture, do not write it.** Layer and module inventory, tensor-shape contracts at
   each interface, parameter budget, and — most important — the **exact differences from the baseline
   architecture**. A difference you cannot point at cannot be claimed as a contribution, and a
   "improved model" that differs everywhere is not reproducible.

2. **Consume the data contract; never re-implement it.** The method code loads data through the
   interface produced by `dataset-selection` (dataset id, revision, split assignment, preprocessing
   outputs). Shapes, dtypes, split sources and file paths are fixed in the spec. If the method brings its
   own data, that is declared explicitly and treated as a dataset of record.

3. **Fix the training contract in a config file, not in code defaults.** Optimizer, schedule, batch size,
   gradient accumulation, precision, epochs/steps, early-stopping and checkpoint-selection rule, and the
   seed policy — all named keys in a versioned config. A value that only exists as a library default is
   not specified: it cannot be reported, compared, or rerun. Every user-changeable key must be reachable
   from the config or the command line, so changing one hyperparameter is a config edit rather than a
   code edit — that is what makes both the reviewer's check and the reader's reuse possible.

4. **Leave an evaluation hook, decoupled from training.** Training code exposes where metrics are
   computed and where predictions/checkpoints are written; the metric definitions themselves come from
   `evaluation-protocol`. Training must be runnable and reportable without the evaluation code being
   rewritten for each condition.

5. **Shape everything as a publishable repository.** The spec fixes the repository layout, not a folder of
   scripts: `README` (what it does, how to install, how to reproduce the paper's numbers),
   `requirements.txt`/lockfile, `LICENSE`, a `configs/` directory with one file per reported condition, a
   `src/` package with the architecture and training loop, `scripts/` entry points for train/eval/figures,
   and a `reproduction/` note mapping each paper table/figure to the command that produced it. The
   audience is a stranger who found the repository from the paper.

6. **Declare the execution downgrade and its unverified assertions.** When no GPU or no data is available,
   the deliverable is **generated code, not a run**. Say so in the artefacts, and list which assertions
   (shape checks, a smoke run, loss-curve sanity) were therefore never executed. An unexecuted artefact
   must never be reported as a passed one.

7. **Anchor reproducibility to the failure it prevents.** Pin the environment, record the exact commands,
   and require fail-loud behaviour on missing data, shape mismatch or diverging loss — silent fallback is
   the mechanism by which a "reproduced" number turns out to be a different experiment. The verification
   procedure itself belongs to `reproducible-implementation-spec` (C07P07); this skill fixes what the
   code must be, that one fixes what makes it re-runnable.

## Reasoning Guidance

The recurring failure this skill exists to prevent is an implementation specified only in prose, so the
coding agent fills every gap with its own choices — and those choices are invisible in the paper. Decide
each point by asking whether a stranger could read the number in the paper and reproduce **that exact
number**: if the answer depends on a default nobody wrote down, the specification is incomplete.

Prefer a smaller, fully specified implementation over a larger one with unspecified corners. The
architecture may be described at module granularity; the training contract and the repository layout must
be exhaustive, because those are what a re-run reproduces.

## Evidence Requirements

The specification must be inspectable without running it: architecture inventory with shapes and
parameter counts, the baseline-difference list, the config schema with every key named, the data
interface signatures, the evaluation hook locations, and the repository layout. Version identifiers for
every external asset (dataset revision, pretrained checkpoint, library versions). Any unexecuted
assertion must be listed as unverified rather than implied to have passed.

## Expected Output

Produce:

- architecture specification: modules, tensor contracts, parameter budget, baseline-difference list
- data interface contract, or an explicit declaration that the method brings its own data
- training contract: complete named key set for config, seed policy, checkpoint selection rule
- evaluation hook specification, decoupled from the training loop
- repository layout for open-source release: README / configs / src / scripts / LICENSE / reproduction note
- execution-downgrade declaration: what was generated only, and which assertions remain unverified

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as accumulated research
intelligence, not as an execution contract. They reference state keys that no longer exist; read them for
the method, not for a pipeline.

### `modules/experiment/method/prompts/model_design_prompt.py` — REQUIREMENTS (no code)

```text
Model architecture requirements prompt. 模型架构需求提示词。

This module provides the prompt template for generating structured model architecture
requirements. It does NOT generate code; instead, it produces a structured specification
that will be handed to the coding module.

该模块提供生成结构化模型架构需求的提示词模板。它不生成代码，而是生成一个结构化的规格，
该规格将被交给编码模块。
```

### `modules/experiment/method/prompts/training_code_prompt.py` — TRAINING CODE

```text
Training code prompt. 训练代码提示词。

Produces the training-code requirements that the coding module turns into an executable
training script: optimiser, schedule, batching, checkpointing, logging — against the
architecture requirements and the data interface.
```

### `modules/experiment/method/prompts/data_collection_prompt.py` — DATA COLLECTION CODE

```text
Data Collection Prompt - Code Agent Data Collection Code Generation.

Responsibility: Generate download, preprocessing, and splitting code for selected datasets.
Simulates Code Agent interaction: generates executable data processing scripts.

Core Position:
1. HuggingFace datasets download code
2. Data preprocessing and cleaning
3. Train/validation/test split

数据收集提示词 - Code Agent 数据收集代码生成

职责：为选定的数据集生成下载、预处理和划分代码。
模拟 Code Agent 交互：生成可执行的数据处理脚本。

核心定位：
1. HuggingFace datasets 下载代码
2. 数据预处理和清洗
3. 训练/验证/测试集划分
```

### `modules/experiment/method/prompts/baseline_requirements_prompt.py` — BASELINE REQUIREMENTS

```text
Baseline requirements prompt. 基线需求提示词。

Produces the structured requirements for reimplementing or integrating the comparison
baselines, so that the method and the baselines are trained and evaluated under one
protocol rather than each under its own.
```
