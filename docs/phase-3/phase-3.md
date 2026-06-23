# Phase 3: Take-home and skills-assessment marking

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 3 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 3 extends the pipeline to assessment. On top of the Phase 1 logistics core and the Phase 2 screening slice, the agent issues a take-home or skills assessment to a candidate through the existing channels, runs and marks the submission in the Sandbox (never in the app runtime), and surfaces the result to the recruiter as advisory input to a human decision. It also stands up the spike-absorption the programme deferred to here: queues with backpressure so a popular role taking thousands of applications or submissions in a day is processed without falling over and without dropping candidates. Marking is advisory: there is no auto-pass and no auto-fail, the agent writes no candidate status, and the same legal guardrails Phase 2 switched on (isolation, redaction before model calls, bias evaluation as a CI gate, per-result tracing) apply to marking before it touches a real candidate. Running candidate-submitted work is the strongest isolation case in the system, which is why the Sandbox boundary is the heart of the phase.

Binding ADRs: 0002 (the eve stack, so the Sandbox, AI Gateway, Connect, Chat SDK, Workflow SDK, and Cron all carry forward), 0003 and 0008 (the swappable auth interface, the dev credential provider, stateless signed sessions, and the production-refusal rule, still active), 0004 (human decides, agent prepares: marking is advisory and the agent changes no status, the source of the bias-eval and tracing prerequisites for marking), 0005 (the Sandbox, AI Gateway, and any allowlisted provider, model, or queue component must be public beta or GA, not private beta), 0006 (data minimisation: submissions stay in the system of record, redaction before any marking model call, the pinned allowlist), 0007 (one repo), 0009 (the Connect broker, reused to read submissions and write logistics annotations), 0010 (verified channel ingress, unchanged), 0011 (channel-bound identity, which gates the recruiter who reads the mark), 0012 and 0016 (the logistics and screening write boundaries this phase builds on), 0013 (the screening bias policy, whose mechanism this phase extends to marking), 0014 (the model-access broker, reused for any marking model call), 0015 (the Sandbox parsing boundary, extended here to execution), and 0001 (record any new architectural decision as an ADR). Four new decisions are proposed for this phase and referenced below, pending acceptance: ADR 0017 (untrusted assessment execution and marking in the Sandbox), ADR 0018 (queue-based absorption of application and submission spikes), ADR 0019 (the assessment-phase decision gate and agent write boundary), and ADR 0020 (bias evaluation for assessment marking).

## Scope

### Includes, made concrete

- **Issuing an assessment.** The agent delivers a take-home or skills assessment to a candidate over the existing WhatsApp channel: the instructions, what to submit, and any deadline, with the same candidate-messaging discipline as Phase 1 (quiet hours, frequency caps, opt-out, easy human handover). Issuing is a logistics action driven by the candidate reaching the assessment stage; the agent does not decide on its own to advance a candidate into assessment (ADR 0004, 0012, 0016).
- **Receiving a submission.** The candidate submits their work through the existing channel; the submission lands in the system of record (the ATS or the designated Azure store), not in an agent-owned durable store (ADR 0006), exactly as documents do in Phase 1. Submissions are untrusted input by definition.
- **Running and marking in the Sandbox.** The submission is fetched through the Connect broker and run and marked inside the Sandbox, never in the app or workflow runtime, with no network egress and enforced resource and time limits (ADR 0017). Marking covers executable take-homes (run against a harness or rubric) and skills assessments (deterministic where the answers allow, model-assisted for free text). Any marking model call goes through the model-access broker (ADR 0014), so redaction, the allowlist, and pinning still apply.
- **Surfacing the result.** The marking result (a score or rubric outcome with its supporting evidence) is surfaced to the recruiter in Teams as advisory input, role-gated through channel-identity resolution (ADR 0011). It is input to a human decision, not a decision: no auto-pass, no auto-fail, no status write (ADR 0019).
- **Spike absorption.** Application intake (the Phase 1 path) and assessment submission marking are absorbed through a queue with backpressure (ADR 0018): candidates are acknowledged immediately and their heavy work is paced against the Sandbox and provider limits, fairly across requisitions, idempotently, with retry and a dead-letter path, so a flood is processed without dropping anyone.
- **Bias and quality evals for marking.** A bias-evaluation suite measures disparate impact on marking outcomes across designated groups and runs in CI as a release gate, extending the Phase 2 mechanism to marking (ADR 0020, building on ADR 0013). Marking does not run against real candidates until that suite exists and passes. Marking-quality checks (correctness, stability, no-fabrication) run alongside it.
- **Per-result tracing.** Every marking run is traceable and replayable candidate by candidate: the submission reference, what ran in the Sandbox, any pinned model and version used, the result and its evidence, and the human who acted on it (ADR 0004).

