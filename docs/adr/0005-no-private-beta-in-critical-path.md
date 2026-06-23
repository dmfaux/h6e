# 0005. No private beta components in the critical path

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, security

## Context

The Vercel Agent Stack includes components at different maturity levels. Some are generally available, some are open or public beta, and some are private beta (at the time of this decision, Enterprise Managed Users and bring-your-own-cloud on AWS). This is a regulated, high-volume hiring process; betting it on software still in private beta is a risk we are not willing to carry.

## Decision

We build only on generally available, open, or public beta components. Anything in private beta is excluded from the critical path until it reaches general availability. Specifically excluded for now: Enterprise Managed Users (so builder-account lifecycle is manual) and bring-your-own-cloud on AWS (so data residency is handled by minimisation instead, see ADR 0006).

## Consequences

We accept manual account lifecycle and the absence of in-account data residency for now, and we design around both rather than waiting. When a needed component reaches GA, adopting it is a new decision recorded as its own ADR. The trade-off is conservatism over capability: we ship on a smaller, more stable surface.

## Alternatives considered

Adopting private beta components under a support agreement. Rejected: even with an agreement, private beta software in the critical path of a compliance-sensitive hiring process is more risk than the capability justifies at this stage.