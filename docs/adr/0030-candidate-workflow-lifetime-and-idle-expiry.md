# 0030. Candidate workflow lifetime and idle expiry

- **Status:** Accepted
- **Date:** 2026-10-28 (rewritten 2026-10-29 for the Workflow SDK run of ADR 0029)
- **Deciders:** Project lead, engineering, legal

## Context

Task 1.2 expects a candidate's workflow to "survive waits and resume cleanly" across a recruitment journey that can run for weeks. The first draft of this ADR framed that as eve's `sessionTimeoutMs`, which completes an idle session after 30 days by default. ADR 0029 moves the Phase 1 candidate workflow out of the eve session into a Workflow SDK run that we start, hand over between deployments, and start at retention 0. eve's session timeout does not apply to that run. A run has no idle limit of its own: it waits on its hook until something ends it. Without a decision here, a candidate who goes quiet keeps a live run, holding their number and logistics state, indefinitely, handing itself to each new deployment every 7 days.

That is a POPIA question first. ADR 0006 requires that we hold the minimum for the shortest time the purpose needs, and the system of record for a candidate is the ATS, not the workflow. It is also a product question: what a returning candidate experiences after a long silence.

## Decision

A candidate's run lives until the journey ends or the candidate has been idle for 30 days, and the end of a run is an event the workflow handles, not data loss.

- **Journey end.** A run ends when the workflow is terminated (Task 1.2's `terminate`: a human-recorded outcome in the ATS such as hire, withdrawal or a reviewed rejection under ADR 0004, or an engineer's terminate under requirement E4).
- **Idle expiry.** A run also ends when 30 days pass with no candidate delivery and no pending logistics work. Pending work means a booked interview slot still ahead, an outstanding document request, or an open chase (Task 1.10). Every item of pending work carries an absolute end date in the state (the slot time, the request's deadline, the chase's last nudge), so pending work cannot keep a run alive indefinitely. Idle time is counted from a `lastActivityAt` field in the run's state, so it carries across the 7-day handoffs of ADR 0029 instead of restarting at each one. The idle expiry time is one of the absolute times the run's single timer waits for (ADR 0029, Timers), so a run ends at its expiry, not at the next handoff after it.
- **What happens at the end.** Before completing, the run writes anything that must survive (for example a booked slot) to the ATS within ADR 0012's write boundary, and writes a closing audit record (Task 1.11) that carries the opaque key, the reason (journey end or idle expiry), and the counts the journey needs reconstructed, never the number. It then completes. Retention 0 (ADR 0029) deletes its payload, and the hook token is released.
- **A candidate who returns after expiry.** Their next message starts a new run. Dedup history is gone, so it is treated as a new application, and the acknowledgement names the role again. We accept this for a candidate silent for 30 days: the ATS still holds where they are, and a recruiter sees both the closing and the opening audit records under the same opaque key.

The 30-day window is a starting value, set in one place in code, and changing it is a change to this ADR.

## Consequences

No candidate state outlives its purpose by more than 30 days of silence, and no second store is introduced for durability. The chase schedule (Task 1.10) becomes load-bearing for run lifetime: a candidate being chased is never idle, so a chase must be recorded as pending work, with its end date, before the idle window can close. Its stall detection has to run inside the window. Task 1.11's audit trail must carry enough to reconstruct a journey that spans two runs, linked by the opaque key. A repeated acknowledgement after 30 days of silence is a known, bounded behaviour rather than a defect, and the acknowledgement copy should read sensibly to someone who applied before.

The Phase 2 eve session keeps eve's own `sessionTimeoutMs`, and its value is a Phase 2 decision. When the session takes over a candidate (ADR 0029, Phase 2 pickup), the session's idle window replaces this one.

## Alternatives considered

No idle expiry: the run lives until terminated, kept current by 7-day handoffs. Rejected: a candidate who simply stops replying would never be cleaned up, against ADR 0006, and every abandoned journey would keep handing itself over forever.

A longer window (90 days or more) to cover the slowest plausible journey. Rejected: it keeps more candidate state alive for longer without need, since a journey with pending work never expires anyway. Silence alone is what the window measures.

Keeping completed run state readable (default retention) so a returning candidate's history can be restored. Rejected: ADR 0029 sets retention 0 for minimisation reasons, and the ATS plus the audit trail already hold what a returning candidate's recruiter needs.

eve's `sessionTimeoutMs` on a candidate session, the first draft's frame. No longer applicable in Phase 1, because ADR 0029 creates no session in this phase.
