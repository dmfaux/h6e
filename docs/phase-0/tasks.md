# Phase 0 task breakdown

Phase 0 stands up the walking skeleton: the spine that Phase 1 plugs into and later phases attach seams to, and nothing more. This document slices the Phase 0 spec (`docs/phase-0/phase-0.md`) into tasks small enough to run one at a time through `/goal`, each ending in a state an agent can prove from transcript output (a command result, an HTTP response, a test exit code, a git status, a printed artefact). Each task names what it delivers and what it defers, so an unattended agent builds the seam and stops rather than pulling later-phase work forward. Delivery tasks are ordered by dependency; a realignment task follows every three delivery tasks and closes the phase, to stop drift and slop before they compound. The breakdown honours the accepted ADR register: where Phase 0 deliberately stops short of a later pattern (the reusable Connect broker in ADR 0009, the real Entra integration behind ADR 0003, webhook verification in ADR 0010), the boundary is written into the task.

## Task list

1. Task 0.1 (delivery): Repository scaffold and booting agent with liveness check
2. Task 0.2 (delivery): CI/CD pipeline, preview and production environments, per-environment secrets
3. Task 0.3 (delivery): Auth interface, dev credential provider, signed session, roles, provider selection, production refusal
4. Task 0.4 (realignment): Realignment over Tasks 0.1 to 0.3
5. Task 0.5 (delivery): Route guard and authenticated whoami endpoint reaching the agent
6. Task 0.6 (delivery): Connect scoped-token round-trip against one real system
7. Task 0.7 (delivery): Public intake placeholder behind WAF and Bot ID
8. Task 0.8 (realignment): Realignment over Tasks 0.5 to 0.7
9. Task 0.9 (delivery): Eval and tracing harness in CI, green on an empty suite with one real trace
10. Task 0.10 (delivery): Metrics baseline artefact
11. Task 0.11 (realignment): Final realignment and Phase 0 done-when verification

---

