# Phase 2: Advisory CV parsing and shortlist preparation

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 2 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 2 adds reasoning to the pipeline, with the legal guardrails switched on before the agent touches a real candidate. On top of the Phase 1 logistics core, the agent parses CVs and supporting documents in the Sandbox (including scanned or photographed CVs read by a vision model), routes every model call through AI Gateway with direct identifiers redacted first and routing constrained to an approved-provider allowlist with pinned models, and assembles a ranked shortlist with visible reasoning that it posts to a named hiring manager in Teams with approve, reject, or adjust controls. It stands up the bias and disparate-impact evaluation suite as a CI release gate, and traces every recommendation so it is replayable candidate by candidate. It never changes a candidate's status. This is the highest-legal-risk phase, which is why the guardrails (human gate, redaction, allowlist, bias evals, tracing) are part of the phase, not bolted on after.

Binding ADRs: 0002 (the eve stack, so AI Gateway and the Sandbox come online this phase alongside the Phase 1 components), 0003 and 0008 (the swappable auth interface, the dev credential provider, stateless signed sessions, and the production-refusal rule, all still active), 0004 (human decides, agent prepares: the central constraint of this phase, and the source of the bias-eval and tracing prerequisites), 0005 (AI Gateway, the Sandbox, and any allowlisted provider or model must be public beta or GA, not private beta), 0006 (data minimisation: the central data constraint, redaction before model calls, an approved-provider allowlist with signed DPAs, pinned models, and the system of record staying put), 0007 (one repo), 0009 (the Connect broker, reused to read documents from the system of record and to write logistics annotations), 0010 (verified channel ingress, unchanged), 0011 (channel-bound identity, which gates the hiring manager who decides in Teams), 0012 (the logistics-phase write boundary), and 0001 (record any new architectural decision as an ADR). Four new decisions are proposed for this phase and referenced below, pending acceptance: ADR 0013 (screening and bias-evaluation policy, the evals ADR that ADR 0004 promised), ADR 0014 (brokered, redacting model access through AI Gateway), ADR 0015 (untrusted document parsing in the Sandbox), and ADR 0016 (the screening-phase decision gate and agent write boundary).

## Scope

### Includes, made concrete

- **Document parsing in the Sandbox.** CVs and supporting documents are parsed in the Sandbox (untrusted input by definition, ADR 0015), including scanned or photographed CVs read by a vision model. Parsing produces structured fields; document text is treated as data, never as instructions.
- **Redaction before any model call.** Direct identifiers are stripped before the call so the model sees the cleared residual (skills, experience, qualifications), not the candidate's identity (ADR 0006). Re-identification happens only on the human-facing side, by correlating to the opaque per-candidate workflow key, never inside the model.
- **Brokered model routing.** Every model call goes through one model-access broker over AI Gateway (ADR 0014): redaction applied and verified, the approved-provider allowlist enforced, the model pinned, and every call audit-logged. No application code calls a provider directly.
- **Advisory screening and shortlist preparation.** The agent assembles a ranked view of candidates against role-relevant criteria, with its reasoning, and posts it to the named hiring manager in Teams with approve, reject, or adjust controls. The ranking is advisory; the agent changes no status (ADR 0004, 0016).
- **The human decision gate.** The durable per-candidate workflow pauses at the decision gate. Only a named, role-resolved human's action advances it, and the decision (including any override of the agent's recommendation) is attributed and logged (ADR 0004, 0011, 0016).
- **Bias and disparate-impact evals as a CI gate.** A bias-evaluation suite measures disparate impact on screening and ranking outputs across designated groups and runs in CI as a release gate that blocks a failing release (ADR 0013). Screening does not run against real candidates until that suite exists and passes.
- **Per-recommendation tracing.** Every recommendation is traceable and replayable candidate by candidate: redacted inputs, the pinned model and version, the reasoning, the output, and the human decision and who made it (ADR 0004).
- **Optional sourcing and reference-check subagents.** Permitted only if a clear need is established and legal clears the new data flows, each with a narrow toolset, clean context, no decision authority, and the same redaction, allowlist, and gateway controls as the rest of the phase. Default is deferred (see open questions).

### Excludes, pushed to a named phase

