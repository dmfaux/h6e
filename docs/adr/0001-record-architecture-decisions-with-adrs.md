# 0001. Record architecture decisions with ADRs

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead

## Context

This project has a phased build with constraints that are easy to erode quietly over time, several of them compliance-driven (POPIA, the Employment Equity Act). Decisions made early need to stay visible and defensible later, to new engineers, to a future maintainer, and potentially to legal or an auditor. Relying on commit history and chat threads to explain why the system is shaped the way it is does not survive contact with reality.

## Decision

We record every architectural decision as an Architecture Decision Record in `docs/adr`, using the format and process defined by the `adr-management` skill. Accepted ADRs are binding. A decision that changes an accepted ADR is made by writing a new ADR that supersedes it, not by editing the old one.

## Consequences

There is a small standing cost: an architectural decision is not finished until its ADR exists. In return we get a durable, readable record of why the system is the way it is, which pays off most exactly when the people who made the decisions are no longer in the room. The register also forms part of the compliance evidence for the human-in-the-loop and data-handling decisions.

The discipline only holds if it is enforced. CLAUDE.md makes respecting and maintaining the register a standing rule for Claude Code, and the `adr-management` skill carries the procedure.

## Alternatives considered

A wiki or a single decisions document. Rejected: both tend to be edited in place, which loses the history of why a decision changed, and neither sits next to the code in version control where it gets reviewed alongside the change it justifies.

No formal record at all. Rejected: the compliance posture of this project makes an unwritten rationale a real liability, not just an inconvenience.