# Recruitment Pipeline Agent: Product Requirements (Roadmap)

**Status:** Accepted
**Type:** Programme-level PRD (roadmap, not detailed spec)
**Scope:** Sets the end state, principles, and phased slices. Each phase is specified in its own document later.

## How to read this document

This is a roadmap, not a street map. It describes where the whole system is going, the rules every phase must obey, and how the work splits into vertical slices that each ship something useful on their own. It deliberately does not contain detailed deliverables, acceptance checklists, data models, or UI specs. Those come in the per-phase specs that follow, which will narrow further into engineering tickets.

Read the end-state and principles first. They are fixed. The phases are sequenced but the boundaries are the contract: what a phase includes, and what it explicitly pushes to a later phase.

## Problem

High-volume hiring in a South African corporate (retail, BPO, graduate programmes, frontline roles) is bottlenecked by coordination, not judgement. Recruiters spend most of their time parsing CVs, booking interviews, chasing candidates and hiring managers, and re-keying data between systems. Good candidates leak out of the pipeline because follow-up is slow. The judgement work (who to hire) is a small slice of the effort and the part that carries the most legal risk.

The cost of not solving it is measured in recruiter hours lost to admin, time-to-hire that loses candidates to faster competitors, and an inconsistent candidate experience on the channel candidates actually use, which in this market is WhatsApp.

## End state

One agent system, built on the Vercel Agent Stack using the eve framework, that runs the logistics of hiring end to end while keeping a named human on every accept-or-reject decision.

When complete, the system:

- Talks to candidates on WhatsApp and to recruiters and hiring managers in Microsoft Teams, from one codebase.
- Runs each candidate as a durable, long-running workflow that survives waits of days and resumes cleanly after failures.
- Parses CVs and supporting documents in isolation, routes model calls across providers through a single gateway with PII redaction, and marks skills assessments or code take-homes in a sandbox.
- Reads and writes to the ATS, Microsoft 365 calendars, and the data warehouse through short-lived, scoped credentials, with a full audit trail.
- Prepares shortlists with reasoning and posts them for human approval. It never moves a candidate to rejected on its own.
- Chases candidates and stakeholders automatically on a schedule, and flags anyone stalled too long.
- Reports on the funnel through a web dashboard built and deployed on the same stack, behind the same auth.
- Sits behind the corporate identity provider (Microsoft Entra ID) for every internal surface, with an auth abstraction that allowed simple credential login during early build.

The system is an orchestration and reasoning layer over data that mostly stays inside the corporate's Microsoft estate and ATS. It is not the system of record.

## Principles and hard constraints

These apply to every phase. They are not negotiable per slice.

**Human decides, agent prepares.** Any decision that significantly affects a candidate (rejection, shortlisting that drives rejection, an offer) pauses for a named human who can override. This is a structural requirement, driven by POPIA section 71 (decisions based solely on automated processing) and the Employment Equity Act, not a feature toggle. Screening and ranking are advisory at most, behind a human gate, and only after bias evaluation is in place.

**Data minimisation over data residency.** We do not have bring-your-own-cloud available (see exclusions), so we control exposure by limiting what personal information flows through Vercel and through model providers, not by where the compute sits. The system of record stays in the corporate's Azure tenant or ATS. Direct identifiers are redacted before model calls. Model routing is constrained to an approved provider allowlist with signed data-processing agreements. If legal judges this insufficient for a given data class, that data class does not flow through the agent.

**Microsoft-first for internal surfaces.** Internal identity is Entra ID. The internal channel is Teams. Calendars are Microsoft 365. This is the path of least resistance in an SA corporate, not a preference to relax.

**Auth is swappable behind an interface.** Internal surfaces depend on our own auth interface, never on a provider directly. A development credential provider (username and password) is used during early build. An Entra-via-Passport provider replaces it later by configuration. The dev provider cannot run in production.

**No private beta in the critical path.** We build only on generally available, open, or public beta components. Anything in private beta is out until it reaches GA.