- Any automated status change, rejection, shortlisting-as-status, auto-advance, or offer. Forbidden in every phase by ADR 0004; the screening-phase boundary is drawn by ADR 0016. The human gate is mandatory.
- Issuing or marking take-home or skills assessments, running submissions in the Sandbox, and queues for absorbing application or submission floods. Phase 3. Phase 2 uses the Sandbox for document parsing only and targets ordinary application volume.
- The reporting dashboard and any warehouse read path. Phase 4.
- The Entra cutover: the real Passport provider, putting Passport in front of internal surfaces, and decommissioning the dev provider. Phase 5. Internal access in Phase 2 stays dev-credential and channel-mapping only, in the non-production pilot environment.
- The agent recording a human-approved decision as an attributed status write. Explicitly out of this phase (ADR 0016); it would be a future ADR, not a quiet extension.

## Dependencies

### Inward (what Phase 0 and Phase 1 must already provide)

- From Phase 0: a deploying eve project on Vercel through CI, with preview and production environments and per-environment secrets; the eval and tracing harness running in CI as a real gate (the empty frame this phase fills with screening and bias evals and per-recommendation traces); the auth interface, dev provider, and roles; edge protection.
- From Phase 1: the durable per-candidate workflow keyed on the verified WhatsApp number, surviving multi-day waits and resuming after failure; the WhatsApp and Teams channels; the reusable Connect broker (ADR 0009) with audit logging; document collection that lands documents in the system of record (the documents Phase 2 parses); full candidate-journey tracing and the durable audit trail; channel-bound identity resolution for Teams (ADR 0011); and verified webhook ingress (ADR 0010). Phase 1 explicitly leaves all reasoning, redaction, and the provider allowlist to this phase.

### Outward (what Phase 2 leaves for later)

- To Phase 3: the Sandbox boundary (ADR 0015), the model-access broker (ADR 0014), and the per-recommendation tracing and audit substrate, all of which Phase 3 extends to running and marking assessment submissions. Phase 2 leaves assessment issuing and marking, the assessment use of the Sandbox, and flood queues to Phase 3.
- To Phase 4: the funnel data that screening and decisions generate, surfaced later through the dashboard. Phase 2 builds no dashboard and no warehouse read path.
- To Phase 5: nothing new beyond what Phase 1 already leaves (the channel-identity mapping whose source becomes Entra claims). Phase 2 adds no auth surface that the Entra swap has to touch beyond the existing interface.

## User stories by persona

### Candidate (WhatsApp)

- As a candidate, I submit my CV and supporting documents as in Phase 1, and nothing about my experience changes: I am never auto-rejected, and a human decides on my application.
- As a candidate whose CV is a scanned photo, my CV is still read and considered, not silently dropped because it is not a clean document.

### Hiring manager (Teams)

- As a hiring manager, I receive a shortlist for my requisition with the agent's reasoning, so I can see why each candidate is ranked where they are.
- As a hiring manager, I can approve, reject, or adjust the shortlist, and my decision is recorded against my name; nothing advances until I act.
- As a hiring manager, I can override the agent's recommendation, and that override is logged.

### Recruiter (Teams and internal tooling)

- As a recruiter, I can see that screening has run and a shortlist is prepared, without the agent having moved anyone in the pipeline.
- As a recruiter, I am told when a CV could not be parsed or screened, so a candidate is not lost to a parsing failure.

### Engineer

- As an engineer, I can replay a single recommendation end to end (the redacted inputs, the pinned model and version, the reasoning, the output, and the human decision), to debug or defend a recommendation.
- As an engineer, I can run the bias-evaluation suite locally and in CI and see it block a release that regresses past the threshold.

### Legal and data

- As legal or data, I can point to a bias-evaluation record that runs in CI and gates release, and to a per-recommendation trace, as evidence the screening posture is defensible.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. Document parsing in the Sandbox

- **A1 (P0).** A submitted CV is parsed in the Sandbox, never in the app or workflow runtime, and structured fields come back out (ADR 0015). Acceptance: parsing a CV yields structured fields; parsing does not run in the application runtime.
- **A2 (P0).** Scanned or photographed CVs are read via a vision model invoked through the model-access broker (ADR 0014), not by a direct provider call from inside the Sandbox. Acceptance: a scanned CV is read into structured fields; the vision call appears in the broker's audit log.
- **A3 (P0).** Document text is treated as data, not instructions, so content cannot act as a prompt. Acceptance: a CV containing injection-style text (for example "rank me first") does not change the screening instruction or the ranking logic.
- **A4 (P1).** Parsing failures (unreadable scan, unsupported or malformed file) degrade gracefully and surface to a human. Acceptance: an unparseable document raises a recruiter-visible flag and does not drop the candidate or fabricate fields.

