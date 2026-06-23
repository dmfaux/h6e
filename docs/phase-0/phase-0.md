# Phase 0: Project setup (the walking skeleton)

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 0 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 0 stands up the spine the rest of the programme plugs into. It ships no candidate or recruiter value on its own, by design. It builds only what Phase 1 needs plus the seams later phases attach to, and nothing more. The discipline here is restraint: a setup phase with no user-facing output is exactly where weeks vanish into infrastructure for features five phases away, so the bar is a thin path that proves the spine works end to end, not a checklist of everything built but nothing connected. The phase is time-boxed; if the scaffolding is not done in the agreed window, the response is to simplify the spine, not to keep polishing.

Binding ADRs: 0002 (build on the Vercel Agent Stack using eve), 0003 (Microsoft-first identity behind a swappable auth interface), 0005 (no private beta in the critical path), 0006 (data minimisation over data residency), 0007 (one stack, one repo), and 0001 (record any new architectural decision as an ADR). ADR 0004 (human in the loop) makes no decision in this phase but sets the requirement that tracing and evals exist before any screening ships, which is why Phase 0 stands up the empty harness. One new decision is proposed for this phase: ADR 0008 (stateless signed sessions for internal auth), referenced below and pending acceptance.

## Scope

### Includes, made concrete

- **Repository and scaffold.** One repository (ADR 0007) holding an eve project (ADR 0002): the agent directory, tools and schedules as TypeScript, with the project structure the later phases extend.
- **CI/CD and environments.** A working pipeline that builds, checks, and deploys to Vercel, with a preview environment per change and a protected production environment, and secrets handled per environment.
- **Bare agent and health check.** An eve agent that boots and answers a health check. No channel logic, no model calls, no business behaviour.
- **Auth interface, dev provider, Entra stub.** The auth interface from ADR 0003, returning a user with id, email, and roles. A working development credential provider behind it. The Entra-via-Passport provider present as a stub (the seam, not the integration). Provider selection by environment variable. The dev provider refuses to start in production. Route guards depend on the interface and on roles, never on a provider. Session shape per ADR 0008 (proposed).
- **Connect round-trip.** Connect wired far enough to prove one scoped, short-lived token round-trips against one real system, the ATS or Outlook, whichever is ready first, with the round-trip logged. The minimum to prove the credential flow, not a reusable broker.
- **Edge protection.** WAF and Bot ID in front of the public intake endpoint, which in this phase is a protected placeholder, not functioning intake.
- **Observability harness.** The eval and tracing harness installed and running in CI, green on an empty suite, wired so Phase 2 plugs in rather than retrofits.
- **Metrics baseline.** The baseline (recruiter admin hours, time-to-hire, drop-off) captured and recorded as a versioned artefact in the repo, since it has to happen before any user-facing phase ships and has no better home.

### Excludes, pushed to a named phase

- Any candidate or recruiter behaviour, and any channel logic beyond the health check. The WhatsApp and Teams channels, conversation, document collection, and calendar booking are Phase 1.
- A reusable Connect token-brokering pattern and real ATS or calendar reads and writes. Phase 0 proves one round-trip only; the brokering pattern is Phase 1.
- Any model call, AI Gateway routing, PII redaction, or provider allowlist enforcement. Phase 2.
- Eval content (the bias and disparate-impact checks, real cases) and trace content on recommendations. Phase 0 builds the empty frame; the content is Phase 2.
- The Sandbox. Phases 2 and 3.
- The dashboard and the warehouse read path. Phase 4.
- The real Entra integration: the Passport provider implementation, the cutover, and decommissioning the dev provider. Phase 0 builds the stub and the seam only. Phase 5.

## Dependencies

### Inward (what must already exist)

None from earlier phases: Phase 0 is the foundation. It does depend on external prerequisites that must be available at phase start: a Vercel account or team and a CI/VCS host; access to at least one real system (a Microsoft 365 tenant and Outlook, or the ATS) for the Connect round-trip; and access to the people and ATS exports needed to capture the metrics baseline.

