# Phase 1: Scheduling and chasing agent (the logistics core)

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 1 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 1 is the first vertical slice: it ships working value top to bottom on its own. The agent runs each candidate as a durable workflow, talks to candidates on WhatsApp to acknowledge applications, answer common questions, collect documents, and book interviews against Microsoft 365 calendars, lets recruiters and hiring managers work in Teams, reads and writes the ATS and Outlook through Connect with a full audit trail, and chases candidates and stakeholders on a schedule while flagging stalls. It is the only phase with near-zero legal risk, which is why it ships first after the Phase 0 skeleton. It adds no reasoning: no model calls, no CV parsing, no scoring, no shortlisting. The judgement work and its legal guardrails are Phase 2.

Binding ADRs: 0002 (build on the Vercel Agent Stack using eve, so Workflow SDK, Chat SDK, Connect, and Cron this phase, but not AI Gateway or Sandbox), 0003 and 0008 (the swappable auth interface, the dev credential provider, stateless signed sessions, and the production-refusal rule), 0004 (human decides, agent prepares: the agent does logistics only and never changes a candidate's status), 0005 (Connect and Chat SDK must not be private beta), 0006 (data minimisation: the system of record stays in the ATS or Azure, the agent pulls only the fields a step needs), 0007 (one repo), and 0001 (record any new architectural decision as an ADR). Four new decisions are proposed for this phase and referenced below, pending acceptance: ADR 0009 (reusable Connect scoped-credential broker), ADR 0010 (verified channel webhook ingress), ADR 0011 (channel-bound internal identity resolution before Entra), and ADR 0012 (the agent's write boundary in the logistics phase).

## Scope

### Includes, made concrete

- **Candidate conversation on WhatsApp.** Acknowledge a new application, answer a curated set of common questions about the role and process through structured prompts, tell the candidate which documents are outstanding and receive them, offer interview slots and book the chosen one, confirm, and remind. The conversation is deterministic (menus and quick replies), not model-driven, with an obvious route to a human at any point.
- **Recruiter and hiring-manager interaction in Teams.** Role-gated. Recruiters get pipeline visibility, event notifications, and stall flags, and can take supported logistics actions. Hiring managers supply or confirm interview availability and are notified of upcoming interviews and stalls needing their input.
- **Durable per-candidate workflow.** Each candidate runs as a durable workflow (Workflow SDK) keyed on the verified WhatsApp number, surviving waits of days and resuming cleanly after failure or redeploy, with idempotent handling of inbound events.
- **Connect-brokered access to the ATS and Outlook.** Short-lived, least-privilege, scoped credentials through a reusable broker (ADR 0009), audit-logged on every issuance and use, replacing the Phase 0 one-off round-trip.
- **Scheduled digests, nudges, and stall flags.** A morning pipeline digest for recruiters, slot-confirmation and outstanding-document chasers for candidates, and stall detection that flags inactive candidates or stakeholders to the responsible human, all on Cron.
- **Internal access through the Phase 0 auth interface.** The dev credential provider for browser and HTTP recruiter tooling, role-mapped to recruiter and hiring-manager, plus channel-bound identity resolution for Teams (ADR 0011), both behind the same interface.
- **Live channel ingress.** The Phase 0 intake placeholder becomes the working application-intake and WhatsApp webhook surface, still behind WAF and Bot ID, with inbound webhooks verified as authentic (ADR 0010).

### Excludes, pushed to a named phase

- Any model call, AI Gateway routing, PII redaction before a model call, or provider-allowlist enforcement, and therefore any CV or document parsing, scoring, or shortlisting. Phase 2. Phase 1 must not create a candidate-PII-to-model flow.
- Issuing or marking take-home or skills assessments, the Sandbox, and queues for absorbing application or submission floods. Phase 3. Phase 1 targets ordinary application volume; spike handling is Phase 3.
- The reporting dashboard and any warehouse read path. Phase 4.
- The Entra cutover: the real Passport provider implementation, putting Passport in front of internal surfaces, and decommissioning the dev provider. Phase 5. Internal access in Phase 1 stays dev-credential and channel-mapping only, in a non-production environment.
- Any decision or outcome status change to a candidate (advance to a hiring stage, reject, shortlist, offer). Forbidden by ADR 0004 in every phase. The agent does logistics only (ADR 0012).

## Dependencies

### Inward (what Phase 0 must already provide)

