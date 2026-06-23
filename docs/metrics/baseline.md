# Metrics baseline

Version: 1.0
Artefact established: 2026-06-23
Owner: TA operations lead, with a data analyst.

This is the recorded baseline for the recruitment pipeline agent's success metrics, kept as a versioned artefact in the repository (requirement H1, Phase 0 Task 0.10). It fixes the figures, the capture method, the capture date, the owner, and the re-measurement method for each baseline measure, so that the effect of the agent can be compared like for like once Phase 1 ships (requirement H2).

The figures themselves are supplied by the business, not invented here. Where a figure has not yet been supplied it is marked **pending** below, with its owner and the point by which it is due. Per the phase spec's resolution, capture completes before Phase 1 ships, not before Phase 0 build starts, so pending figures are expected and in scope. The structure, method, owners, and re-measurement plan are in place now during Phase 0.

## Data protection

This artefact holds aggregate figures only: counts and durations. It records no candidate records and no direct identifiers (ADR 0006, data minimisation over data residency). The system of record for the underlying data stays in the corporate's Azure tenant or the ATS. Any figure entered here must be an aggregate (an average, a median, a total, a rate), never anything traceable to an individual candidate, recruiter, or hiring manager.

## Baseline figures

### 1. Recruiter admin hours per requisition (H1)

- Figure: **pending.** To be supplied by the business before Phase 1 ships.
- Capture method: a 1 to 2 week recruiter time-diary plus a short survey, recording hours spent on hiring logistics (CV handling, scheduling, chasing, drafting, marking) per requisition. Reported as an aggregate average across recruiters, with no individual named.
- Capture date: pending (data capture not yet run; due before Phase 1 ships).
- Owner: TA operations lead, with a data analyst.
- Re-measurement method: repeat the same 1 to 2 week time-diary and survey after Phase 1 has been live long enough to cover a comparable set of requisitions, using the same instrument and the same aggregate-average reporting, so the before and after are comparable.

### 2. Time-to-hire by stage (H1)

- Figure: **pending.** To be supplied by the business before Phase 1 ships.
- Capture method: pull 3 to 6 months of historical requisition data from the ATS export and compute, per pipeline stage, the elapsed time between stage timestamps. Reported as aggregate durations per stage (for example median and mean days in stage), with no candidate identifiers.
- Capture date: pending (ATS export not yet pulled; due before Phase 1 ships).
- Owner: TA operations lead, with a data analyst.
- Re-measurement method: re-run the same ATS-export query over an equivalent post-Phase 1 window, computing the same per-stage aggregate durations from stage timestamps, so the stages line up with the baseline.

### 3. Stage-to-stage drop-off (H1)

- Figure: **pending.** To be supplied by the business before Phase 1 ships.
- Capture method: from the same 3 to 6 months of ATS export, count candidates entering and leaving each pipeline stage and compute the stage-to-stage drop-off rate. Reported as aggregate counts and rates per stage transition, with no candidate identifiers.
- Capture date: pending (ATS export not yet pulled; due before Phase 1 ships).
- Owner: TA operations lead, with a data analyst.
- Re-measurement method: re-run the same stage-count query over an equivalent post-Phase 1 window and recompute the per-transition drop-off rates on the same stage definitions, so the funnel is comparable.

## Status summary

| Figure | Status | Owner | Due |
| --- | --- | --- | --- |
| Recruiter admin hours per requisition | Pending | TA operations lead, with a data analyst | Before Phase 1 ships |
| Time-to-hire by stage | Pending | TA operations lead, with a data analyst | Before Phase 1 ships |
| Stage-to-stage drop-off | Pending | TA operations lead, with a data analyst | Before Phase 1 ships |

When a figure is supplied, replace its **pending** marker with the aggregate value and set its capture date to the date the data was captured. Keep the method, owner, and re-measurement method, and bump the artefact version.
