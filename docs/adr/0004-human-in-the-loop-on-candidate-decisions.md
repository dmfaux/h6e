# 0004. Human in the loop on every candidate-affecting decision

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal

## Context

The agent processes job applications. Any decision that significantly affects a candidate (rejection, shortlisting that drives rejection, an offer) is exactly the kind of decision that carries legal weight in South Africa. POPIA section 71 restricts decisions based solely on automated processing that significantly affect a person, and a hiring rejection qualifies. The Employment Equity Act and B-BBEE mean hiring decisions are scrutinised for fairness and designated-group representation, and a model trained on historical hiring data will learn proxies for race, gender, and age even when obvious fields are stripped.

## Decision

The agent prepares and recommends; a named human decides and can override, and the override is logged. This is structural, built into the workflow, not a disclaimer bolted on. Concretely: the agent never changes a candidate's status on its own; shortlists and assessment results are advisory and surface to a human for approve, reject, or adjust; screening and ranking are advisory at most and only run once bias evaluation and tracing are in place (see ADR on evals when written). Automated rejection, and automated ranking that drives rejection, are programme non-goals.

## Consequences

We give up some potential time saving from full automation of screening. We accept that in exchange for a defensible position under POPIA and the Employment Equity Act, and for keeping the highest-risk part of recruitment AI off the table. Every recommendation must be traceable candidate by candidate, which makes tracing and eval infrastructure a hard requirement before any screening feature ships, not an optional extra. Any future move toward more automation requires a new ADR and explicit legal sign-off, not an incremental change.

## Alternatives considered

Automated screening with a human reviewing only a sample, or only edge cases. Rejected: a rejection produced solely by automated processing is the precise risk POPIA section 71 addresses, and sampling does not cure it.