# 0019. The assessment-phase decision gate and agent write boundary

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, legal, engineering (proposed)

## Context

ADR 0004 keeps a named human on every candidate-affecting decision. ADR 0012 drew the agent's write boundary for the logistics phase and ADR 0016 for the screening phase, each scoped to its phase by its own title, and each recording that a new category of agent output in a later phase needs its own ADR rather than a quiet extension. Phase 3 introduces a category neither covered: an assessment mark. The agent issues a take-home or skills assessment, the submission is marked in the Sandbox (ADR 0017), and the result is surfaced to the recruiter as advisory input to a human decision. An assessment result that drives whether a candidate advances or is rejected is a candidate-affecting decision, and employment assessments are a classic disparate-impact surface under the Employment Equity Act, so the boundary for this phase must be explicit: what the agent may output, what it must not write, and that a mark never advances or rejects a candidate on its own. The PRD makes auto-pass and auto-fail an explicit Phase 3 exclude.

## Decision

In the assessment phase the agent's permitted output is advisory only: a marking result (a score or rubric outcome with its supporting evidence) surfaced to the recruiter in Teams and traced (ADR 0004), plus the logistics annotations already permitted by ADRs 0012 and 0016 (for example recording that an assessment was issued, submitted, or marked). The agent performs no auto-pass and no auto-fail and writes no decision or outcome status: it does not advance, reject, shortlist, or otherwise move a candidate on the strength of a mark. The mark is input to a human, not a decision; where acting on it is a status change in the ATS, that move remains a human action, consistent with ADRs 0012 and 0016. A mark, like a screening recommendation, may be overridden by the human, and the human's decision and any override are attributed and logged. This does not weaken ADR 0004 or narrow ADRs 0012 and 0016; it records which assessment-phase outputs are permitted so everything else stays off-limits by default, and every agent write is audit-logged so the boundary is checkable. If a specific human-triggered status write tied to an assessment outcome is later judged safe and worth the convenience, that is a further ADR, not a quiet extension of this one.

## Consequences

The human-in-the-loop guarantee holds through the assessment phase: no candidate is passed or failed by the agent, and the highest-risk move (an automated rejection) stays off the table, whether on the agent's initiative or as an automatic consequence of a mark. Marking earns its keep as advisory input that speeds a human decision without making it. The cost is the same friction the earlier boundaries carry: a recruiter or hiring manager reads the mark and still performs any status move themselves. The trace and attribution keep every mark and every human decision reconstructable, which is the compliance evidence ADR 0004 requires. This boundary governs the assessment phase; relaxing it toward agent-recorded outcome writes is a deliberate future decision with legal sign-off, not an increment.

## Alternatives considered

Letting the agent auto-pass or auto-fail on a clear mark (for example a code take-home that scores zero or full). Rejected: an automated pass or fail that drives advancement or rejection is a decision based solely on automated processing, the precise POPIA section 71 and Employment Equity Act risk ADR 0004 exists to prevent, and the PRD excludes it outright. A high or low score is still a human's call.

Relying on ADRs 0012 and 0016 unchanged and not recording an assessment boundary. Rejected: both are scoped to their own phases by their titles and neither contemplated an assessment mark, and both ask that a new write category be a new ADR. The assessment phase needs its boundary stated explicitly, given the legal stakes.

Treating the mark as mere data needing no boundary because it is "only advisory". Rejected: advisory outputs that feed candidate-affecting decisions are exactly what ADR 0004 governs, and leaving the boundary unstated is how an advisory mark quietly becomes an automated gate.