- A deploying eve project on Vercel through a working CI pipeline, with preview and production environments and per-environment secrets.
- The auth interface (ADR 0003) with a working dev credential provider, role mapping, stateless signed sessions (ADR 0008), and the production-refusal guard, plus a booting agent reachable behind a route guard.
- A proven Connect credential round-trip against one real system, to extend into the reusable broker (ADR 0009).
- The public intake placeholder behind WAF and Bot ID, to make live.
- The eval and tracing harness running in CI as a real gate on an empty suite, to exercise with Phase 1 logistics checks and full candidate-journey traces.

### Outward (what Phase 1 leaves for later)

- To Phase 2: the durable workflow, channels, Connect broker, tracing, and audit trail as the substrate that screening and shortlisting plug into. Phase 1 deliberately leaves all reasoning, redaction, and the provider allowlist to Phase 2.
- To Phase 3: the channels and workflow as the path for issuing and receiving assessments, and the Connect and audit patterns. Phase 1 leaves marking, the Sandbox, and flood queues to Phase 3.
- To Phase 5: the channel-identity mapping (ADR 0011) whose source becomes Entra claims, with no change downstream of the interface.

## User stories by persona

### Candidate (WhatsApp)

- As a candidate, when I apply I get a prompt acknowledgement on WhatsApp that names the role, so I know my application landed.
- As a candidate, I can ask common questions about the role and the process and get accurate answers, or be handed to a human when the agent cannot help, so I am not stuck talking to a wall.
- As a candidate, I can see which documents are still outstanding and submit them on WhatsApp.
- As a candidate, I can choose an interview slot that suits me, get a confirmation, and receive a reminder before it.
- As a candidate, I can reach a human easily whenever I want to.

### Recruiter (Teams and internal tooling)

- As a recruiter, I get a morning digest of my pipeline (who is where, what is outstanding, what has stalled) so I can act without trawling the ATS.
- As a recruiter, I am notified when a candidate submits documents or books or changes a slot.
- As a recruiter, I am flagged when a candidate or a stakeholder has stalled beyond the threshold, so I can step in.
- As a recruiter, I can take supported logistics actions (claim a handover, trigger a re-invite, snooze a flag) from Teams, and reach recruiter tooling behind a role-gated dev login.

### Hiring manager (Teams)

- As a hiring manager, I can supply or confirm interview availability, so candidate bookings land on the right calendar at a time I can make.
- As a hiring manager, I am notified of upcoming interviews and of stalls that need my input.

### Engineer

- As an engineer, I can trace a single candidate's workflow end to end (inbound events, waits, retries, Connect calls, outbound messages) to debug a stuck conversation.
- As an engineer, I can inspect and, where needed, manually advance or terminate a workflow without a redeploy and without losing candidate state.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. Candidate conversation (WhatsApp)

- **A1 (P0).** A new application produces a WhatsApp acknowledgement that names the role, within an agreed short window. Acceptance: applying triggers an acknowledgement referencing the role.
- **A2 (P0).** The candidate can get answers to a curated set of common role and process questions through structured prompts, with no model interpretation of free text. Acceptance: selecting a listed question returns its curated answer; an unrecognised free-text message is met with options or a handover offer, never a fabricated answer.
- **A3 (P0).** At any point the candidate can reach a human, and the conversation hands over (a recruiter-visible flag is raised and automated prompts on that thread pause). Acceptance: a handover request raises the flag and suspends automation on that thread.
- **A4 (P1).** Outbound automated messages observe configured quiet hours and frequency caps. Acceptance: automated messages are not sent outside quiet hours and respect the cap.
- **A5 (P1).** An opt-out or stop request halts automated messaging and flags a human. Acceptance: after opt-out, no further automated messages are sent and a human is notified.

### B. Document collection

- **B1 (P0).** The agent tells the candidate which documents are outstanding and accepts them over WhatsApp. Acceptance: outstanding documents are listed; an uploaded document is acknowledged and recorded as received.
- **B2 (P0).** Received documents land in the system of record (ATS or Azure), not in a durable store owned by the agent (ADR 0006). Acceptance: a received document appears on the candidate's ATS record or the designated Azure store via Connect; the agent does not become the durable store.
- **B3 (P0).** The agent validates presence and basic format only, not content. Acceptance: a missing or wrong-type submission is re-requested; document contents are not parsed or interpreted (that is Phase 2).
- **B4 (P1).** Document-collection state survives multi-day waits. Acceptance: a submission days later resumes the same workflow and updates the outstanding-items state.

