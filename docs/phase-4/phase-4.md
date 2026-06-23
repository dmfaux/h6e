# Phase 4: Funnel reporting dashboard

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 4 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 4 adds the one surface the programme has deferred at every step: a funnel reporting dashboard. On top of the logistics, screening, and assessment slices of Phases 1 to 3, it is a fixed, reviewed Next.js web app in the one repo, on Vercel, behind the same auth, that shows funnel metrics (time-to-hire by stage, source effectiveness, drop-off) drawn read-only from the corporate warehouse (Synapse or Fabric) through Connect. It is descriptive and retrospective. It makes no candidate-affecting decision, calls no model, runs no Sandbox, touches no candidate channel, and writes nothing anywhere. It reports on outcomes that humans and the earlier phases produced; it does not produce them. That is what makes this the lowest-risk phase since Phase 1: the heavy compliance machinery (redaction, bias evals, the human gate) governs the agent's decisions, and this surface makes none.

The load-bearing decision is not how to draw a chart. It is where the dashboard reads from and where that funnel data comes from. The system of record and the reporting store stay in the corporate estate (ADR 0006); the agent is not the reporting source of truth. So the dashboard reads the warehouse, the warehouse is the source of truth, and the warehouse is fed by the corporate's existing data pipeline, which this programme consumes but does not build.

Binding ADRs: 0002 (the eve stack on Vercel, one repo, so the dashboard is a Next.js app here, not a separate tool), 0003 and 0008 (the swappable auth interface, the dev credential provider still active at Phase 4, stateless signed sessions, and the production-refusal rule), 0005 (Connect must be public beta or GA, not private beta), 0006 (data minimisation: the reporting store stays in the corporate estate, the agent is not the reporting source of truth, no durable second copy of candidate data), 0007 (one repo, the dashboard is a web app and not a BI tool, no self-service ad-hoc exploration), 0009 (the reusable Connect broker, extended here to the warehouse), and 0001 (record any new architectural decision as an ADR). ADR 0004 is satisfied trivially: the dashboard makes no decision and triggers no agent action. Two new decisions are proposed for this phase and referenced below, pending acceptance: ADR 0021 (funnel dashboard as a read-only reporting surface over the warehouse) and ADR 0022 (warehouse read access through the Connect broker).

## Scope

### Includes, made concrete

- **The funnel dashboard.** A Next.js web app in the one repo, deployed on Vercel, presenting the three funnel metric families the PRD names: time-to-hire by stage, source effectiveness, and drop-off by stage. The reports are fixed and reviewed, filterable along predefined dimensions (for example requisition, role, source, period), not a free-form query builder (ADR 0007).
- **Read-only warehouse access through Connect.** The dashboard reads the corporate warehouse (Synapse or Fabric) through the reusable Connect broker (ADR 0009), as a new read-only, least-privilege capability scoped to the agreed funnel datasets, server-side only, audit-logged on every issuance and use (ADR 0022). No write path to the warehouse exists.
- **The warehouse as the only reporting source.** The warehouse is the dashboard's sole data source and the reporting source of truth (ADR 0021). The dashboard does not read the ATS directly and does not read the agent's operational or audit stores for reporting.
- **Aggregate, non-identifying reporting.** Metrics are counts, rates, and durations over stages and groups, with small cells guarded against re-identification, and an as-of time on every view so "live" is not mistaken for real-time.
- **Internal access through the existing auth interface.** The dashboard sits behind the Phase 0 auth interface, inheriting whatever provider is active (the dev credential provider at Phase 4), role-gated to a TA-lead reporting role, with no separate login (ADR 0003, 0008). It depends on the interface and roles only, so the Phase 5 Entra swap touches no dashboard code.
- **Observability and metric correctness.** Dashboard queries and Connect warehouse reads are traced and audited on the Phase 0 harness, and a metric-definition check runs in the Phase 0 eval gate so a query change cannot silently alter a reported metric.

### Excludes, pushed to a named phase or out of the programme