### Excludes, pushed to a named phase

- **Auto-pass and auto-fail, and any status change driven by a mark.** Forbidden in every phase by ADR 0004; the assessment-phase boundary is drawn by ADR 0019. The human gate is mandatory; a mark is advisory input only.
- **The reporting dashboard and any warehouse read path.** Phase 4. Assessment results become funnel data the dashboard later surfaces, but Phase 3 builds no dashboard and no warehouse read.
- **The Entra cutover:** the real Passport provider, putting Passport in front of internal surfaces, and decommissioning the dev provider. Phase 5. Internal access in Phase 3 stays dev-credential and channel-mapping only, in the non-production pilot environment.
- **A candidate-facing authenticated web surface.** Candidate identity stays the verified WhatsApp number with no login (ADR 0003, a programme non-goal). Assessment delivery and submission use the existing channel.
- **New screening or shortlisting logic.** Phase 2 owns CV parsing, screening, and shortlist preparation; Phase 3 adds assessment marking only and reuses the Phase 2 broker, Sandbox, tracing, and gate substrate.
- **Recording a human's acted-on assessment outcome as an attributed status write.** Out of this phase by ADR 0019; it would be a future ADR, not a quiet extension.

## Dependencies

### Inward (what earlier phases must already provide)

- **From Phase 0:** a deploying eve project on Vercel through CI with preview and production environments and per-environment secrets; the eval and tracing harness running in CI as a real gate (the frame this phase fills with marking evals and per-result traces); the auth interface, dev provider, and roles; edge protection.
- **From Phase 1:** the durable per-candidate workflow keyed on the verified WhatsApp number, surviving multi-day waits and resuming after failure; the WhatsApp and Teams channels with the candidate-messaging discipline (quiet hours, caps, opt-out, handover) and the nudge, stall-flag, and digest schedules; the reusable Connect broker (ADR 0009) with audit logging; document and file collection that lands input in the system of record; verified webhook ingress (ADR 0010); channel-bound identity resolution (ADR 0011); and full candidate-journey tracing and the durable audit trail.
- **From Phase 2:** the Sandbox boundary (ADR 0015) this phase extends to execution; the model-access broker (ADR 0014) with redaction, the allowlist, and pinning, reused for any marking model call; the bias-evaluation mechanism (ADR 0013) and the CI gate this phase extends to marking; the labelled-dataset and group-label handling pattern; the per-recommendation tracing substrate; and the redaction standard (`docs/compliance/redaction-standard.md`).

### Outward (what Phase 3 leaves for later)

- **To Phase 4:** the assessment results and decision data this phase generates, surfaced later through the dashboard. Phase 3 builds no dashboard and no warehouse read path.
- **To Phase 5:** nothing new beyond what Phase 1 already leaves (the channel-identity mapping whose source becomes Entra claims). Phase 3 adds no auth surface the Entra swap must touch beyond the existing interface.

## User stories by persona

### Candidate (WhatsApp)

- As a candidate, I receive a clear assessment with what to submit and by when, on the channel I already use, so I am not sent to a separate system I have to log into.
- As a candidate, I can submit my work over WhatsApp and get an acknowledgement that it arrived, so I am not left wondering.
- As a candidate applying to a popular role with thousands of others, I am still acknowledged promptly and not dropped, even if my result takes longer during a rush.
- As a candidate, I am never passed or failed by a machine: a human decides, and I can reach a human at any point.

### Recruiter (Teams and internal tooling)

- As a recruiter, I receive an assessment result with its reasoning and evidence as advisory input, so I can weigh it in my decision without the agent having moved the candidate.
- As a recruiter, I am told when a submission could not be marked, so a candidate is not lost to a marking failure.
- As a recruiter, during a flood I can see that submissions are queued and being worked through, and which are stalled or dead-lettered, so nothing disappears silently.

### Hiring manager (Teams)

- As a hiring manager, the assessment result feeds the same human decision I already make on a candidate; nothing advances or rejects automatically on a mark.

### Engineer

- As an engineer, I can replay a single marking run end to end (the submission reference, what ran in the Sandbox, any model call and its pinned model, the result and evidence, and who acted on it), to debug or defend a mark.
- As an engineer, I can run the marking bias-evaluation suite locally and in CI and see it block a release that regresses past the threshold.
- As an engineer, I can observe queue depth, age, and dead-letter counts during a spike and intervene on a stuck or repeatedly failing item without a redeploy.

### Legal and data

- As legal or data, I can point to a marking bias-evaluation record that runs in CI and gates release, and to a per-result trace, as evidence the assessment posture is defensible, the same way I can for screening.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. Assessment issuing and submission