### C. Interview scheduling against Microsoft 365 calendars

- **C1 (P0).** The agent offers slots derived from the relevant interviewer or hiring-manager calendar availability and books the chosen slot. Acceptance: offered slots reflect real availability; booking creates a calendar event via Connect.
- **C2 (P0).** The booked event lands on the correct Outlook calendar with candidate and interviewer detail, and the candidate is confirmed. Acceptance: the event exists on the intended calendar; the candidate receives a confirmation.
- **C3 (P0).** Reschedule and cancellation are handled cleanly. Acceptance: a candidate or recruiter reschedule moves or cancels the event and re-confirms, leaving no orphaned events.
- **C4 (P1).** Slot contention does not cause double-booking. Acceptance: two candidates cannot take the same unique slot; a taken slot is no longer offered.
- **C5 (P1).** Times are correct for the South African locale. Acceptance: slots and confirmations show correct SAST times.

### D. Recruiter and hiring-manager interaction (Teams)

- **D1 (P0).** Recruiters and hiring managers interact with the agent in Teams, gated by role (ADR 0011). Acceptance: a mapped recruiter or hiring manager can issue supported requests; an unmapped Teams user is refused or ignored.
- **D2 (P0).** The agent notifies the right recruiter on key logistics events (documents received, slot booked or changed, handover requested, stall flagged). Acceptance: each event produces a Teams notification to the correct recipient.
- **D3 (P0).** A hiring manager can supply or confirm interview availability that scheduling then uses. Acceptance: provided availability constrains the slots offered to candidates.
- **D4 (P1).** Recruiters can take supported logistics actions from Teams (claim a handover, trigger a re-invite, snooze a stall flag). Acceptance: the action changes the workflow's behaviour accordingly.

### E. Durable per-candidate workflow

- **E1 (P0).** Each candidate runs as a durable workflow keyed on the verified WhatsApp number, surviving waits of days. Acceptance: a workflow paused for a multi-day wait resumes correctly.
- **E2 (P0).** The workflow resumes cleanly after a failure or redeploy without losing state or repeating completed actions. Acceptance: a failure mid-step resumes without re-sending completed messages or double-booking.
- **E3 (P0).** Inbound events are idempotent and correlated to the right candidate (ADR 0010). Acceptance: a duplicate delivery creates no second workflow and no duplicate side effects.
- **E4 (P1).** A workflow can be inspected and, if needed, manually advanced or terminated. Acceptance: a stuck workflow can be observed and intervened on without a redeploy.

### F. Connect-brokered ATS and calendar access

- **F1 (P0).** All ATS and calendar access uses short-lived, scoped credentials through the reusable broker, not the Phase 0 one-off and not static credentials (ADR 0009). Acceptance: each external call uses a freshly brokered scoped credential; no long-lived static credential sits in application code.
- **F2 (P0).** Every credential issuance and use is audit-logged (who, what, when, scope, target). Acceptance: an auditable record exists for every brokered access.
- **F3 (P0).** Scopes are least-privilege per operation. Acceptance: a calendar-read operation cannot write the ATS, and so on.
- **F4 (P1).** Credential failures degrade gracefully. Acceptance: a transient Connect failure retries or surfaces to a recruiter and does not drop the candidate or corrupt the workflow.

### G. Scheduled digests, nudges, and stall flags

- **G1 (P0).** A scheduled recruiter pipeline digest is delivered, summarising each recruiter's active candidates, outstanding items, and stalls. Acceptance: the digest arrives on schedule with correct per-recruiter content.
- **G2 (P0).** Candidates with unconfirmed slots or outstanding documents are nudged on a defined cadence within courtesy limits. Acceptance: an unconfirmed candidate is nudged per the cadence; nudges stop on completion or opt-out.
- **G3 (P0).** Stalls (a candidate or stakeholder inactive beyond the threshold) are detected and flagged to the responsible human. Acceptance: a party past the threshold is flagged to the right recruiter or hiring manager.
- **G4 (P1).** Digest timing, nudge cadence, quiet hours, and stall thresholds are configurable without a code change. Acceptance: changing the configured value changes behaviour.

### H. Internal access and roles

