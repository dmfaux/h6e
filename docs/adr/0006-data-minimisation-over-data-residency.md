# 0006. Data minimisation over data residency

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, security

## Context

The agent handles candidate personal information, including dense personal data in CVs. POPIA constrains how that data is processed and shared. The clean residency answer (run compute in our own cloud account via bring-your-own-cloud) is unavailable because BYOC is private beta and excluded by ADR 0005. We need a defensible data-handling posture without it.

## Decision

We control exposure by minimising what personal information flows through Vercel and through model providers, rather than by where the compute physically sits. The system of record (candidate PII, CVs, application data) stays in the corporate's Azure tenant or the ATS. The agent operates on the specific fields a step needs, not whole records passed around freely. Direct identifiers (name, ID number, address, photo) are redacted before any model call, so the model sees the skills and experience it needs, not the identity. AI Gateway routing is constrained to an approved provider allowlist whose data-processing terms legal has signed, and model choice is pinned rather than free-routed. If legal judges this insufficient for a given data class, that data class does not flow through the agent.

## Consequences

We get a defensible POPIA posture without BYOC: the agent is an orchestration layer over data that mostly stays in the Microsoft estate, third parties see the minimum, and there is a signed data-processing chain for those that see anything. The cost is more engineering work (redaction, allowlist enforcement, field-level data discipline) than BYOC would have required, and a standing constraint on which providers we may route to. If data residency turns out to be a hard regulatory line that minimisation plus agreements cannot satisfy, the fallback is to wait for BYOC to reach GA rather than ship something indefensible, which would be a new ADR.

## Alternatives considered

Passing full CVs to models and relying on provider terms alone. Rejected: weaker under POPIA and unnecessary, since most model tasks here do not need direct identifiers.

Waiting for BYOC before building anything that touches candidate data. Rejected for now: it blocks the whole programme on a private beta timeline, and minimisation gives an acceptable posture in the meantime.