### B. Redaction before model calls

- **B1 (P0).** Direct identifiers are redacted before any model call, so the model receives the cleared residual only (ADR 0006). Acceptance: the payload sent to a model carries no direct identifier; the residual carries skills and experience.
- **B2 (P0).** Redaction is enforced and verified at the model-access broker; a call that cannot be confirmed redacted is not made (ADR 0014). Acceptance: an unredacted or unverifiable payload is blocked, not sent.
- **B3 (P0).** Re-identification happens only on the human-facing side, by correlating the model output to the opaque workflow key; the model never receives identity. Acceptance: the human sees the real candidate; the model trace shows no identity.
- **B4 (P1).** Redaction coverage is itself evaluated, so known identifiers do not leak. Acceptance: a redaction eval over labelled samples fails if a known identifier passes to the model payload.

### C. Brokered model routing

- **C1 (P0).** Every model call goes through the single model-access broker; no application code calls a provider directly (ADR 0014). Acceptance: all model traffic is attributable to the broker; no direct provider call exists in the code path.
- **C2 (P0).** The broker enforces the approved-provider allowlist and refuses any provider not on it (ADR 0006, 0014). Acceptance: a call to an off-allowlist provider is refused.
- **C3 (P0).** The model is pinned, and the pinned model and version are recorded on every call (ADR 0006, 0014). Acceptance: each call's trace names the model and version; routing is not free.
- **C4 (P0).** Every model call is audit-logged (who, what task, when, model and version, redaction applied). Acceptance: an auditable record exists for every model call.
- **C5 (P1).** The broker degrades gracefully on provider or gateway failure. Acceptance: a transient failure retries or surfaces to a human and does not drop the candidate or fall back to an unredacted or off-allowlist call.

### D. Advisory screening and shortlist preparation

- **D1 (P0).** The agent assembles a ranked view of candidates against role-relevant criteria for a requisition, with reasoning for each placement. Acceptance: a shortlist exists with a visible reason per candidate.
- **D2 (P0).** Screening and ranking are advisory and change no candidate status (ADR 0004, 0016). Acceptance: producing a shortlist moves no candidate in the pipeline.
- **D3 (P0).** The shortlist is keyed to candidates by the opaque workflow key through the model path and re-identified only for the human view. Acceptance: the ranking the model produces references no identity; the hiring manager's view shows the real candidates.
- **D4 (P1).** Screening does not run for a requisition until the bias-evaluation record exists and passes (ADR 0004, 0013). Acceptance: with no passing bias-eval record, screening does not run against real candidates.
- **D5 (P1).** Re-screening on a materially updated CV or new document is handled cleanly. Acceptance: an updated CV produces a refreshed recommendation without duplicating or orphaning the prior one.

### E. The human decision gate (Teams)

- **E1 (P0).** The shortlist is posted to the named hiring manager in Teams with approve, reject, or adjust controls (ADR 0016). Acceptance: the hiring manager sees the shortlist, the reasoning, and the controls.
- **E2 (P0).** The durable workflow pauses at the gate and only a named, role-resolved human's action advances it (ADR 0011, 0016). Acceptance: nothing advances without a decision; an unmapped or unauthenticated actor cannot decide.
- **E3 (P0).** The human's decision, and any override of the agent's recommendation, is attributed to that person and logged (ADR 0004). Acceptance: the audit trail shows who decided what and when, and whether they overrode the recommendation.
- **E4 (P0).** Where moving a candidate is a status change in the ATS, that move remains a human action; the agent does not write the resulting decision status (ADR 0012, 0016). Acceptance: the agent writes no decision or outcome status; the named human performs the status move.
- **E5 (P1).** The control surface does not nudge toward acceptance: no decision is pre-selected, and the reasoning and any uncertainty are visible before a choice. Acceptance: the human must make an explicit choice; nothing is defaulted.

### F. Bias and disparate-impact evaluation