- **H1 (P0).** Internal browser and HTTP recruiter tooling sits behind the Phase 0 auth interface using the dev credential provider, role-gated to recruiter and hiring-manager (ADR 0003). Acceptance: a role-mapped dev login reaches recruiter tooling; an unauthenticated or wrong-role request is refused.
- **H2 (P0).** Teams interactions are authorised by resolving the Teams sender to an internal role behind the same interface (ADR 0011). Acceptance: a mapped Teams user resolves to a role; an unmapped one is refused; the mapping is configuration, swappable to Entra in Phase 5.
- **H3 (P0).** The dev provider still refuses to start in production (ADR 0003); Phase 1 runs in a non-production environment. Acceptance: a production-configured boot refuses; Phase 1 deploys to the pilot environment.
- **H4 (P1).** Roles are least-privilege across surfaces. Acceptance: where recruiter and hiring-manager actions differ, each role is gated to its own.

### I. Channel ingress and edge

- **I1 (P0).** The Phase 0 intake placeholder becomes the live application-intake and WhatsApp webhook surface, still behind WAF and Bot ID. Acceptance: real inbound WhatsApp events are received and processed; the edge protection remains.
- **I2 (P0).** Inbound webhooks (WhatsApp, Teams) are verified as authentic before processing (ADR 0010). Acceptance: an unsigned or forged webhook is rejected; only verified provider events are processed.
- **I3 (P1).** Malformed or replayed events are handled safely. Acceptance: a malformed or replayed event neither crashes the agent nor duplicates side effects.

### J. Observability and audit

- **J1 (P0).** Every candidate workflow is traceable end to end on the Phase 0 harness. Acceptance: an engineer can replay a single candidate's journey (events, waits, retries, Connect calls, outbound messages) from traces.
- **J2 (P0).** A durable audit trail records the agent's logistics actions and Connect accesses. Acceptance: the trail reconstructs what the agent did for a candidate and when (compliance, ADR 0004 and 0006).
- **J3 (P1).** The Phase 0 eval gate gains Phase 1 logistics checks. Acceptance: CI runs deterministic logistics evals (for example FAQ routing correctness, no fabricated answers, no double-booking) and a regression fails the build. Bias and disparate-impact evals remain Phase 2, since there is no screening here.

### K. Data-handling boundary

- **K1 (P0).** The agent makes logistics writes only and never a decision or outcome status change (ADR 0004 and 0012). Acceptance: no candidate decision status is changed by the agent; a forward stage move is a human action.
- **K2 (P0).** Candidate PII stays in the system of record; the agent holds only minimal operational and correlation state (ADR 0006). Acceptance: the agent's workflow store holds keys and logistics state, not a duplicate candidate record; documents land in the ATS or Azure.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The candidate channel** (Chat SDK, WhatsApp) carries inbound candidate messages and documents to the webhook surface and outbound acknowledgements, prompts, document requests, slot offers, confirmations, nudges, and handover notices.
- **The internal channel** (Chat SDK, Teams) carries recruiter and hiring-manager messages, availability, and actions, and outbound notifications, digests, and stall flags. It is role-gated through channel-identity resolution.
- **The per-candidate durable workflow** (Workflow SDK) is the spine. It orchestrates the conversation, document collection, scheduling, waits, and retries; calls the Connect broker; and emits traces and audit records.
- **The Connect broker** (ADR 0009) mints scoped, short-lived credentials for the ATS and Microsoft 365 calendars and is the only path to those systems. Every issuance and use is audit-logged.
- **External systems** are the ATS (candidate logistics fields and application status read, document attachment, logistics annotations) and Microsoft 365 Outlook calendars (availability read, event create, update, cancel).
- **The schedules** (Cron) drive three jobs: the recruiter digest to Teams, candidate nudges through the workflow, and stall detection to Teams flags.
- **The auth interface** (Phase 0) fronts every internal surface: the dev credential provider for browser and HTTP tooling, and channel-identity resolution for Teams, both returning id, email, and roles.
- **The edge** (WAF and Bot ID) sits in front of the now-live webhook and intake surface; webhook authenticity is verified at ingress.
- **The observability harness** (Phase 0) traces every workflow path, runs the Phase 1 logistics evals as a CI gate, and holds the audit trail.

