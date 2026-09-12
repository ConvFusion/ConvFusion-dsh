---
name: Problem Definition
category: research-understanding/problem-definition
type: system
status: active
version: 1.0
origin: initiation/conversation, incubation
---

# Skill: Problem Definition

## Purpose

Convert a research interest into a falsifiable research problem: a question whose answer would change what we do, and which could turn out to be false.

## When to Use

Use this skill when:

- A domain and some signals exist, but no committable research question does.
- A direction is stated so broadly that any result could be claimed to support it.
- You need to decide whether two candidate directions are actually the same problem.

## Research Method

1. **State the problem as a question, not a topic.** "Geometry-conditioned adaptation" is a topic; "does conditioning the adapter on egocentric geometry change navigation performance when topology is held fixed?" is a problem.
2. **Name the comparison.** Every research problem implies a baseline or a null. If you cannot name what the answer is compared against, the problem is not yet defined.
3. **Specify the setting.** Dataset, model class, metric, deployment constraint — whatever the answer is conditional on. A problem that is true in every setting is usually not research.
4. **State the falsification condition.** What observation would show the answer is "no"? If nothing could, the problem is unfalsifiable and should be rewritten.
5. **Check separability.** If the problem bundles two independent questions, split it — bundled questions produce uninterpretable results.
6. **Write the seed down**, with topic, question, setting and falsification condition, so planning can act on it.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The setting you specify should be justified: if you claim a dataset or metric is the standard one, that claim needs a literature basis. Falsification conditions must be concrete enough that someone else could check them.

## Expected Output

Produce:

- the research question, stated as a question
- the comparison / baseline it is against
- the setting it is conditional on
- the falsification condition
- a note on whether it needed splitting into sub-questions

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/conversation/prompts/clarify_goal_prompt.py` — TEMPLATE

```text
You are a research goal clarifier. Based on the user's interests and pain points, clarify their research goals.

Interests:
{interests}

Pain Points:
{pain_points}

Define clear research goals that address the pain points while building on the interests.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "goals": ["goal1", "goal2"],
    "reasoning": "brief reasoning"
}}
```

### `modules/initiation/conversation/prompts/analyze_interest_prompt.py` — TEMPLATE

```text
You are a research interest analyst. Based on the user input and research seed, identify their research interests.

User Input:
{user_input}

Research Seed:
{research_seed}

Identify the user's research interests and determine the domain.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "interests": ["interest1", "interest2"],
    "domain": "research domain",
    "reasoning": "brief reasoning"
}}
```

### `modules/initiation/conversation/prompts/analyze_pain_points_prompt.py` — TEMPLATE

```text
You are a research pain point analyst. Based on the user's interests, identify their research pain points and challenges.

User Interests:
{interests}

User Input:
{user_input}

Identify the key pain points or challenges the user is facing in their research.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "pain_points": ["pain_point1", "pain_point2"],
    "reasoning": "brief reasoning"
}}
```
