# 0030. Candidate session idle timeout and durability

- **Status:** Proposed
- **Date:** 2026-10-28
- **Deciders:** Project lead, engineering

## Context

Task 1.2 keys one durable eve session per candidate and expects it to "survive waits and resume cleanly" across a recruitment journey that can run for weeks. eve's `sessionTimeoutMs` (`docs/agent-config.md`) sets how long a session may sit idle before eve completes it. It defaults to 30 days, the window restarts each time a turn settles, and when it elapses eve emits `session.ended`, releases every continuation address, and the next message for that address starts a fresh session with `defineState` at its initial value. For a candidate that means the dedup history is gone, the `workflow-started` effect fires again, and any held logistics state (outstanding documents, slot status, handover) is lost.

Under the trace policy ADR 0027 sets (no recorded inputs or outputs), eve also selects deletion of the ended run's durable payloads and streams. The session's history is therefore not recoverable after the timeout either.

A reviewer flagged this as a durability decision rather than a bug: the right idle window, what happens at expiry, and whether candidate state must outlive the session are product and compliance questions (POPIA retention, ADR 0006) as much as engineering ones. This ADR records the choice for a human to make. No code changes the timeout until it is accepted.

If ADR 0029 is accepted, the candidate workflow leaves the eve session for a Workflow SDK run, and this question becomes the run's retention and hook-token lifetime instead. The decision below is written to hold in either shape.

## Decision

Proposed: a candidate's correlation and logistics state outlives any single eve session or run. The idle timeout for a candidate session stays at eve's default, and expiry is treated as an event the workflow handles, not as data loss. Concretely:

- The authoritative record of where a candidate is in the pipeline stays in the system of record (the ATS, ADR 0006). Session state holds correlation and logistics only, as Task 1.2 already requires.
- On session end (timeout or termination), the workflow writes a closing audit record (Task 1.11) and the dedup window is allowed to lapse: a message that arrives after a month of silence is a new application for dedup purposes, and the acknowledgement names the role again. This is acceptable for a candidate who has been silent for 30 days.
- A candidate who must be chased past the idle window is kept alive by the chase schedule (Task 1.10), whose nudges settle turns and restart the window, so an active journey never times out by accident.
- Any state that must survive expiry (for example a booked interview slot) is written to the system of record before the session ends, never only to session state.

## Consequences

No timeout tuning is needed and no second store is introduced for session durability. The cost is that the chase schedule becomes load-bearing for session lifetime, so its stall-detection must run before the idle window closes, and Task 1.11's audit trail must carry enough to reconstruct a journey that spans two sessions. A repeated acknowledgement after 30 days of silence is a known, bounded behaviour rather than a defect.

## Alternatives considered

Raising `sessionTimeoutMs` to cover the longest plausible journey (90 days or more). Rejected as the only measure: it hides the problem rather than handling it, keeps more candidate state alive for longer (against ADR 0006), and still loses state at some horizon.

Setting `experimental.workflow.retention: "default"` to keep completed session payloads readable. Rejected for now: it is an experimental setting (ADR 0005), and it retains transcripts the trace policy deliberately drops.

A durable store for candidate state outside the session. Covered by ADR 0029's alternatives; not adopted for session lifetime alone.