### Task 0.1: Repository scaffold and booting agent with liveness check
- Type: delivery
- Status: done
- Vertical slice: a single eve project that installs, builds, boots, and answers an unauthenticated liveness check locally.
- Delivers: the one repository holding an eve project (the agent directory, tools and schedules as TypeScript, following eve's conventions) that builds with the documented commands; a bare agent that boots; an unauthenticated liveness endpoint that returns healthy (requirements A1, A2, C1).
- Defers: CI/CD and deployment (Task 0.2); the auth interface, dev provider, and route guards (Tasks 0.3, 0.5); Connect (Task 0.6); edge protection (Task 0.7); observability (Task 0.9); all channel logic, model calls, and business behaviour (Phase 1 and later).
- Depends on: none.
- Honours ADRs: 0002 (build on the Vercel Agent Stack using eve), 0007 (one stack, one repo).
- Evidence: `pnpm install` and `pnpm build` exiting 0; the liveness endpoint returning HTTP 200 healthy to an unauthenticated request (curl output or an equivalent test); `git status` showing the new project.
- /goal condition:
  > Task 0.1 (repository scaffold and booting agent with liveness check) is complete when a clean install and build of the eve project succeed and the agent boots and answers an unauthenticated liveness check. Prove it by surfacing in the transcript: (a) `pnpm install` and `pnpm build` both exiting 0; (b) the agent running locally and its liveness endpoint returning HTTP 200 with a healthy body to an unauthenticated request (show the curl command and its output, or an equivalent test's output); and (c) `git status` showing the new eve project staged or committed. Build only the single eve project (ADR 0002, ADR 0007) and the liveness endpoint. Do not add channel logic, model calls, auth, route guards, CI configuration, edge protection, or any business behaviour, which are later tasks 0.2 to 0.10. Use pnpm, never npm, and use the current production versions of packages. Set Task 0.1's Status line in docs/phase-0/tasks.md to done only after the build and liveness checks pass, and surface the updated status line. Or stop after 25 turns.
- Done when: a clean checkout installs and builds with `pnpm`, the agent boots, and the liveness endpoint returns healthy without a login. Project structure follows eve's conventions and there is no second repository or external build tool in the critical path (A2). No auth, channel, model, or business logic is present.

---

### Task 0.2: CI/CD pipeline, preview and production environments, per-environment secrets
- Type: delivery
- Status: done
- Vertical slice: opening a change runs a build-and-check gate in GitHub Actions and, on pass, yields a reachable Vercel preview URL of the booting agent; production is protected; secrets are per environment.
- Delivers: a GitHub Actions build-and-check gate on every change; a Vercel preview deployment per pull request via the Vercel GitHub integration; a protected production environment that deploys only from the main branch through the pipeline; secrets configured per environment with none committed; if achievable, the deploy verifying the agent booted before reporting healthy (requirements B1, B2, B3, B4, ADR 0024).
- Defers: auth (Tasks 0.3, 0.5); edge protection (Task 0.7); the eval gate wiring into CI (Task 0.9 attaches to this pipeline); all business logic.
- Depends on: Task 0.1.
- Honours ADRs: 0024 (CI/CD on GitHub Actions with the Vercel integration), 0007 (one repo), 0002 (the stack).
- Evidence: a GitHub Actions run with conclusion success; the preview URL liveness endpoint returning HTTP 200; evidence the gate blocks a failing change; a secret scan finding nothing committed.
- /goal condition:
  > Task 0.2 (CI/CD pipeline, preview and production environments, per-environment secrets) is complete when every change runs a build-and-check gate in GitHub Actions, a passing change produces a reachable Vercel preview deployment of the agent, production is protected to deploy only from the main branch through the pipeline, and secrets are per environment with none committed, per ADR 0024 and requirements B1 to B3. Prove it by surfacing in the transcript: (a) a GitHub Actions run with conclusion success on a change (show `gh run list` or `gh pr checks` output); (b) the resulting preview URL's liveness endpoint returning HTTP 200 (show the curl and its output); (c) evidence that a failing check blocks the deploy (show the workflow gating the deploy on the check, or a failing run that did not deploy); and (d) a secret scan over the repo finding no committed secrets (show the command and its clean output). Build only the pipeline and environments. Do not add auth, edge protection, model calls, or business logic. Use pnpm and the Vercel GitHub integration (ADR 0024), never npm or hand deploys to production. If the deploy can also verify the agent booted before reporting healthy (requirement B4), include it; otherwise note it deferred to a follow-up. Set Task 0.2's Status line in docs/phase-0/tasks.md to done only after the preview is shown reachable and the gate is shown to block on failure, and surface the updated status line. Or stop after 30 turns.
- Done when: a change yields a reachable preview URL of the agent; a failing check blocks the deploy; production deploys only through the pipeline from the agreed source; preview and production read their own secrets and a scan finds none in version control. B4 (deploy verifies boot) is included if achievable, else recorded as deferred follow-up.

---

### Task 0.3: Auth interface, dev credential provider, signed session, roles, provider selection, production refusal
- Type: delivery
- Status: done
- Vertical slice: a configured dev user signs in through the dev provider and receives a stateless signed session carrying id, email, and roles; bad credentials are refused; the env var selects an inert Entra stub; the dev provider refuses to start in production.
- Delivers: the auth interface returning a user with id, email, and roles (D1); the dev credential provider authenticating a username and password against a configured user list and issuing a stateless signed session carrying roles (D2, ADR 0008); provider selection by environment variable with the Entra-via-Passport provider present as an inert stub (D3); the dev provider failing closed in a production configuration (D4); at least recruiter, hiring-manager, and an internal engineering role defined (D5).
- Defers: the route guard and the whoami endpoint (Task 0.5); the real Entra integration and the dev-provider decommission (Phase 5); any session datastore (excluded by ADR 0008).
- Depends on: Task 0.1.
- Honours ADRs: 0003 (swappable auth interface), 0008 (stateless signed sessions). Leaves the Entra app-role seam for ADR 0023 (Phase 5).
- Evidence: `pnpm test src/auth` exiting 0; a production-configuration boot with the dev provider selected refusing to start; `git status --porcelain` scoped to the auth code.
- /goal condition:
  > Task 0.3 (auth interface, dev credential provider, signed session, roles, provider selection, production refusal) is complete when the auth interface returns a user with id, email, and roles (ADR 0003); the dev credential provider authenticates a configured username and password and issues a stateless signed session carrying roles (ADR 0008); bad credentials are refused; provider selection is by environment variable with the Entra-via-Passport provider present as an inert stub selectable by that variable; and the dev provider refuses to start in a production configuration, failing closed (requirement D4). Prove it by surfacing in the transcript: (a) `pnpm test src/auth` exiting 0 with tests covering successful sign-in issuing a role-bearing session, bad-credential refusal, session mint-and-verify, and the env var selecting the inert stub; (b) a check that booting with a production configuration and the dev provider selected refuses to start (show the test or boot output); and (c) `git status --porcelain` showing no changes outside the auth code and its tests. Define at least the recruiter, hiring-manager, and internal engineering roles (requirement D5). Do not build the route guard or the whoami endpoint (Task 0.5), do not add a session datastore (ADR 0008 is stateless), and do not implement the Entra integration (Phase 5, stub only). Use pnpm, never npm. Set Task 0.3's Status line in docs/phase-0/tasks.md to done only after the auth tests and the production-refusal check pass, and surface the updated status line. Or stop after 25 turns.
- Done when: a configured test user signs in and receives a session carrying roles; bad credentials are refused; switching the env var selects the inert stub; a production-configured boot with the dev provider refuses to start. Roles are part of the interface from day one, sessions are stateless signed tokens, and no provider coupling has leaked into the interface.

---

### Task 0.4: Realignment over Tasks 0.1 to 0.3
- Type: realignment
- Status: done
- Vertical slice: not a delivery task; it builds nothing. It re-proves Tasks 0.1 to 0.3 against the spec, corrects any Status that does not match reality, and produces a corrective plan.
- Delivers: a realignment report at `docs/phase-0/realignment-1.md` marking each in-scope requirement (A1, A2, B1 to B4, C1, D1 to D5) done, partial, missing, or drifted against re-run evidence; corrected Status lines in this file; flags for slop, scope creep, and any architectural decision lacking an ADR; a prioritised corrective plan.
- Defers: any new feature work (none is in scope here); large corrective work is appended as new tasks rather than done inline.
- Depends on: Tasks 0.1, 0.2, 0.3.
- Honours ADRs: 0001 (record decisions), and re-checks 0002, 0008, 0024 alignment.
- Evidence: re-run outputs of `pnpm build`, the liveness check, the preview URL, `pnpm test src/auth`, and the production-refusal check; corrected Status lines; `git status` showing the report.
- /goal condition:
  > Task 0.4 (realignment over Tasks 0.1 to 0.3) is complete when every in-scope Phase 0 requirement those tasks were meant to satisfy (A1, A2, B1 to B4, C1, D1 to D5) is listed and marked done, partial, missing, or drifted against re-run evidence, not against the Status claims in tasks.md. Re-run the checks from Tasks 0.1 to 0.3 and surface their output: `pnpm build` exiting 0, the liveness endpoint returning HTTP 200 unauthenticated, the Vercel preview URL reachable, `pnpm test src/auth` exiting 0, and the production-refusal check. For any task whose Status reads done but whose checks no longer pass, correct its Status back to partial or todo in docs/phase-0/tasks.md; for any at todo or partial that the checks show finished, correct it the other way. Flag any slop (half-finished, untested, or broken-intermediate work), any scope creep or gold-plating beyond the Phase 0 spec (cut it, or record it as a proposed scope change for a human, do not silently keep it), and any architectural decision made in Tasks 0.1 to 0.3 that lacks an ADR (per the adr-management skill, write the missing ADR in Proposed status or record that it must be written; confirm the CI/CD matches ADR 0024 and the session matches ADR 0008). Write the findings and a short prioritised corrective plan (finishing partials and removing slop before any new work) to docs/phase-0/realignment-1.md. Build nothing new. Prove completion by surfacing the re-run check outputs, any corrected Status lines, and `git status` showing realignment-1.md added. Set Task 0.4's Status line in docs/phase-0/tasks.md to done after the report is written and the checks are re-run, and surface the updated status line. Or stop after 20 turns.
- Done when: the report exists, each in-scope requirement is marked against re-run evidence, every Status in this file matches what the checks show, slop and scope creep and decision drift are flagged with actions, and any undocumented decision has a Proposed ADR or a recorded instruction to write one.

---

### Task 0.5: Route guard and authenticated whoami endpoint reaching the agent
- Type: delivery
- Status: done
- Vertical slice: an authenticated request with a role-mapped dev session reaches the agent through a route guard and sees its own id, email, and roles; a request without a valid session is refused.
- Delivers: a route guard that depends only on the auth interface and roles, never on a provider (D1); an authenticated whoami-style endpoint behind the guard that reaches the agent boot path and returns the resolved id, email, and roles (C2); a guard able to require a specific role (D5).
- Defers: any business logic beyond returning identity and roles; Connect (Task 0.6); edge protection (Task 0.7); channel and model logic (Phase 1, Phase 2).
- Depends on: Tasks 0.1, 0.3.
- Honours ADRs: 0003 (guards depend on the interface, not a provider), 0008 (guards read identity and roles from the verified token).
- Evidence: `pnpm test` for the guard and whoami exiting 0, with cases for an authed request returning id/email/roles, a no-session request refused, and a role-gated route enforcing its role; optionally a local curl with a minted dev session.
- /goal condition:
  > Task 0.5 (route guard and authenticated whoami endpoint reaching the agent) is complete when an authenticated internal request carrying a valid role-mapped dev session reaches the agent through a route guard and receives its own id, email, and roles, and a request with no valid session is refused (requirement C2, ADR 0003). The guard depends only on the auth interface and roles, never on a provider (requirement D1), and a guard can require a specific role (requirement D5). Prove it by surfacing in the transcript: (a) `pnpm test` for the guard and whoami exiting 0 with cases for an authenticated request returning id, email, and roles, a no-session request refused, and a role-gated route enforcing its required role; and (b) optionally a local run showing a minted dev session reaching the whoami endpoint (curl and output). Build only the guard and the whoami surface, returning id, email, and roles and nothing more, wired to the agent boot path from Task 0.1 using the auth interface from Task 0.3. Do not add business logic, channel logic, model calls, Connect, or edge protection. Use pnpm, never npm. Set Task 0.5's Status line in docs/phase-0/tasks.md to done only after the guard and whoami tests pass, and surface the updated status line. Or stop after 20 turns.
- Done when: an authed role-mapped dev request reaches the agent and sees its id, email, and roles; an unauthenticated request to that surface is refused; the guard reads roles from the interface alone; a role requirement is enforceable. No business logic is present beyond returning identity and roles.

---

### Task 0.6: Connect scoped-token round-trip against one real system
- Type: delivery
- Status: todo
- Blocked: the proof path (`src/connect/proof.ts`) is built and Connect is reachable, but no real external system is provisioned (no Microsoft 365 Connect connector for this project, no confirmed ATS), so the round-trip cannot complete and is not faked. Recorded for engineering and stakeholder in `docs/phase-0/task-0.6-blocker.md`. Stays todo until a real read response and audit record are surfaced.
- Vertical slice: a single proof path obtains a scoped, short-lived Connect token for one real external system, makes one minimal read that returns a real response, and logs the issuance and use.
- Delivers: one Connect-issued, scoped, short-lived credential against Microsoft 365 / Outlook (read-only calendar free/busy) by default, or a confirmed ATS with a read-only scope as fallback; one minimal read call that succeeds (E1); an audit log of the round-trip with who, what, when, scope, and target (E2); the scope requested kept read-only and narrow (E3).
- Defers: the reusable Connect token broker (ADR 0009, Phase 1); any write scope; any real ATS or calendar reads and writes beyond the single proof; copying candidate records into the agent (ADR 0006).
- Depends on: Task 0.1.
- Honours ADRs: 0009 (Phase 0 proves one round-trip only and deliberately does not build the reusable broker), 0006 (minimal, non-PII read; system of record stays put), 0005 (Connect treated as public beta, gated by a phase-start maturity check).
- Evidence: the proof path's run output showing a Connect-issued short-lived token, the real read response, and the audit record; or, if no system is reachable, a clear recorded blocker.
- /goal condition:
  > Task 0.6 (Connect scoped-token round-trip against one real system) is complete when one scoped, short-lived credential is obtained through Connect for one real external system (Microsoft 365 / Outlook with a read-only calendar free/busy scope by default, or a confirmed ATS with a read-only scope), used to make one minimal read call that returns a real response, and the issuance and use are audit-logged (requirements E1, E2, E3). Prove it by surfacing in the transcript the proof path's run output showing: (a) a Connect-issued short-lived token, not a long-lived static credential; (b) the real read response from the external system; and (c) the audit log record stating who, what, when, scope, and target. The read must be a non-PII minimal read (ADR 0006); request a read-only narrow scope only, with no write scope. If no real external system is reachable at run time, do not mark the task done and do not fake a response: surface a clear blocking note that the round-trip needs a reachable system, and stop. Build only a single proof path. Do not build a reusable token broker (ADR 0009, Phase 1), do not add write scopes, and do not copy candidate records into the agent (ADR 0006). Use pnpm, never npm. Set Task 0.6's Status line in docs/phase-0/tasks.md to done only after a real read response and the audit record are surfaced, and surface the updated status line. Or stop after 25 turns.
- Done when: the read returns a real response using a Connect-issued token, not a static credential; the round-trip is audit-logged; the requested scope is read-only and narrow. The reusable broker is explicitly not built. If no external system is reachable, the task is not marked done and the blocker is recorded for engineering and stakeholder.

---

### Task 0.7: Public intake placeholder behind WAF and Bot ID
- Type: delivery
- Status: todo
- Vertical slice: an internet-facing intake placeholder endpoint is reachable, returns a placeholder response, and carries WAF and Bot ID protection at the edge, with no intake logic.
- Delivers: the public intake endpoint as a protected placeholder with Vercel WAF and Bot ID in front of it (F1); if achievable, a basic bot probe challenged or blocked at the edge rather than by the application (F2).
- Defers: live intake, webhook verification, and channel logic (Phase 1, ADR 0010); any candidate-data handling.
- Depends on: Task 0.2.
- Honours ADRs: 0002 (Vercel-native edge protection); the Phase 0 spec records that no separate Phase 0 ADR is needed for the edge placeholder, with the security posture folding into Phase 1 (ADR 0010) when the endpoint becomes live.
- Evidence: a request to the deployed placeholder returning its placeholder response; the committed WAF and Bot ID configuration or the Vercel firewall CLI output for the project; optionally a bot probe challenged at the edge.
- /goal condition:
  > Task 0.7 (public intake placeholder behind WAF and Bot ID) is complete when an internet-facing intake placeholder endpoint exists, returns a placeholder response, carries Vercel WAF and Bot ID protection at the edge, and contains no intake or channel logic (requirements F1, F2; Phase 1 makes it functional). Prove it by surfacing in the transcript: (a) a request to the deployed placeholder endpoint returning its placeholder response (show the curl and output); and (b) evidence that WAF and Bot ID are configured in front of it (show the committed firewall or Bot ID configuration, or the Vercel firewall CLI output for the project). If achievable, also show a basic bot probe being challenged or blocked at the edge rather than by the application (requirement F2); otherwise note it deferred. Build only the protected placeholder. Do not add intake logic, webhook verification, channel logic, or candidate-data handling (Phase 1, ADR 0010). Use pnpm, never npm. Set Task 0.7's Status line in docs/phase-0/tasks.md to done only after the placeholder responds and the edge protection is shown configured, and surface the updated status line. Or stop after 20 turns.
- Done when: the endpoint is reachable, returns a placeholder response, and carries WAF and Bot ID; it contains no intake or channel logic. F2 (edge challenges a probe) is shown if achievable, else recorded as deferred.

---

### Task 0.8: Realignment over Tasks 0.5 to 0.7
- Type: realignment
- Status: todo
- Vertical slice: not a delivery task; it builds nothing. It re-proves Tasks 0.5 to 0.7 against the spec, corrects any Status that does not match reality, and produces a corrective plan.
- Delivers: a realignment report at `docs/phase-0/realignment-2.md` marking each in-scope requirement (C2, D1, D5 for the guard; E1 to E3; F1, F2) done, partial, missing, or drifted against re-run evidence; corrected Status lines; flags for slop, scope creep, and undocumented decisions; a prioritised corrective plan.
- Defers: new feature work; large corrective work is appended as new tasks.
- Depends on: Tasks 0.5, 0.6, 0.7.
- Honours ADRs: 0001 (record decisions), 0009 (confirm the Connect work stayed a one-off and did not build the broker).
- Evidence: re-run outputs of the guard and whoami tests, the Connect proof path, and the placeholder behind WAF and Bot ID; corrected Status lines; `git status` showing the report.
- /goal condition:
  > Task 0.8 (realignment over Tasks 0.5 to 0.7) is complete when every in-scope Phase 0 requirement those tasks were meant to satisfy (C2, D1, D5 for the guard; E1 to E3; F1, F2) is listed and marked done, partial, missing, or drifted against re-run evidence, not against the Status claims in tasks.md. Re-run the checks and surface their output: `pnpm test` for the guard and whoami, the Connect round-trip proof path (a real read response plus its audit record, or the recorded blocker if no system is reachable), and the placeholder endpoint returning its response behind WAF and Bot ID. For any task whose Status reads done but whose checks no longer pass, correct its Status back to partial or todo in docs/phase-0/tasks.md; for any at todo or partial that the checks show finished, correct it the other way. Flag any slop, any scope creep or gold-plating beyond the Phase 0 spec (cut it, or record it as a proposed scope change for a human), and any architectural decision in Tasks 0.5 to 0.7 that lacks an ADR (write it Proposed or record that it must be written; confirm the Connect work stayed a one-off and did not build the ADR 0009 broker, and that the edge work needs no Phase 0 ADR per the phase spec). Write the findings and a prioritised corrective plan to docs/phase-0/realignment-2.md. Build nothing new. Prove completion by surfacing the re-run outputs, any corrected Status lines, and `git status` showing realignment-2.md added. Set Task 0.8's Status line in docs/phase-0/tasks.md to done after the report is written and the checks are re-run, and surface the updated status line. Or stop after 20 turns.
- Done when: the report exists, each in-scope requirement is marked against re-run evidence, every relevant Status matches what the checks show, slop and scope creep and decision drift are flagged with actions, and the Connect one-off boundary is confirmed intact.

---

### Task 0.9: Eval and tracing harness in CI, green on an empty suite with one real trace
- Type: delivery
- Status: todo
- Vertical slice: the eval harness runs in CI as a real gate and passes on an empty suite, and tracing emits a real trace from the authenticated whoami path, so green means wired rather than absent.
- Delivers: the eval harness running in CI as a gate that fails the build if it cannot run, passing on an empty suite (G1); tracing wired so at least one path (the authenticated whoami path from Task 0.5) emits a real trace (G2); a short note on where Phase 2 attaches eval cases and recommendation traces (G3); if the harness introduces a tool not already covered by ADR 0002, a Proposed ADR recording that choice.
- Defers: all eval content, bias and disparate-impact checks, and any recommendation trace (Phase 2, ADR 0013 and the evals-policy ADR authored at Phase 2 start).
- Depends on: Tasks 0.2, 0.5.
- Honours ADRs: 0004 (tracing and evals must exist before any screening ships, which is why the empty frame stands up now), 0002 (prefer eve-native observability); records a new ADR if a distinct eval or tracing tool is introduced.
- Evidence: the eval harness command running and exiting 0 on the empty suite, shown running in CI as a gate; a real trace for the authenticated whoami path (span output or a trace id); the tooling ADR or a note that ADR 0002 covers it.
- /goal condition:
  > Task 0.9 (eval and tracing harness in CI, green on an empty suite with one real trace) is complete when the eval harness runs in CI as a real gate and passes on an empty suite, and tracing is wired so at least one path (the authenticated whoami path from Task 0.5) emits a real trace, so green means wired not absent (requirements G1, G2, G3). Prove it by surfacing in the transcript: (a) the eval harness command running and exiting 0 on the empty suite, plus evidence it runs in CI as a gate that fails the build if the harness cannot run (show the CI step and a run, or a deliberately broken harness failing the build); and (b) a real trace emitted for the authenticated whoami path (show the span or trace output, or a trace id). If the harness introduces an eval or tracing tool not already covered by ADR 0002, record that decision as a new ADR in Proposed status (per the adr-management skill, next number after the highest in docs/adr, add the index row) and reference it here; if it uses eve-native observability already covered by ADR 0002, note that instead, so no undocumented tooling decision is left. Add a short note (requirement G3) on where Phase 2 attaches eval cases and recommendation traces. Build only the empty frame and one real trace. Do not add eval content, bias or disparate-impact checks, or any recommendation trace (Phase 2). Use pnpm, never npm. Set Task 0.9's Status line in docs/phase-0/tasks.md to done only after the gate runs green on the empty suite and one real trace is surfaced, and surface the updated status line. Or stop after 25 turns.
- Done when: the eval gate runs in CI and a harness that cannot run fails the build; the empty suite passes; one real trace is emitted from the authenticated path; there is a short note on where Phase 2 plugs in; and the harness tooling choice is either covered by ADR 0002 or recorded as a Proposed ADR.

---

### Task 0.10: Metrics baseline artefact
- Type: delivery
- Status: todo
- Vertical slice: a versioned artefact at `docs/metrics/baseline.md` records the baseline figures (or marks them pending), the capture method, the capture date, and the owner and re-measurement method for each figure.
- Delivers: the baseline of recruiter admin hours per requisition, time-to-hire by stage, and stage-to-stage drop-off, captured and recorded as a versioned repo artefact stating its figures (or explicit pending markers), method, and date (H1); each figure naming its owner and re-measurement method (H2). Aggregate figures only, no candidate identifiers.
- Defers: nothing technical; the actual figures are supplied by the business and capture may complete before Phase 1 ships per the phase spec's resolution, with any not-yet-supplied figure marked pending.
- Depends on: none.
- Honours ADRs: 0006 (aggregate, non-identifying figures only; no candidate records).
- Evidence: the artefact's content (method, date, per-figure owner, re-measurement method, figures or pending markers); `git status` showing `docs/metrics/baseline.md` added.
- /goal condition:
  > Task 0.10 (metrics baseline artefact) is complete when a versioned artefact exists at docs/metrics/baseline.md recording the recruiter-admin-hours-per-requisition, time-to-hire-by-stage, and stage-to-stage drop-off baseline, stating the capture method, the capture date, and the owner and re-measurement method for each figure (requirements H1, H2). Figures supplied by the business are recorded; any figure not yet supplied is marked explicitly as pending with its owner (the TA operations lead with a data analyst) and its due point (before Phase 1 ships), consistent with the phase spec's resolution that capture completes before Phase 1 ships. The artefact holds aggregate figures only, with no candidate identifiers (ADR 0006). Prove it by surfacing in the transcript the artefact's content (its method, date, per-figure owner, re-measurement method, and figures or pending markers) and `git status` showing docs/metrics/baseline.md added. Build only the documentation artefact. Do not build any software pipeline, and do not record candidate-level or identifying data. Set Task 0.10's Status line in docs/phase-0/tasks.md to done only after the artefact exists with method, date, and per-figure owner, and surface the updated status line. Or stop after 15 turns.
- Done when: the artefact exists, states its figures or explicit pending markers, names the capture method and date, and gives each figure an owner and a re-measurement method. It holds aggregate data only, with no candidate identifiers.

---

### Task 0.11: Final realignment and Phase 0 done-when verification
- Type: realignment
- Status: todo
- Vertical slice: not a delivery task; it builds nothing. It re-proves Tasks 0.9 and 0.10 and verifies the seven Phase 0 done-when conditions hold together as one spine.
- Delivers: a final realignment report at `docs/phase-0/realignment-3.md` marking Tasks 0.9 and 0.10's requirements (G1 to G3, H1, H2) and each of the seven Phase 0 done-when bullets done, partial, missing, or drifted against re-run evidence; corrected Status lines; flags for any slop, scope creep, or undocumented decision across the whole phase; a prioritised corrective plan separating Phase 0 sign-off blockers from human decisions.
- Defers: new feature work; large corrective work is appended as new tasks for a human to schedule.
- Depends on: Tasks 0.9, 0.10 (and reads across all earlier tasks for the done-when check).
- Honours ADRs: 0001 (record decisions), and re-checks alignment with all Phase 0 ADRs (0002, 0003, 0006, 0008, 0009, 0024).
- Evidence: re-run outputs across the spine (build, liveness, preview URL, auth and guard tests, production-refusal, Connect proof, edge curl, eval gate, trace, baseline artefact); the done-when table; corrected Status lines; `git status` showing the report.
- /goal condition:
  > Task 0.11 (final realignment and Phase 0 done-when verification) is complete when Tasks 0.9 and 0.10 are checked the way the earlier realignments checked their tasks, and the seven Phase 0 done-when conditions are verified to hold together as one spine, not in isolation. List each Phase 0 done-when bullet and mark it done, partial, missing, or drifted against re-run evidence: (1) an authenticated role-mapped dev request reaches the booting agent and sees its roles while an unauthenticated request is refused; (2) one Connect-issued scoped short-lived token round-trips against a real system with one read, logged, or the recorded blocker if no system is reachable; (3) CI builds and checks every change and deploys a passing change to a reachable preview, with protected production and per-environment secrets; (4) the dev provider refuses to start in production, verified; (5) the public placeholder is reachable behind WAF and Bot ID with no intake logic; (6) the eval and tracing harness runs green on an empty suite in CI with one real trace; (7) the metrics baseline artefact is recorded with method and date. Re-run the underlying checks and surface their output (`pnpm build`, liveness, preview URL, `pnpm test`, the production-refusal check, the Connect proof, the edge curl, the eval gate, the trace, and the baseline artefact). Correct any Status line in docs/phase-0/tasks.md that does not match reality. Flag any slop, scope creep, or undocumented architectural decision across the phase, and per the adr-management skill write any missing ADR in Proposed status or record that it must be written. Write the findings, the done-when table, and a prioritised corrective plan to docs/phase-0/realignment-3.md, separating what must be fixed before Phase 0 is signed off from what a human must decide. Build nothing new. Set Task 0.11's Status line in docs/phase-0/tasks.md to done after the report is written and the done-when checks are re-run, and surface the updated status line. Or stop after 25 turns.
- Done when: the report exists; Tasks 0.9 and 0.10 are re-proved; each of the seven done-when bullets is marked against re-run evidence and the spine is shown to work end to end (or every gap is named with an action); every Status in this file matches reality; and any undocumented decision has a Proposed ADR or a recorded instruction to write one.

## Assumptions

- The Connect round-trip (Task 0.6) targets Microsoft 365 / Outlook with a read-only calendar free/busy scope by default, switching to a confirmed ATS read-only scope only if M365 is not reachable first. This follows the phase spec's resolved open question.
- Connect and Passport are public beta, not private beta, at build start, and so are permitted under ADR 0005. Tasks assume the phase-start maturity check passes; if either is private beta, that component is held and a blocking note raised (recorded in the relevant task or realignment).
- CI/CD is GitHub plus GitHub Actions plus the Vercel GitHub integration, per ADR 0024. A Vercel team and a GitHub repository exist or are provisioned at phase start.
- The metrics baseline (Task 0.10) is a documentation artefact; its figures come from the business and may be marked pending until before Phase 1 ships, with the artefact's structure, method, owner, and date in place during Phase 0.
- ADR 0008 is Accepted (it is, in the register), so the dev provider and guards build against the stateless signed-session shape.
- The eval and tracing harness (Task 0.9) prefers eve-native observability; if it introduces a distinct tool, the task records a Proposed ADR for that choice.

## Open questions

Grouped by who answers them. None blocked the slicing; each is carried into the task that needs it.

- Engineering and stakeholder: is a Microsoft 365 test tenant (or a confirmed ATS) reachable at phase start for the Connect round-trip (Task 0.6)? This is the one external dependency that can stall the phase; confirm on day one.
- Engineering and security: are Connect and Passport confirmed at public beta or GA, not private beta, at build start (Tasks 0.3, 0.6)? Record the result in the repo per the phase spec.
- Data and stakeholder: what are the baseline figures, and are any available during Phase 0 or all pending until before Phase 1 ships (Task 0.10)? The owner is the TA operations lead with a data analyst.
- Engineering: which eval and tracing tooling does the harness use, and is it covered by ADR 0002 or does it need its own ADR (Task 0.9)? The task records the decision either way.

## Consistency note flagged for a human

The phase spec has a small internal tension on the metrics baseline. Requirement H1 and the phase-level done-when read as if the baseline figures are recorded during Phase 0, while the resolved open question states that figure capture completes before Phase 1 ships, not before Phase 0 build starts. Task 0.10 reconciles these by requiring the artefact, its method, owner, date, and re-measurement plan in Phase 0, with any not-yet-supplied figure marked explicitly as pending. This is a working reconciliation, not a spec edit. If a human wants the actual figures to be a hard Phase 0 sign-off gate, that should be stated and Task 0.10 (and the phase-level acceptance) adjusted accordingly.