- **Self-service ad-hoc data exploration.** Out of the programme as framed (ADR 0007, PRD non-goal). This is a fixed, reviewed reporting surface. If arbitrary slicing becomes a hard requirement, that is a separate decision to add a self-service tool, recorded as its own ADR, not part of this phase.
- **Any write path to the warehouse, the ATS, or candidate state.** Out forever for this surface (ADR 0021, 0022). The dashboard reads; it changes nothing. Candidate status changes remain human actions in the ATS (ADR 0004, 0012, 0016, 0019), untouched here.
- **Building or owning the ATS-to-warehouse data pipeline.** The corporate's existing pipeline feeds the warehouse; this programme consumes it (ADR 0021). If the warehouse lacks a needed funnel fact, extending that pipeline is corporate data-engineering work, not Phase 4 scope (see open questions and the consistency note).
- **Candidate-level identifying drill-down and operational dashboards.** Out of this phase. The surface is aggregate funnel reporting. Candidate-level operational views are not this phase, and any identifying drill-down would be a new data-handling decision under ADR 0006.
- **Any model call, Sandbox use, or candidate-channel logic.** Not engaged by a read-only reporting surface. The dashboard makes no model call (so AI Gateway and the redaction path of ADR 0014 are not exercised) and runs nothing in the Sandbox.
- **The Entra cutover.** Phase 5. The dashboard is built to inherit the provider swap with no code change; putting Passport in front of it, and decommissioning the dev provider, is Phase 5. Phase 4 runs in the non-production pilot environment with the dev provider.

## Dependencies

### Inward (what earlier phases must already provide)

- **From Phase 0:** a deploying eve project on Vercel through CI, with preview and production environments and per-environment secrets; the auth interface (ADR 0003) with a working dev credential provider, role mapping, stateless signed sessions (ADR 0008), and the production-refusal guard; a proven Connect credential flow to extend; the eval and tracing harness running in CI as a real gate; and the metrics baseline artefact (`docs/metrics/baseline.md`), whose stage taxonomy and definitions the dashboard should match so figures are comparable.
- **From Phase 1:** the reusable Connect broker (ADR 0009), extended here with a read-only warehouse capability; and the logistics funnel events (applications, bookings, stalls) that, via the ATS and the corporate pipeline, become warehouse funnel data.
- **From Phases 2 and 3:** the screening and assessment funnel data (shortlists prepared, human decisions, marking outcomes, drop-off) that, via the ATS and human status moves and the corporate pipeline, become reportable.
- **The real precondition** is that the warehouse is populated with the funnel facts the metrics need. That is a corporate-pipeline matter more than a Phase 2 or 3 code matter: Phase 4's mechanism does not hard-depend on the screening or marking logic, only on the funnel data reaching the warehouse. The richness of the metrics tracks which phases are live and feeding the funnel.

### Outward (what Phase 4 leaves for later)

- **To Phase 5:** the dashboard as one more internal surface that the Entra cutover puts Passport in front of, with no dashboard code change (the proof that the ADR 0003 seam held for the reporting surface too). Phase 4 adds no auth surface the Entra swap must touch beyond the existing interface.
- **Out of the programme unless deliberately reopened:** self-service ad-hoc analysis (a new-tool decision and ADR, ADR 0007), and any candidate-level identifying reporting (a new data-handling decision under ADR 0006).

## User stories by persona

### TA lead and TA operations (the dashboard audience)

- As a TA lead, I open the dashboard with my normal internal login and no separate sign-in, and see the funnel metrics for the requisitions I oversee, so I can judge pipeline health without trawling the ATS or asking for a report.
- As a TA lead, I can see time-to-hire by stage, where candidates drop off, and which sources bring the strongest pipeline, so I can act on the bottleneck rather than guess at it.
- As a TA lead, I can see when the data was last refreshed, so I know whether I am looking at this morning's picture or last night's.
- As a TA operations owner, the dashboard's metrics line up with the baseline we captured before Phase 1, so I can tell whether the agent moved the numbers.

### Recruiter and hiring manager (secondary, if granted read access)

