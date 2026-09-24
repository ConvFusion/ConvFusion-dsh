---
name: Research Theme Generation
category: innovation/research-theme-generation
type: system
status: active
version: 1.0
origin: conception/idea-generation
---

# Skill: Research Theme Generation

## Purpose

Turn a research topic and a ranked set of gaps into candidate research themes — each stated at the level of a precise research title (most often the paper title) that attacks a named gap through a stated mechanism, instead of several rewordings of one theme.

## When to Use

Use this skill when:

- A research topic exists and the literature has been reviewed into gaps, and you need candidate themes to commit to.
- An existing theme list looks broad but every entry shares the same mechanism.
- You need cross-domain candidate themes and want their validity conditions made explicit.

## Research Method

1. **Fix the generation target before generating.** For each gap write the one-sentence change in capability the theme must produce. A theme that cannot state this is a restatement of existing work, however appealing it sounds.
2. **Generate across mechanisms, not within one.** For each gap, produce candidates from at least three different mechanism families — change the representation, change the training signal, change the inference procedure, change the evaluation setting. Mechanism diversity is what makes the later theme decision meaningful.
3. **Force cross-domain transfer to declare itself.** For at least one candidate per gap, name the source field and the imported mechanism, then state what must be re-derived for the import to be valid. Unexamined analogy is the most common source of fake novelty.
4. **Check the closest work while writing the theme, not after.** If you cannot name what differs from the nearest existing method and why that difference should matter, drop the candidate rather than keeping it with vague novelty language.
5. **State each theme at title level, with its falsifiable claim.** A research theme is a strict selection, normally usable as the paper title: write one sentence naming the problem, the intervention and the comparison. Then write the observation that would show it does not work — a theme whose claim cannot fail is a programme of work, not a research theme.
6. **Keep the theme separate from its implementation.** Record mechanism, claim and title only. Architecture, dataset and schedule belong to planning, and committing to them now silently deletes alternatives.
7. **Stop at coverage, not at a count.** Stop when every selected gap has at least one candidate from each plausible mechanism family; report the gaps that produced nothing and why, rather than padding the list.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Each candidate theme must reference the gap it addresses and the closest work it must be distinguished from. Any cross-domain import must name its source and what was re-derived. No theme may be justified by trend or popularity alone.

## Expected Output

Produce:

- candidate research themes, each with its gap, mechanism family and core claim
- a title-level statement per theme (usable as the paper title), together with its falsification condition
- the closest-work comparison that distinguishes each theme
- cross-domain imports with their validity conditions
- gaps that yielded no viable theme, with the reason

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/conception/prompts/idea_generation_prompt.py` — SYSTEM_PROMPT

```text
You are an expert in scientific innovation and research idea generation. Based on the identified innovation opportunities for the specific research topic below, generate high-quality research ideas:

Research Topic: {research_topic}

1. Generate 5-10 distinct research ideas
2. Each idea should address identified gaps and opportunities
3. Encourage cross-domain innovation and novel approaches
4. Each idea must have clear motivation and core innovation

Innovation Opportunities:
{innovation_opportunities}

Deep Research Gaps:
{deep_research_gaps}

Research Understanding:
{research_understanding}

Please return the ideas in JSON format:
{{
    "candidate_ideas": [
        {{
            "id": "idea_1",
            "title": "brief, specific title",
            "motivation": "why this research is needed",
            "core_innovation": "what's novel about this approach",
            "expected_contribution": "expected contribution",
            "technical_direction": "technical approach"
        }}
    ]
}}

IMPORTANT REQUIREMENTS:
1. Generate AT LEAST 5-10 distinct ideas
2. Each idea must be specific, actionable, and researchable
3. Focus on real innovation, not just incremental improvements
4. Address the identified research gaps and opportunities
5. Include a mix of theoretical and applied approaches
6. Encourage cross-domain thinking and novel combinations
7. Each idea should have clear, well-articulated motivation
8. Avoid generic or vague ideas - focus on concrete, specific research directions
```

### `modules/conception/prompts/gap_discovery_prompt.py` — SYSTEM_PROMPT

```text
You are an expert in identifying research gaps and innovation opportunities. Based on the provided research understanding for the specific research topic below, perform deep gap analysis:

Research Topic: {research_topic}

1. Identify unresolved problems and research contradictions
2. Analyze methodological limitations in current approaches
3. Extract high-impact innovation opportunities

Research Understanding:
{research_understanding}

Domain Challenges:
{domain_challenges}

Research Opportunities:
{research_opportunities}

Knowledge State - Research Gaps:
{research_gaps}

Knowledge State - Methodological Limitations:
{limitations}

Knowledge State - Research Contradictions:
{contradictions}

Knowledge State - Opportunity Signals:
{opportunities}

Please return the analysis in JSON format:
{{
    "deep_research_gaps": [
        {{
            "title": "brief title of the gap",
            "description": "detailed description",
            "why_unresolved": "why this remains unresolved",
            "innovation_potential": "innovation potential score 0-1"
        }}
    ],
    "methodological_limitations": [
        {{
            "limitation": "description of limitation",
            "approach": "current approach",
            "improvement_opportunity": "opportunity for improvement"
        }}
    ],
    "innovation_opportunities": [
        {{
            "opportunity": "innovation opportunity",
            "type": "theoretical|applied|methodological",
            "priority": "high|medium|low",
            "rationale": "why this is valuable"
        }}
    ]
}}

IMPORTANT REQUIREMENTS:
1. Focus on structural contradictions and real unsolved problems
2. Analyze both theoretical and methodological limitations
3. Identify opportunities with real innovation potential
4. Avoid generic suggestions - be specific and research-focused
5. Prioritize opportunities that address critical domain challenges
6. Cross-reference Knowledge State limitations and contradictions with your own analysis
```
