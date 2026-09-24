---
name: Research Foundation Assessment
category: research-understanding/research-foundation-assessment
type: system
status: active
version: 1.0
origin: initiation/profile
---

# Skill: Research Foundation Assessment

## Purpose

Assess the methodological foundation behind a researcher's stated skills, distinguishing claimed skills from demonstrated ones.

## When to Use

Use this skill when:

- Deciding how much scaffolding a research plan needs.
- Matching a direction to a researcher's real strengths.
- Reviewing an artefact (paper, code, report) to infer the level of method.

## Research Method

1. **Extract the concrete methods used in the artefact** (not the topic it is about).
2. **Classify depth per method**: can use, can modify, can design from scratch. These are different capabilities.
3. **Note dependencies the researcher does not control** — a method that requires unavailable infrastructure is not a strength for planning purposes.
4. **Estimate the level of methodological rigour** visible in the artefact: baselines chosen, controls run, ablation logic.
5. **Translate into planning implications**: which parts of a plan can be delegated and which need support.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every capability claim must point at a specific artefact location (section, file, figure) that demonstrates it.

## Expected Output

Produce:

- methods with a depth classification each
- external dependencies that limit what can be assumed
- an assessment of methodological rigour with its basis
- planning implications

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/profile/prompts/profile_paper_analysis_prompt.py` — TEMPLATE

```text
You are a research paper analysis assistant. Read the uploaded paper and produce a brief description for the user's research profile.

Paper filename: {filename}

Extracted PDF text (first {limit} characters):
{pdf_text}

Generate a concise description of this paper for the user's research profile. Include:
- The paper's main topic / research area
- The core idea or contribution (1-2 sentences)

Output JSON only (no markdown):
{{
    "title": "The paper title (derive from PDF text if available, otherwise use the filename without extension)",
    "description": "A brief 2-4 sentence English description of what this paper is about"
}}
```

### `modules/initiation/profile/prompts/foundation_analysis_prompt.py` — SYSTEM_PROMPT

```text
You are a research foundation analysis expert. Analyze the user's input and conversation history to determine their existing research foundation and skill level.

User Input:
{user_input}

Conversation History:
{conversation_history}

Your task is to evaluate the user's research background based on their input and conversation. Identify their skill level, existing skills, and overall experience.

# (JSON formatting policy is provided by Foundation Layer.)
{{
    "foundation_description": "A brief description of the user's research foundation (2-3 sentences)",
    "foundation_level": "beginner | intermediate | advanced",
    "skills": ["skill1", "skill2", ...],
    "experience": "Description of relevant experience and background"
}}

Foundation Level Guidelines:
- "beginner": Limited research experience, new to the field, basic knowledge only
- "intermediate": Some research experience, familiar with core concepts, has done some projects
- "advanced": Extensive research experience, deep domain expertise, proven publication record

SELF-CHECK:
- foundation_level MUST be one of: beginner, intermediate, advanced
- All JSON brackets properly closed
- skills array may be empty if no specific skills mentioned
```
