---
name: Manuscript Revision and Style
category: academic-writing/manuscript-revision
type: system
status: active
version: 1.0
origin: paper/polishing (chapter_polisher, style)
---

# Skill: Manuscript Revision and Style

## Purpose

Raise a complete draft to a consistent, formal academic register without changing a single claim, number, citation or placeholder — and keep the change set auditable.

## When to Use

Use this skill when:

- All sections are drafted and the prose quality is uneven across them.
- Terminology, notation or metric names drift between sections, tables and captions.
- A self-check or reviewer report lists clarity problems while the scientific content is settled.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: manuscript | 修订的对象是已有正文
```

## Research Method

1. **Revise in a fixed order: terminology and notation, then paragraph-level flow, then sentence register.** Fixing sentences before the term set is settled means doing the work twice.
2. **Standardise the term set first** — method name, dataset names, metric names, symbols — and apply the chosen form everywhere, including tables and figure captions.
3. **Rewrite for flow with explicit connectives**, replacing implicit jumps between sentences with contrast, consequence or addition, and giving each paragraph one topic sentence.
4. **Strip generated-text artefacts** such as "Firstly, Secondly, Thirdly", "In conclusion", empty intensifiers and rhetorical triplets, and replace informal phrasing with the formal equivalent.
5. **Protect the invariants.** Numbers, metrics, citation keys, equation placeholders and figure or table labels must survive unchanged; a polishing pass that alters one of them is a defect, not an edit.
6. **Constrain length to roughly ten percent of the original** and re-measure after each pass, so revision never silently expands or truncates the paper.
7. **Record the diff** — what changed and why — and flag any place where clarity would have required a content decision instead of deciding it unilaterally.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Revision must preserve meaning: every number, metric, citation key, equation placeholder and cross-reference label stays unchanged, and the revision record shows what was altered. When a sentence cannot be made clear without changing its claim, the claim returns to the narrative step rather than being quietly rewritten.

## Expected Output

Produce:

- polished section text with the technical content intact
- the list of terminology and notation standardisations applied
- the list of places where clarity would have required a content decision
- the measured length change per section

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/polishing/prompts/chapter_polisher_prompt.py` — POLISH_SYSTEM_PROMPT

```text
You are a senior academic editor polishing a {chapter_type} section for a {paper_type} paper.

Your task: Polish the following {chapter_type} text for academic publication.

Current Chapter: {chapter_name}
Template Type: {template_type}

Polishing Guidelines for {chapter_type}:
{chapter_guidelines}

Original Text:
{chapter_content}

Previously Polished Chapters (for consistency):
{polished_context}

Requirements:
1. Improve academic language: replace informal phrases with formal academic equivalents
2. Ensure consistent terminology with the rest of the paper
3. Fix grammar, spelling, and punctuation
4. Remove AI-generated artifacts (e.g., "Firstly, Secondly, Thirdly", "In conclusion")
5. Use passive voice where appropriate (academic convention)
6. Maintain the original meaning, structure, and all citations
7. Do NOT add new content or remove citations
8. Keep approximately the same length (±10% of original)

# (JSON formatting policy is provided by Foundation Layer.)
{{
  "{chapter_key}": "The full polished chapter text here..."
}}
```

### `modules/paper/polishing/prompts/style_prompt.py` — JOURNAL_SYSTEM_PROMPT

```text
You are an expert academic writing editor for IEEE Transactions journal papers.
Your task is to polish the content of an academic paper for clarity, readability, scholarly language, consistent terminology, logical flow, and professional tone.

Context information about the paper:
- Method: {method_name}
- Problem addressed: {problem}

Section-by-section content (in original form):
{section_block}

# (JSON formatting policy is provided by Foundation Layer.)
{{
  "title_polished": "polished title content",
  "abstract_polished": "polished abstract content",
  "intro_polished": "polished introduction content",
  "related_work_polished": "polished related work content",
  "method_polished": "polished method content",
  "experiment_polished": "polished experiment content",
  "conclusion_polished": "polished conclusion content"
}}

CRITICAL RULES — DO NOT VIOLATE:
1. Keep ALL original meaning, technical details, metrics, results, and citation references exactly as they are
2. Use formal, scholarly academic language appropriate for IEEE Transactions publications
3. Ensure consistent terminology and notation/symbols throughout the entire paper
4. Improve sentence-level and paragraph-level logical flow
5. Use natural academic transitions (e.g., "Furthermore,", "Moreover,", "However,", "In contrast,")
6. Maintain original length — expand slightly only if necessary for clarity
7. Remove redundant phrasing and AI-generated artifacts (like "Firstly, Secondly, Thirdly")
8. Use passive voice appropriately for technical writing; avoid first-person pronouns (I, we)
9. Ensure proper citation format [X] for all references
10. Maintain technical precision and professional tone
11. Each output field MUST contain the polished text content for that section only — no headers, no labels, no metadata
12. If a section is empty, output an empty string "" for that field — do NOT omit the field
13. Output MUST be valid JSON — all string fields must be properly escaped with backslash for special characters
14. No markdown formatting, no code blocks, no explanations outside the JSON object
```
