# 0014. Brokered, redacting model access through AI Gateway

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, legal, security (proposed)

## Context

Phase 2 is the first phase that calls a model. ADR 0002 chose AI Gateway for model routing. ADR 0006 sets the policy for what may reach a model: direct identifiers are redacted before any call, routing is constrained to an approved provider allowlist whose data-processing terms legal has signed, and model choice is pinned rather than free-routed. ADR 0006 sets the policy but not the architecture that enforces it. Phase 2 makes many model calls across parsing, screening, and shortlisting, and possibly optional subagents, so without one enforced path the redaction, allowlist, and pinning would be re-implemented per call site and would erode quietly, which is the exact failure ADR 0009 avoided for external-system credentials.

A CV is dense personal data (a PRD key risk). An unredacted prompt to an off-allowlist provider is a POPIA breach, not a bug. The enforcement cannot be advisory.

## Decision

All model access in Phase 2 goes through a single internal model-access broker over AI Gateway, mirroring the Connect broker of ADR 0009. Application code (workflow steps, screening logic, any subagent) requests a named model task and never calls a provider SDK directly. The broker is the only path from the agent to a model, and it: redacts direct identifiers before the call so the model receives the cleared residual only (ADR 0006); enforces the approved-provider allowlist and refuses any provider not on it; pins the model and records the pinned model and version; and audit-logs every call (who, what task, when, which model and version, and that redaction was applied). Model inputs and outputs are correlated to a candidate by the opaque per-candidate workflow key, not by identity, so the model never sees who the candidate is and re-identification happens only against the system of record on the human-facing side. The broker fails closed: if it cannot confirm redaction was applied or that the provider and model are permitted, it does not make the call and surfaces the failure rather than degrading to an unredacted or off-allowlist call.

## Consequences

We get one audited, minimising path to models, consistent across every model task, which operationalises ADR 0006 and produces the per-recommendation trace ADR 0004 requires. Concentrating model access localises the blast radius if AI Gateway changes or a provider is removed from the allowlist, which is a benefit on beta software (ADR 0005). The cost is an internal abstraction to build and maintain on a beta dependency, and a single chokepoint that must be traced and must degrade gracefully. Fail-closed means a redaction or allowlist problem stops screening for that candidate rather than leaking data, which is the correct trade but does mean the broker's health is on the critical path. The redaction step inside the broker is only as good as the redaction standard legal and data sign off (an open question for Phase 2); the broker enforces whatever that standard is and verifies it ran, but does not invent it.

## Alternatives considered

Per-call model handling, each site calling AI Gateway and redacting for itself. Rejected: inconsistent redaction and allowlist enforcement, and it spreads beta-API coupling and POPIA-critical logic across the codebase, repeating the failure ADR 0009 exists to prevent.

Redacting once upstream and trusting downstream calls to be clean. Rejected: redaction has to be the last thing before the call and verified at the call, because an intermediate step could reintroduce an identifier; enforcing it at the single broker is what makes "no unredacted call" checkable.

Free model routing across providers for cost or availability. Rejected: it contradicts the pinned-model and allowlist requirements of ADR 0006, and an unpinned model undermines the reproducibility the bias evals (ADR 0013) and tracing (ADR 0004) depend on.