- **A1 (P0).** The agent issues an assessment to a candidate over the existing channel once the candidate is at the assessment stage, with instructions, what to submit, and any deadline. Acceptance: a candidate at the assessment stage receives the assessment; issuing is a logistics step, not a per-candidate advancement decision by the agent (ADR 0004, 0012, 0016).
- **A2 (P0).** The candidate submits work through the existing channel and it is acknowledged. Acceptance: a submission is received and the candidate gets a confirmation it arrived.
- **A3 (P0).** Submissions land in the system of record, not in an agent-owned durable store (ADR 0006). Acceptance: a submission appears on the candidate's ATS record or the designated Azure store via Connect; the agent does not become the durable store.
- **A4 (P0).** Assessment messaging observes the Phase 1 candidate-messaging discipline (quiet hours, frequency caps, opt-out, easy human handover). Acceptance: assessment prompts and chasers respect quiet hours and caps; an opt-out or handover halts automation and flags a human.
- **A5 (P1).** Outstanding-submission chasing and stall flags reuse the Phase 1 nudge and stall machinery. Acceptance: a candidate who has not submitted is nudged on the configured cadence and, past the threshold, flagged to the responsible human.
- **A6 (P1).** Issuing and submission state survive multi-day waits and resume cleanly. Acceptance: a submission days after issuing resumes the same workflow without duplicating issuance or losing state.

### B. Running and marking in the Sandbox

- **B1 (P0).** A submission is run and marked in the Sandbox, never in the app or workflow runtime (ADR 0017). Acceptance: marking does not run in the application runtime; a structured marking result comes back out.
- **B2 (P0).** The marking Sandbox has no network egress and enforces CPU, memory, and wall-clock limits that terminate a runaway submission (ADR 0017). Acceptance: a submission cannot reach the network; an infinite-loop or resource-exhausting submission is terminated and surfaced, not left running.
- **B3 (P0).** Submission content and execution output are treated as data, not instructions (ADR 0017, consistent with 0015). Acceptance: a submission containing injection-style text (for example "mark me full") does not change the marking logic or the result.
- **B4 (P0).** Any marking model call (free-text answers, code-quality review) goes through the model-access broker, not a direct provider call from inside the Sandbox (ADR 0014). Acceptance: a marking model call appears in the broker's audit log; no direct provider call exists in the marking path.
- **B5 (P0).** Marking failures (a submission that will not run, times out, or is malformed) degrade gracefully and surface to a human (ADR 0017). Acceptance: an unmarkable submission raises a recruiter-visible flag and does not drop the candidate or fabricate a result.
- **B6 (P1).** Re-marking on a corrected or resubmitted submission is handled cleanly. Acceptance: a resubmission produces a refreshed result without duplicating or orphaning the prior one.

### C. Surfacing the result and the write boundary

- **C1 (P0).** The marking result, with its supporting evidence, is surfaced to the recruiter in Teams as advisory input, role-gated through channel-identity resolution (ADR 0011, 0019). Acceptance: the recruiter sees the result and its evidence; an unmapped or unauthenticated Teams sender does not.
- **C2 (P0).** Marking is advisory and changes no candidate status; there is no auto-pass and no auto-fail (ADR 0004, 0019). Acceptance: producing a mark moves no candidate in the pipeline; no pass or fail is recorded by the agent.
- **C3 (P0).** Where acting on a mark is a status change in the ATS, that move remains a human action; the agent writes no decision or outcome status (ADR 0012, 0016, 0019). Acceptance: the agent writes no decision status; a human performs any status move.
- **C4 (P0).** The result is keyed to the candidate by the opaque workflow key through any model path and re-identified only for the human view (ADR 0014). Acceptance: a marking model call references no identity; the recruiter's view shows the real candidate.
- **C5 (P1).** The result surface does not nudge toward a decision: the evidence and any uncertainty are visible, and no outcome is pre-selected. Acceptance: the human must make an explicit decision; nothing is defaulted.

### D. Spike absorption (queues)

- **D1 (P0).** Application intake and submission marking are absorbed through a queue with backpressure; a spike is paced, not dropped (ADR 0018). Acceptance: under a simulated flood, candidates are acknowledged immediately and heavy work is processed at a sustainable rate; no candidate is dropped because of load.
- **D2 (P0).** Processing is fair across requisitions so one large intake does not starve others (ADR 0018). Acceptance: during a single-requisition flood, other requisitions continue to be processed.
- **D3 (P0).** Queued work is idempotent and has a retry and dead-letter path (ADR 0010, 0018). Acceptance: a duplicated or retried item causes no duplicate side effects; an item that repeatedly fails is dead-lettered and surfaced to a human, not silently lost.
- **D4 (P0).** Queue depth, age, and dead-letter counts are observable and alert when a spike outpaces sustainable throughput. Acceptance: an operator can see queue health and is alerted when backlog or age crosses a threshold.
- **D5 (P1).** Spike pacing keeps candidate-facing waits within courtesy limits. Acceptance: acknowledgement is immediate; result latency under load stays within the configured courtesy bound or the candidate is told it will take longer.

