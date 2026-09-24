---
name: Innovation Gap Analysis
category: innovation/innovation-gap-analysis
type: system
status: active
version: 1.0
origin: conception/understanding, conception/gap-discovery
---

# Skill: Innovation Gap Analysis

## Purpose

Turn a literature landscape into the specific unresolved problems, methodological limitations and contradictions that a contribution could target — and separate structural gaps from areas that are merely unfamiliar to you.

## When to Use

Use this skill when:

- A literature review or landscape exists and you need to know what is still open in it.
- You are about to generate ideas and want them aimed at real gaps rather than at topics.
- A gap is being claimed in a proposal and must survive the question "has this already been done?".

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 缺口是文献图景上的判断，需先有文献证据
```

## Research Method

1. **Re-derive the gap from the landscape, not from one paper.** A gap is a statement about the field, so it must rest on the multi-work picture (settled vs contested results, method families). If the search has not reached saturation, say so before claiming anything is unresolved.
2. **Classify each candidate gap by type.** An untested assumption; a contradiction between works; a limitation the authors themselves admit; a capability that exists but not under this setting; a problem no method addresses at all. The type determines what evidence would close the gap.
3. **Test each gap for resolution before recording it.** Search recent literature specifically for work that already addresses it. A gap that has been closed and merely not read is not a gap — record the closest existing work next to every claimed gap.
4. **Separate structural from incidental gaps.** A gap that persists across many groups and settings is structural; one that exists because a single paper used a small dataset is incidental. Structural gaps support a contribution; incidental ones support at most a paper.
5. **Name the mechanism that produces the gap.** "No method handles X" is a description; "existing methods assume Y, which fails when X" is a mechanism, and it predicts what a solution must change. Prefer mechanistic gap statements.
6. **Rank by consequence, not by ease of filling.** For each gap state what becomes possible if it is closed and which existing result would be overturned. A gap that changes nothing measurable is not worth a project.
7. **Record contradiction pairs explicitly.** When two works disagree, keep both citations and state the condition under which each could be right — that condition is frequently the research question.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every gap must cite the works that define the boundary of current capability plus the closest work that approaches it. Contradiction claims must cite both sides. The search coverage that licenses the word "unresolved" must be recorded, and anything the search could not rule out must be flagged as such.

## Expected Output

Produce:

- the gap list with each gap classified by type and mechanism
- closest existing work per gap, with the exact difference
- contradiction pairs with the condition under which each side holds
- a consequence-based ranking of the gaps
- an explicit statement of what the search could not exclude

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/conception/prompts/understanding_prompt.py` — TEMPLATE

```text
You are an expert research analyzer specializing in scientific innovation. Based on the provided Knowledge State for the specific research topic below, perform the following analysis:

Research Topic: {research_topic}

1. Understand the research landscape and current state of the art
2. Identify key domain challenges and contradictions
3. Extract research opportunities and innovation potentials

Knowledge State - Research Landscape:
{research_landscape}

Knowledge State - Trends:
{trends}

Knowledge State - Research Gaps:
{research_gaps}

Knowledge State - Methodological Limitations:
{limitations}

Knowledge State - Research Contradictions:
{contradictions}

Knowledge State - Scientific Building Blocks:
{building_blocks}

Knowledge State - Core Evidence Papers:
{core_papers}

Please return the analysis in JSON format:
{{
    "research_understanding": {{
        "domain_summary": "brief summary of the research domain",
        "key_findings": ["key finding 1", "key finding 2"],
        "current_state_of_art": "summary of current state of the art"
    }},
    "domain_challenges": [
        {{
            "challenge": "description of challenge",
            "impact": "potential impact",
            "relevance": "why this is important"
        }}
    ],
    "research_opportunities": [
        {{
            "opportunity": "description of opportunity",
            "potential": "innovation potential",
            "direction": "research direction"
        }}
    ]
}}

IMPORTANT REQUIREMENTS:
1. Focus on scientific reasoning and innovation potential
2. Identify structural contradictions in the research domain
3. Extract real research opportunities, not just vague suggestions
4. Analysis should be based on the provided Knowledge State
5. Both theoretical and applied opportunities should be considered
6. Pay special attention to methodological limitations and contradictions as sources of innovation

(JSON formatting policy is provided by Foundation Layer.)
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