### Outward (what this phase provides to later phases)

- To Phase 1: a deploying eve project, the auth interface with a working dev provider and role mapping, a booting agent reachable behind a route guard, and a proven Connect credential flow to extend into real ATS and calendar access.
- To Phase 2: an eval and tracing harness already in CI as a gate, ready to receive screening evals and recommendation traces.
- To Phase 5: the auth interface and the Entra provider stub, so the cutover is a configuration change and one adapter, not a rewrite.

## User stories by persona

This is a setup phase, so the user-facing stories are thin. The persona served is mainly the engineer.

- As an engineer, I can open a pull request and get a preview deployment of the agent, so I can see my change running before it reaches production.
- As an engineer, I can sign in through the dev credential provider with a role-mapped test user and reach the booting agent, so I can confirm the auth seam and the agent boot path work together.
- As an engineer, I can run the eval and tracing harness locally and in CI and see it pass on the empty suite, so I know the frame Phase 2 fills is already wired.
- As a data or TA-operations owner, I can point to a recorded baseline of recruiter admin hours, time-to-hire, and drop-off, so the success metrics are measurable once Phase 1 ships.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. Repository and project scaffold

- **A1 (P0).** The repository holds a single eve project that builds locally and in CI. Acceptance: a clean checkout builds with the documented commands and the project structure follows eve's conventions.
- **A2 (P0).** All four programme surfaces (agent, channels, schedules, dashboard) live in this one repository over time (ADR 0007); Phase 0 creates the project that will hold them, without building the channels or dashboard. Acceptance: there is no second repository or external build tool in the critical path.

### B. CI/CD pipeline and environments

- **B1 (P0).** Every change runs build and checks in CI, and a passing change produces a preview deployment. Acceptance: opening a change yields a reachable preview URL of the agent; a failing check blocks the deploy.
- **B2 (P0).** A protected production environment exists and deploys from the agreed source (for example the main branch). Acceptance: production deploys only through the pipeline, not by hand.
- **B3 (P0).** Secrets are configured per environment, with no secret committed to the repository. Acceptance: preview and production read their own secrets; a scan finds no secrets in version control.
- **B4 (P1).** The deploy verifies the agent booted before a deployment is considered healthy. Acceptance: a deploy where the agent fails to boot is reported as failed, not green.

### C. Bare agent and health check

- **C1 (P0).** The agent boots and answers an unauthenticated liveness check used by the platform and the deploy. Acceptance: the liveness endpoint returns healthy when the agent is up, and does not require a login.
- **C2 (P0).** An authenticated internal endpoint, behind a route guard, reaches the booting agent and returns the resolved user and roles. Acceptance: a request with a valid role-mapped dev session reaches the agent and sees its own id, email, and roles; a request without a valid session is refused. No business logic beyond this.

### D. Auth interface, dev provider, and Entra stub

- **D1 (P0).** The auth interface returns an authenticated user with id, email, and roles, and is the only thing route guards depend on (ADR 0003). Acceptance: guards make allow or deny decisions from the interface and roles alone, with no reference to a provider.
- **D2 (P0).** The development credential provider authenticates a username and password against a configured user list and issues a session (ADR 0008, proposed). Acceptance: a configured test user signs in and receives a session carrying their roles; bad credentials are refused.
- **D3 (P0).** Provider selection is by environment variable, and the Entra-via-Passport provider exists as a stub selectable by that variable without being implemented. Acceptance: switching the variable selects the stub; the stub is clearly inert and not a real integration.
- **D4 (P0).** The dev provider refuses to start in production (ADR 0003), failing closed if it cannot confirm it is outside production. Acceptance: a production-configured boot with the dev provider selected refuses to start rather than running insecurely.
- **D5 (P0).** Roles are part of the interface from day one and at least the roles Phase 1 consumes (recruiter, hiring manager) are defined, plus an internal role for engineering access to the health and whoami surfaces. Acceptance: a session carries roles and a guard can require a specific role.

