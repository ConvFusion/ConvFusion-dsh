---
name: Research Landscape
category: literature/research-landscape
type: system
status: active
version: 1.0
origin: discovery/cognition, synthesis
---

# Skill: Research Landscape

## Purpose

Synthesise the reviewed literature into a landscape: what is settled, what is contested, what is moving — the picture a newcomer needs to place a contribution.

## When to Use

Use this skill when:

- The reviewed corpus needs to become a navigable picture rather than a pile of extractions.
- You need to place a proposed contribution relative to the field.
- You are deciding which sub-area is worth entering.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 全景由读过的文献综合而来
```

## Research Method

1. **Map the sub-areas** and the works that define each. A landscape with undefined regions is a reading list, not a landscape.
2. **Mark what is settled vs contested.** Settled results constrain the contribution; contested ones are where work is possible.
3. **Track trends as direction of movement**, and say what evidence supports the trend — a trend asserted from one paper is a guess.
4. **Identify challenges and their persistence.** A challenge that has survived several attempts is a different opportunity from a newly appeared one.
5. **State the unexploited combinations** where two mature lines have not been combined, and why the combination is not trivial.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Sub-area boundaries and settled/contested labels must cite the works that justify them. Trend claims need multiple supporting works and a time basis.

## Expected Output

Produce:

- sub-areas with defining works
- settled vs contested results
- trends with their supporting evidence
- persistent challenges and unexploited combinations

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/discovery/cognition/prompts/understanding_prompt.py` — TEMPLATE

```text
You are a professional research domain analyst.

Please analyze the following core papers and construct the research landscape for this field:

{papers_str}

Please identify and analyze:
1. **Main Tasks**: What are the core problems addressed in this field?
2. **Main Methods**: What methodologies and techniques are used?
3. **Common Datasets**: What datasets are used in research?
4. **Benchmarks**: What evaluation metrics and benchmarks are used?
5. **Main Challenges**: What are the major difficulties facing this field?

IMPORTANT: Output MUST be in ENGLISH only.

Output format:
{{
    "research_landscape": {{
        "tasks": [
            {{"name": "task name", "description": "task description", "representative_papers": [paper_indices]}}
        ],
        "methods": [
            {{"name": "method name", "description": "method description", "representative_papers": [paper_indices]}}
        ],
        "datasets": [
            {{"name": "dataset name", "description": "dataset description"}}
        ],
        "benchmarks": [
            {{"name": "benchmark name", "description": "benchmark description", "metrics": ["metric1", "metric2"]}}
        ],
        "challenges": [
            {{"name": "challenge name", "description": "challenge description"}}
        ]
    }}
}}
```

### `modules/discovery/cognition/prompts/landscape_cognition_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in research landscape analysis.

Research Topic: {research_topic}

## Papers
{papers_str}

## Extracted Method Families
{extracted_method_families}

Synthesize a comprehensive research landscape: subfields, paradigms, key institutions and researchers.

