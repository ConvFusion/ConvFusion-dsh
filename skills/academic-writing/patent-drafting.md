---
name: Patent Drafting
category: academic-writing/patent-drafting
type: system
status: active
version: 1.0
origin: stage5.1/output-transformation
---

# Skill: Patent Drafting

## Purpose

Transform a research result into a patent draft: restate it as a technical problem, a technical solution with features, the effects it produces, and embodiments a skilled person could carry out.

## When to Use

Use this skill when:

- A research result is mature enough that its mechanism could be protected.
- A paper exists and a patent is being derived from it (or directly from the research state).
- You need to decide whether the contribution is a protectable technical solution or only a finding.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments/simulation-result | 专利要转化实验结果（仿真结果亦可先起稿）
```

## Research Method

1. **Start from the research state, not from the paper text.** A patent is organised around a technical problem and its solution; the paper is organised around a scientific argument. Re-derive the technical content rather than renaming sections.
2. **State the technical problem independently.** Describe the deficiency of the prior art in technical terms (what fails, under what conditions), without the paper's framing about gaps or contributions.
3. **Express the solution as technical features.** The solution must be describable as a method or apparatus composed of steps/components. If a claim cannot be written as features, the idea is not yet a patentable solution.
4. **Distinguish patent claims from research claims.** A research claim says something true about the world; a patent claim defines the boundary of an exclusive right. Never copy a research claim into a claim set — restate the feature combination.
5. **State the technical effects as consequences of the solution**, each traceable to a feature that produces it. Effects that come from the evaluation rather than the mechanism are not technical effects.
6. **Describe embodiments in implementable detail.** A skilled person must be able to carry out the solution from the description alone; "as described in the paper" is not an embodiment.
7. **Check the draft is not a renamed paper**: it must contain implementation/embodiment content and claim features that the paper never needed.

## Reasoning Guidance

Focus on:

- Which part of the contribution is a mechanism rather than a measurement.
- The broadest feature set that still solves the technical problem.
- Whether an alternative implementation would fall outside the claim (scope).
- What the prior art already discloses, so the solution is delimited against it.

Avoid:

- Reusing paper headings as patent sections — it produces a draft that cannot be examined.
- Copying research claims into patent claims; they limit no technical feature.
- Claiming effects that were measured rather than produced by the mechanism.
- Omitting embodiments; a draft without them is not enabling.

## Evidence Requirements

Each technical effect stated should be traceable to evidence that the mechanism produces it. The prior-art statements should be traceable to literature evidence. Record which research claims and evidence the draft draws on, so the source research stays answerable.

## Expected Output

Produce:

- technical field and the technical problem of the prior art
- the technical solution stated as features (method/apparatus)
- technical effects, each tied to the feature producing it
- embodiments with implementable detail
- a numbered claim set expressed as feature combinations (not research claims)
- an abstract
