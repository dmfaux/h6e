# 0013. Screening and bias-evaluation policy

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, data, engineering

## Context

ADR 0004 keeps a named human on every candidate-affecting decision and states that screening and ranking are advisory at most, and only run "once bias evaluation and tracing are in place (see ADR on evals when written)." That ADR was deliberately deferred until there was screening to evaluate. The Phase 0 spec confirms its home is Phase 2, owned by engineering and legal, and that it must name which disparate-impact checks run, the thresholds, and what blocks a release. Phase 2 is the first phase that screens candidates, so the policy must exist before any screening runs against a real candidate.

The constraint is regulatory. The Employment Equity Act scrutinises hiring for fairness and representation across designated groups (in South African law: black people, women, and people with disabilities), and a model reasoning over CV content will learn proxies for those attributes even when obvious fields are stripped. POPIA section 71 restricts decisions based solely on automated processing. A screening step with no measured, gated bias evaluation is exactly the exposure ADR 0004 exists to prevent.

There is a tension to resolve. Minimisation (ADR 0006) strips direct identifiers before the model call, so the screening model must not see designated-group membership. But measuring disparate impact requires knowing group membership to compare selection rates. The policy has to measure bias without feeding group attributes to the screening model.

## Decision

Screening and shortlisting carry a bias-evaluation suite that runs in CI as a release gate, and screening does not run against real candidates until that suite exists and passes. The suite measures disparate impact on the agent's screening and ranking outputs across designated groups, using a controlled evaluation dataset whose group labels live only in the eval harness and are never passed to the screening model. The disparate-impact metric, the designated groups measured, and the threshold that fails a release are fixed in this policy and signed off by legal and data; the selection-rate ratio across groups (the four-fifths rule as the starting reference) is the default metric unless legal and data set another. A prompt, model, or logic change that moves a measured group's outcome past the threshold fails the build and blocks release, the same way a broken test does. The suite also carries non-bias screening-quality checks (extraction correctness against a labelled set, ranking stability, and no-fabrication checks), but the bias gate is the one this ADR makes mandatory and blocking. Every screening run is traced per recommendation (ADR 0004), and if the bias-evaluation record cannot be produced, screening does not run.

## Consequences

We get a defensible, written, enforced bias posture: screening cannot ship or regress past the threshold without a human seeing it, which is part of the compliance evidence under the Employment Equity Act and POPIA. The gate is real, not advisory, so a model swap or prompt edit that degrades fairness is caught in CI rather than in production. The cost is real engineering and governance work: a maintained labelled evaluation dataset with group labels (itself sensitive data, held under access control and outside the model path), a metric and threshold legal will own and revisit, and a build that can be blocked by a fairness regression. The labelled dataset is a standing data-handling obligation, not a one-off. Setting the threshold too loose makes the gate theatre; too tight makes the build flaky; tuning it is a legal and data decision, not an engineering convenience. This policy governs Phase 2 screening; extending automated decisioning beyond advisory remains a programme non-goal needing its own ADR and legal sign-off.

## Alternatives considered

Feeding group attributes to the model so it can "correct" for them. Rejected: it contradicts minimisation (ADR 0006), and explicit use of protected attributes in a screening decision is its own legal hazard. Measuring impact on outputs while keeping attributes out of the model is the defensible shape.

A bias review done by hand each release rather than a CI gate. Rejected: it is not reproducible, does not block a regression reliably, and produces no durable evidence trail. ADR 0004 requires the check to be in CI as a hard prerequisite.

Deferring the bias policy until after a screening pilot. Rejected: ADR 0004 makes the evaluation a precondition for screening running at all, so the policy precedes the pilot, not the reverse.