### E. Bias and quality evaluation for marking

- **E1 (P0).** A bias-evaluation suite measures disparate impact on marking outcomes across designated groups, using group labels held only in the eval harness and never passed to any marking model (ADR 0013, 0020). Acceptance: the suite reports a disparate-impact measure per designated group; no marking model receives a group label.
- **E2 (P0).** The suite runs in CI as a release gate and blocks a release that regresses past the threshold (ADR 0004, 0013, 0020). Acceptance: a prompt, model, rubric, or harness change that breaches the threshold fails the build.
- **E3 (P0).** Marking does not run against real candidates until the bias-evaluation record exists and passes (ADR 0004, 0020). Acceptance: with no passing record, marking does not run against real candidates.
- **E4 (P0).** The bias gate applies to deterministic and model-assisted marking alike (ADR 0020). Acceptance: a deterministic test-harness assessment is covered by the suite, not assumed exempt.
- **E5 (P1).** Marking-quality checks (correctness against a labelled set, stability, no-fabrication) run alongside the bias gate. Acceptance: a regression in marking correctness or a fabricated result fails the relevant check.
- **E6 (P1).** The metric, designated groups, mark bands, and threshold are the ones legal and data sign off, recorded with the suite. Acceptance: the suite names its metric, groups, bands, threshold, and sign-off.

### F. Tracing and audit

- **F1 (P0).** Every marking run is replayable candidate by candidate: the submission reference, what ran in the Sandbox, any pinned model and version, the result and evidence, and the human who acted on it (ADR 0004). Acceptance: an engineer can reconstruct a single marking run end to end from traces.
- **F2 (P0).** The audit trail records assessment issuing, submission receipt, Sandbox marking, any model access (ADR 0014), and the human action, alongside the Phase 1 and Phase 2 audit (ADR 0019). Acceptance: the trail reconstructs what was issued, what was submitted, what was marked, and what the human did, for a candidate.
- **F3 (P1).** Traces and audit carry forward to Phase 4 without re-plumbing. Acceptance: a short note explains where assessment funnel data attaches for the dashboard.

### G. Data-handling boundary

- **G1 (P0).** The agent makes no decision or outcome status change; marking output is advisory (ADR 0004, 0012, 0016, 0019). Acceptance: no candidate decision status is changed by the agent.
- **G2 (P0).** Candidate PII and submissions stay in the system of record; the agent holds only minimal operational and correlation state and no duplicate candidate record (ADR 0006). Acceptance: marking input is fetched transiently; identity is not duplicated into an agent-owned durable store.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The candidate channel** (Chat SDK, WhatsApp, Phase 1) carries the assessment instructions out and the submission and acknowledgements in, under the Phase 1 messaging discipline.
- **The intake and submission queue** (ADR 0018) sits in front of the load-bearing work: it accepts and acknowledges arrivals immediately, persists submissions through the Connect broker, and enqueues marking for paced, fair, idempotent processing with retry and dead-letter, observable for depth and age.
- **The per-candidate durable workflow** (Workflow SDK, Phase 1) gains an assessment branch: issue, wait for submission, enqueue marking, surface the result, and record the human action, emitting traces and audit records throughout. It remains the unit of state; the queue paces its heavy steps.
- **The Sandbox marking surface** (ADR 0017, extending 0015) receives an untrusted submission fetched through the Connect broker, runs and marks it with no egress and under resource and time limits, and returns a structured advisory result. Any model call it needs goes out through the model-access broker.
- **The model-access broker** (ADR 0014, Phase 2) is the only path to a model for any model-assisted marking: redaction applied and verified, the allowlist enforced, the model pinned, every call audit-logged, correlated by the opaque workflow key.
- **The Teams surface** (Chat SDK, Phase 1) carries the marking result and its evidence to the recruiter as advisory input, role-gated through channel-identity resolution (ADR 0011).
- **The Connect broker** (ADR 0009, Phase 1) reads submissions from the system of record and writes logistics annotations (assessment issued, submitted, marked). It writes no decision status.
- **The schedules** (Cron, Phase 1) drive assessment chasing and stall flags, reusing the Phase 1 nudge and stall machinery.
- **The observability harness** (Phase 0) now also holds the marking bias and quality evals as a CI release gate and the per-result traces, and the queue's health metrics.

How they connect: a candidate at the assessment stage is issued an assessment over WhatsApp by their durable workflow. They submit; the submission is acknowledged at once, persisted to the system of record through the Connect broker, and a marking job is enqueued. The queue paces marking against the Sandbox and provider limits. The marking job fetches the submission through Connect, runs and marks it in the Sandbox with no egress, and (where marking needs a model) calls out only through the model-access broker. The structured result is surfaced to the recruiter in Teams as advisory input; the recruiter weighs it in a human decision, and any status move is performed by the human, not the agent. Every step is traced and audited, the marking bias-eval suite gates release in CI, and the queue's health is observable throughout a flood.

