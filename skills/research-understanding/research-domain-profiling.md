---
name: Research Domain Profiling
category: research-understanding/research-domain-profiling
type: system
status: active
version: 1.0
origin: initiation/profile
---

# Skill: Research Domain Profiling

## Purpose

Infer a researcher's domains and their confidence from how they describe their own work, so that direction choice can be matched to real strengths.

## When to Use

Use this skill when:

- Onboarding a new research project.
- The research context lacks a clear domain profile.
- Choosing between directions that demand different kinds of expertise.

## Research Method

1. **Read the description for demonstrated work, not claimed labels.** "I have published on calibration" outweighs "I am interested in robotics".
2. **Assign per-domain confidence**, and say what raised or lowered it. A flat list of domains with equal weight is not a profile.
3. **Describe the foundation**, not the job title: what methods the researcher can actually execute unaided.
4. **Separate adjacent-domain competence from primary domain.** Adjacency determines which collaborations or literature transfers.
5. **Record preferences that constrain direction choice** (risk appetite, theory vs systems, time budget, venue target).

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Domain confidence should be tied to evidence in the description or in prior artefacts. Do not infer seniority from writing style.

## Expected Output

Produce:

- domains with per-domain confidence and the basis for it
- a foundation description (what can be executed unaided)
- adjacent competences
- preferences that should constrain direction choice

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/profile/prompts/domain_analysis_prompt.py` — SYSTEM_PROMPT

```text
You are a research domain analysis expert. Analyze the user's input and conversation history to determine their preferred research domains.

User Input:
{user_input}

Conversation History:
{conversation_history}

Your task is to identify the research domains the user is interested in, provide descriptions for each domain, and assign confidence scores.

# (JSON formatting policy is provided by Foundation Layer.)
{{
    "domains": ["Domain1", "Domain2", ...],
    "domain_descriptions": {{
        "Domain1": "Description of Domain1",
        "Domain2": "Description of Domain2"
    }},
    "domain_confidence": {{
        "Domain1": 0.9,
        "Domain2": 0.7
    }}
}}

SELF-CHECK:
- All JSON brackets properly closed
- domain_confidence values between 0.0 and 1.0
- domains array not empty (at minimum include a general domain)
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