- As a recruiter, where I am granted reporting access, I see the same fixed funnel views role-gated to me, without any new login or tool.

### Engineer

- As an engineer, I can trace a dashboard view to the warehouse reads it caused and see them in the audit trail, so an access question has an answer.
- As an engineer, I can rely on a CI check that fails if a query change alters a reported metric's definition, so the numbers do not drift silently.

### Legal and data

- As legal or data, I can point to a reporting surface that reads the warehouse read-only through an audited broker, holds no durable second copy of candidate data, and shows aggregate figures with small cells guarded, as evidence the reporting posture is defensible under POPIA.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. Funnel reports

- **A1 (P0).** The dashboard presents the three funnel metric families the PRD names: time-to-hire by stage, source effectiveness, and drop-off by stage. Acceptance: an authenticated TA lead sees each of the three, drawn from warehouse data, for the configured reporting scope.
- **A2 (P0).** Metrics are aggregate (counts, rates, durations over stages and groups), not candidate-level identifying records. Acceptance: no report exposes a candidate's direct identifiers; every figure is an aggregate.
- **A3 (P0).** Each view shows an as-of time reflecting the warehouse's data freshness, so "live" is not read as real-time. Acceptance: every report displays the as-of timestamp of the data it drew.
- **A4 (P1).** Metric definitions match the Phase 0 baseline (`docs/metrics/baseline.md`) so figures are comparable over time. Acceptance: time-to-hire and drop-off use the same stage taxonomy and method as the baseline artefact.
- **A5 (P1).** Reports can be filtered along fixed, reviewed dimensions (for example requisition, role, source, period), not arbitrarily composed (ADR 0007). Acceptance: the predefined filters work; there is no free-form query builder.
- **A6 (P1).** Small cells are suppressed or banded to prevent re-identification in low-count aggregates. Acceptance: an aggregate over fewer than the configured threshold is suppressed or banded, not shown as an identifying count.

### B. Warehouse read access

- **B1 (P0).** All warehouse access goes through the Connect broker as a read-only capability; no direct warehouse connection exists in the code (ADR 0009, 0022). Acceptance: every warehouse query uses a freshly brokered read-only credential; no static warehouse credential sits in code.
- **B2 (P0).** The warehouse scope is read-only and least-privilege (the agreed funnel datasets or views only); no write scope is ever requested or available (ADR 0021, 0022). Acceptance: the dashboard cannot write the warehouse; there is no write scope to request.
- **B3 (P0).** The warehouse credential is obtained and used server-side only and never exposed to the browser (ADR 0022). Acceptance: no warehouse credential or token appears in client code or in traffic to the browser; the browser reads through our server.
- **B4 (P0).** Every warehouse credential issuance and use is audit-logged (who, what dataset, when, scope, target) (ADR 0009). Acceptance: an auditable record exists for each warehouse read.
- **B5 (P1).** Warehouse or Connect failures degrade gracefully. Acceptance: a transient failure shows a clear "data unavailable" state with the last-known as-of time, not a crash and not a stale render presented as live.

### C. Access, identity, and the auth seam

- **C1 (P0).** The dashboard sits behind the Phase 0 auth interface, inheriting the active provider (the dev credential provider at Phase 4), role-gated to a TA-lead reporting role (ADR 0003, 0008). Acceptance: a role-mapped TA-lead login reaches the dashboard; an unauthenticated or wrong-role request is refused.
- **C2 (P0).** There is no separate login: the dashboard shares the same auth interface and stateless signed session as the other internal surfaces (ADR 0008). Acceptance: a TA lead already signed in to the internal surfaces reaches the dashboard without a second sign-in.
- **C3 (P0).** The dashboard depends only on the auth interface and roles, never on a provider, so the Phase 5 Entra swap touches no dashboard code (ADR 0003). Acceptance: the dashboard reads id, email, and roles from the interface; switching the provider variable changes no dashboard code.
- **C4 (P0).** The dev provider still refuses to start in production; Phase 4 runs in the non-production pilot environment (ADR 0003). Acceptance: a production-configured boot with the dev provider selected refuses to start.
- **C5 (P1).** Any audience broader than TA lead (recruiter, hiring manager, executive read access) is granted by role configuration through the same interface, least-privilege. Acceptance: an added reporting role is gated through the interface, not by a bypass.

