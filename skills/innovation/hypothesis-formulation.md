---
name: Hypothesis Formulation
category: innovation/hypothesis
type: system
status: active
version: 1.0
origin: conception/structuring, conception/innovation-state-synthesis
---

# Skill: Hypothesis Formulation

## Purpose

Turn a selected idea into a hypothesis precise enough to be wrong: named variables, a comparison, a predicted effect worth caring about, and the conditions under which it holds.

## When to Use

Use this skill when:

- A direction has been chosen and the experiment must be made testable.
- An aim is written as a goal ("study X", "improve Y") rather than a claim.
- An experiment is planned but no result could count as evidence against it.

## Research Method

1. **Write the hypothesis as a directional statement.** "Under condition Z, changing X raises Y relative to comparison C" — not "study X" and not "improve Y". A hypothesis with no direction cannot be wrong in an informative way.
2. **Name the independent variable, the dependent measure and the comparison.** If any of the three is missing, the hypothesis cannot be tested as written, and the missing element is the real work item.
3. **State the effect size that would matter.** "Better" without a magnitude cannot be separated from noise after the experiment is run; name the smallest difference that would change a decision.
4. **State the boundary conditions.** Regimes, datasets, scales, hardware. The hypothesis should predict where the effect weakens or reverses; a hypothesis that must hold everywhere is untestable.
5. **Split conjunctions.** A hypothesis containing "and" usually bundles two claims, so a partial failure becomes uninterpretable. Split it into separately checkable claims.
6. **Make it refutable by one experiment.** Name the observation that would falsify it and verify that the planned measurement could actually produce that observation.
7. **Rank the hypothesis against its alternatives.** Include the null and the trivial explanation — the effect comes from extra capacity, compute or tuning rather than from the mechanism. The experiment must be able to separate the mechanism from the confound.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The hypothesis must cite the gap and the closest-work analysis that motivate it. Boundary conditions must be justified from prior evidence, not asserted. The refutation test must be concrete enough that another researcher could run it.

## Expected Output

Produce:

- hypotheses written as directional statements
- variables, comparison and the effect size that matters
- boundary conditions derived from prior evidence
- the concrete refutation test
- competing trivial explanations and how the experiment separates them

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/conception/prompts/structuring_prompt.py` — TEMPLATE

```text
You are an expert in research design and methodology. Transform the selected final idea into a structured, actionable research plan:

Research Topic: {research_topic}

1. Develop clear problem statement and research motivation
2. Define core hypothesis and technical approach
3. Outline expected contributions and evaluation strategy
4. Provide a complete, structured research plan

Final Idea:
{final_idea}

Selected Ideas:
{selected_ideas}

Research Understanding:
{research_understanding}

Please return the structured research plan in JSON format:
{{
    "structured_research_ideas": [
        {{
            "problem_statement": "clear, concise problem statement",
            "research_motivation": "why this research is important and needed",
            "core_hypothesis": "central hypothesis or research question",
            "technical_route": "detailed technical approach and methodology",
            "expected_contribution": "what will be contributed to the field",
            "evaluation_strategy": "how success will be measured",
            "related_work": ["key paper 1", "key paper 2"],
            "methodology": "detailed methodology description",
            "timeline": [
                {{
                    "phase": "phase 1",
                    "duration": "1-2 months",
                    "activities": ["activity 1", "activity 2"]
                }}
            ],
            "risks": [
                {{
                    "risk": "description of risk",
                    "mitigation": "how to mitigate"
                }}
            ]
        }}
    ]
}}

IMPORTANT REQUIREMENTS:
1. Create a complete, structured research plan
2. Problem statement should be specific and research-focused
3. Technical route should be detailed and actionable
4. Evaluation strategy should be clear and measurable
5. Timeline should be realistic and well-organized
6. Identify key risks and mitigation strategies
7. The plan should be comprehensive enough to form the basis of a research proposal

(JSON formatting policy is provided by Foundation Layer.)
```

### `modules/conception/prompts/innovation_state_synthesis_prompt.py` — TEMPLATE

```text
You are an expert in research state synthesis. Your task is to synthesize the Conception module's intermediate results into a unified, structured Innovation State that captures the complete research innovation space for the specific research topic below.

Research Topic: {research_topic}

You have access to the following Conception outputs:
- Research Understanding: The research context and domain analysis
- Domain Challenges: Key challenges and contradictions
- Research Opportunities: Identified innovation opportunities
- Deep Research Gaps: Identified gaps in the research landscape
- Methodological Limitations: Limitations in current approaches
- Innovation Opportunities: High-value innovation directions
- Candidate Ideas: Generated research ideas
- Evaluated Ideas: Assessed research ideas
- Selected Ideas: Selected promising directions
- Final Idea: The chosen final research direction
- Structured Research Ideas: Structured research plans

Please return the Innovation State in JSON format:
{{
  "innovation_state": {{
    "topic_focused_summary": "A concise summary of the innovation space focused specifically for the research topic",
    "candidate_hypotheses": [
      {{
        "hypothesis_id": "hypothesis_1",
        "title": "hypothesis title",
        "description": "detailed description of the hypothesis",
        "novelty": 0.0-1.0,
        "feasibility": 0.0-1.0
      }}
    ],
    "selected_direction": {{
      "idea_id": "idea_1",
      "title": "final idea title",
      "motivation": "research motivation",
      "core_innovation": "core innovation",
      "expected_contribution": "expected contribution",
      "novelty": 0.0-1.0,
      "feasibility": 0.0-1.0,
      "scientific_value": 0.0-1.0,
      "overall_score": 0.0-1.0
    }},
    "novelty_analysis": {{
      "key_novelty_factors": ["factor 1", "factor 2"],
      "comparison_to_sota": "how this idea compares to the state of the art"
    }},
    "feasibility_analysis": {{
      "key_feasibility_factors": ["factor 1", "factor 2"],
      "risk_assessment": "assessment of implementation risks"
    }},
    "innovation_opportunities_summary": "summary of the innovation opportunities landscape",
    "research_gaps_addressed": ["gap 1", "gap 2"],
    "methodological_limitations_addressed": ["limitation 1", "limitation 2"]
  }}
}}

IMPORTANT REQUIREMENTS:
1. CRITICAL: Focus ALL analysis on the specific research topic - exclude irrelevant information
2. Integrate information from all intermediate results to form a comprehensive innovation state
3. Ensure novelty_analysis and feasibility_analysis are based on the evaluated_ideas and selected_ideas
4. candidate_hypotheses should include the key ideas that were most promising
5. selected_direction should be exactly the final_idea with all relevant fields
6. Include all structured research idea details in the selected_direction
7. research_gaps_addressed should reference the gaps from Discovery and deep_research_gaps
8. methodological_limitations_addressed should reference the limitations from Discovery

(JSON formatting policy is provided by Foundation Layer.)
```
