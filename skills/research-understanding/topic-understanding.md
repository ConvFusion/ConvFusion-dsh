---
name: Topic Understanding
category: research-understanding/topic-understanding
type: system
status: active
version: 1.0
---

# Skill: Topic Understanding

## Purpose

Turn an unstructured input — a paper, repository, dataset, conversation, half-formed idea — into a precise statement of what is actually being researched: its source type, domain, and substantive content.

## When to Use

Use this skill when:

- A new piece of material enters the project and you do not yet know how to treat it.
- The user describes an interest in vague terms and you must find the research inside it.
- You are about to search the literature but the question itself is still unclear.

## Research Method

1. **Classify the input's source type.** Paper, patent, code, dataset, conversation, experiment log, report, or other. Treatment differs: a dataset claim needs different support from a conversation claim. If ambiguous, say so rather than defaulting silently.
2. **Identify the domain at the level a researcher would name it** (e.g. "Robotics (Embodied AI)", not "Computer Science"). The domain determines which literature is relevant and which baselines count.
3. **Separate what the input states from what it implies.** List explicitly: stated problems, methods, results, limitations, claimed future work. Do not merge these into one summary — their differences are where research questions come from.
4. **Extract research signals.** A signal is something that could become a research direction: an admitted limitation, a contradiction with another work, a missing evaluation dimension, an untested assumption.
5. **Assemble a research seed** — domain + problem + signals — expressed so a later step can build a direction from it. If the material cannot support a seed, state what is missing.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every claim about what the material says must be traceable to the material (section, figure, file path). Domain and source-type judgements should state their basis. Never let an agent-generated summary become the only record of a source.

## Expected Output

Produce:

- source type and domain, with the basis for each
- a problem / method / limitation / future-work breakdown that keeps them separate
- extracted research signals
- a research seed, or an explicit statement of what is missing to form one

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/trigger/prompts/detect_source_prompt.py` — TEMPLATE

```text
You are a research source detection expert. Analyze the user input and determine its source type.

User Input:
{user_input}

Determine the source type from one of the following:
- "paper": Academic paper, preprint, or publication
- "patent": Patent document
- "code": Code repository, implementation, or algorithm
- "dataset": Dataset description or link
- "conversation": Casual conversation, question, or exploratory discussion
- "experiment": Experiment log or results
- "report": Technical report or project report
- "other": Other types

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "source_type": "one of the types above",
    "domain": "the research domain inferred (e.g., Computer Vision, NLP, etc.)",
    "confidence": 0.0-1.0,
    "reasoning": "brief reasoning for your decision"
}}
```

### `modules/initiation/trigger/prompts/extract_content_prompt.py` — TEMPLATE

```text
You are a research content extraction expert. Extract the core research content from the input.

Source Type: {source_type}

Input Content:
{user_input}

Extract the following information:
1. summary: A concise summary of the content (2-3 sentences)
2. problems: Key research problems or challenges mentioned
3. methods: Methods, approaches, or techniques mentioned

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "summary": "concise summary",
    "problems": ["problem1", "problem2"],
    "methods": ["method1", "method2"]
}}
```

### `modules/initiation/trigger/prompts/extract_research_signals_prompt.py` — TEMPLATE

```text
You are a research signal detection expert. Analyze the extracted content and identify research signals.

Summary:
{summary}

Problems:
{problems}

Methods:
{methods}

Identify:
1. limitations: Limitations or gaps in the current work
2. future_work: Potential future research directions mentioned or implied
3. research_signals: Explicit or implicit research signals (trends, opportunities, open questions)

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "limitations": ["limitation1", "limitation2"],
    "future_work": ["future_direction1", "future_direction2"],
    "research_signals": ["signal1", "signal2"]
}}
```

### `modules/initiation/trigger/prompts/build_seed_prompt.py` — TEMPLATE

```text
You are a research seed builder. Consolidate all extracted information into a structured ResearchSeed.

Source Type: {source_type}
Domain: {domain}
Summary: {summary}

Problems:
{problems}

Methods:
{methods}

Limitations:
{limitations}

Future Work:
{future_work}

Research Signals:
{research_signals}

Output a consolidated JSON with all the extracted information.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "research_seed": {{
        "source_type": "{source_type}",
        "domain": "{domain}",
        "summary": "consolidated summary",
        "problems": ["problem1", "problem2"],
        "methods": ["method1", "method2"],
        "limitations": ["limitation1", "limitation2"],
        "future_work": ["future_direction1", "future_direction2"],
        "research_signals": ["signal1", "signal2"]
    }}
}}
```