Output JSON:
{{
    "research_landscape": {{
        "subfields": [
            {{
                "name": "subfield name",
                "description": "subfield description",
                "representative_papers": ["paper title"]
            }}
        ],
        "paradigms": [
            {{
                "name": "paradigm name",
                "description": "paradigm description",
                "key_papers": ["paper title"]
            }}
        ],
        "key_institutions": ["institution 1"],
        "key_researchers": ["researcher name"],
        "representative_papers": ["paper title"]
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/trend_cognition_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in trend analysis.

Research Topic: {research_topic}

## Papers
{papers_str}

Analyze the papers above and identify research trends: emerging topics, mature topics,
declining topics, paradigm shifts, and keyword evolution over time.

Output JSON:
{{
    "trend_landscape": {{
        "emerging_topics": ["emerging topic 1", "emerging topic 2"],
        "mature_topics": ["mature topic 1"],
        "declining_topics": ["declining topic 1"],
        "timeline": [
            {{
                "year": 2024,
                "key_papers": ["paper title"],
                "trends": ["trend 1"]
            }}
        ],
        "paradigm_shifts": ["paradigm shift 1"],
        "keyword_evolution": ["keyword evolution 1"]
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/cognition/prompts/challenge_cognition_prompt.py` — TEMPLATE

```text
You are a research cognition analyst specializing in challenge analysis.

Research Topic: {research_topic}

## Papers
{papers_str}

## Extracted Limitations
{extracted_limitations}

## Extracted Future Work
{extracted_future_work}

Synthesize a comprehensive challenge landscape: limitations, open problems, failure cases.

Output JSON:
{{
    "challenge_landscape": {{
        "limitations": ["limitation 1", "limitation 2"],
        "open_problems": ["open problem 1"],
        "failure_cases": ["failure case 1"],
        "challenges": [
            {{
                "description": "challenge description",
                "severity": "high/medium/low",
                "type": "limitation/open_problem/failure_case",
                "source_papers": ["paper title"]
            }}
        ]
    }}
}}

IMPORTANT: Output ONLY raw JSON. No markdown blocks.
```

### `modules/discovery/synthesis/prompts/knowledge_state_synthesis_prompt.py` — TEMPLATE

```text
You are an expert in research cognitive compression. Your task is to synthesize the Discovery module's intermediate results into a structured Knowledge State that captures the essential research cognition for the topic below.

Research Topic: {research_topic}

## Discovery Execution Summary (CRITICAL: Use THESE EXACT NUMBERS in discovery_summary, do NOT invent numbers)

| Phase | Real Metrics (use these exact numbers) |
|-------|----------------------------------------|
| 🔍 Retrieval | {retrieval_summary} |
| 📋 Curation | {curation_summary} |
| 🧠 Cognition | {cognition_summary} |

IMPORTANT: When generating the `discovery_summary` field in your JSON output, you MUST use the exact numbers provided above. Do not invent or guess any numbers - use only what is provided here. The discovery_summary is for display to the user, so format the text clearly.

You have access to the following Discovery outputs:
- Research Landscape: The structure of the research domain
- Trends: Evolution directions of the field
- Research Gaps: Identified gaps in current research
- Core Papers: Most important papers with abstracts (if any were retrieved)
- Structure Analysis: Coverage analysis of the paper collection
- Coverage/Depth Gaps: Where the paper collection is weak
- Gap Summary: Summary of knowledge structure gaps

If the paper counts are 0, it means retrieval did not find papers, but you should still synthesize the research landscape from your domain knowledge, and note in `overall_assessment` that no papers were retrieved and the cognition is based on domain knowledge only.

Your task is to perform CROSS-PAPER REASONING (or domain synthesis if no papers are available) and produce a compressed Knowledge State with the following 8 dimensions:

---

### 1. landscape（聚焦主题的领域结构）
Extract ONLY the aspects of the research landscape that are DIRECTLY relevant to {research_topic}.
Exclude unrelated topics (e.g., NLP, ESG, biomedical if not relevant).
Focus on: dominant methods, key benchmarks, active subfields, emerging topics.

### 2. trends（领域演化方向）
Identify how the field is evolving SPECIFICALLY for {research_topic}.
What methods are rising? What is declining? What is the next paradigm?
Ignore trends that are unrelated to the research topic.

### 3. gaps（交叉分析后的隐式空白）
This is the most important section. Do NOT just list the research_gaps from Discovery.
Instead, perform CROSS-PAPER ANALYSIS to identify IMPLICIT gaps:
- Paper A solves accuracy, Paper B solves efficiency → but no one solves both
- Paper A works on benchmarks, Paper B fails in real world → robustness gap
- Multiple papers use Method X → but none analyze its failure modes
These implicit gaps are where real innovation opportunities lie.

### 4. limitations（方法局限性清单）
Extract SPECIFIC methodological limitations from the papers:
- What techniques are used? What are their known failure modes?
- What assumptions do current methods make that may not hold?
- What are the computational, data, or scalability constraints?
Each limitation should be concrete and actionable.

### 5. contradictions（研究矛盾）
Identify CONTRADICTIONS across papers:
- Paper A claims X, Paper B claims not-X
- Different methods give conflicting results on the same problem
- Theory predicts one thing, experiments show another
Contradictions are high-value sources of theoretical innovation.

### 6. opportunities（时机信号）
Identify TIMING-BASED opportunities:
- Is there a surge of interest in a sub-topic but no benchmark?
- Is there strong industrial demand but little academic research?
- Have hardware advances made old approaches suddenly viable?
- Is there a "right time" opportunity for a specific approach?

### 7. building_blocks（可组合方法原语）
Abstract the papers into COMPOSABLE METHOD PRIMITIVES:
- representations: What representations are used? (e.g., frequency domain, physical priors)
- architectures: What architectures are dominant? (e.g., Transformer, Mamba, GNN)
- optimization: What training techniques? (e.g., contrastive learning, physics-constrained loss)
- mechanisms: What mechanisms? (e.g., attention, memory, sparse computation)
These primitives can be recombined to create novel approaches.

---

Research Landscape:
{research_landscape}

Trends:
{trends}

Research Gaps:
{research_gaps}

Core Papers (with abstracts):
{core_papers_with_abstracts}

Foundational Papers:
{foundational_papers}

SOTA Papers:
{sota_papers}

Structure Analysis:
{structure_analysis}

Coverage Gaps:
{coverage_gaps}

Depth Gaps:
{depth_gaps}

Gap Summary:
{gap_summary}

IMPORTANT RULE for discovery_summary: You MUST use the EXACT numbers from the "Discovery Execution Summary" table above. Do NOT invent, estimate, or change any numbers in discovery_summary — copy the numbers exactly as provided. The discovery_summary is for user display, so format the text clearly but keep all numbers exact.

Please return the Knowledge State in JSON format:
{{
    "knowledge_state": {{
        "discovery_summary": {{
            "retrieval": {{
                "total_papers": "EXACT number from the Retrieval summary above",
                "rounds_completed": "EXACT number from the Retrieval summary above",
                "coverage_quality": "EXACT value from the Retrieval summary above"
            }},
            "curation": {{
                "input_papers": "EXACT number from the Curation summary above",
                "filtered_papers": "EXACT number from the Curation summary above",
                "core_papers": "EXACT number from the Curation summary above",
                "foundational_papers": "EXACT number from the Curation summary above",
                "sota_papers": "EXACT number from the Curation summary above",
                "benchmark_papers": "EXACT number from the Curation summary above",
                "trend_papers": "EXACT number from the Curation summary above",
                "contrasting_method_papers": "EXACT number from the Curation summary above",
                "diversity_score": "EXACT number from the Curation summary above"
            }},
            "cognition": {{
                "dimensions_analyzed": ["problem", "landscape", "method", "evidence", "challenge", "innovation", "trend", "opportunity"],
                "method_families_identified": "EXACT number from the Cognition summary above",
                "challenges_identified": "EXACT number from the Cognition summary above",
                "opportunities_identified": "EXACT number from the Cognition summary above"
            }},
            "overall_assessment": "your evaluation of the discovery quality and completeness (written by you, not from summary)",
            "recommendation": "proceed/refine/restart based on coverage sufficiency (your judgment)"
        }},
        "landscape": {{
            "topic_focused_summary": "summary of the research domain focused on the topic",
            "dominant_methods": ["method 1", "method 2"],
            "key_benchmarks": ["benchmark 1"],
            "active_subfields": ["subfield 1"],
            "emerging_topics": ["topic 1"]
        }},
        "trends": {{
            "rising_methods": ["method 1"],
            "declining_methods": ["method 1"],
            "next_paradigm": "description of next paradigm",
            "evolution_direction": "where the field is heading"
        }},
        "gaps": [
            {{
                "type": "implicit|explicit|cross_paper",
                "title": "gap title",
                "description": "detailed description",
                "evidence": ["Paper A shows X", "Paper B shows Y"],
                "innovation_potential": 0.0-1.0
            }}
        ],
        "limitations": [
            {{
                "technique": "technique name",
                "limitation": "specific limitation",
                "root_cause": "why this limitation exists",
                "affected_aspects": ["accuracy", "efficiency", "generalization"]
            }}
        ],
        "contradictions": [
            {{
                "claim_a": "Paper A claims X",
                "claim_b": "Paper B claims not-X",
                "contradiction_type": "theoretical|empirical|methodological",
                "resolution_opportunity": "how resolving this could lead to innovation"
            }}
        ],
        "opportunities": [
            {{
                "signal": "description of the opportunity signal",
                "type": "industrial_demand|academic_gap|hardware_driven|timing_based",
                "urgency": "high|medium|low",
                "rationale": "why this is a good opportunity now"
            }}
        ],
        "building_blocks": {{
            "representations": ["rep 1", "rep 2"],
            "architectures": ["arch 1", "arch 2"],
            "optimization_methods": ["method 1", "method 2"],
            "memory_mechanisms": ["mechanism 1"],
            "physics_constraints": ["constraint 1"],
            "uncertainty_modules": ["module 1"]
        }},
        "evidence": {{
            "core_papers": [
                {{
                    "id": "paper_id",
                    "title": "paper title",
                    "year": 2024,
                    "citation_count": 100,
                    "key_contribution": "what this paper contributes",
                    "relevance_to_topic": "why this paper matters for {research_topic}"
                }}
            ]
        }}
    }}
}}

IMPORTANT REQUIREMENTS:
1. CRITICAL: Focus ALL analysis on {research_topic}. Exclude unrelated content.
2. Perform genuine cross-paper reasoning, not just summarization.
3. Gaps must be IMPLICIT (derived from comparing papers), not just explicit future work.
4. Limitations must be SPECIFIC and ACTIONABLE, not generic.
5. Contradictions must be REAL conflicts, not just different approaches.
6. Opportunities must have TIMING rationale, not just "this is important".
7. Building blocks must be ABSTRACT and COMPOSABLE, not paper-specific.
8. Evidence papers must include relevance_to_topic justification.

CRITICAL: You MUST output ONLY the raw JSON object. DO NOT wrap it in markdown code blocks.
DO NOT include ```json or ``` markers.
DO NOT add any text before or after the JSON.
The output must be a valid JSON object starting with {{ and ending with }}.
```