### D. Data-handling boundary

- **D1 (P0).** The dashboard reads only the warehouse, never the ATS directly and never the agent's operational or audit stores, for reporting (ADR 0021). Acceptance: the dashboard's data source is the warehouse alone.
- **D2 (P0).** The dashboard writes nothing anywhere and triggers no agent action (ADR 0021, 0004). Acceptance: opening or using the dashboard changes no candidate, pipeline, or warehouse state.
- **D3 (P0).** The dashboard makes no model call and runs nothing in the Sandbox (ADR 0006; ADR 0014 not engaged). Acceptance: no model call or Sandbox run originates from the dashboard.
- **D4 (P1).** No durable copy of warehouse data is created outside the warehouse; only short-lived, aggregate, non-identifying caching for performance is permitted (ADR 0006). Acceptance: there is no durable materialised copy of candidate-level warehouse data in the agent's or dashboard's stores.

### E. Observability and metric correctness

- **E1 (P0).** Dashboard queries and Connect warehouse reads are traced on the Phase 0 harness and recorded in the audit trail. Acceptance: an engineer can see which user viewed which report and which warehouse reads it caused.
- **E2 (P1).** A metric-definition check runs in the Phase 0 eval gate so a query change cannot silently alter a reported metric. Acceptance: a change that alters a metric's computed result against a fixed expected output fails the build.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The dashboard** (Next.js on Vercel, in the one repo, ADR 0007) renders the fixed funnel reports. Its server side requests warehouse reads through the Connect broker and returns aggregate results to the browser; the browser never reaches the warehouse directly.
- **The auth interface** (Phase 0, ADR 0003) fronts the dashboard as it fronts every internal surface, returning id, email, and roles, with the dev credential provider active and the Entra provider still a stub. Sessions are stateless and signed (ADR 0008), shared with the other internal surfaces so there is no separate login.
- **The Connect broker** (ADR 0009, extended by ADR 0022) mints short-lived, read-only, least-privilege credentials scoped to the agreed funnel datasets, and is the only path from our code to the warehouse. Every issuance and use is audit-logged.
- **The warehouse** (Synapse or Fabric) is the corporate reporting store and the dashboard's only source of truth (ADR 0021), fed by the corporate's existing ATS-to-warehouse pipeline, which is outside this programme's scope to build.
- **The observability harness** (Phase 0) traces dashboard queries and Connect reads, holds the audit records of warehouse access, and runs the metric-definition check as a CI gate.

How they connect: a TA lead reaches the dashboard through the auth interface using their existing internal session, with the route guard reading the TA-lead role from the interface. The dashboard's server side asks the Connect broker for a read-only credential scoped to a funnel dataset, runs the query against the warehouse, guards small cells and stamps the as-of time, and returns the aggregate to the browser. Every read is brokered, scoped, and audited; every view is traced; and the metric definitions are checked in CI. Nothing is written, no model is called, and no candidate state moves.

## Integration points and boundary contracts

Named contracts, not schemas.

- **Auth interface to the dashboard.** Out (from the interface): an authenticated user with id, email, and roles, or a refusal. In: the dashboard's role requirement (TA-lead reporting role). No new contract; the dashboard reuses the Phase 0 interface and stateless signed session (ADR 0003, 0008).
- **Connect broker to the warehouse (ADR 0009, 0022).** Out: a request for a short-lived, read-only, least-privilege credential scoped to a named funnel dataset or view, and the read query itself. In: a short-lived read token and aggregate funnel results (counts, durations, stage transitions, source tags). Crossing the boundary: aggregate funnel metrics, server-side only. Scopes: read-only on the agreed datasets; no write scope exists. Every issuance and use audit-logged.
- **The funnel data contract in the warehouse.** The warehouse must expose the funnel facts the metrics need (stage timestamps, stage transitions, source, outcomes) as queryable datasets or views. Providing and shaping that data is a corporate data-engineering dependency (ADR 0021); aligning it to the metric definitions is an open question for data and engineering. This spec names the contract; it does not specify its schema.
- **Observability backend.** Out: traces of dashboard queries and Connect reads, and durable audit records of warehouse access. The metric-definition check is internal to CI and crosses no external boundary.

