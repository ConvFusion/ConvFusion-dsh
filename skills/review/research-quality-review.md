---
name: Research Quality Review
category: review/research-quality-review
type: system
status: active
version: 1.0
---

# Skill: Research Quality Review

## Purpose

Diagnose an existing body of research as a whole and produce actionable guidance: what state the work is actually in, which weaknesses threaten its claims, what evidence is missing, and which next step would move it forward. The output is a diagnosis plus findings and guidance — not a score, and not a rewrite of the research state.

## When to Use

Use this skill when:

- A mentor reviews a student's research state before advising, or a researcher reviews their own work before submitting or starting a new round.
- The work spans several artefacts (state, plans, evidence, claims, paper) and needs a whole-picture check rather than one narrow inspection.
- You must decide **where to intervene next**: which gap, if closed, most improves the credibility of the whole.

Do **not** use it merely to reformat or summarise existing material; that is a writing or extraction task.

## Research Method

1. **Read the research state before judging it.** Assemble the current picture from the actual artefacts — problem statement, research questions, claims, evidence, plans and their status, paper sections, open questions. Never diagnose from memory of an earlier round or from what the author says they did.
2. **Diagnose against explicit dimensions, not a global impression.** Cover at least: problem clarity, **construct definition**, literature grounding, research gap, novelty, methodology, **mechanistic specificity**, experiment design, evidence sufficiency, claim–evidence fit, **predictive content**, reproducibility, and integrity. Report each dimension as supported, weak, missing or not reported — an unreviewed dimension is stated as unreviewed.
3. **Audit each construct on its own terms.** For every construct the work introduces: is it defined where it is used, does its definition depend on other internal terms (circular), does it name a metaphor where an operational specification is needed, and could an independent study operationalize it **from this manuscript alone**. Under-defined constructs are findings against the place they are used, not against the reader.
4. **Ask what the mechanism actually is.** Where explanatory power is claimed, state the causal pathway and its variables concretely, and flag places where a term like "alignment", "resonance", "architecture" or "representation" is standing in for the explanation. An undefined pathway is a finding even when the claim sounds reasonable.
5. **Separate the testable from the unfalsifiable, and say which stage the work is at.** List the distinct predictions the work makes, ask which of them are unique to it rather than shared with existing accounts, and check that the operational definitions would let someone test them. Classify the framework as conceptual, metaphorical or formalizable, and judge it **against that stage** — a conceptual contribution is not deficient for lacking experiments, but it is deficient for presenting itself as tested.
6. **Convert every weakness into a finding with a location and a status.** A finding names the category, the artefact it points at, the observation that supports it, and its verification status (see Reasoning Guidance). An observation you cannot point at is not yet a finding.
7. **Separate diagnosis from prescription.** First state what is true about the work; only then state what should happen next. Guidance that is not traceable to a finding is advice, not review.
8. **Prioritise by threat to the claim, not by ease of fixing.** Rank findings by how much they undermine the central claim if left open, and say which single gap most limits the work.
9. **Stop at guidance.** Do not edit the research state, the paper or the evidence. If the review implies a state change, emit it as a proposal for the owner to accept, edit or reject.

## Reasoning Guidance

- **Distinguish "not reported" from "not done".** Absence of a number means the information is missing, not that the experiment was skipped. Never let a gap in reporting become an accusation of a gap in work.
- **Distinguish suspicion from misconduct.** Integrity concerns are stated as an integrity question with the specific inconsistency that raises it, and are never escalated to a conclusion. The goal is to raise credibility, not to make an unprovable charge.
- **Report the finding, not the person.** "Claim C4 has no supporting evidence" is reviewable; "the author did not do the work" is not.
- **Mark inference as inference.** Every explanatory sentence is either an observation from an artefact or an inference — label the second kind, and state what would confirm it.
- **Prefer coverage over depth when unsure.** It is more useful to say a dimension was not examined than to over-read a small amount of material and present it as a verdict.
- **Respect maturity.** A work at the idea stage is not deficient for lacking results. Judge each dimension against what that stage should have, and say which stage you are judging against.
- **Precise, serious, non-emotional.** Critique arguments, not authors. No sarcasm, no personal remark, no praise inflation: an unearned compliment is as damaging to the review's credibility as an unearned criticism.
- **Judge prior work as it is, not as a foil.** A claim that existing theories are insufficient is checked against what those theories actually say; a characterisation that is easier to refute than the original is itself a finding (straw person). Name the closest established account that already covers the phenomenon, and state what this work adds beyond it.
- **No vague reference.** Quote or paraphrase the passage, and give its location, for every major finding. "Earlier in the paper" is not a location.

## Evidence Requirements

- Every finding cites the artefact it came from: state section, claim id, evidence id, plan id, paper section, file path — and for a manuscript, the section plus a quotable span, never a vague pointer.
- A finding about a construct quotes its definition as written; a finding about a mechanism quotes the sentence that claims the explanation.
- A judgement of "insufficient" states what evidence would be sufficient — the metric, the comparison, the number of runs.
- Findings about claims cite both the claim and the evidence (or their absence).
- Do not introduce new facts about the research; a review quotes and reasons about what exists. Anything you had to look up outside the work is labelled as context, not evidence.
- If an artefact could not be read, say so explicitly and mark the affected findings as unverified rather than assuming their content.

## Expected Output

Produce four layers, in order:

1. **Diagnosis** — current maturity and progress, strong areas, weak areas, critical issues, gaps in research and in evidence, open questions; each dimension marked supported / weak / missing / not reported / not reviewed, and the framework classified as conceptual / metaphorical / formalizable with the stage it is judged against.
2. **Findings** — one entry per issue, with: category, statement, location (artefact + section/id), observation, verification status, severity, related claim / evidence / plan, plausible explanation (marked as inference), required evidence, recommendation.
3. **Guidance** — per finding: the problem, why it matters for the claim, the likely root cause, what is missing, the suggested direction, the expected evidence, and the skill that would carry it out.
4. **Recommended plans** — for the findings worth acting on now, a concrete next step: objective, the skill it uses, the evidence it should produce, and how the result would be judged.

Close with the single highest-value next action, and with what was **not** examined.

## Where the Result Goes

Write the review to `review/research-quality-review-<YYYY-MM-DD>.md` — the research root's `review/`
directory, **at the same level as `research/`**. One file per run, so two runs of the same
review can be compared and a later round can read what the previous one found. `review/`
is the reserved namespace the counterparty may write to, so anything here syncs to the
other side of an active mentorship unchanged.

Open the file with a short header: the skill id and version, the date, what was reviewed
(and whose research, when this is someone else's), and the **coverage and limits** of this
run — what was inspected and what could not be. Findings that cannot be traced back to a
source under that header are not reviewable later.

Do not modify the research state, evidence, claims, plans or paper as part of a review.
State changes are proposed, not applied.
