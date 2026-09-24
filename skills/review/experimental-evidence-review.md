---
name: Experimental Evidence Review
category: review/experimental-evidence-review
type: system
status: active
version: 1.0
---

# Skill: Experimental Evidence Review

## Purpose

Decide whether the experiments actually support the claims they are attached to, and locate the weakest link when they do not: which claim lacks evidence, which comparison is not like-for-like, which result rests on a single run, and what specifically would close the gap.

## When to Use

Use this skill when:

- Claims exist and evidence exists, but the fit between them is unverified.
- Reviewing a results section, a claim table, or an evidence list before it is written up or acted on.
- A result is about to be used as the basis for a decision (submission, direction change, another experiment).

Use `research-quality-review` instead when the whole body of work must be assessed, and this skill when the question is specifically about the evidence behind claims.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments | 评实验证据先要有实验
```

## Research Method

1. **Trace each result through the record before judging it.** Claim → experiment or analysis → dataset and split → metric → output artefact → table or figure. For each link record what artefact exists, what consistency check it passed, what is missing, and what that costs the claim. Check dataset identity, version and licensing; sample, class and split counts; which data are real, simulated, illustrative or predicted; and whether configurations, seeds and evaluation scripts exist. **Plausible numbers do not establish authenticity, and unusual numbers do not establish fabrication** — say which artefact would verify the result instead of judging by appearance.
2. **Build the claim → evidence map before judging anything.** For each claim list the evidence meant to support it, and for each piece of evidence the claim it is used for. Claims with no evidence and evidence used for no claim are both findings, and each is stated separately.
3. **Check that the comparison is like-for-like.** Same data, same split, same metric definition, same budget, same evaluation protocol. A difference produced under a different protocol is not a result about the method, and the specific divergence is named.
4. **Test whether the evidence can bear the claim's strength.** Match quantifiers and verbs against the design: "consistently", "always", "robust" require repetition or breadth that a single run cannot supply. Name the word in the claim that the evidence does not license.
5. **Check stability before magnitude.** Repeated runs across seeds, or an interval, are required before a difference is treated as real. A gain visible only at the best epoch, or within run-to-run spread, is recorded as unstable rather than as a result.
6. **Check that baselines and ablations answer the right question.** A baseline that is weaker than the obvious alternative, or an ablation that removes more than one contribution, leaves the claim unsupported even when the numbers look favourable. State which comparison was needed and was not run.
7. **Look for the disconfirming case, not only the confirming one.** Ask where the method should fail if the claim were false, and check whether the work looked there. Absence of a negative result is reported as an untested condition.
8. **Apply the computational checks this study actually needs — none of the ones it does not.** Train/validation/test separation with duplicate and contamination checks; test data or benchmark used during model, prompt or hyper-parameter selection; comparable tuning, compute, data and stopping criteria for every baseline; strong simple baselines alongside recent methods; repeated runs with uncertainty; effect size and practical significance; statistical independence and the correct unit of analysis; robustness, distribution shift and failure cases; runtime, memory or cost where efficiency is claimed. For LLM or agent studies additionally: model identifier, version and access date; prompts, tools, retrieval sources, memory and stopping conditions; token, tool-call and compute budgets across comparisons; human intervention, retries, exclusions and failed runs; the reliability and possible bias of any LLM-based evaluator; and independent checks of claimed task success. Finally, ask **where the gain actually comes from** — the claimed method, more compute, a stronger base model, or additional information.
9. **Add the domain checks when the claim depends on them.** For clinical or medical claims: patient-level separation, site/scanner/acquisition confounding, label provenance, class imbalance, calibration or decision utility where clinical use is claimed, external or temporal validation, and ethics or data-access reporting — and state when retrospective performance cannot carry a clinical claim. For privacy or federated work: the stated threat model, what each party can see, whether keeping data local is being equated with privacy, privacy accounting, attack evaluation, and whether empirical protection is being presented as a formal guarantee.
10. **Report what would change the verdict.** For each weakness, name the experiment, metric or statistic that would settle it, expressed so it could be scheduled. Demand the missing test that could **materially change the central conclusion**, not every test that could conceivably be run.

## Reasoning Guidance

- **A missing number is a reporting gap, not a missing experiment.** Never convert "not reported" into "not done"; state which of the two you can actually establish.
- **Statistical support is a claim about the design, not a ritual.** Do not demand a test where the design cannot support one, and do not accept a p-value where the comparison is confounded.
- **Separate measurement from explanation.** An error pattern that explains a gain is a hypothesis until it is measured; label it as such.
- **Distinguish "the evidence is absent" from "the evidence contradicts".** These produce different next steps: one asks for an experiment, the other asks for a revision of the claim.
- **Judge against the declared thresholds, not against the best-looking number.** If the study pre-declared a success margin, that margin decides; a favourable post-hoc comparison does not replace it.
- **Keep severity honest.** A finding is critical only if the central claim fails without it; otherwise say what it costs.
- **Proportionality is part of the judgement.** Name the one or two missing tests that could change the conclusion; a review that lists every unrun experiment as a defect is unusable as guidance and usually wrong about what matters.
- **Gains need an attribution, not only a magnitude.** A reported improvement over a baseline is not evidence for the proposed mechanism until the alternative sources of gain — compute, base model, extra data, data contamination — have been addressed.
- **Quote the claim before judging its strength**, and cite where it appears; a strength judgement without the exact wording and location cannot be checked or acted on.

## Evidence Requirements

- Cite the artefact for every judgement: run directory, results table, evidence id, figure, or paper section.
- Quote the exact claim wording when judging its strength, and name the word the evidence does not license.
- For every "insufficient" verdict, state the required evidence: how many runs, which seeds, which baseline, which metric, which slice.
- Where a number comes from a cited source rather than from this work, mark it as external and say so.
- If a result artefact is unreadable or missing, record that explicitly instead of inferring the outcome.

## Expected Output

1. **Claim → evidence table** — one row per claim: supporting evidence, traceability of the record behind it (dataset/split, metric, artefact), comparison validity, stability, verdict (supported / partially supported / unsupported / unverifiable), and the missing piece.
2. **Findings** — per issue: category, statement, location, observation, verification status, severity, related claim and evidence, plausible explanation (marked as inference), required evidence, recommendation.
3. **Guidance** — per finding: why it matters to the claim, root cause, what is missing, the suggested direction, the expected evidence, and the skill that would run it.
4. **Recommended plans** — the experiments worth running now, each with objective, skill, expected evidence and success criterion.

End with which claims are safe to state as they stand, and which must be weakened until the evidence arrives.

## Where the Result Goes

Write the review to `review/experimental-evidence-review-<YYYY-MM-DD>.md` — the research root's `review/`
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