### E. Connect scoped-token round-trip

- **E1 (P0).** A scoped, short-lived credential is obtained through Connect for one real system (the ATS or Outlook, whichever is ready first) and used to make one minimal read call that succeeds. Acceptance: the call returns a real response using a Connect-issued token, not a long-lived static credential.
- **E2 (P0).** The round-trip is logged so the credential flow is auditable. Acceptance: there is a record that a scoped token was issued, used, and for what.
- **E3 (P1).** The scope requested is the minimum needed to prove the flow (for example a read-only calendar or read-only ATS scope), not a broad grant. Acceptance: the requested scope is read-only and narrow.

### F. Edge protection on the public intake endpoint

- **F1 (P0).** The public intake endpoint exists as a protected placeholder with WAF and Bot ID in front of it. Acceptance: the endpoint is reachable, returns a placeholder response, and carries WAF and Bot ID protection; it contains no intake or channel logic (that is Phase 1).
- **F2 (P1).** Obvious automated abuse against the placeholder is challenged or blocked at the edge. Acceptance: a basic bot probe is met by Bot ID or WAF, not by the application.

### G. Observability: eval and tracing harness

- **G1 (P0).** The eval harness runs in CI as a real gate and passes on an empty suite. Acceptance: CI runs the harness; a harness that cannot run fails the build rather than passing silently.
- **G2 (P0).** Tracing is wired so spans or events can be emitted, and at least one path (for example the authenticated health path) emits a trace, so green means wired, not absent. Acceptance: a trace is visible for that path; the harness is demonstrably connected, not stubbed out.
- **G3 (P1).** The harness is documented enough that Phase 2 adds eval cases and recommendation traces without re-plumbing. Acceptance: a short note explains where eval cases and traces will attach.

### H. Metrics baseline

- **H1 (P0).** The baseline of recruiter admin hours per requisition, time-to-hire by stage, and drop-off between stages is captured and recorded as a versioned artefact in the repo. Acceptance: the artefact exists, states its figures, and names the capture method and date.
- **H2 (P1).** The artefact names who owns each figure and how it will be re-measured after Phase 1, so the success metrics are comparable later. Acceptance: each figure has an owner and a re-measurement method.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The eve project** is the single deployable. It contains the agent, and over later phases the channels, schedules, and dashboard. In Phase 0 it contains the agent and the auth and routing around it.
- **The CI/CD pipeline** sits between the VCS host and Vercel. It builds and checks every change, deploys passing changes to a preview environment, and deploys the agreed source to production. It reads secrets per environment.
- **The auth interface** sits in front of every internal surface. Route guards call the interface, get id, email, and roles, and decide. Behind the interface sit two providers: the dev credential provider (active in early phases) and the Entra-via-Passport stub (inert until Phase 5). Selection is by environment variable.
- **The agent** exposes two internal surfaces in Phase 0: an unauthenticated liveness check, and an authenticated whoami-style endpoint behind a route guard that proves the auth-to-agent path.
- **Connect** brokers a scoped, short-lived token to one external system (the ATS or Outlook). In Phase 0 a single proof path requests the token, makes one read call, and logs the round-trip. There is no reusable broker yet.
- **The public intake endpoint** is an internet-facing placeholder protected by WAF and Bot ID at the edge. It will become the Phase 1 intake and webhook surface.
- **The observability harness** wraps the project: tracing emits from at least one path, and the eval suite runs in CI as a gate.

How they connect: a change flows through CI to a preview deploy of the eve project on Vercel. An engineer reaches the agent's authenticated surface through the auth interface using a dev session, with the route guard reading roles from the interface. A separate proof path uses Connect to reach one external system and back. The public placeholder sits behind the WAF and Bot ID edge. Traces and the eval gate run across the whole thing in CI.