**One stack.** The agent, the channels, the schedules, and the reporting UI live in one repo, built with Claude Code, deployed on Vercel, behind one auth layer. We do not add a second tool unless a hard requirement forces it.

## Programme non-goals

These are out of scope for the whole programme as currently framed, not just for the first phase. Each can be revisited, but only deliberately.

- **Automated rejection or automated ranking that drives rejection.** This is the highest-risk use of recruitment AI under the Employment Equity Act and POPIA, and the lowest-value in time saved. Excluded by design. If ever reconsidered, only behind a hard human gate with a defensible bias-evaluation record.
- **Bring-your-own-cloud and Enterprise Managed Users.** Both are private beta. Excluded until GA. Account lifecycle for the small build team is manual in the meantime.
- **v0 and Power BI.** No low-code or BI tool. The dashboard is a web app in our repo. (If the corporate already runs Snowflake, the v0-plus-Snowflake build path could be reconsidered, but that is not assumed.)
- **Replacing the ATS.** The agent integrates with the existing ATS. It does not become the system of record.
- **Candidate authentication via a login.** Candidate identity is the verified WhatsApp number through Chat SDK. The auth abstraction is for internal surfaces only.

## Success metrics

**Leading (weeks):**
- Recruiter admin time per requisition: target a meaningful reduction once Phase 1 is live (set the baseline before build).
- Candidate slot-confirmation rate and time-to-confirm after the agent takes over chasing.
- Pipeline stall rate: proportion of candidates stuck in a stage beyond an agreed threshold, which the agent should drive down.

**Lagging (months):**
- Time-to-hire across the funnel.
- Candidate drop-off between stages, particularly early-stage leakage from slow follow-up.
- Recruiter capacity: requisitions handled per recruiter without added headcount.

Targets and measurement method are set per phase against a baseline captured before Phase 1 ships. Do not build without that baseline.

## The phases

Each phase from 1 onward is a vertical slice: it delivers working value on its own, top to bottom, rather than a horizontal layer that only pays off once a later phase lands. Phase 0 is the deliberate exception, the project setup that ships no user value but stands up the spine the slices plug into. Phases are sequenced. A later phase assumes the earlier ones exist.

### Phase 0: Project setup

The walking skeleton. This is the one phase that is not a vertical slice: it ships no candidate or recruiter value on its own. It stands up only what Phase 1 needs plus the seams later phases plug into, and nothing more. Keep it thin and time-boxed. A setup phase with no user-facing output is exactly where weeks vanish into infrastructure for features five phases away, so the discipline is to build the spine, not the system.

**Includes:**
- The repo scaffolded with eve, deployed to Vercel through a working CI pipeline, with preview and production environments and secrets handling in place.
- A bare eve agent that boots and answers a health check, nothing more.
- The auth interface defined, with the development credential provider working and the Entra provider stubbed (the seam, not the integration). Route guards depend on the interface and on roles, never on the provider. The dev provider cannot start in production.
- Connect wired far enough to prove one scoped token round-trips, against whichever of the ATS or Outlook is ready first, so Phase 1 is not where the credential flow gets discovered to be broken.
- WAF and Bot ID on the public application intake endpoint.
- The eval and tracing harness installed and running in CI with nothing to evaluate yet, so Phase 2 plugs in rather than retrofits.
- The metrics baseline captured (recruiter hours, time-to-hire, drop-off), since it has to happen before anything ships and has no better home.

**Excludes (pushed later):**
- Any candidate or recruiter behaviour, and any channel logic beyond the health check (Phase 1).
- Any model calls (Phase 2).
- The Sandbox (Phases 2 and 3).
- The dashboard (Phase 4).
- The actual Entra integration. Phase 0 builds the stub and the seam only (Phase 5).

**Done when:** an authenticated internal request, using a role-mapped dev login through the auth interface, reaches a booting agent; one Connect token round-trips against a real system; the CI pipeline deploys to a preview environment; the eval and tracing harness runs green on an empty suite; and the metrics baseline is recorded. Done is the thinnest path that proves the spine works end to end, not a checklist of everything built but nothing connected.

### Phase 1: Scheduling and chasing agent