How they connect: an application arrives at the live intake and webhook surface behind WAF and Bot ID, and the event, once verified, starts or advances that candidate's durable workflow. The workflow converses over WhatsApp, requests documents, and offers slots; it uses Connect-brokered credentials to read calendar availability, write events, attach documents, and read ATS status; and it notifies recruiters and hiring managers in Teams. Cron jobs read pipeline state to send the digest, nudges, and stall flags. Every step emits traces and audit records.

## Integration points and boundary contracts

Named contracts, not schemas.

- **WhatsApp (Chat SDK, WhatsApp Business API).** In: candidate messages, document media, delivery and read receipts. Out: agent messages, structured prompts, requests for documents. Crossing the boundary: candidate-provided personal information and documents transit Meta's WhatsApp Business API and Vercel, transiently. Webhooks are verified (ADR 0010). Meta is a processor in the candidate data path (open question, legal).
- **Teams (Chat SDK, Microsoft bot and Graph).** In: recruiter and hiring-manager messages, availability, and actions. Out: notifications, digests, and stall flags. Crossing the boundary: internal user identity (Teams or Azure AD id and email) and pipeline summaries that reference candidates. Sender identity is mapped to roles by the channel-identity resolver (ADR 0011).
- **ATS (Connect).** In: the candidate logistics fields a step needs, application or pipeline status (read), the outstanding-document list, interviewer assignment. Out: document attachments, contact and logistics annotations, audit records. Scopes: read logistics fields, write a document attachment, write a logistics annotation. No decision-status write (ADR 0004 and 0012). No broad grant.
- **Microsoft 365 Outlook calendars (Connect).** In: interviewer or hiring-manager free and busy availability. Out: interview event create, update, cancel on the designated calendar. Scopes: calendar free and busy read, calendar event write, least-privilege.
- **Cron (eve).** Triggers the digest, nudge, and stall jobs on schedule; no external data crosses beyond what those jobs read and write through the contracts above.
- **Observability backend.** Out: traces and spans, and durable audit records.

At every boundary the agent pulls only the fields a logistics step needs (for example the candidate's WhatsApp number, the role, the outstanding-document list, the interviewer's calendar) rather than whole candidate records, and pushes documents to the system of record rather than retaining them (ADR 0006).

## Data handling and compliance

- **Personal information touched:** the candidate's WhatsApp number (their identity), the name and contact used to message them, the documents they submit, interview times, and recruiter and hiring-manager identities. There is no CV parsing and no model call, so the redaction-before-model path is not exercised in Phase 1; that is Phase 2. ADR 0006 still governs: minimise the fields pulled, keep the system of record in the ATS or Azure, and push documents there rather than holding them.
- **No model flow:** Phase 1 must not create a candidate-PII-to-model flow. None exists by design, and the provider allowlist and redaction enforcement land in Phase 2.
- **New channel processors:** candidate messages and documents transit Meta's WhatsApp Business API and Vercel, and internal traffic transits Microsoft Teams and 365. This is a new data flow relative to Phase 0 (which had no channel). It needs legal sign-off on the POPIA basis and consent capture at application, and acceptance of Meta and Microsoft as processors in the candidate data path (open question, legal). Microsoft 365 is already the corporate estate, so it carries less novelty.
- **Writes:** logistics only (ADR 0004 and 0012). The agent never changes a decision or outcome status. Documents land in the system of record (ADR 0006).
- **Audit:** a durable, queryable trail of the agent's logistics actions and Connect accesses. ADR 0004's traceability requirement applies even though there are no recommendations yet: every action the agent takes on a candidate is reconstructable.
- **Environment posture:** because the dev provider cannot run in production (ADR 0003), Phase 1 runs in a non-production pilot environment, consistent with the PRD's "non-production-exposed environment". Running real, bounded candidate data through that environment is an open question for security and legal; the same data controls (ADR 0006, Connect, audit) apply regardless of environment label.
- **Beta components (ADR 0005):** Connect and Chat SDK are used on the same basis as Phase 0, permitted as long as they are public beta or GA, not private beta.

## Access and identity

- **Active provider for browser and HTTP tooling:** the dev credential provider (ADR 0003 and 0008). Roles: recruiter and hiring-manager, plus the internal engineering role carried from Phase 0.
- **Teams authorisation:** the channel-identity resolver maps a Teams sender to an internal role behind the same interface (ADR 0011), configuration-driven now and swappable to Entra group or app-role claims in Phase 5.
- **Candidate identity:** the verified WhatsApp number, with no login (ADR 0003), used as the workflow correlation key.
- **What is gated:** all recruiter and hiring-manager tooling and Teams actions are role-gated; the candidate WhatsApp channel is open (identity is the verified number); the webhook and intake surface is public but edge-protected and webhook-verified.
- **Production refusal:** the dev provider still fails closed in production (ADR 0003), so Phase 1 is non-production.
- **Sessions:** stateless signed sessions for browser tooling (ADR 0008).