At every boundary the dashboard reads only aggregate funnel data through the broker, holds no durable copy outside the warehouse, and keeps candidate identity in the system of record (ADR 0006).

## Data handling and compliance

Phase 4 is low on personal data by design, which is the right shape for a read-only aggregate reporting surface under ADR 0006.

- **Personal information touched:** ideally none directly. The dashboard shows aggregate funnel metrics (counts, rates, durations over stages and groups). Direct identifiers do not belong on it, and candidate-level identifying drill-down is out of scope (ADR 0006, 0021).
- **The reporting store stays in the corporate estate (ADR 0006):** the warehouse is the corporate's, in their Microsoft data stack. The dashboard reads it and does not copy it durably; only short-lived, aggregate caching for performance is permitted, with no durable second copy of candidate data outside the warehouse.
- **Small-cell re-identification (POPIA):** an aggregate sliced finely enough (a stage with one or two candidates, a rare source) can identify a person. Small cells are suppressed or banded (requirement A6). The suppression policy is a legal and data sign-off (open question).
- **No model flow:** Phase 4 makes no model call, so the redaction path, the provider allowlist, and the Sandbox (ADR 0006, 0014, 0015) are not exercised. This surface adds no candidate-PII-to-model flow.
- **No write path:** the dashboard writes nothing (ADR 0021, 0022). It changes no candidate status, which keeps ADR 0004, 0012, 0016, and 0019 intact without engaging them.
- **Access audit (ADR 0009):** warehouse reads are audit-logged like every other external access, so who viewed reporting data and which reads it caused is reconstructable, even though the data is aggregate.
- **Environment posture:** because the dev provider cannot run in production (ADR 0003), Phase 4 runs in the non-production pilot environment, with the same operational rigour the earlier phases set (per-environment secrets, full audit, least-privilege scopes, monitoring). The Entra-fronted production environment is lit at Phase 5.
- **Beta components (ADR 0005):** Connect is used on the same basis as the earlier phases, permitted as long as it is public beta or GA, not private beta. Next.js and Vercel hosting are GA.

## Access and identity

- **Active provider:** the dev credential provider (ADR 0003, 0008), as in Phases 1 to 3. The Entra provider remains a stub until Phase 5.
- **The dashboard role:** a TA-lead reporting role gates the dashboard. Roles are part of the interface (ADR 0003), so adding the TA-lead reporting role is configuration within the existing interface, not a new auth decision. Recruiter, hiring-manager, and internal engineering roles carry forward from earlier phases; any reporting read access for them is role configuration through the same interface (requirement C5).
- **No separate login (ADR 0008):** the dashboard shares the stateless signed session with the other internal surfaces, so a signed-in TA lead reaches it without a second sign-in. This constrains the deployable topology (a shared domain or shared session), noted as an open question and a risk, but it is an application of the existing session decision, not a new one.
- **The Phase 5 seam:** the dashboard depends only on id, email, and roles from the interface, so putting Passport in front of it and mapping Entra claims to the same roles is a Phase 5 configuration change that touches no dashboard code (ADR 0003).
- **Production refusal (ADR 0003):** the dev provider still fails closed in production, so Phase 4 stays non-production.
- **Candidate identity:** untouched. Candidates have no login and no presence on this internal surface (ADR 0003).

## Observability, evals, and tracing

