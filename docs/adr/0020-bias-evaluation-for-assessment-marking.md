# 0020. Bias evaluation for assessment marking

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, data, engineering (proposed)

## Context

ADR 0013 set the screening-phase bias-evaluation policy: a suite measures disparate impact on the agent's outputs across the Employment Equity Act designated groups, runs in CI as a release gate, uses a labelled dataset whose group labels live only in the eval harness and never reach the model, and blocks screening until it exists and passes. ADR 0013 scopes itself to Phase 2 screening. Phase 3 produces a new candidate-affecting output, an assessment mark, that ADR 0013 does not cover. Employment assessments and selection tests are a textbook disparate-impact surface (the four-fifths rule originates in selection-procedure law), and the risk exists whether the marking is model-assisted (a free-text or code-quality judgement) or deterministic (a code take-home scored by a test harness): a neutral-looking test can still produce a discriminatory effect. ADR 0004 makes bias evaluation and tracing a precondition for any advisory output that affects a candidate, so marking cannot run against real candidates without a bias evaluation in place, the same way screening could not.

## Decision

Assessment marking carries a bias evaluation on the same mechanism as ADR 0013, extended to marking outputs. A suite measures disparate impact on marking results across the designated groups, using a controlled, labelled evaluation set whose group labels live only in the eval harness and are never passed to any marking model (consistent with ADRs 0006 and 0013). It runs in CI as a release gate: a prompt, model, rubric, or harness change that moves a measured group's outcome past the threshold fails the build and blocks release, and marking does not run against real candidates until the suite exists and passes. The measure is disparate impact on the marking outcome (for example the rate at which each group reaches a given mark band), with the selection-rate ratio (four-fifths) as the default reference unless legal and data set another, and it applies to deterministic and model-assisted marking alike because the legal exposure is the effect on candidates, not the mechanism. Marking-quality checks (marking correctness against a labelled set, stability, and no-fabrication) run alongside the bias gate, as they do for screening. Every marking run is traced per result (ADR 0004); if the bias-evaluation record cannot be produced, marking does not run. The exact metric, the mark bands measured, the threshold, and the dataset's provenance and consent basis are owned and signed off by legal and data, as in ADR 0013.

## Consequences

The assessment phase inherits the same defensible, enforced bias posture as screening: a marking change that degrades fairness past the threshold is caught in CI rather than in production, and marking cannot ship without the record ADR 0004 requires. Applying the gate to deterministic marking too closes the trap that an "objective" test is assumed fair when it may not be. The cost is the same standing obligation ADR 0013 created: a maintained labelled evaluation set for assessments (sensitive data, held under access control and outside any model path), a metric and threshold legal and data own and revisit, and a build that a fairness regression can block. Where an assessment is bespoke per requisition, the evaluation obligation attaches per assessment type, which is real recurring governance work, not a one-off. This extends ADR 0013's policy to a second output; it does not relax ADR 0013, and extending automated decisioning beyond advisory remains a programme non-goal needing its own ADR and legal sign-off.

## Alternatives considered

Treating deterministic, test-harness marking as objective and exempt from bias evaluation. Rejected: disparate-impact doctrine targets the effect of a selection procedure, not whether a human or a script produced it, so a deterministic test can still fail the four-fifths rule and must be measured.

Relying on ADR 0013 unchanged, reading "screening" to include marking. Rejected: ADR 0013 scopes itself to Phase 2 screening by its own terms, and given the legal stakes the extension to a new output is a decision to record, not to assume.

Deferring marking bias evaluation until after an assessment pilot. Rejected: ADR 0004 makes the evaluation a precondition for marking running at all, the same reason ADR 0013 precedes the screening pilot rather than following it.