## Observability, evals, and tracing

- **Tracing:** every candidate workflow is fully traceable on the Phase 0 harness, so an engineer can replay one candidate's journey across inbound events, waits, retries, Connect calls, and outbound messages.
- **Audit trail:** a durable, queryable record of the agent's logistics actions and Connect accesses, supporting the compliance posture.
- **Evals:** Phase 1 exercises the Phase 0 gate with deterministic logistics checks (FAQ routing correctness, unrecognised input handed over rather than answered, scheduling correctness including no double-booking, nudge and stall logic), so the harness is proven beyond empty. Bias and disparate-impact evals stay in Phase 2, since Phase 1 runs no screening.
- **Feeds Phase 2:** the tracing and audit substrate carries forward to per-recommendation traces, and the now-exercised eval gate is ready for the screening and bias evals ADR 0004 requires.

## Risks and mitigations

- **Candidate experience.** A deterministic, menu-driven WhatsApp agent with no free-text understanding can feel like a wall (a PRD key risk). Mitigation: an obvious, easy human handover, structured quick replies, conservative automation, and clear "a human will follow up" fallbacks.
- **Channel and processor compliance.** Candidate documents and messages transit Meta's WhatsApp infrastructure. Mitigation: legal sign-off on the POPIA basis and consent at application, minimise what the channel holds, and push documents to the system of record promptly.
- **Beta maturity.** Phase 1 builds real logistics on young software (Connect, Chat SDK, Workflow SDK, eve). Mitigation: keep the broker thin and well-traced, make workflows idempotent, degrade Connect failures gracefully, and hold fallbacks for regressions.
- **Durable-workflow correctness.** Multi-day waits plus redeploys risk lost or duplicated actions. Mitigation: idempotency keys on inbound events and side effects, resume-safe steps, engineer inspect-and-advance tooling, and tracing.
- **Calendar contention.** Concurrent candidates could double-book. Mitigation: re-check availability and lock the slot at booking, guarantee unique slots, and reconcile on conflict.
- **Identity-mapping drift before Entra.** The Teams role mapping is configuration and could go stale or over-permissive. Mitigation: least-privilege roles, keep the mapping the only thing Phase 5 swaps, and audit Teams actions.
- **Environment posture.** Real candidates interact with a non-production environment because the dev provider cannot run in production. Mitigation: treat the pilot environment as production-grade operationally (secrets, monitoring, data controls), bound the pilot cohort, and resolve the security and legal open question before widening.
- **Scope creep into reasoning.** Pressure to add "just a little" natural-language understanding or to peek at CV content will appear. Mitigation: no model calls in Phase 1 is a hard boundary; any model call needs the Phase 2 gateway, redaction, and allowlist, and pulling it forward would need an ADR.
- **Over-messaging.** Nudges and reminders could spam candidates. Mitigation: quiet hours, frequency caps, and opt-out handling.
- **Volume.** A popular role could spike inbound traffic. Phase 1 targets ordinary volume; flood queues are Phase 3. Mitigation: state the boundary, ensure backpressure that does not drop candidates without building Phase 3 queues, and flag if pilot volume approaches limits.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- Phase 1 makes no model calls. Candidate questions are answered deterministically from a curated FAQ with structured replies, and anything off-script is handed to a human. Free-text natural-language understanding is Phase 2.
- Phase 1 runs in a controlled, non-production pilot environment, consistent with the dev provider's production-refusal (ADR 0003) and the PRD's "non-production-exposed environment". The Entra-fronted production environment is lit at Phase 5.
- The ATS exposes the reads and writes the logistics flow needs through Connect (status read, document attachment, logistics annotation), and the Microsoft 365 calendars expose free and busy availability and event write. The specific ATS is a PRD-recorded blocking open question.
- Documents land in the system of record (ATS or Azure); the agent does not become a durable document store.
- The corporate WhatsApp Business API account (Meta) and a Teams app registration are available or provisioned at phase start, analogous to Phase 0's external prerequisites.
- Connect and Chat SDK are public beta or GA at build start, so they are permitted by ADR 0005.
- "Recruiter tooling reached through the auth interface using a role-mapped dev login" is a thin internal surface that extends Phase 0's authenticated endpoint into role-gated recruiter logistics operations, distinct from the Teams conversational surface.
- Phase 1 targets ordinary application volume; absorbing floods is Phase 3.