- **Tracing:** dashboard queries and Connect warehouse reads are traced on the Phase 0 harness, so a view can be tied to the reads it caused.
- **Audit:** warehouse access joins the existing audit trail (ADR 0009), recording who read which dataset and when.
- **Metric-correctness eval:** a deterministic check in the Phase 0 CI gate verifies that the dashboard's metric definitions compute the agreed result, so a query change cannot silently alter a reported number (requirement E2). This is the Phase 4 use of the eval gate.
- **No bias or disparate-impact eval is added here.** Those gates govern the agent's screening and marking decisions (ADR 0013, 0020), which this phase neither performs nor changes. The dashboard reports on outcomes the earlier phases and humans produced; it introduces no decision logic to evaluate. The Phase 2 and 3 bias gates remain as they are.
- **Feeds Phase 5:** nothing new beyond the existing surfaces; the dashboard is one more thing the Entra cutover fronts.

## Risks and mitigations

- **The warehouse may not hold the funnel data.** The central Phase 4 risk: if the corporate pipeline does not carry the funnel facts the metrics need, the dashboard is empty or wrong (ADR 0021). This is the Phase 4 analogue of Phase 1's "which ATS" blocker. Mitigation: confirm the warehouse identity, contents, and a funnel data contract early; treat a missing fact as a pipeline-extension dependency on the corporate side, not as a reason to wire the dashboard to the ATS (which would supersede ADR 0021). See the consistency note.
- **Small-cell re-identification.** Aggregates over tiny cohorts can identify people (POPIA). Mitigation: aggregate-only reporting, small-cell suppression or banding, no direct identifiers, and a signed-off suppression policy (requirement A6).
- **Wrong or drifting numbers eroding trust.** A reporting surface whose figures do not match the recruiters' reality is worse than none. Mitigation: align definitions to the Phase 0 baseline, the metric-definition CI check, and a visible as-of time so freshness is never overstated.
- **Freshness expectation versus warehouse latency.** "Drawn live" can be misread as real-time when the warehouse lags the ATS. Mitigation: surface the as-of time on every view and set expectations to the warehouse's refresh cadence, not real-time.
- **The auth seam for a separate app surface.** "No separate login" across the dashboard and the agent must hold even if they deploy separately. Mitigation: the stateless signed session is provider-independent and validates anywhere that shares the signing secret and a session-scoping domain (ADR 0008); validate the seam, and confirm the Phase 5 swap touches no dashboard code.
- **Beta Connect to a new system.** The warehouse connector is another young surface (a PRD key risk). Mitigation: keep the read path thin and well-traced, degrade gracefully (requirement B5), and concentrate access in the broker so a regression is localised (ADR 0022, 0005).
- **Scope creep into ad-hoc BI.** The pull to add "just one custom slice" will recur. Mitigation: ADR 0007 holds; this is a fixed, reviewed surface, and any self-service is a deliberate new-tool decision and ADR, not an incremental feature.
- **Caching becoming a durable PII copy.** Performance caching can quietly turn into a second store of candidate data. Mitigation: only short-lived, aggregate, non-identifying caching; no durable copy outside the warehouse (requirement D4, ADR 0006); crossing into durable caching of candidate-level data would need a new ADR.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- The warehouse is the corporate's Microsoft data stack (Synapse or Fabric), per the PRD and ADR 0007. The specific one is confirmed by engineering (a PRD-recorded blocking open question for this phase).
- The warehouse is fed by the corporate's existing ATS-to-warehouse data pipeline. Building or owning that pipeline is out of scope for this programme; the dashboard is a read consumer (ADR 0021).
- The dashboard's audience is the TA lead and TA operations. Recruiters and hiring managers may be granted read access by role configuration; the spec defaults the gated role to TA lead.
- Reporting is aggregate and non-identifying. There is no candidate-level identifying drill-down on this surface.
- Phase 4 runs in the non-production pilot environment until the Phase 5 Entra cutover, because the dev provider cannot run in production (ADR 0003).
- Metric definitions align with the Phase 0 baseline (`docs/metrics/baseline.md`) so the figures are comparable.
- Connect can reach the warehouse with a read-only scope, mirroring the warehouse reachability the PRD flags as a Phase 4 question.
- Next.js on Vercel is GA, and Connect is public beta or GA at build start, so both are permitted by ADR 0005.
- The dashboard is descriptive and retrospective only; it makes no decision and triggers no agent action, so ADR 0004's gate is not engaged.