- **F1 (P0).** A bias-evaluation suite measures disparate impact on screening and ranking outputs across designated groups, using group labels held only in the eval harness and never passed to the screening model (ADR 0013). Acceptance: the suite reports a disparate-impact measure per designated group; the screening model receives no group label.
- **F2 (P0).** The suite runs in CI as a release gate and blocks a release that regresses past the threshold (ADR 0004, 0013). Acceptance: a prompt, model, or logic change that breaches the threshold fails the build.
- **F3 (P0).** Screening-quality checks (extraction correctness against a labelled set, ranking stability, no-fabrication) run alongside the bias gate. Acceptance: a regression in extraction or a fabricated field fails the relevant check.
- **F4 (P1).** The metric, designated groups, and threshold are the ones legal and data sign off, and are recorded with the suite. Acceptance: the suite names its metric, groups, threshold, and sign-off.

### G. Tracing and audit on recommendations

- **G1 (P0).** Every recommendation is replayable candidate by candidate: redacted inputs, pinned model and version, reasoning, output, and the human decision (ADR 0004). Acceptance: an engineer can reconstruct a single recommendation end to end from traces.
- **G2 (P0).** The audit trail records model access (ADR 0014) and the human decision gate (ADR 0016) alongside the Phase 1 logistics audit. Acceptance: the trail reconstructs what the agent recommended, what reached a model, and what the human decided, for a candidate.
- **G3 (P1).** Traces and the audit trail carry forward to Phase 3 without re-plumbing. Acceptance: a short note explains where assessment-marking traces will attach.

### H. Optional sourcing and reference-check subagents

- **H1 (P1).** If built, sourcing and reference-check subagents are advisory only, with a narrow toolset, clean context, no decision authority, and the same redaction, allowlist, gateway, and tracing controls as the rest of the phase. Acceptance: a subagent produces advisory input only, through the broker, traced, and changes no status.
- **H2 (P1).** If the new data flows they introduce (third-party referees, externally sourced candidate data) are not cleared by legal, the subagents are not built in this phase. Acceptance: absent legal clearance, the subagents are deferred and their absence does not block the phase.

### I. Data-handling boundary

- **I1 (P0).** The agent makes no decision or outcome status change; screening output is advisory (ADR 0004, 0012, 0016). Acceptance: no candidate decision status is changed by the agent.
- **I2 (P0).** Candidate PII stays in the system of record; the agent holds only minimal operational and correlation state and no duplicate candidate record (ADR 0006). Acceptance: parsed and redacted data is operational and transient; identity is not duplicated into an agent-owned durable store.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The Sandbox parsing surface** (ADR 0015) receives an untrusted document fetched from the system of record through the Connect broker, extracts structured fields (text, and vision reading for scanned CVs through the model-access broker), and returns structured fields to the workflow. It never runs in the app or workflow runtime.
- **The redaction step** (ADR 0006) sits between parsed structured data and any reasoning call. It strips direct identifiers and produces the cleared residual. It is enforced and verified inside the model-access broker.
- **The model-access broker** (ADR 0014) is the only path to a model. It applies and verifies redaction, enforces the allowlist, pins the model, audit-logs every call, and correlates inputs and outputs by the opaque workflow key.
- **The screening and shortlisting logic** takes the redacted residual and role criteria and produces a ranked view with reasoning, keyed by workflow id, re-identified only on the human-facing side.
- **The per-candidate durable workflow** (Phase 1, Workflow SDK) gains a screening branch and a decision-gate pause: it orchestrates parse, redact, screen, post to Teams, wait for the named human, and record the decision, emitting traces and audit records throughout.
- **The Teams surface** (Phase 1, Chat SDK) carries the shortlist, the reasoning, and the approve, reject, or adjust controls to the named hiring manager, role-gated through channel-identity resolution (ADR 0011).
- **The Connect broker** (Phase 1, ADR 0009) reads the candidate's documents from the system of record and writes logistics annotations (for example that screening ran or a shortlist was prepared). It writes no decision status.
- **The observability harness** (Phase 0) now holds the screening and bias evals as a CI release gate and the per-recommendation traces.

How they connect: a candidate's submitted document, already in the system of record from Phase 1, is fetched through the Connect broker and parsed in the Sandbox. The structured fields are redacted and sent, only through the model-access broker, to an allowlisted provider with a pinned model for extraction and screening. The workflow assembles a ranked shortlist with reasoning, posts it to the named hiring manager in Teams, and pauses at the decision gate. The named human approves, rejects, or adjusts; the decision is attributed and logged; and any status move is performed by the human, not the agent. Every model call and every recommendation is traced and audited, and the bias-eval suite gates release in CI.