## Open questions

Tagged by owner, and blocking or non-blocking for this spec. Each carries a best-judgment answer (the working decision). Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation; two facts (the ATS identity, the legal basis) remain genuine external unknowns and are answered with a posture and a fallback, not invented detail.

- **Which ATS is in use, and does it expose the calendar, status, and document APIs the workflow needs through Connect?** (Engineering, stakeholder. Blocking for the build, per the PRD; non-blocking for this city-map spec, which names the contracts ATS-agnostically.)
  Answer: The ATS must be named by the stakeholder; it cannot be guessed, and it stays the one true build blocker for the ATS integration. Posture: the spec stays ATS-agnostic, and the ATS integration does not start until the ATS is named and confirmed to expose, through Connect, the reads and writes the flow needs (status read, document attachment, logistics annotation, interviewer assignment). Fallback for the pilot if the ATS has no usable API or Connect connector: run logistics on Microsoft 365 alone (calendars plus a designated SharePoint or Azure document store as the system of record for documents), and defer ATS write-back to a manual or later step. This keeps the pilot unblocked without weakening ADR 0006.
- **What is the POPIA basis and consent-capture approach for routing candidate messages and documents through WhatsApp and Meta, and are Meta and Microsoft accepted as processors in the candidate data path?** (Legal. Blocking before real candidates; non-blocking for the spec.)
  Answer (needs sign-off): Lawful basis is the candidate's consent for recruitment logistics, supported by legitimate interest in running their application. Capture explicit opt-in at first contact: the candidate's first WhatsApp interaction presents a short notice (purpose, that Meta carries the messages and Microsoft hosts the calendars and store, a link to the full privacy notice) and proceeds only on opt-in; an opt-out stops processing (requirement A5). Meta (WhatsApp Business API) and Microsoft are processors (operators under POPIA) under signed operator agreements. Minimise what transits the channel: push documents to the system of record promptly and do not retain message bodies beyond operational need. Legal signs this off before any real candidate is onboarded.
- **Is a deterministic, no-model candidate conversation acceptable for the Phase 1 candidate experience, or is lightweight natural-language understanding required?** Lightweight understanding would pull the Phase 2 gateway, redaction, and allowlist forward and need an ADR. (Stakeholder, engineering. Non-blocking; the spec defaults to deterministic.)
  Answer: Deterministic for Phase 1. Menus, quick replies, and a curated FAQ, with prominent, easy human handover for anything off-script (requirements A2, A3). This holds the hard no-model boundary and keeps the phase near-zero legal risk; the candidate-experience risk is carried by the handover, not by understanding free text. If the pilot shows the menu approach frustrates candidates, revisit in Phase 2 where the gateway, redaction, and allowlist exist, not by pulling model calls into Phase 1.
- **Is running real but bounded candidate data through a non-production pilot environment acceptable to security and legal, given the dev provider cannot run in production?** (Security, legal. Non-blocking for the spec; resolve before the pilot.)
  Answer (needs sign-off): Yes, under conditions. "Non-production" refers to the identity layer (the dev provider, not Entra), not to operational rigour. Run the pilot in a dedicated, operationally hardened environment (per-environment secrets, full audit, least-privilege Connect scopes, monitoring) that is not the Vercel production environment, so the dev provider may run there. Restrict it to a bounded, consented candidate cohort and a small set of named pilot recruiters. Real candidate PII is acceptable under the ADR 0006 controls given that tight access limit and consent (see the POPIA answer above). Widen beyond the pilot cohort only after the Entra cutover (Phase 5) or explicit security and legal sign-off.
- **Do the four proposed ADRs (0009 Connect broker, 0010 webhook ingress verification, 0011 channel-identity resolution, 0012 the write boundary) get accepted as proposed?** (Engineering, security, legal. Non-blocking for the spec; they block building those areas exactly as specified.)
  Answer: Accept all four as proposed (needs sign-off). 0009 gives one audited, least-privilege path to external systems; 0010 stops forged or replayed events driving the agent; 0011 role-gates Teams now and keeps the Phase 5 Entra swap a change of mapping source only; 0012 lets logistics writes proceed while keeping ADR 0004's human gate intact. Flip all four to Accepted in the register before building those areas.