## Open questions

Tagged by owner, and blocking or non-blocking for this spec. Each carries a best-judgment answer (the working decision). Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation; the warehouse identity and contents remain genuine external unknowns answered with a posture and a fallback, not invented detail.

- **Which warehouse is in use (Synapse, Fabric, or other), can Connect reach it read-only, and does it actually contain the funnel facts the metrics need?** (Engineering, data. Blocking for the build, per the PRD; non-blocking for this city-map spec, which names the contract warehouse-agnostically.)
  Answer: The warehouse must be named by engineering and data; it cannot be guessed, and it is the one true build blocker for the read integration. Posture: the spec stays warehouse-agnostic, and the read integration does not start until the warehouse is named, confirmed reachable read-only through Connect, and confirmed to expose the funnel facts (stage timestamps, transitions, source, outcomes) the metrics need. Fallback if Connect has no usable warehouse connector at build start: hold the read path and raise a blocking note rather than wiring a direct connection (which ADR 0022 forbids) or pointing the dashboard at the ATS (which ADR 0021 forbids). Confirm warehouse access early; this is the external dependency that can stall the phase.
- **Is the funnel data already in the warehouse, or must the corporate extend their ATS-to-warehouse pipeline to carry the agent-era funnel events, and who owns that?** (Data, stakeholder. Blocking for the build; non-blocking for the spec.)
  Answer: This is the latent gap (see the consistency note): the PRD and earlier specs assume funnel data reaches the warehouse but never state the mechanism. Posture: the corporate's existing pipeline is the assumed feeder. If it does not carry the needed funnel facts, the fix is to extend that pipeline (corporate data-engineering work), not to expand Phase 4 to build a feeder or to bypass to the ATS. If extending the pipeline is not feasible in time, that is a decision for a human: either descope the affected metrics for the pilot, or take a deliberate, ADR-recorded decision about an alternative source (which would supersede ADR 0021). Owner: data and the stakeholder, with engineering.
- **Who is the dashboard's audience, and which role or roles gate it?** (Stakeholder. Non-blocking; the spec defaults to a TA-lead reporting role.)
  Answer: Default the gated role to TA lead and TA operations. If recruiters, hiring managers, or executives should also see the fixed funnel views, grant them by least-privilege role configuration through the same interface (requirement C5); it is configuration, not a new surface. Stakeholder confirms the audience before the pilot; engineering owns the role config shape.
- **What are the exact metrics, their definitions, and the stage taxonomy, and do they align with the Phase 0 baseline?** (Stakeholder, data. Non-blocking for the city map; needed to build the reports.)
  Answer: Build the three families the PRD fixes (time-to-hire by stage, source effectiveness, drop-off by stage), defined to match the Phase 0 baseline (`docs/metrics/baseline.md`) so the numbers are comparable. The precise stage taxonomy and any additional fixed views come from the stakeholder and data; the metric-definition CI check (requirement E2) pins them once agreed. Owner: stakeholder and data.
