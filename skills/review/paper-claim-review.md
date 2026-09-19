---
name: Paper and Claim Review
category: review/paper-claim-review
type: system
status: active
version: 1.0
---

# Skill: Paper and Claim Review

## Purpose

Check a manuscript against the research it reports: whether every claim in the text is carried by evidence, whether the conclusion stays inside what was shown, whether the framing over-reaches the design, and what must change before the work can be stated as it stands.

## When to Use

Use this skill when:

- A draft exists and must be checked for claim–evidence consistency before submission or circulation.
- A reviewer's report, a mentor's read, or a self-check must be turned into specific, actionable findings.
- A result changed and the manuscript may no longer agree with the research state.

Use `experimental-evidence-review` when the question is whether the experiments are strong enough; use this skill when the question is whether the **text** says more, less, or something other than what the research supports.

## Research Method

1. **Check genre and maturity before reading for quality.** Does the manuscript do what its stated genre promises — if it claims to be a review, does it actually survey the literature rather than argue one position; if it claims a method, is the development far enough along for the venue and stage it presents itself at? Say plainly whether the work reads as premature, mispositioned, or filed under the wrong article type.
2. **Extract every claim from the text, not only the labelled ones.** Claims hide in abstracts, contributions lists, figure captions, section conclusions and the abstract's first sentence. Each is recorded with its location and exact wording.
3. **Bind each claim to its evidence.** For every extracted claim, identify the evidence that carries it and check that the evidence exists, is reported where the claim is made, and is reachable from the text. A claim whose support lives only in an unsubmitted artefact is flagged as unsupported in the manuscript.
4. **Read the strength of the wording against the strength of the design.** Quantifiers, causal verbs and generality ("consistently", "eliminates", "generalises to") are tested against what was actually run. Name the specific word the evidence does not license, and propose the weaker wording that is supported.
5. **Check internal consistency.** Numbers in the abstract against the tables, the conclusion against the results, the contributions list against what was demonstrated, figure captions against the figures, and terminology against itself. Disagreements are findings with both locations cited.
6. **Check that the argument is complete.** For each contribution: is the problem stated, the gap established, the mechanism described, the evidence shown, the limitation acknowledged? A missing limitation is a finding about over-reach, not a stylistic note.
7. **Separate what the work shows from what it claims to show about the field.** Generality to other tasks, models or settings requires evidence from those settings; otherwise the claim belongs to the tested setting and must say so.
8. **Audit how the text uses the literature.** For every generalisation stated without citation ("it is well known", "increasingly demonstrated", "existing methods fail"), record where it appears and what support is attached. For each cited work that carries the gap, the method or a conclusion, check that the source supports the claim attached to it rather than a neighbouring one. Flag characterisations of prior work that are easier to refute than the original (straw person), and name the closest competing work if it is missing.
9. **Test whether the work could be re-implemented from the text alone.** For each construct, definition and equation: is it specified operationally, or does it lean on a shared intuition and on terms defined elsewhere in the text? Would an independent reader be able to build and test it from this manuscript without asking the authors? Anything that fails this test is reported against the passage that introduces it.
10. **Turn each finding into a revision decision.** For each one: weaken the wording, add the evidence, add the caveat, or remove the claim — and say which. A finding without a suggested resolution is an observation, not a review.

## Reasoning Guidance

- **Absence in the text is not absence in the work.** "Not reported here" and "not done" are different findings; state which one the manuscript supports.
- **Do not review for taste.** Style, ordering and phrasing only matter where they change what the reader is led to believe; label such a finding as clarity, and keep it below substantive findings.
- **Quote before judging.** A claim review without the exact sentence is not checkable later, and the author cannot act on it.
- **Distinguish over-claiming from error.** A conclusion broader than the evidence is a wording problem with a clear fix; a number that contradicts the tables is a correctness problem. They are reported separately and with different severity.
- **Judge the claim the paper actually makes.** Do not import restrictions the authors declared and honoured (scope statements, tested settings) as if they were violations.
- **Precise, serious, non-emotional prose.** Critique the argument, never the authors; no sarcasm, no personal remark, and no praise inflation — the review's usefulness rests on every sentence being supported, in both directions.
- **Anchor every major finding to a quotable location.** Quote or paraphrase the passage and say where it is (section and line or page). Never write "earlier in the paper" — a finding that cannot be found cannot be acted on.
- **Judge writing by what it makes the reader believe, not by taste.** Style matters only where it obscures reasoning: generic motivation that would fit any study, contribution lists that are just implementation steps, equations disconnected from the analysis, discussion that repeats results without explaining them, or terminology used without a definition.
- **Report the symptom, not a theory about the author.** A polished paragraph, an unusual phrase or a leftover placeholder is a finding about the text — not evidence about who or what wrote it.
- **Keep every finding actionable and minimal.** The smallest change that makes the claim true is the recommendation.

## Evidence Requirements

- Every finding cites two locations where relevant: where the claim is made and where the evidence (or the contradicting statement) is; both are quoted, not paraphrased loosely.
- A citation finding names the reference and the claim it is attached to, and states whether the source supports that claim, a weaker version of it, or something else.
- Verdicts use the distinction between unsupported-in-text, contradicted-by-artefacts, and unverifiable-from-what-was-provided.
- Where a number in the text disagrees with an artefact, both values are quoted.
- Numbers quoted from cited work are marked as external and are not treated as this work's evidence.
- If a section could not be read or is absent, say so rather than reviewing around it.

## Expected Output

1. **Claim inventory** — every claim with location, exact wording, the evidence bound to it, and verdict: supported / under-supported / unsupported in the manuscript / contradicted / unverifiable.
2. **Findings** — per issue: category (claim strength, consistency, completeness, definition, mechanism, citation, genre fit, clarity), statement, both locations, observation, verification status, severity, the change required, and the suggested resolution.
3. **Guidance** — per finding: why it matters to the paper's argument, what is missing, the suggested direction, the expected evidence, and the skill that would produce it.
4. **Recommended plans** — the follow-ups that would let a weakened claim be stated at full strength, each with objective, skill and expected evidence.

Close with the claims that are safe to state as written, and the shortest list of edits that would make the rest safe.

## Where the Result Goes

Write the review to `review/paper-claim-review-<YYYY-MM-DD>.md` — the research root's `review/`
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