The logistics core, and the only phase with near-zero legal risk. Ship this first, after Phase 0.

**Includes:**
- Candidate conversation on WhatsApp: acknowledge applications, answer questions about the role and process, collect missing documents, book interview slots against Microsoft 365 calendars.
- Recruiter and hiring-manager interaction in Teams.
- Durable per-candidate workflow that survives multi-day waits and resumes after failure.
- Scoped, short-lived access to the ATS and Outlook calendars through Connect, with audit logging.
- Scheduled digests and automated nudges (a morning pipeline view for recruiters, slot-confirmation chasers for candidates, stall flags).
- Internal access through the auth interface set up in Phase 0, using the dev credential provider, role-mapped to recruiter and hiring-manager roles.

**Excludes (pushed later):**
- Any CV parsing, scoring, or shortlisting (Phase 2).
- Take-home marking (Phase 3).
- The reporting dashboard (Phase 4).
- Entra cutover (Phase 5). Internal access in this phase is dev credentials only, in a non-production-exposed environment.

**Done when:** a candidate can apply on WhatsApp, be acknowledged, supply documents, and book an interview that lands in the right Outlook calendar; recruiters manage that pipeline in Teams; the agent chases candidates and stakeholders on schedule and flags stalls; and an authenticated internal user reaches the recruiter tooling through the auth interface using a role-mapped dev login.

### Phase 2: Advisory CV parsing and shortlist preparation

Adds reasoning to the pipeline, with the legal guardrails switched on before it touches a real candidate.

**Includes:**
- CV and document parsing in the Sandbox (untrusted input by definition), including scanned or photographed CVs via a vision model.
- Model routing through AI Gateway with PII redaction before any call and an approved-provider allowlist.
- Shortlist preparation: the agent assembles a ranked view with its reasoning and posts it to the hiring manager in Teams as approve, reject, or adjust controls. The agent does not change a candidate's status itself.
- Evals on the screening and shortlisting logic, including disparate-impact checks across designated groups, wired into CI so a prompt or model change that breaks a rule is caught before production.
- Tracing on every recommendation, replayable candidate by candidate.
- Optional sourcing and reference-check subagents, each with a narrow toolset and clean context, if needed in this phase rather than deferred.

**Excludes:**
- Any automated status change, rejection, or auto-advance. Human gate is mandatory.
- Take-home marking (Phase 3).
- The dashboard (Phase 4).

**Done when:** a submitted CV is parsed and a shortlist with visible reasoning appears in Teams for a human to approve or override; every recommendation has a replayable trace; the bias-evaluation suite runs in CI and blocks a release that fails it; and no candidate status changes without a human action.

### Phase 3: Take-home and skills-assessment marking

Extends the Sandbox to assessment, the strongest isolation use case.

**Includes:**
- Issuing a take-home or skills assessment to a candidate through the existing channels.
- Running and marking the submission in the Sandbox, never in the app runtime, with results surfaced to the recruiter as advisory input.
- Queues for handling application or submission floods (a popular graduate role taking thousands in a day), so spikes are processed without falling over.

**Excludes:**
- Auto-pass or auto-fail. Marking is advisory; a human reviews.
- Anything in Phases 4 and 5.

**Done when:** a candidate receives an assessment, submits it, the submission is marked in isolation, and the result reaches the recruiter as input to a human decision; and a submission spike is absorbed without dropping candidates.

### Phase 4: Funnel reporting dashboard

A web app in the same repo, not a BI tool.

**Includes:**
- A Next.js dashboard on Vercel showing funnel metrics: time-to-hire by stage, source effectiveness, drop-off points.
- Read-only, scoped access to the warehouse (Synapse or Fabric) through Connect.
- Access behind the auth interface, inheriting whatever provider is active.

**Excludes:**
- Self-service ad-hoc data exploration. This is a fixed, reviewed reporting surface. If ad-hoc slicing becomes a hard requirement, that is a separate decision about adding a self-service tool, not part of this phase.
- Any write path to the warehouse.