- **How live is "live", and what warehouse refresh latency is acceptable?** (Stakeholder, data. Non-blocking; the spec defaults to as-of-timestamped, near-real-time as the warehouse allows.)
  Answer: Read live from the warehouse per query (the PRD's "drawn live"), and show the data's as-of time on every view rather than promising real-time (requirement A3). The acceptable lag is the warehouse's own refresh cadence; set the expectation to that, and revisit only if the stakeholder needs fresher data than the pipeline provides (which would be a pipeline question, not a dashboard one). Owner: stakeholder and data.
- **What is the small-cell suppression policy for aggregate reporting under POPIA?** (Legal, data. Non-blocking; the spec defaults to suppressing or banding small cells.)
  Answer (needs sign-off): Suppress or band aggregates below a configured cell-size threshold so a low-count slice cannot identify a person (requirement A6). Legal and data set and sign off the threshold and the banding approach. Owner: legal and data.
- **What is the deployable topology: one Vercel project with the dashboard as routes, or a second project in the same repo sharing the session?** (Engineering. Non-blocking; constrained by "no separate login".)
  Answer: Either satisfies ADR 0007 (one repo, one stack) as long as the dashboard shares the auth interface and the stateless signed session so there is no separate login (ADR 0003, 0008) and the Phase 5 swap touches no dashboard code (requirement C2, C3). Engineering chooses the topology at build; if a separate deployment is used, the session must be scoped to validate across both surfaces. This is an implementation detail under the existing ADRs, not a new decision. Owner: engineering.
- **Do the two proposed ADRs (0021 the reporting boundary, 0022 warehouse read access through Connect) get accepted as proposed?** (Project lead, engineering, data, security. Non-blocking for the spec; they block building those areas exactly as specified.)
  Answer: Accept both as proposed (needs sign-off). 0021 fixes the dashboard's only source as the warehouse and keeps the agent out of the reporting-source-of-truth role; 0022 puts warehouse access through the audited, read-only, server-side broker. Neither contradicts an accepted ADR, and each is a genuine new decision the phase forces. Flip both to Accepted in the register before building those areas. Owner: project lead, with engineering, data, and security.
- **Is the Phase 0 metrics baseline captured, so the dashboard's figures are comparable to it?** (Data, stakeholder. Non-blocking for the spec.)
  Answer: As in the earlier phases, the Phase 0 baseline artefact (`docs/metrics/baseline.md`) gates ship, not build. The dashboard can be built against the agreed definitions in parallel, but its figures are only meaningfully compared once the baseline exists. Align the dashboard's definitions to the baseline so the comparison holds. Owner: TA operations and data.

## Consistency note (for a human, not resolved here)

Defining this phase surfaces one gap in the PRD and the earlier specs, which I am flagging rather than quietly fixing.

The programme assumes funnel data reaches the warehouse so Phase 4 can read it, but no document states how. Phases 0 to 3 each exclude "any warehouse read path" and none describes a warehouse write or feed; the PRD's Phase 4 entry says only that the dashboard reads the warehouse. The working resolution in this spec and in ADR 0021 is that the corporate's existing ATS-to-warehouse pipeline feeds it, which is consistent with the Phase 0 baseline being pulled from ATS exports and with ADR 0006 keeping the reporting store in the corporate estate. If that pipeline does not in fact carry the agent-era funnel facts, the gap becomes real: the choices are to extend the corporate pipeline (out of this programme's scope), to descope the affected metrics for the pilot, or to take a deliberate decision about an alternative source (which would supersede ADR 0021). That is a decision for a human and a likely PRD clarification, not something to settle by expanding Phase 4 silently.

## Done when (phase-level acceptance)

Phase 4 is done when all of the following hold together, proving the reporting slice end to end rather than each piece in isolation:

- An authenticated TA lead, through the auth interface with a role-mapped login and no separate sign-in, opens the dashboard and sees the funnel metrics (time-to-hire by stage, source effectiveness, drop-off) drawn live from the warehouse, each view stamped with its as-of time.
- The dashboard reads the warehouse only, through a short-lived, read-only, least-privilege Connect-brokered credential used server-side and never exposed to the browser, audit-logged on every read; it has no write path and does not query the ATS or the agent's operational or audit stores for reporting.
- Reporting is aggregate and non-identifying, with small cells guarded, and metric definitions align with the Phase 0 baseline so the figures are comparable.
- The dashboard is gated behind the auth interface inheriting the active provider, runs in the non-production pilot environment (the dev provider still refuses to start in production), and is built so the Phase 5 Entra swap touches no dashboard code.
- Dashboard queries and Connect reads are traced and audited, and a metric-definition regression is caught by the eval gate.
- No model call, no Sandbox run, no candidate-affecting decision, and no agent write originates from the dashboard; it is descriptive reporting only.

Done is a working, defensible reporting surface a TA lead opens with their normal login and trusts the numbers on, not a set of components that each pass in isolation.