## Integration points and boundary contracts

Named contracts, not schemas.

- **WhatsApp (Chat SDK, WhatsApp Business API).** In: candidate submissions (files, links, or text) and acknowledgements. Out: assessment instructions, submission acknowledgement, chasers. Crossing the boundary: candidate-provided submission content transits Meta's WhatsApp Business API and Vercel, transiently. Webhooks are verified (ADR 0010). Meta is a processor in the candidate data path (Phase 1 legal sign-off).
- **Connect to the system of record (ATS or Azure).** In: the candidate's submission and the role-relevant fields a marking step needs. Out: the submission persisted on receipt, and logistics annotations only (assessment issued, submitted, marked). Scopes: read the submission and needed fields, write the submission attachment and a logistics annotation. No decision-status write (ADR 0004, 0012, 0016, 0019). Reuses the Phase 1 broker (ADR 0009).
- **Sandbox boundary** (ADR 0017). In: an untrusted submission and a marking instruction or harness, provisioned in (no run-time fetch). Out: a structured advisory marking result with evidence, not executable content and not raw output as a prompt. No network egress; resource and time limited.
- **Model-access broker to an allowlisted provider** (ADR 0014, AI Gateway). Out: a redacted payload (the cleared residual of a submission) to a pinned model on an allowlisted, DPA-covered provider, only where marking needs a model. In: the model's structured output, correlated by workflow key. Crossing the boundary: the cleared residual only, never direct identifiers.
- **Teams (Chat SDK) to the recruiter** (ADR 0011, 0019). Out: the marking result and its evidence as advisory input. In: the human's action on it, attributed. Crossing the boundary: candidate-referencing result content to an authorised internal recipient.
- **Cron (eve).** Triggers assessment chasing and stall flags; no external data crosses beyond what those jobs read and write through the contracts above.
- **Observability backend.** Out: per-result traces, durable audit records, and queue health metrics. The marking bias-eval gate is internal to CI.

At every boundary the agent works on the fields a step needs and the cleared residual for any model call, never whole candidate records freely passed, persists submissions to the system of record rather than retaining them, and keeps identity in the system of record (ADR 0006).

## Data handling and compliance

- **Personal information touched:** the candidate's submission (which can be dense personal data, for example code with comments, a written assessment, or a document), the structured marking result derived from it, and the candidate's identity held in the system of record. The agent marks transiently and holds no duplicate candidate record (ADR 0006).
- **Untrusted execution (ADR 0017):** submissions are run and marked in the Sandbox with no egress and under resource and time limits, so a hostile or runaway submission cannot execute in the app runtime, exfiltrate, call home, or exhaust the host. Submission content is data, not instructions.
- **Redaction before any marking model call (ADR 0006, 0014):** where marking uses a model, direct identifiers are stripped before the call and verified at the broker, which fails closed. The redaction standard is the Phase 2 artefact (`docs/compliance/redaction-standard.md`); marking adds the wrinkle that identifiers can appear inside submission content (a name in a code comment or cover note), so the standard applies to submission residual too (open question, data and legal).
- **Allowlist and pinned models (ADR 0006, 0014):** any marking model call routes only to a DPA-covered allowlisted provider with a pinned model, reusing the Phase 2 allowlist.
- **POPIA section 71 and the Employment Equity Act (ADR 0004, 0019, 0020):** marking is advisory only, there is no auto-pass or auto-fail, the agent writes no status, the marking bias-evaluation suite must exist and pass before marking runs against real candidates, and every marking run is traced. Assessments are a classic disparate-impact surface, so the bias gate applies to deterministic and model-assisted marking alike.
- **The bias-measurement tension (ADR 0013, 0020):** measuring disparate impact on marking needs group membership, but no marking model may see it. Resolution: group labels live only in the eval harness on a controlled assessment dataset and measure impact on outcomes; they are never passed to a marking model. That dataset is sensitive and held under access control.
- **New candidate data path if an external assessment platform is used:** delivering or hosting an assessment on a third-party platform would introduce a new processor in the candidate data path (like Meta in Phase 1), needing its own POPIA basis and legal sign-off. The spec defaults to no new external platform; if one is required it is a new integration and a new ADR (open question, legal and engineering).
- **Residency (ADR 0006):** unchanged. Data minimisation stands unless security or legal rules residency a hard line, which would supersede ADR 0006 and is the Phase 2 go/no-go already recorded.
- **Environment posture:** Phase 3 runs in the non-production pilot environment, because the dev provider cannot run in production (ADR 0003), with the same operational rigour Phase 1 and 2 set and a bounded, consented cohort. A genuine high-volume flood test is run with synthetic load, not by exposing real candidates at scale before the Entra cutover (open question, security).
- **Beta components (ADR 0005):** the Sandbox, AI Gateway, and any queue component are permitted as long as they are public beta or GA, not private beta.