## Integration points and boundary contracts

Named contracts, not schemas.

- **Connect to the system of record (ATS or Azure).** In: the candidate's submitted documents and the role-relevant logistics fields a screening step needs. Out: logistics annotations only (screening ran, shortlist prepared). Scopes: read documents and the needed fields, write a logistics annotation. No decision-status write (ADR 0004, 0012, 0016). Reuses the Phase 1 broker (ADR 0009).
- **Sandbox boundary** (ADR 0015). In: an untrusted document and a parse instruction. Out: structured extracted fields, not executable content and not raw document narrative as a prompt.
- **Model-access broker to an allowlisted provider** (ADR 0014, AI Gateway). Out: a redacted payload (the cleared residual) to a pinned model on an allowlisted, DPA-covered provider, for extraction, vision reading, or screening reasoning. In: the model's structured output, correlated by workflow key. Crossing the boundary: the cleared residual only, never direct identifiers, and only to a provider whose data-processing terms legal has signed.
- **Teams (Chat SDK) to the named hiring manager** (ADR 0011, 0016). Out: the shortlist, the reasoning, and the approve, reject, or adjust controls. In: a named, role-resolved human's decision. Crossing the boundary: candidate-referencing recommendation content to an authorised internal decision-maker; the decision and any override come back attributed.
- **Observability backend.** Out: per-recommendation traces (redacted inputs, pinned model and version, reasoning, output, human decision) and durable audit records. The bias-eval gate is internal to CI.

At every boundary the agent works on the fields a step needs and the cleared residual for any model call, never whole candidate records freely passed, and keeps identity in the system of record (ADR 0006).

## Data handling and compliance

This is the phase where candidate PII first meets a model, so the data posture is the heart of it.

- **Personal information touched:** the CV and supporting documents (dense personal data), the structured fields extracted from them, and the candidate's identity held in the system of record. The agent parses and redacts transiently and holds no duplicate candidate record (ADR 0006).
- **Redaction before model calls (ADR 0006, 0014):** direct identifiers (for example name, identity number, address, contact details, photograph, date of birth) are stripped before any model call, enforced and verified at the broker, which fails closed if it cannot confirm redaction. The model sees skills and experience, not identity. The exact field list is the redaction standard legal and data sign off (open question, blocking for build).
- **Allowlist and pinned models (ADR 0006, 0014):** routing is constrained to providers whose DPAs legal has signed, and the model is pinned. The allowlist must include a vision-capable model for scanned CVs and a text model for reasoning. The allowlist and DPAs are a legal sign-off (open question, blocking for build).
- **Untrusted input (ADR 0015):** documents are parsed in the Sandbox, and their text is treated as data, so a CV cannot inject instructions into screening.
- **POPIA section 71 and the Employment Equity Act (ADR 0004, 0013, 0016):** the human gate is mandatory and structural, screening is advisory only, the bias-evaluation suite must exist and pass before screening runs against real candidates, and every recommendation is traced. The agent changes no status.
- **The bias-measurement tension:** measuring disparate impact needs group membership, but the screening model must not see it (ADR 0006). Resolution: group labels live only in the eval harness on a controlled dataset and measure impact on outputs; they are never passed to the screening model (ADR 0013). That labelled dataset is itself sensitive and held under access control.
- **Residency (ADR 0006):** the accepted decision is data minimisation rather than residency, because bring-your-own-cloud is private beta (ADR 0005). If security or legal rules residency a hard line that minimisation plus DPAs cannot satisfy, that supersedes ADR 0006 and Phase 2 waits for BYOC GA (open question, the build go/no-go).
- **Environment posture:** Phase 2 runs in the non-production pilot environment, because the dev provider cannot run in production (ADR 0003), with the same operational rigour Phase 1 set (per-environment secrets, full audit, least-privilege scopes, monitoring) and a bounded, consented candidate cohort.
- **Beta components (ADR 0005):** AI Gateway and the Sandbox are used on the same basis as Connect and Chat SDK, permitted as long as they are public beta or GA, not private beta.

## Access and identity