## Integration points and boundary contracts

Named contracts, not schemas.

- **VCS host to CI to Vercel.** Source changes in, build and check results and deployments out. Crossing the boundary: code and build artefacts, plus per-environment secret references. No personal data.
- **Connect to the external system (ATS or Outlook).** Out: a request for a scoped, short-lived credential and one minimal read. In: a short-lived token and one read response. Scope needed: a single read-only scope on whichever system is used first (for example read-only Microsoft 365 calendar, or a read-only ATS scope). No write scope in Phase 0.
- **Auth interface to providers.** Out: a sign-in attempt (dev credentials now, an Entra handshake later). In: an authenticated user with id, email, and roles, or a refusal. The Entra side is stubbed in Phase 0, so nothing crosses that boundary yet.
- **Public edge (WAF and Bot ID) to the intake placeholder.** In: internet traffic, filtered and bot-challenged at the edge before it reaches the application. Out: a placeholder response. No candidate data crosses, because there is no intake logic yet.
- **Observability harness.** Out (to the tracing backend): spans or events from instrumented paths. The eval gate is internal to CI and crosses no external boundary.

## Data handling and compliance

Phase 0 is deliberately low on personal data, which is the right shape for a setup phase under ADR 0006.

- **No model calls, so no redaction path is exercised yet.** Redaction before model calls, the provider allowlist, and field-level discipline are Phase 2 concerns. Phase 0 must not create a candidate-PII flow through Vercel or any provider. The redaction and allowlist seams are noted for Phase 2, not built here.
- **The system of record stays put** (ADR 0006). Phase 0 reads one minimal record through Connect to prove the flow and does not copy candidate records into the agent.
- **The metrics baseline is aggregate, not identifying:** counts and durations (admin hours, time-to-hire, drop-off), not candidate records. It should be captured and stored as aggregate figures, with no direct identifiers.
- **Secrets** (Connect credentials, the session signing secret, provider configuration) are handled per environment and never committed (requirement B3). The session secret is set distinctly per environment (ADR 0008, proposed).
- **Beta-component compliance** (ADR 0005): Phase 0 wires Connect and Passport, which are permitted because only Enterprise Managed Users and bring-your-own-cloud are excluded as private beta. If either Connect or Passport turns out to be private beta at build start, ADR 0005 forces a rethink (see open questions).

## Access and identity

- The **dev credential provider is the active provider** for internal surfaces in Phase 0 (ADR 0003). The Entra provider is a stub.
- **Roles are defined in the interface from day one** (ADR 0003): at least recruiter and hiring manager (the Phase 1 consumers), plus an internal role for engineering access to the health and whoami surfaces. The exact final set is settled when the guards are built.
- **What is gated:** the authenticated internal endpoint (requirement C2) is behind a route guard that requires a valid, role-mapped dev session. The liveness check is open. The public intake placeholder is open to the internet but protected at the edge by WAF and Bot ID.
- **The production guard** (ADR 0003): the dev provider refuses to start in production, failing closed. This is verified, not assumed (requirement D4).
- **Candidate identity is out of scope** for this phase, as it is throughout: candidates are identified by their verified WhatsApp number through Chat SDK, not a login, and there is no candidate surface in Phase 0 anyway.
- **Session shape** is governed by ADR 0008 (proposed): stateless, signed, provider-independent, so the Phase 5 swap does not touch the guards.

## Observability, evals, and tracing

- **What stands up:** the eval harness as a real CI gate, green on an empty suite (G1), and tracing wired so at least one path emits a trace (G2). Green must mean wired, not absent, which is why one real trace and a real gate are required.
- **What it feeds:** Phase 2 attaches screening and shortlisting evals (including the disparate-impact checks ADR 0004 requires) and per-recommendation traces to this frame. ADR 0004 makes tracing and evals a hard prerequisite before any screening ships, so standing up the empty frame now is what lets Phase 2 plug in rather than retrofit.
- **Not in this phase:** any eval content or any trace of a recommendation, because there are no recommendations yet.

