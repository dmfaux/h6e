# 0016. The screening-phase decision gate and agent write boundary

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, engineering (proposed)

## Context

ADR 0004 keeps a named human on every candidate-affecting decision: the agent prepares and recommends, a human decides and can override, and the override is logged. ADR 0012 drew the agent's write boundary for the logistics phase (calendar events, document attachments, logistics annotations) and explicitly forbade decision or outcome status writes, noting that any later, specific status move judged safe would need a new ADR rather than a quiet extension. ADR 0012 is scoped to the logistics phase by its own title.

Phase 2 introduces something the logistics phase did not have: the agent produces a shortlist, a ranked recommendation with reasoning, and posts it to a hiring manager in Teams with approve, reject, or adjust controls. This raises two questions ADR 0012 did not answer. First, how is the human gate represented so it genuinely gates: what advances a candidate, and what does not. Second, when the named human approves, rejects, or adjusts, who writes the resulting outcome, and is the agent recording a human's decision distinguishable from the agent making one. This is the highest-risk surface in the system (the pull toward automated rejection is a named programme risk), so the boundary must be explicit and recorded, not extrapolated.

## Decision

In the screening phase the agent's permitted outputs are advisory only: a shortlist or recommendation artefact with visible reasoning, surfaced to a named human in Teams and traced (ADR 0004), plus the logistics annotations already permitted by ADR 0012 (for example recording that screening ran or a shortlist was prepared). The agent writes no decision or outcome status: not advancing a candidate to a hiring stage, not rejecting, not shortlisting as a status, not offering. The durable per-candidate workflow pauses at the decision gate and only a specific, named, role-resolved human's approve, reject, or adjust action advances it; an unmapped or unauthenticated actor cannot decide (ADR 0011). The human's decision, and any override of the agent's recommendation, is attributed to that person and logged. Where the act of moving a candidate is a status change in the ATS, that move remains a human action (consistent with ADR 0012): the agent surfaces the decision and the named human performs the status move; the agent does not write the resulting decision status, even after approval, in this phase. If a specific human-triggered status write (the agent recording an approved decision as an attributed write) is later judged safe and worth the convenience, that is a further ADR, not a quiet extension of this one.

## Consequences

The human-in-the-loop guarantee (ADR 0004) holds intact through the first phase that screens, and the highest-risk action in the system stays off the table: no candidate status, least of all a rejection, is ever written by the agent, whether on its own initiative or as an automated consequence of an approval. The decision gate is a real workflow pause tied to a named human, so "no candidate status changes without a human action" is structural, not a convention. The cost is friction: a human who approves in Teams still performs the actual status move in the ATS, which is deliberate and mirrors the logistics boundary of ADR 0012. The trace and attribution make every recommendation and every human decision reconstructable, which is the compliance evidence ADR 0004 requires. This boundary governs the screening phase; relaxing it toward agent-recorded status writes is a deliberate future decision with legal sign-off, not an increment.

## Alternatives considered

Letting the agent write the outcome status once a human approves, treating the agent as the scribe of a human decision. Rejected for this phase: it puts a rejection or stage move one approval-click away from an agent write, which is the precise risk the programme keeps off the table; the small convenience is not worth blurring the line in the first screening phase. It is recorded here as a possible future ADR, not adopted now.

Relying on ADR 0012 unchanged and not recording a screening-phase boundary. Rejected: ADR 0012 is scoped to logistics by its title and did not contemplate the agent producing recommendations or a decision gate, and ADR 0012 itself asks that a new write category be a new ADR. The screening phase needs its boundary stated explicitly, especially given the legal stakes.

Letting the agent auto-advance candidates it scores highly and gating only rejections. Rejected: an automated advance that drives later rejection is still a decision based on automated processing, and ADR 0004 makes no exception for the "positive" direction.