## Access and identity

- **Active provider for browser and HTTP tooling:** the dev credential provider (ADR 0003, 0008), with the recruiter, hiring-manager, and internal engineering roles carried from earlier phases.
- **The recipient of the result:** the recruiter who reads the marking result acts in Teams, resolved to a named internal identity and role through channel-identity resolution (ADR 0011). The result is advisory input; any candidate-affecting decision built on it still goes through the human gate (ADR 0004, 0019).
- **Candidate identity:** the verified WhatsApp number, with no login (ADR 0003), still the workflow correlation key; no marking model receives it.
- **What is gated:** the marking result and its evidence are role-gated to the requisition's recruiter (and hiring manager where relevant); the candidate channel is unchanged; the webhook and intake surface stays public, edge-protected, and webhook-verified.
- **Production refusal (ADR 0003):** the dev provider still fails closed in production, so Phase 3 stays non-production.
- **Sessions:** stateless signed sessions for browser tooling (ADR 0008), unchanged.

## Observability, evals, and tracing

- **Per-result tracing (ADR 0004):** every marking run is replayable candidate by candidate, capturing the submission reference, what ran in the Sandbox, any pinned model and version, the result and evidence, and the human who acted on it. Pinning makes a model-assisted mark reproducible.
- **Marking bias and disparate-impact evals (ADR 0013, 0020):** the suite measures impact on marking outcomes across designated groups from a controlled labelled dataset, runs in CI as a release gate, and blocks a release that regresses past the threshold. Marking does not run against real candidates until it exists and passes.
- **Marking-quality evals:** correctness against a labelled set, stability, and no-fabrication run alongside the bias gate, so a quality or fabrication regression is caught in CI too.
- **Queue observability (ADR 0018):** depth, age, and dead-letter counts are visible and alert when a spike outpaces sustainable throughput, so a flood is watched, not discovered after candidates wait too long.
- **Audit:** assessment issuing, submission receipt, Sandbox marking, any model access (ADR 0014), and the human action join the Phase 1 and Phase 2 audit trail, so the full path from issuing to result to human action is reconstructable.
- **Feeds Phase 4:** the assessment results and decision data become funnel inputs the dashboard later surfaces; Phase 3 builds no dashboard.

## Risks and mitigations

- **Untrusted code execution.** Running candidate-submitted code is the strongest isolation case in the system. Mitigation: the Sandbox with no network egress and enforced resource and time limits (ADR 0017), submission content treated as data, and marking never in the app runtime.
- **Resource exhaustion and runaway submissions.** A submission can loop forever or exhaust the host, made worse during a flood. Mitigation: hard CPU, memory, and wall-clock limits that terminate and surface (ADR 0017), and the queue pacing work against capacity (ADR 0018).
- **Bias in assessments.** Employment assessments are a textbook disparate-impact surface, and the risk exists even for "objective" deterministic tests. Mitigation: the marking bias-evaluation suite as a hard CI gate covering deterministic and model-assisted marking alike (ADR 0020), the mandatory human gate (ADR 0004, 0019), marking kept advisory, and full per-result tracing.
- **Scope creep into automated pass/fail.** The pull to let a clear mark auto-advance or auto-reject will recur, sharpest with a deterministic score. Mitigation: ADR 0004 and 0019 hold; no auto-pass, no auto-fail, the agent writes no status; any relaxation is a deliberate future ADR with legal sign-off.
- **Flood handling.** A popular graduate role can take thousands in a day (a PRD scenario). Mitigation: the queue absorbs the spike with backpressure, fair ordering, idempotency, and dead-lettering; no candidate is dropped; queue health is observed and alerted (ADR 0018). The flood test uses synthetic load before any real high-volume exposure.
- **Candidate experience during a flood.** A long silence after submission costs good applicants. Mitigation: immediate acknowledgement, courtesy-bounded result latency, and clear "this will take longer" messaging under load (ADR 0018, Phase 1 discipline).
- **Redaction leakage from submission content.** An identifier embedded in a code comment or written answer could reach a marking model. Mitigation: redaction enforced and verified at the broker over submission residual, fail-closed on unverifiable redaction (ADR 0014), and the redaction standard extended to submission content (open question).
- **Prompt injection from submission content.** A submission crafted to manipulate a marking model. Mitigation: marking isolated in the Sandbox with content treated as data (ADR 0017), structured results out, and the human gate as the backstop.
- **Marking and execution failures.** Poor submissions, malformed files, unsupported runtimes. Mitigation: degrade gracefully and surface to a human; never drop a candidate or fabricate a result (ADR 0017).
- **Beta maturity.** The Sandbox, AI Gateway, and the queue component are young (a PRD key risk). Mitigation: keep the Sandbox boundary and the queue thin and well-traced, degrade gracefully, hold fallbacks, and prove on a bounded pilot plus synthetic load (ADR 0005).
- **Cost and latency at volume.** Marking, especially model-assisted, costs time and money at flood scale. Mitigation: the queue paces against provider and Sandbox limits, prefer deterministic marking where the assessment allows, and flag if pilot or flood-test volume approaches limits.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- Phase 3 builds on Phase 1's logistics core and Phase 2's broker, Sandbox, tracing, and gate substrate; it does not rebuild them.
- Assessments are delivered and submitted through the existing WhatsApp channel, with submissions landing in the system of record, and no new candidate-facing authenticated surface is built (ADR 0003, the no-candidate-login non-goal).
- The agent does not decide on its own to advance a candidate into the assessment stage; issuing is a logistics step once a human advances the candidate, or once a requisition is configured (a human-set policy) so every applicant receives the assessment.
- Marking spans deterministic execution (a take-home run against a harness or rubric) and model-assisted marking (free-text answers, code-quality review); deterministic marking is preferred where the assessment allows, for cost, latency, and reproducibility.
- Any marking model call reuses the Phase 2 allowlist and pinned models through the model-access broker; no new provider is added without a new signed DPA.
- The Sandbox, AI Gateway, and the queue component are public beta or GA at build start, so they are permitted by ADR 0005.
- Phase 3 runs in the non-production pilot environment with the same operational rigour and bounded, consented cohort as Phase 1 and 2; high-volume behaviour is proven with synthetic load, not by exposing real candidates at scale before Phase 5.
- The marking bias-evaluation dataset is built on the Phase 2 pattern (historical, de-identified, group labels only in the harness), adapted to the assessment type.

