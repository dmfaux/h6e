# 0009. Reusable Connect scoped-credential broker

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering (proposed)

## Context

ADR 0002 chose Connect for scoped credentials to external systems. Phase 0 proved exactly one Connect round-trip as a deliberate one-off and explicitly left a reusable token-brokering pattern to Phase 1. Phase 1 makes many calls to the ATS and to Microsoft 365 calendars, across many candidate workflows and several scheduled jobs, each needing a short-lived, scoped credential. We need one consistent way to obtain and use those credentials, rather than ad hoc credential handling spread across every call site, both for least privilege and for the compliance audit trail.

## Decision

All ATS and Microsoft 365 calendar access in Phase 1 goes through a single internal broker over Connect. Application code (workflow tools, scheduled jobs) requests a named capability for one operation (for example read calendar free/busy, write a calendar event, attach a document, read a candidate logistics field) and receives a short-lived, least-privilege credential scoped to that operation only. Every issuance and every use is audit-logged with who, what, when, scope, and target. No long-lived static credentials live in application code or environment beyond what Connect itself requires. The broker is the only path from the agent to external systems.

## Consequences

We get one audited, least-privilege path to external systems, consistent across workflows and schedules, which serves the ADR 0006 minimisation posture and the compliance audit trail. The cost is an internal abstraction to build and maintain on a beta dependency (Connect, ADR 0005), and a single chokepoint that must degrade gracefully and be traced. Concentrating external access here also localises the blast radius if Connect changes or regresses, which is a benefit on young software.

## Alternatives considered

Per-call ad hoc credential handling at each site. Rejected: inconsistent scoping and auditing, and it spreads beta-API coupling across the codebase.

A single long-lived service credential to the ATS or calendars. Rejected: it contradicts the scoped, short-lived posture of ADR 0002 and ADR 0006 and weakens the audit trail that the compliance position depends on.
