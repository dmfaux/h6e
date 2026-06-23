# 0002. Build on the Vercel Agent Stack using eve

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering

## Context

The system is an agent that runs long-lived hiring workflows, talks to candidates and staff across channels, routes model calls, runs untrusted code, and integrates with external systems through scoped credentials. We need a coherent set of building blocks for this rather than assembling and maintaining each piece separately.

## Decision

We build on the Vercel Agent Stack, using the eve framework as the application structure. This gives us, from one vendor and one codebase: the Workflow SDK for durable execution, Chat SDK for channels, AI Gateway for model routing, Sandbox for isolated code execution, Connect for scoped credentials, and Cron for schedules. The agent is an eve project (an agent directory, tools as TypeScript files, schedules and channels as code).

## Consequences

We get a fast path to a working system and one operational surface instead of many. The cost is concentration: our whole agent estate standardises on one vendor's shape, which is sticky by design. This is mitigated, not removed, by several of these components being open source (Workflow SDK, eve, AI SDK) and by AI Gateway supporting our own provider keys.

A second cost: parts of the stack (Connect, Passport, eve) are beta at the time of this decision. ADR 0005 constrains us to not depend on anything in private beta, which bounds this risk but does not eliminate the beta-maturity risk on the public-beta pieces.

## Alternatives considered

Assembling the equivalent from separate best-of-breed services (a workflow engine, a separate model gateway, a separate sandbox provider, hand-rolled channel integrations). Rejected for this team and timeline: more integration and operational burden than the coordination is worth, and slower to a first working slice.