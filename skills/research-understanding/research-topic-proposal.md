---
name: Research Topic Proposal
category: research-understanding/research-topic-proposal
type: system
status: active
version: 1.0
origin: initiation/conversation, incubation
---

# Skill: Research Topic Proposal

## Purpose

Turn an understood input and the researcher's profile into one or more stated research topics — a **loose working direction** (a sentence, a paragraph, or something distilled from a document) that aims the literature search. A research topic is not yet a research theme: it does not have to be falsifiable, and it must not be forced into a paper title at this stage.

## When to Use

Use this skill when:

- The input has been understood and the intent confirmed as research, but no direction has been named.
- A direction is being assumed from the material alone, without the researcher's own domains and foundation taken into account.
- You are about to search the literature and need a stable anchor to aim the search at.

## Research Method

1. **State the topic as a direction, not a problem.** "Using LLMs to support research decisions" is a topic. A falsifiable research question is *not* required here and belongs to theme generation and hypothesis formulation; forcing one now produces a fake problem that the literature has not yet earned.
2. **Derive it from the input and the profile together.** Take the research signals the material yielded (admitted limitations, contradictions, untested assumptions) and intersect them with what the researcher actually has — domains, demonstrated foundation, available setting. A topic with no basis in either is a guess.
3. **Keep it deliberately loose, but not empty.** A topic may be one sentence, a paragraph, or a distilled statement from a document. It must be concrete enough that a literature search can be aimed at it — and no more precise than the evidence currently supports.
4. **Name them all when there is more than one.** Distinct topics differ in the question they point at, not in dataset or scale. Record every candidate; choosing among them is a decision to be made with reasoning, not silently.
5. **Say what would sharpen or kill each topic.** For each, note which literature would confirm it, narrow it, or refute it — that is exactly what the literature step must answer.
6. **Write every topic into `research/topics.md`** — one bullet per topic, each carrying its basis (input signal + profile) and what would sharpen or kill it. That file is the stable anchor the literature step retrieves against, and the record that survives across sessions. Create it if missing; append rather than overwrite when a new topic appears.
7. **Mark the file as topics, not themes.** `research/topics.md` holds loose directions; the committed research theme (normally the paper title) is decided later, after the literature and the gap are in hand.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every topic must be traceable to the input that suggested it (section, figure, file path) and, where used, to the researcher's profile. A topic may not rest on trend or on a single paper alone; the basis for the direction must be visible so it can be revisited when the literature says otherwise.

## Expected Output

Produce:

- one or more research topics, each stated as a direction
- the input signal(s) and profile basis each topic rests on
- for each topic, what literature would confirm, narrow or kill it
- every topic written into `research/topics.md` (one bullet each, with its basis)
- an explicit note that these are topics, not yet research themes

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