- **Active provider for browser and HTTP tooling:** the dev credential provider (ADR 0003, 0008), with the recruiter, hiring-manager, and internal engineering roles carried from Phase 1.
- **The decision-maker:** the hiring manager who approves, rejects, or adjusts a shortlist acts in Teams, resolved to a named internal identity and role through channel-identity resolution (ADR 0011). The decision must be attributable to a specific named person (ADR 0004, 0016); an unmapped or unauthenticated Teams sender cannot decide.
- **Candidate identity:** the verified WhatsApp number, with no login (ADR 0003), still the workflow correlation key; the model never receives it.
- **What is gated:** the shortlist and the decision controls are role-gated to the requisition's named decision-maker; recruiter visibility is role-gated as in Phase 1; the candidate channel is unchanged.
- **Production refusal (ADR 0003):** the dev provider still fails closed in production, so Phase 2 stays non-production.
- **Sessions:** stateless signed sessions for browser tooling (ADR 0008), unchanged.

## Observability, evals, and tracing

- **Per-recommendation tracing (ADR 0004):** every recommendation is replayable candidate by candidate, capturing the redacted inputs, the pinned model and version, the reasoning, the output, and the human decision and who made it. Pinning the model is what makes a recommendation reproducible.
- **Bias and disparate-impact evals (ADR 0013):** the suite measures impact on outputs across designated groups from a controlled labelled dataset, runs in CI as a release gate, and blocks a release that regresses past the threshold. Screening does not run against real candidates until it exists and passes (ADR 0004).
- **Screening-quality evals:** extraction correctness against a labelled set, ranking stability, no-fabrication, and redaction coverage run alongside the bias gate, so a quality or leak regression is caught in CI too.
- **Audit:** model access (ADR 0014) and the decision gate (ADR 0016) join the Phase 1 logistics audit trail, so the full path from document to recommendation to human decision is reconstructable.
- **Feeds Phase 3:** the broker, the Sandbox boundary, and the tracing and audit substrate carry forward to assessment marking.

## Risks and mitigations

- **Bias and disparate impact.** The central legal risk of the programme. Mitigation: the bias-evaluation suite as a hard CI gate (ADR 0013), the mandatory human gate (ADR 0004, 0016), screening kept advisory, full per-recommendation tracing, and screening that does not run without a passing bias record.
- **Redaction leakage.** A name, identity number, photograph, or embedded identifier in scanned text could reach a model. Mitigation: redaction enforced and verified at the single broker, fail-closed on unverifiable redaction (ADR 0014), and a redaction-coverage eval over labelled samples (requirement B4).
- **Prompt injection from candidate content.** A CV crafted to manipulate the model. Mitigation: parsing isolated in the Sandbox with text treated as data, not instructions (ADR 0015), structured extraction, and the human gate as the backstop.
- **Rubber-stamping the recommendation.** A human gate that exists but is reflexively approved weakens the ADR 0004 guarantee in practice. Mitigation: present the reasoning and uncertainty, pre-select no decision, make override easy and logged (requirement E5), and measure approval and override rates in the pilot.
- **Scope creep into automated rejection.** A named programme risk, sharpest in this phase. Mitigation: ADR 0004, 0012, and 0016 hold; the agent writes no status, even after approval; any relaxation is a deliberate future ADR with legal sign-off.
- **Provider or model drift.** An off-allowlist provider or an unpinned model would break the minimisation and reproducibility posture. Mitigation: the broker enforces the allowlist and pins the model, config-controlled and audited (ADR 0014).
- **Parsing and vision failures.** Poor scans or malformed files. Mitigation: degrade gracefully and surface to a human; never drop a candidate or fabricate fields (requirement A4).
- **Beta maturity.** AI Gateway and the Sandbox are young (a PRD key risk). Mitigation: keep the broker and the Sandbox boundary thin and well-traced, degrade gracefully, hold fallbacks, and prove on a bounded pilot (ADR 0005).
- **Cost and latency at volume.** Vision and reasoning calls cost time and money. Phase 2 targets ordinary volume; floods are Phase 3. Mitigation: state the boundary and flag if pilot volume approaches limits.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- Phase 2 builds on Phase 1's durable workflow, channels, Connect broker, and tracing and audit substrate; it does not rebuild them.
- AI Gateway and the Sandbox are public beta or GA at build start, so they are permitted by ADR 0005.
- Re-identification is by correlation to the opaque per-candidate workflow key. The model never receives identity; identity stays in the system of record. This is the design that satisfies redaction without a fragile token map.
- Bias-evaluation group labels live only in a controlled eval dataset and are never fed to the screening model.
- The shortlist is an advisory artefact surfaced in Teams plus a logistics annotation; preparing it is not a pipeline status write (ADR 0012, 0016). Where the ATS models shortlisting as a status, the named human performs that move.
- Phase 2 still runs in the non-production pilot environment, with the same operational rigour and bounded, consented cohort as Phase 1.
- Sourcing and reference-check subagents default to deferred unless a clear need is established and legal clears the new data flows.
- Phase 2 targets ordinary application volume; absorbing floods is Phase 3.