**Done when:** an authenticated TA lead opens the dashboard and sees the funnel metrics drawn live from the warehouse through a scoped read token, with no separate login.

### Phase 5: Entra cutover

Flip the identity layer with no change to application code.

**Includes:**
- Wiring the Entra-via-Passport provider behind the existing auth interface, mapping Entra group or app-role claims to the same roles the app already uses.
- Putting Passport in front of every internal surface (recruiter tooling, approval flows, dashboard).
- Decommissioning the dev credential provider for all internal surfaces and confirming it cannot run in production.

**Excludes:**
- Enterprise Managed Users (private beta; account lifecycle stays manual).
- Any change to candidate-side WhatsApp identity, which is untouched.

**Done when:** internal users authenticate through Entra via Passport across all internal surfaces; roles resolve correctly from Entra claims; the dev provider is disabled and provably cannot start in production; and no downstream code changed to make the swap, proving the abstraction held.

### Future (parked, not scheduled)

Recorded so we design without blocking them, not committed to.

- Bring-your-own-cloud on AWS for data residency, when it reaches GA. Until then, the data-minimisation approach stands.
- Enterprise Managed Users for automated builder-account lifecycle, when GA.
- Additional candidate channels (web chat, others) on the same Chat SDK codebase, if demand appears.
- v0-plus-Snowflake build path, only if the corporate turns out to run Snowflake.

## Cross-cutting open questions

To resolve as we move from this roadmap into per-phase specs. Owners noted.

- Which ATS is in use, and does it expose the calendar and status APIs the workflow needs? (Engineering, stakeholder. Blocking for Phase 1.)
- What is the approved model-provider allowlist, and are the data-processing agreements signed for each? (Legal. Blocking for Phase 2.)
- What is the redaction standard: which fields are stripped before a model call, and who signs off that the residual data is acceptable under POPIA? (Legal, data. Blocking for Phase 2.)
- What is the warehouse (Synapse, Fabric, or other), and how does Connect reach it? (Engineering. Blocking for Phase 4, useful earlier if the agent reads warehouse data mid-pipeline.)
- Who are the named human decision-makers per stage, and what are the approval thresholds? (Stakeholder. Blocking for Phase 2.)
- What is the admin baseline (recruiter hours, time-to-hire, drop-off) we measure against? (Data, stakeholder. Blocking before Phase 1 ships.)
- Does the security team accept data minimisation plus DPAs as sufficient without BYOC, or is residency a hard line? If hard, Phases 2 onward wait for BYOC GA. (Legal, security. Blocking for Phase 2.)

## Key risks

- **Beta maturity.** Connect and Passport are beta and eve is public beta. We are building a hiring process on young software. Mitigation: keep Phase 1 dependency-light, prove each component on low-risk logistics before extending it, and hold a fallback for anything that regresses.
- **Compliance exposure on screening.** The Employment Equity Act and POPIA make automated screening the riskiest part. Mitigation is structural, not a disclaimer: human gate on every decision, bias evaluation in CI, full tracing, and screening kept advisory. If we cannot produce the bias-evaluation record, screening does not run.
- **Candidate experience.** A WhatsApp agent that feels like a wall between a person and a job costs good applicants. Mitigation: obvious, easy handover to a human, and conservative automation early.
- **Model data flow.** A CV is dense personal data. Mitigation: redaction before model calls, an approved-provider allowlist, and a signed DPA chain. No provider outside the allowlist receives candidate data.
- **Scope creep into rejection automation.** The pull to let the agent auto-reject to save more time will recur. Mitigation: it is a programme non-goal, and any change requires deliberate legal sign-off, not an incremental tweak.

## Timeline and dependencies

No external hard deadline is assumed; confirm whether one exists (a hiring season, a graduate intake) that should anchor the build. Phases are sequential because each builds on the last. The metrics baseline now sits inside Phase 0, which is the right home for it, since it has to happen before any user-facing phase ships or the success metrics are unmeasurable later. Watch Phase 0 itself: time-box it, and if the scaffolding is not done in the agreed window, that is a signal to simplify the spine, not to keep polishing.