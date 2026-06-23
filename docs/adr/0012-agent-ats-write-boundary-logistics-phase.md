# 0012. The agent's write boundary in the logistics phase

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, engineering (proposed)

## Context

Phase 1 is the first phase where the agent writes to the system of record and to the calendars: it books interviews, attaches candidate-supplied documents, and records contact and audit information through Connect. ADR 0004 forbids the agent from changing a candidate's status on its own and reserves decisions that significantly affect a candidate (rejection, shortlisting that drives rejection, an offer) for a named human. ADR 0004 says what the agent may not decide; it does not enumerate what the agent may write. Phase 1 needs that line drawn so logistics can proceed without eroding the human-in-the-loop guarantee, especially where an ATS models a logistics event as a pipeline status.

## Decision

In the logistics phase the agent may make logistics writes only: creating, updating, and cancelling interview calendar events; attaching candidate-supplied documents to the system of record; and recording contact, scheduling, and audit annotations. The agent must not write any decision or outcome status (advancing a candidate to a hiring stage, rejecting, shortlisting, or making an offer). Where an ATS represents a forward stage move as a status change, that move remains a human action: the agent surfaces the information and a named human moves the candidate. This does not weaken ADR 0004. It records which non-decision writes are permitted, so everything else stays off-limits by default, and every write the agent makes is audit-logged so the boundary is checkable.

## Consequences

Logistics can run end to end while the human-in-the-loop guarantee (ADR 0004) and the minimisation posture (ADR 0006, the system of record stays put and writes are minimal) both hold. The cost is that some pipeline movement an ATS might otherwise automate stays manual by design, and the boundary needs care where an ATS conflates a logistics event with a status. If a specific logistics-driven status move (for example marking interview scheduled) is later judged safe and necessary, that is a new ADR, not a quiet extension of this one.

## Alternatives considered

Letting the agent write pipeline status for logistics events. Rejected: it blurs the line ADR 0004 draws and risks an automated move that significantly affects a candidate.

Forbidding all agent writes and having a human perform every logistics write. Rejected: it removes the point of the logistics phase, and logistics writes (calendar events, document attachments) do not carry the decision risk ADR 0004 targets.