## Open questions

Tagged by owner, and blocking or non-blocking for this spec. Each now carries a committed best-judgment decision to build against. Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation (the legal and data items in particular: the DPA chain, the redaction standard, and the bias metric and dataset are decisions a human owner must ratify, even though the working decision is fixed here).

- **What is the approved model-provider allowlist, and are the data-processing agreements signed for each?** (Legal. Blocking for the build, per the PRD; non-blocking for this city-map spec, which stays provider-agnostic.)
  Answer (needs sign-off): Start with a single approved provider, Anthropic, reached only through AI Gateway, with two pinned models: a multimodal model for reading scanned and photographed CVs (working pin: Claude Sonnet 4.6, `claude-sonnet-4-6`) and a text-reasoning model for screening and shortlist reasoning (working pin: Claude Opus 4.8, `claude-opus-4-8`). One provider keeps the signed-DPA chain to a single agreement, which is the tightest minimisation posture (ADR 0006), and Claude is multimodal so one provider covers both the vision and the reasoning task. Legal signs the Anthropic and AI Gateway data-processing terms (confirming no-training use and short retention) before any real candidate. The broker refuses any provider or model not on this list (ADR 0014). The pins are config-controlled: change them by config, and add a provider only with a new signed DPA, only if availability or resilience demands a second one. Owner: legal (the DPA), engineering (the allowlist config).
- **What is the redaction standard: which fields are stripped before a model call, and who signs off that the residual is acceptable under POPIA?** (Legal, data. Blocking for the build; non-blocking for the spec.)
  Answer (needs sign-off): Strip, before any model call, every direct identifier and obvious proxy: full name, identity or passport number, date of birth and age, photograph or face image, physical and postal address (including suburb or township, which proxies for area and demographics), phone number, email, social handles, and any explicit equity or designated-group field (race, gender, nationality, home language, marital status, disability). Keep the role-relevant residual the screening task needs: skills, qualifications, certifications, years and type of experience, employer and institution names, and job titles. Employer and institution names are kept because they are needed for relevance and are not direct identifiers; any disparate impact from a residual proxy is caught by the bias evals (ADR 0013), not by stripping fields the task depends on. Replace stripped identifiers with stable per-candidate placeholders so document structure survives for parsing. Record the standard as a versioned artefact at `docs/compliance/redaction-standard.md`, owned by legal and the data lead, who sign off that the residual is acceptable under POPIA. The broker enforces and verifies it and fails closed if it cannot (ADR 0014).
- **Who are the named human decision-makers per stage, and what are the approval thresholds?** (Stakeholder. Blocking for the build; non-blocking for the spec.)
  Answer: The named decision-maker per requisition is the hiring manager in the requisition configuration, extending the Phase 1 channel-identity mapping (ADR 0011); the assigned recruiter is the escalation and fallback contact. There is no automated approval threshold: the agent ranks, and the named human approves, rejects, or adjusts every shortlist (ADR 0004, 0016), with the decision attributed and logged. The shortlist surfaces a configurable top N candidates per requisition (working default: 10) with reasoning for each; the agent sets no pass or fail cut of its own. Start the pilot with the same 1 to 2 requisitions and people as Phase 1. Stakeholder supplies the names before the pilot; engineering owns the config shape.
- **Does security accept data minimisation plus DPAs as sufficient without bring-your-own-cloud, or is residency a hard line?** (Legal, security. The build go/no-go; non-blocking for the spec.)
  Answer: Proceed on data minimisation per accepted ADR 0006. Before the first real candidate's CV reaches a model, security and legal confirm that minimisation (redaction enforced at the broker) plus the signed DPA plus the pinned single-provider allowlist is acceptable without BYOC. If they rule residency a hard line that this cannot satisfy, do not proceed: raise a superseding ADR and wait for BYOC GA (the ADR 0006 fallback). This is the build go/no-go; the spec assumes the accepted position holds. Owner: security and legal.