## Open questions

Tagged by owner, and blocking or non-blocking for this spec. Each carries a best-judgment answer (the working decision). Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation.

- **Do the four proposed ADRs (0017 Sandbox execution and marking, 0018 queue-based spike absorption, 0019 the assessment-phase write boundary, 0020 marking bias evaluation) get accepted as proposed?** (Project lead, legal, engineering, security, data. Non-blocking for the spec; they block building those areas exactly as specified.)
  Answer: Accept all four as proposed (needs sign-off). 0017 extends the ADR 0015 isolation to executing untrusted submissions with the egress, resource-limit, and result-contract decisions execution forces; 0018 absorbs floods without dropping candidates; 0019 keeps marking advisory with no auto-pass or auto-fail and the agent writing no status; 0020 extends the ADR 0013 bias gate to marking. None contradicts an accepted ADR, and each is a genuine new decision the phase forces. Flip all four to Accepted in the register before building those areas. Owner: project lead, with legal, engineering, security, and data.
- **What assessment types are in scope for the pilot, and how does a candidate submit (file over WhatsApp, a link to submitted work, or an external assessment platform)?** (Stakeholder, engineering, legal. Blocking for the build of the issuing and submission flow; non-blocking for this spec, which stays submission-mechanism-agnostic.)
  Answer: Default to assessment types whose submission fits the existing channel: a code take-home submitted as a file or a link to a repository or archive, and a structured skills assessment answered as text or a file. Whatever the candidate submits lands in the system of record and is fetched to the Sandbox for marking. An external assessment platform is out by default because it opens a new candidate data path and a new processor; if a type genuinely needs one, that is a new integration with its own POPIA basis and a new ADR, not a quiet addition. Stakeholder names the pilot assessment(s); engineering owns the submission handling; legal clears any external platform if proposed.
- **Does marking surface only to the recruiter, or also feed the Phase 2 hiring-manager decision gate directly?** (Stakeholder, engineering. Non-blocking; the spec defaults to recruiter as advisory input.)
  Answer: Surface the marking result to the recruiter as advisory input, per the PRD. The mark informs the existing human decision process (the recruiter, and the hiring-manager gate from Phase 2 where the requisition uses one); it does not create a new automated approve/reject step and the agent writes no status (ADR 0019). If the pilot shows the hiring manager should see the mark alongside the shortlist directly, that is a surfacing change within the existing gate, not a new decision path.