- **Who are the named recruiters and hiring managers, what is the Teams-sender-to-role mapping, and what is the interviewer and calendar assignment per requisition?** (Stakeholder. Non-blocking for the spec; needed to configure the pilot.)
  Answer: The names come from the stakeholder; this spec fixes the structure. A versioned configuration (not code) maps a Teams sender identity (email or Azure AD id) to a role (recruiter or hiring-manager), and a per-requisition assignment names the interviewer(s) and the calendar(s) bookings land on. Start the pilot small: 1 to 2 requisitions, 1 to 2 recruiters, and the relevant hiring managers. The mapping is the only thing Phase 5 swaps to Entra groups (ADR 0011). Stakeholder supplies the names before the pilot; engineering owns the config shape.
- **What are the digest timing, nudge cadence, quiet hours, and stall thresholds for the pilot?** (Stakeholder, recruiter operations. Non-blocking; sensible defaults are set in the spec and tuned in the pilot.)
  Answer: Defaults, all configurable (requirement G4), tuned in the pilot by recruiter operations. Recruiter digest: weekdays at 07:30 SAST. Candidate nudges: first nudge 24 hours after an item falls outstanding (unconfirmed slot or missing document), then every 48 hours, up to 3 nudges, then escalate to the recruiter as a stall flag. Quiet hours: no candidate messages 20:00 to 07:00 SAST, and none on Sundays or South African public holidays. Stall thresholds: a candidate inactive on a required action for 72 hours is flagged; a stakeholder (hiring-manager availability or interview confirmation) inactive for 48 hours is flagged.
- **Is the Phase 0 metrics baseline captured, so Phase 1's leading metrics (admin time, slot-confirmation rate and time, stall rate) are measurable?** (Data, stakeholder. Non-blocking for the spec; gating before Phase 1 ships, per the PRD.)
  Answer: It is gating for ship, not for build. Phase 1 build can proceed in parallel, but Phase 1 cannot be declared shipped and measured until the Phase 0 baseline artefact (`docs/metrics/baseline.md`) exists. After the pilot, re-measure admin time, slot-confirmation rate and time, and stall rate against that baseline using the same method, so the figures are comparable. Owner: TA operations and data.
- **Is there a hard external deadline (a hiring season or graduate intake) anchoring Phase 1?** (Stakeholder. Non-blocking.)
  Answer: None assumed. Proceed without a deadline anchor (per the PRD). Run the pilot on a steady-volume requisition, not a graduate intake, since high-volume floods are Phase 3 territory. If a graduate intake season does anchor the programme, treat it as a Phase 3 timing dependency (flood queues must land before that intake) and confirm it with the stakeholder; it does not change Phase 1.

## Done when (phase-level acceptance)

Phase 1 is done when all of the following hold together, proving the logistics slice end to end:

- A real candidate can apply through the live intake and WhatsApp webhook (behind WAF and Bot ID, with the webhook verified), receive an acknowledgement, ask common questions or reach a human, submit outstanding documents that land in the system of record, and book an interview that creates an event on the correct Outlook calendar with a confirmation, all driven by a durable per-candidate workflow that survives multi-day waits and resumes after failure without duplicating actions.
- Recruiters and hiring managers work the pipeline in Teams: role-gated, receiving the morning digest, event notifications, and stall flags, and providing interview availability that scheduling uses.
- The agent chases candidates and stakeholders on schedule (nudges and digests) within courtesy limits and flags stalls to the responsible human.
- All ATS and calendar access goes through the reusable Connect broker, least-privilege and audit-logged, and the agent makes only logistics writes and never a decision or status change (ADR 0004 and 0012).
- An authenticated internal user reaches role-gated recruiter tooling through the auth interface using a role-mapped dev login; the dev provider still refuses to start in production; Phase 1 runs in the non-production pilot environment.
- Every candidate journey is traceable end to end and reconstructable from the audit trail, and the eval gate runs the Phase 1 logistics checks (not bias, which is Phase 2) and blocks a regression.

Done is a working logistics slice that a candidate and a recruiter both feel, not a set of components that each pass in isolation.