## Risks and mitigations

- **Time-box erosion.** A setup phase with no user output is where weeks disappear. Mitigation: build only the spine and the seams Phase 1 needs; judge done against the phase-level acceptance below, not a build-everything checklist; if the window slips, simplify the spine rather than polish it.
- **Beta maturity of Connect, Passport, and eve.** We are standing a hiring process on young software (a PRD key risk). Mitigation: prove the Connect round-trip early and thinly, keep Phase 0 dependency-light, and hold a fallback for anything that regresses. Do not build depth on beta surfaces in Phase 0.
- **Dev provider leaking into production.** The highest-consequence failure of the auth seam. Mitigation: the production guard fails closed (D4) and is verified in CI, backed by ADR 0003 and ADR 0008.
- **Empty-harness rot.** An eval or tracing harness that is green only because it is empty hides a broken wiring. Mitigation: make the CI gate real (a harness that cannot run fails the build) and require at least one real trace, so green proves the wiring (G1, G2).
- **Scope creep pulling later work forward.** The pull to add a bit of channel logic or a first model call will appear. Mitigation: the exclude boundary is explicit and named to a phase; anything past a seam needs a reason and, if architectural, an ADR.
- **Connect proof blocked on external access.** If neither the ATS nor a Microsoft 365 tenant is reachable at phase start, the round-trip cannot be proven. Mitigation: confirm at least one system is available early; this is the one external dependency that can stall the phase, so surface it first.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- The Connect round-trip runs against Microsoft 365 and Outlook (known to exist per ADR 0003) unless the ATS is confirmed ready first.
- Connect and Passport are public, not private, beta at build start, and so are permitted by ADR 0005, which excludes only Enterprise Managed Users and bring-your-own-cloud.
- The metrics baseline is a data-gathering and documentation task, recorded as a versioned repo artefact, not a software pipeline. Its figures and method are owned by data and stakeholder.
- The public intake endpoint is a protected placeholder in Phase 0, occupying the surface Phase 1's intake and webhook will later use, with no channel logic now.
- A CI/VCS host and a Vercel team exist or are provisioned at phase start; the spec stays host-agnostic about which.
- The "authenticated internal request reaches a booting agent" from the PRD is satisfied by an authenticated whoami-style endpoint behind a role-aware guard that invokes the agent boot path, with no business logic.

## Open questions

Tagged by owner, and blocking or non-blocking for Phase 0. Each carries a best-judgment answer (the working decision). Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation.

- **Which system, ATS or Outlook, is the target for the Connect round-trip, and is access available at phase start?** (Engineering, stakeholder. Non-blocking for this spec; blocking for the round-trip task itself, which needs at least one system reachable.)
  Answer: Target Microsoft 365 / Outlook first, with a read-only calendar free/busy scope as the round-trip. It is known to exist (ADR 0003, Microsoft-first), needs no ATS procurement, and is the narrowest meaningful proof. The ATS is deferred because "which ATS" is still open. Fallback: if no M365 test tenant or mailbox is reachable in the first days of the phase, switch the round-trip to whichever ATS is confirmed ready, with a read-only scope. Confirm M365 tenant access on day one; this is the one external dependency that can stall the phase.
- **Are Connect and Passport confirmed at public beta or GA, not private beta, at build start?** (Engineering, security. Non-blocking; if either is private beta, ADR 0005 forces a rethink before wiring it.)
  Answer: Treat both as public beta and permitted under ADR 0005, which excludes only Enterprise Managed Users and bring-your-own-cloud. Gate it with a one-time phase-start check: an engineer verifies each component's current maturity in Vercel's docs or console and records the result in the repo (a line in the README or a short note). If either is private beta at build start, hold that component and raise a blocking note rather than wiring it.
