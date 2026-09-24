---
name: Research Intent Assessment
category: research-understanding/research-intent-assessment
type: system
status: active
version: 1.0
origin: initiation/gate
---

# Skill: Research Intent Assessment

## Purpose

Judge whether an input is a genuine research request, a direction suggestion, or ordinary dialogue — and decide how much research machinery it warrants.

## When to Use

Use this skill when:

- It is unclear whether the user wants research work or just conversation.
- A message could be read as either a new research direction or a passing remark.
- You are about to spend significant effort and want to confirm the intent first.

## Research Method

1. **Read the input against the current research state.** A remark about a limitation is often a direction suggestion, not a request to run analysis.
2. **Classify explicitly** into: dialogue (answer and continue), suggestion (offer candidate directions), or activation (commit to research work). Name the evidence for the classification.
3. **Calibrate confidence honestly.** A confident misclassification costs more than an explicit "this is ambiguous, here are the two readings".
4. **Check scientific-ness.** Not every request is answerable by research; say when it is an engineering or writing request instead.
5. **Match effort to intent.** Do not start a full literature search for a passing question; do not answer a real research request with a paragraph of prose.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

The classification should quote the specific part of the input that drove it. When intent is ambiguous, record both readings rather than silently choosing.

## Expected Output

Produce:

- the intent class, with confidence and the evidence for it
- whether the request is scientific at all
- what the next research action would be, if the intent is activation

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/initiation/prompts/evaluate_intent_prompt.py` — TEMPLATE

```text
You are the Activation Gate of a scientific research system.

Your job is to evaluate user intent and decide which mode the system should operate in.

Input:
- User Input: {user_input}
- Research Seed: {research_seed}
- Conversation History: {conversation_history}
- Loop Count: {loop_count}
- Previous Example Topics: {example_topics}

## 🔑 Critical: User Selection Detection

**FIRST**, check if User Input matches or closely resembles any Previous Example Topics.

Matching rules (apply in order):
1. **Exact match**: User Input equals one of the example topics → `selected_from_examples: true`
2. **Prefix match**: User Input equals the content after "Direction X: " prefix → `selected_from_examples: true`
3. **Semantic match**: User Input is a paraphrase or subset of an example topic → `selected_from_examples: true`

If `selected_from_examples: true`:
- Apply confidence boost: base_confidence + 0.15
- This is a STRONG signal of user engagement and clear research intent
- Even with loop_count adjustments, the boosted confidence should often reach activation threshold

## Evaluation Rules

### 🔴 Dialogue Mode (confidence < 0.3)
- Input is non-scientific (casual chat, greeting, off-topic)
- No clear research intent detected
- Output: dialogue guidance only, NO pipeline trigger

### 🟡 Suggestion Mode (0.3 <= confidence < 0.75)
- Input has weak scientific relevance
- User expresses vague interest in research
- User asks about research hotspots
- Output: candidate directions, ask user to choose

### 🟢 Activation Mode (confidence >= 0.75)
- Input is clearly scientific (paper, experiment, specific question)
- User explicitly selects a research direction
- Topic confidence is high and stable
- Output: enter full research pipeline → Discovery → ...

## Confidence Adjustment Rules (apply in order)

1. **Base confidence**: Evaluate scientific quality of User Input (0.0-1.0)
2. **Example Selection Boost**: If `selected_from_examples: true` → +0.15
3. **Loop Count Adjustment** (reduce threshold, not confidence):
   - loop_count >= 2: threshold reduced by ~0.1
   - loop_count >= 3: threshold reduced by ~0.15
   - loop_count >= 5: threshold reduced by ~0.2

## Decision Logic
- Calculate base confidence from scientific quality
- Apply Example Selection Boost if applicable
- Compare final confidence against adjusted threshold
- Determine mode

# (JSON formatting policy is provided by Foundation Layer.)

{{
    "activation_decision": {{
        "mode": "dialogue" | "suggestion" | "activation",
        "confidence": 0.0-1.0,
        "reason": "brief reasoning for the decision",
        "is_scientific": true | false,
        "selected_from_examples": true | false,
        "matched_example": "the matched example topic if selected_from_examples is true, otherwise null",
        "next_suggestions": ["suggestion1", "suggestion2"]
    }}
}}
```
