---
name: Contribution Design
category: innovation/contribution-design
type: system
status: active
version: 1.0
origin: conception/structuring, decision/impact-evaluation
---

# Skill: Contribution Design

## Purpose

State what the field gains if the work succeeds, and design the evidence package that demonstrates each claim instead of merely asserting it.

## When to Use

Use this skill when:

- An idea and its hypothesis are fixed and the claims must be made defensible.
- A proposal claims a contribution that no planned experiment would actually demonstrate.
- You need to choose baselines and controls that make the result interpretable.

## Research Method

1. **Name the contribution type explicitly.** New mechanism, new evidence or understanding, new benchmark or dataset, new capability, or a negative result that changes practice. Each type demands a different demonstration.
2. **Write each contribution as a claim the field can reuse**, not as "we propose X". If a reader cannot take the result and apply it, it is a description of activity rather than a contribution.
3. **Attach a demonstration to every claim.** A mechanism claim needs an ablation that isolates the mechanism; a capability claim needs a comparison at matched budget; a benchmark needs adoption criteria. A claim without its demonstration is a promise.
4. **Choose the strongest available baselines before designing the method.** If the method is only compared with weak baselines the contribution cannot be assessed. Prefer the current state of the art plus the simplest strong alternative.
5. **Plan the negative controls.** For any performance claim, include extra-compute and extra-tuning controls so that gains can be attributed to the mechanism rather than to resources.
6. **State the scope of each claim** — the setting in which the collected evidence supports it — and refuse to generalise beyond it in the write-up.
7. **Write the fallback contribution into the plan.** State which result would force the main claim to be restated, and what would still count as a valid contribution in that case.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Each contribution must be paired with the experiment or analysis that would demonstrate it. Baseline choices must be justified from the literature. The compute and tuning budget of every comparison must be stated so that gains are attributable.

## Expected Output

Produce:

- contribution statements with their type
- a per-claim demonstration plan
- the baseline set with its literature justification
- control conditions that isolate the mechanism
- the scope and limits of each claim, plus a fallback contribution

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

### `modules/decision/prompts/impact_evaluator.py` — SYSTEM_PROMPT

```text
Evaluate the potential impact of the following research proposal:

Idea:
{idea}

Method:
{method}

Please consider:
1. Potential contribution to the field (scientific advancement)
2. Practical applications and real-world impact
3. Potential for follow-up research and further development
4. Broader impact on society, industry, or policy
5. Innovation level and novelty of the approach
6. Potential for commercialization or technology transfer

You MUST follow this EXACT JSON schema:
{{
    "impact_score": 0.8,
    "scientific_impact": {{
        "field_contribution": "contribution to the research field",
        "theoretical_advancement": "theoretical contributions",
        "methodological_innovation": "methodological advancements"
    }},
    "practical_applications": {{
        "immediate_applications": "direct practical uses",
        "long_term_applications": "future applications",
        "industry_relevance": "relevance to specific industries"
    }},
    "societal_impact": {{
        "social_benefits": "benefits to society",
        "policy_implications": "policy-related impacts",
        "environmental_considerations": "environmental impacts"
    }},
    "innovation_level": {{
        "novelty": "degree of innovation",
        "disruptive_potential": "potential to disrupt the field",
        "follow_up_potential": "potential for further research"
    }},
    "commercialization_potential": "potential for commercialization",
    "risk_factors": "factors that might limit impact",
    "impact_analysis": "detailed explanation of the impact assessment"
}}
```

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
