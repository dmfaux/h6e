# 0021. Funnel dashboard as a read-only reporting surface over the warehouse

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, data, security (proposed)

## Context

Phase 4 builds the funnel reporting dashboard. The PRD fixes it as a read-only Next.js app on Vercel that reads the warehouse (Synapse or Fabric) through Connect, not a BI tool (ADR 0007), with no write path to the warehouse. The decision Phase 4 has to make is where the dashboard reads from, because under time pressure the temptation is to point it at whatever is nearest for freshness.

Across the programme the system of record stays in the corporate's Azure tenant or the ATS (ADR 0006). The agent holds only minimal operational and correlation state plus an audit trail; it is not the reporting source of truth. The funnel facts the dashboard reports (stage timestamps, stage transitions, source, outcomes) are produced by candidates moving through the pipeline (Phases 1 to 3) and by human decisions recorded in the ATS, and then land in the corporate warehouse. Every earlier phase explicitly excludes a warehouse path and leaves "the funnel data" to be surfaced here, but none states the mechanism by which that data reaches the warehouse.

This is a compliance-relevant boundary under POPIA: the reporting store, like the system of record, should stay in the corporate estate, and the dashboard must not become a second durable copy of candidate data.

## Decision

The funnel dashboard is a read-only reporting surface whose only data source is the corporate warehouse. The warehouse is the reporting source of truth, fed by the corporate's existing ATS-to-warehouse data pipeline, which this programme consumes but does not build or own.

The dashboard does not read the ATS directly, and it does not read the agent's operational or audit stores, for reporting. If a funnel fact the metrics need is missing from the warehouse, the fix is to extend the corporate pipeline that feeds it, not to wire the dashboard to another source.

The dashboard surfaces aggregate funnel metrics (time-to-hire by stage, source effectiveness, drop-off). It does not provide candidate-level identifying drill-down, and it does not provide self-service ad-hoc exploration (the latter already excluded by ADR 0007). It is descriptive and retrospective: it makes no candidate-affecting decision and triggers no agent action, so ADR 0004's human gate is not engaged by it.

## Consequences

We get one clean reporting boundary. The system of record and the reporting store both stay in the corporate estate (ADR 0006), the dashboard stays a thin fixed surface (ADR 0007), and the agent stays out of the reporting-source-of-truth role.

The cost is a hard dependency on the corporate pipeline actually carrying the funnel facts the metrics need. If it does not, the dashboard is empty or wrong until that pipeline is extended, and that extension is corporate data-engineering work outside this programme's scope. Pointing the dashboard at the ATS or the agent's stores for "freshness" is off the table; doing so would be a new decision that supersedes this ADR, not a quiet workaround. Reporting freshness is bounded by the warehouse's own latency, which the dashboard surfaces as an as-of time rather than implying real-time.

## Alternatives considered

Reading funnel data directly from the ATS through Connect, bypassing the warehouse. Rejected: it duplicates the warehouse's role, couples the reporting surface to the operational system, and cuts against the PRD's warehouse-read decision. The ATS is the operational system of record, not the analytics store.

Building the dashboard on the agent's own audit trail and operational state. Rejected: the agent is not the reporting source of truth (ADR 0006). Its stores hold correlation and operational state, not the corporate-wide funnel, and reading them for reporting would make the agent a second system of record.

The programme building its own ATS-to-warehouse pipeline. Rejected for this phase: it is a large data-engineering scope the PRD does not put here, and the corporate already runs the Microsoft data stack. If the pipeline genuinely cannot carry the data, that is a separate, deliberate decision, not an expansion of Phase 4.