- **What are the metrics baseline figures, the capture method, and who owns each number?** (Data, stakeholder. Non-blocking for the spec; the capture must complete before Phase 1 ships.)
  Answer: The figures are supplied by the business, not invented here; this spec fixes the method, owner, and home. Owner: the TA operations lead, with a data analyst. Method: pull 3 to 6 months of historical requisition data from the ATS export for time-to-hire by stage (stage timestamps) and stage-to-stage drop-off (stage counts), and run a 1 to 2 week recruiter time-diary plus a short survey for admin hours per requisition. Record as a versioned artefact at `docs/metrics/baseline.md` stating each figure, its method, its capture date, and its owner. Capture must complete before Phase 1 ships, not before Phase 0 build starts.
- **Which CI/VCS host and Vercel team are used, and who holds the secrets?** (Engineering. Non-blocking.)
  Answer: GitHub for source and GitHub Actions for the build-and-check gate, deploying to Vercel through the Vercel GitHub integration (a preview per pull request, production on the main branch). The project lives under the corporate's Vercel team as a dedicated project. Secrets are held as Vercel environment variables per environment, plus GitHub Actions secrets for any CI-only needs, owned by the engineering lead with documented break-glass access. No secret in version control (requirement B3).
- **Does the public edge protection (WAF and Bot ID on the placeholder) need its own recorded ADR for compliance defensibility, or is the PRD mandate enough until Phase 1 makes the endpoint functional?** (Security. Non-blocking.)
  Answer: No separate ADR for Phase 0. The PRD mandate plus ADR 0002 (the Vercel stack) cover a protected placeholder that carries no candidate data. Revisit at Phase 1 when the endpoint becomes live intake and a webhook surface; the security posture there is recorded by ADR 0010 (verified channel webhook ingress), so the edge decision can fold into the Phase 1 security ADRs rather than a Phase 0 one.
- **Does ADR 0008 (stateless signed sessions) get accepted as proposed?** (Project lead, engineering, security. Non-blocking for the spec; blocks building the auth provider exactly as specified, since the session shape depends on it.)
  Answer: Accept as proposed (needs sign-off). The reasoning holds: stateless signed tokens keep the skeleton free of a session datastore and keep the Entra swap clean because both providers mint the same provider-independent session. Build the dev provider and guards against it. Flip ADR 0008 to Accepted in the register before relying on it in code.
- **The "ADR on evals" referenced by ADR 0004 is not yet written.** Phase 0 stands up the empty harness only; the evals-policy ADR (which bias checks, which thresholds) is expected at Phase 2 when there is eval content. Confirm that home. (Engineering, legal. Non-blocking for Phase 0.)
  Answer: Confirmed: its home is Phase 2, authored at the start of that phase when there is screening to evaluate, owned by engineering and legal. It will name which disparate-impact checks run, the thresholds, and what blocks a release. Phase 0 builds the empty frame; Phase 1 adds deterministic logistics evals but no bias policy, because Phase 1 runs no screening.

## Done when (phase-level acceptance)

Phase 0 is done when all of the following hold together, proving the spine end to end rather than each piece in isolation:

- An authenticated internal request, using a role-mapped dev login through the auth interface, reaches a booting agent and sees its own resolved roles; an unauthenticated request to that surface is refused.
- One Connect-issued, scoped, short-lived token round-trips against a real system (the ATS or Outlook) with one successful read, and the round-trip is logged.
- The CI pipeline builds and checks every change and deploys a passing change to a reachable preview environment, with a protected production environment in place and secrets handled per environment.
- The dev credential provider refuses to start in a production configuration, verified rather than assumed.
- The public intake placeholder is reachable behind WAF and Bot ID, with no intake logic.
- The eval and tracing harness runs in CI as a real gate, green on an empty suite, with at least one real trace proving the wiring.
- The metrics baseline (recruiter admin hours, time-to-hire, drop-off) is recorded as a versioned repo artefact with its method and date.

Done is the thinnest path that proves the spine works end to end, not a checklist of everything built but nothing connected.
