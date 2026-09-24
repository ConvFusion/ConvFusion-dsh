---
name: Research Process
category: research-planning/research-process
type: system
status: active
version: 1.0
origin: v2/native-process
---

# Skill: Research Process

## Purpose

Define the stages a research project passes through, and what counts as evidence that a stage has actually landed — so capability selection and progress reporting reflect a real research process rather than a fixed pipeline.

## When to Use

Use this skill when:

- Deciding which capabilities a research project currently needs most.
- Reporting what a conversation changed about the research.
- Adapting the process to a discipline whose order genuinely differs from the default.

## Research Method

The stages below are a **default**, not a pipeline: they describe what a research project must eventually produce, not the order in which it must be produced. Real work moves back and forth between them, and nothing here blocks or schedules anything.
Each stage is judged by **artifacts on disk**, never by conversation content: a stage has landed only when the artifact it produces actually exists.
Edit the block below to define your own process. The first block containing `stage:` lines wins, and your customisation is composed **before** the default text — so your definition takes precedence without any extra setting.
Format: `stage: <id> | <display name> | <capability category> | <signal> | <what this stage produces>`. Signals come from a fixed vocabulary (see the header of this skill file in the repository); an empty or unknown signal means the stage is displayed but does not count towards the current-stage decision.

```text
stage: topics | 提出话题 | research-understanding | topic-proposed | 研究话题（research/topics.md）
stage: literature | 文献调研 | literature | literature-evidence | 实际检索到的文献证据（research/evidence/）
stage: innovation | 创新假设 | innovation | claims | 已确定的研究问题与主题、可检验的假设与主张（project.md / research/claims/）
stage: planning | 计划管理 | research-planning | method-plan | 可执行的研究计划与方法设计（research/plans/）
stage: resource | 资源评估 | resource-estimation | resource-estimate | 资源需求、成本与可行性估计（research/plans/）
stage: decision | 研究决策 | research-decision | decisions | 已记录理由的研究决策（research/decisions/）
stage: experiment | 实验验证 | experiment | experiments | 实验产物与经确认的结果证据（experiments/<name>/results/）
stage: writing | 论文写作 | academic-writing | manuscript | 论文正文（papers/<id>/paper.md）
```

A project that has landed every stage is not "finished" — research continues by evolving the same artifacts. The absence of a missing stage is not the absence of work.

## Reasoning Guidance

Focus on:

- Whether the artifact a stage produces actually exists on disk.
- Which stage is the first one without its artifact — that is the current gap.
- Whether a discipline’s process really differs, or the default order is merely unfamiliar.

Avoid:

- Treating the stage list as a schedule: nothing here may block, gate or order work.
- Inferring progress from conversation content — only artifacts count.
- Adding a stage whose signal is not in the vocabulary and expecting it to be judged.
- Reading "no missing stage" as "the research is done".

## Evidence Requirements

Every stage judgement must be checkable against the workspace: it names the artifact that would satisfy it. A stage is never marked landed on the strength of a claim in conversation.

## Expected Output

Produce:

- an ordered list of stages, each naming the capability category it draws on
- for each stage, the artifact that would prove it has landed
- the current stage (the first stage without its artifact), or an explicit statement that every stage has landed
- a note that the list describes assets, not a procedure to follow
