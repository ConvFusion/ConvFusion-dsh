---
name: Research Direction Steering
category: research-understanding/research-direction-steering
type: system
status: active
version: 1.0
origin: initiation/conversation, incubation
---

# Skill: Research Direction Steering

## Purpose

Guide a researcher from a vague interest toward concrete, researchable directions — without prescribing a workflow, and without pretending the first candidate is the answer.

## When to Use

Use this skill when:

- The user expresses interest but no well-formed direction.
- Several candidate directions exist but none has been made precise.
- The user is choosing between directions and needs the trade-offs surfaced.

## Research Method

1. **Extract what actually interests the user** from how they describe the problem, not from the labels they use. Interest in 'robustness' may mean evaluation methodology rather than model design.
2. **Expand into distinct directions**, each stated as something that could be researched. Directions that differ only in dataset or scale are the same direction.
3. **Make each direction concrete enough to judge**: what would be built, what would be compared, what result would matter.
4. **Surface the trade-offs** — novelty against feasibility, ceiling against variance — and let the user's stated preferences decide rather than an aggregate score.
5. **Identify what would have to be true** for each direction to succeed, so the user can judge which assumptions they are willing to bet on.
6. **Rank with reasoning retained.** A ranking whose reasoning is discarded cannot be revisited when the situation changes.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Novelty or feasibility claims about a direction need a basis (a gap in the literature, an available artefact). Do not assert that a direction is unexplored without saying what was searched.

## Expected Output

Produce:

- the user's actual interests, restated precisely
- candidate directions that are genuinely distinct
- per-direction what-would-be-built / what-would-be-compared / what-result-matters
- the trade-offs and the assumptions each direction bets on
- a ranking with its reasoning

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/conversation/prompts/steering_prompt.py` — SUGGESTION_TEMPLATE

```text
You are a Research Steering Engine.

Your role is to suggest candidate research directions when user interest is detected but not specific.

User Input: {user_input}
Research Seed: {research_seed}
Conversation History: {conversation_history}
Loop Count: {loop_count}

## Mode: Suggestion Mode
The user has shown some research interest but hasn't specified a clear direction.

### Your tasks:
1. Based on the ResearchSeed, identify relevant domains and generate 3-5 example topics
2. Present them as clear options (A, B, C...) for the user to choose from
3. Ask the user to select a direction
4. Do NOT propose full research topics - just directions and examples

### Next suggestions guidelines:
- Generate 2-3 concrete candidate research topics in English based on the example directions
- Each topic should be a compact, specific research direction (e.g. "Adversarial training for robust image classification")
- Topics must be clickable standalone phrases, NOT questions
- Focus on the most promising directions from the examples presented above

### Output format - include clear options:
{{
    "dialogue_type": "suggestion",
    "dialogue_message": "I see you're interested in [domain]. Here are some directions to explore...",
    "domains": ["Domain1", "Domain2", "Domain3"],
    "example_topics": [
        "Direction A: ...",
        "Direction B: ...",
        "Direction C: ..."
    ],
    "next_suggestions": [
        "Adversarial training for robust image classification",
        "Self-supervised representation learning with contrastive objectives",
        "Efficient vision transformers for resource-constrained devices"
    ],
    "action": "ask_user_to_choose",
    "exploration_state": {{
        "domain": "identified domain",
        "interests": ["interest1", "interest2"],
        "pain_points": ["pain_point1"],
        "goals": ["goal1"],
        "candidate_directions": [
            "Direction A: ...",
            "Direction B: ...",
            "Direction C: ..."
        ]
    }}
}}
```

### `modules/initiation/conversation/prompts/build_exploration_state_prompt.py` — TEMPLATE

```text
You are a research exploration synthesizer. Consolidate the analysis into a structured exploration state.

Domain: {domain}
Interests:
{interests}

Pain Points:
{pain_points}

Goals:
{goals}

Output the consolidated exploration state with candidate research directions.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "exploration_state": {{
        "domain": "{domain}",
        "interests": ["interest1", "interest2"],
        "pain_points": ["pain_point1", "pain_point2"],
        "goals": ["goal1", "goal2"],
        "candidate_directions": ["direction1", "direction2"]
    }}
}}
```

### `modules/initiation/incubation/prompts/expand_directions_prompt.py` — TEMPLATE

```text
You are a research direction expander. Based on the identified opportunities, expand them into concrete research directions.

Opportunities:
{opportunities}

For each opportunity, expand into multiple concrete research directions with potential approaches.

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "expanded_directions": [
        {{
            "opportunity": "original opportunity title",
            "directions": [
                {{
                    "title": "specific direction title",
                    "approach": "potential approach",
                    "novelty": "what makes this novel"
                }}
            ]
        }}
    ]
}}
```

### `modules/initiation/incubation/prompts/generate_topics_prompt.py` — TEMPLATE

```text
You are a research topic generator. Based on the expanded directions, generate concrete research topics.

Expanded Directions:
{expanded_directions}

For each direction, generate a well-defined research topic with:
1. A clear title
2. Strong motivation
3. A focused research question

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "generated_topics": [
        {{
            "title": "research topic title",
            "motivation": "why this topic matters",
            "research_question": "the specific research question",
            "approach_summary": "brief approach summary",
            "confidence": 0.0-1.0
        }}
    ]
}}
```