- **Do the four proposed ADRs (0013 bias-eval policy, 0014 model-access broker, 0015 Sandbox parsing, 0016 screening-phase decision gate and write boundary) get accepted as proposed?** (Project lead, legal, engineering, security, data. Non-blocking for the spec; they block building those areas exactly as specified.)
  Answer: Accept all four as proposed (needs sign-off). 0013 gives the bias gate ADR 0004 requires; 0014 gives one audited, minimising model path; 0015 isolates untrusted parsing; 0016 keeps the human gate intact through the first screening phase and the agent writing no status. None contradicts an accepted ADR, and each is a genuine new decision the phase forces. Flip all four to Accepted in the register before building those areas. Owner: project lead, with legal, engineering, security, and data.
- **What is the disparate-impact metric, which designated groups are measured, what threshold blocks a release, and where does the labelled group-label dataset come from?** (Legal, data, engineering. Blocking for the build; non-blocking for the spec, which fixes the architecture in ADR 0013.)
  Answer (needs sign-off): Metric: the selection-rate ratio across designated groups (the four-fifths, 80 per cent, rule) as the primary gate, with the absolute selection-rate gap tracked alongside. "Selection" means appearing on or above the recommended shortlist. Groups: the Employment Equity Act designated groups, measured pairwise against the reference group: race (African, Coloured, and Indian designated against White), gender (women against men), and disability (people with disabilities). Threshold: a measured group's selection-rate ratio below 0.8 fails the release; 0.8 to 0.9 is a warn band that is logged but does not block. Dataset: a held-out, labelled evaluation set built from historical, de-identified application data, with designated-group labels drawn from the corporate's existing employment-equity self-declaration records; labels live only in the eval harness and never reach the screening model (ADR 0013). Working minimum: roughly 100 cases per group for a stable ratio, tuned by data. Legal and data own and sign off the final metric, groups, threshold, and the dataset's provenance and consent basis (it is sensitive data in its own right). Owner: legal, data, engineering.
- **Are sourcing and reference-check subagents in scope for Phase 2, or deferred?** (Stakeholder, legal. Non-blocking for the spec.)
  Answer: Out of scope for Phase 2; deferred to a later phase. They introduce new external personal-data flows (externally sourced candidate data, third-party referees) with their own POPIA bases, which the core screening slice does not need and which are not worth opening in the highest-legal-risk phase. Revisit only when there is a clear need and legal has cleared those flows; if ever built they remain advisory, narrow-toolset, decision-free, and run through the same redaction, allowlist, gateway, and tracing controls (requirements H1, H2, which stand as the bar if it is revisited). Owner: stakeholder, legal.
- **Is the Phase 0 metrics baseline captured, and how are Phase 2's effects measured?** (Data, stakeholder. Non-blocking for the spec.)
  Answer: As in Phase 1, the Phase 0 baseline artefact (`docs/metrics/baseline.md`) gates ship, not build. Phase 2's effect is measured in the pilot by: time from CV submission to shortlist ready (screening turnaround); hiring-manager decision time (shortlist posted to decision); the override rate (the proportion of recommendations the human changes or rejects, the key human-in-the-loop health signal); and recruiter screening admin time against the baseline. The bias-eval result is recorded per release. Compare against the Phase 0 baseline using the same method. Owner: TA operations and data.

## Done when (phase-level acceptance)

Phase 2 is done when all of the following hold together, proving the screening slice end to end rather than each piece in isolation:

- A submitted CV (including a scanned or photographed one) is parsed in the Sandbox, redacted before any model call, and a shortlist with visible reasoning appears in Teams for a named hiring manager to approve, reject, or adjust.
- Every model call goes through the model-access broker to an allowlisted, DPA-covered provider with a pinned model, with redaction applied and verified, and is audit-logged; no application code calls a provider directly.
- Every recommendation has a replayable trace (redacted inputs, pinned model and version, reasoning, output, and the human decision and who made it).
- The bias and disparate-impact evaluation suite runs in CI as a release gate and blocks a release that regresses past the threshold; screening does not run against real candidates until that record exists and passes.
- No candidate status changes without a named human's action; the agent writes no decision or outcome status (ADR 0004, 0012, 0016), and any override is logged.
- Phase 2 runs in the non-production pilot environment; the dev provider still refuses to start in production.

Done is a working, defensible screening slice that a hiring manager acts on and that legal can stand behind, not a set of components that each pass in isolation.