- **What is the marking bias metric, which mark bands and designated groups are measured, what threshold blocks a release, and where does the labelled dataset come from?** (Legal, data, engineering. Blocking for the build of marking; non-blocking for the spec, which fixes the architecture in ADR 0020.)
  Answer (needs sign-off): Reuse the Phase 2 framework (ADR 0013, 0020). Metric: the selection-rate ratio (four-fifths) on reaching a defined mark band, with the absolute gap tracked alongside, measured pairwise against the reference group for the Employment Equity Act designated groups (race, gender, disability), unless legal and data set another. Threshold: a measured group's ratio below 0.8 fails the release; 0.8 to 0.9 warns. Dataset: a held-out, labelled assessment evaluation set built from historical, de-identified submissions where available, with designated-group labels from the corporate's employment-equity self-declaration records, labels held only in the eval harness. Because assessments can be bespoke per requisition, the obligation attaches per assessment type, and a new assessment type ships only with its evaluation. Legal and data own and sign off the metric, bands, groups, threshold, and dataset provenance and consent. Owner: legal, data, engineering.
- **Does the Phase 2 redaction standard need extending for submission content (identifiers embedded in code or written answers)?** (Data, legal. Blocking for the build of model-assisted marking; non-blocking for the spec.)
  Answer (needs sign-off): Yes, extend the existing standard (`docs/compliance/redaction-standard.md`) to cover identifiers that can appear inside a submission (a name in a code comment, a header, or a cover note), not just structured CV fields. The broker enforces and verifies redaction over the submission residual before any marking model call and fails closed if it cannot (ADR 0014). Deterministic marking that runs in the Sandbox without a model call does not hit this path. Owner: data and legal, with engineering.
- **What are the flood-test target volume and the sustainable processing rate, and how is the flood proven without exposing real candidates at scale?** (Engineering, stakeholder. Non-blocking for the spec; needed to validate ADR 0018.)
  Answer: Anchor the flood-test target to a realistic worst case for a popular graduate role (working figure: thousands of applications or submissions in a day, refined with the stakeholder against historical intake). Prove it with synthetic load against the pilot environment, measuring that candidates are acknowledged immediately, work is paced fairly, nothing is dropped, and dead-lettering and alerting fire correctly, before any real high-volume cohort. Set the sustainable rate from the Sandbox and provider limits, configurable (ADR 0018). Owner: engineering, with the stakeholder for the volume figure.
- **Is a graduate-intake season the timing anchor for Phase 3, given Phase 1 flagged it as a Phase 3 dependency?** (Stakeholder. Non-blocking.)
  Answer: Confirm with the stakeholder. If a graduate intake anchors the programme, the spike-absorption of this phase (ADR 0018) must land and be flood-tested before that intake opens, which makes Phase 3 the timing-critical phase for high volume. If there is no such season, proceed without a deadline anchor (per the PRD), and run the pilot on steady volume with synthetic flood tests.
- **Is the Phase 0 metrics baseline captured, and how is Phase 3's effect measured?** (Data, stakeholder. Non-blocking for the spec.)
  Answer: As in Phase 1 and 2, the Phase 0 baseline artefact (`docs/metrics/baseline.md`) gates ship, not build. Phase 3's effect is measured in the pilot by: time from submission to marking result (marking turnaround), recruiter assessment-handling admin time against the baseline, the proportion of marks the human overrides (the human-in-the-loop health signal for marking), and, under flood test, acknowledgement latency, throughput, drop rate (target zero), and dead-letter rate. The marking bias-eval result is recorded per release. Owner: TA operations and data.

## Done when (phase-level acceptance)

Phase 3 is done when all of the following hold together, proving the assessment slice end to end rather than each piece in isolation:

- A candidate at the assessment stage receives an assessment over the existing channel, submits it (the submission landing in the system of record), and the submission is run and marked in the Sandbox, never in the app runtime, with no network egress and under enforced resource and time limits.
- The marking result, with its evidence, reaches the recruiter in Teams as advisory input to a human decision; there is no auto-pass and no auto-fail, the agent writes no candidate status, and any status move is a human action (ADR 0004, 0019).
- Any marking model call goes through the model-access broker to an allowlisted, DPA-covered provider with a pinned model, with redaction applied and verified, and is audit-logged; no direct provider call exists in the marking path.
- A submission (or application) spike is absorbed without dropping candidates: candidates are acknowledged immediately, heavy work is paced fairly and idempotently against the Sandbox and provider limits, repeatedly failing items are dead-lettered and surfaced, and queue health is observable, proven under synthetic flood load.
- The marking bias and disparate-impact evaluation suite runs in CI as a release gate and blocks a release that regresses past the threshold, covering deterministic and model-assisted marking alike; marking does not run against real candidates until that record exists and passes.
- Every marking run is replayable candidate by candidate from traces, and reconstructable from the audit trail (issuing, submission, marking, model access, human action).
- Phase 3 runs in the non-production pilot environment; the dev provider still refuses to start in production.

Done is a working, defensible assessment slice that a recruiter acts on and that legal can stand behind, and a flood that the system absorbs without losing a candidate, not a set of components that each pass in isolation.
