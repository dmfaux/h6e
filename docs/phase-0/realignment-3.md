# Realignment 3: Tasks 0.9 and 0.10, and the Phase 0 done-when spine

- Type: realignment (Task 0.11). Builds nothing.
- Date: 2026-06-23
- Scope: re-prove Tasks 0.9 (eval and tracing harness in CI) and 0.10 (metrics baseline artefact) the way the earlier realignments checked their tasks, then verify the seven Phase 0 done-when conditions hold together as one spine, not in isolation. Correct any drifted Status in `tasks.md`. Flag slop, scope creep, and any undocumented decision across the whole phase. Separate Phase 0 sign-off blockers from human decisions.

## Summary

Phase 0 stands as one working spine. Six of the seven done-when conditions are done against re-run evidence; the seventh (the Connect round-trip) is blocked exactly as recorded, and the done-when bullet for it is written to accept that recorded blocker, so the phase is satisfiable as written but the round-trip itself stays unproven until a real system is reachable.

- Task 0.9 (eval and tracing harness): all of G1, G2, G3 pass. The eval gate runs green on the empty suite, runs in CI as a real gate, and one real OpenTelemetry trace is emitted from the authenticated whoami path. Status `done` is correct, no change.
- Task 0.10 (metrics baseline artefact): H1 and H2 pass. The artefact exists with method, date, per-figure owner, and re-measurement method, figures marked pending per the recorded reconciliation. Status `done` is correct, no change.
- The realignment chain is now whole: `realignment-1.md` (Task 0.4) and `realignment-2.md` (Task 0.8) both exist and are committed, closing the gap Realignment 2 flagged.

No Status line in `tasks.md` needed correcting except Task 0.11 itself (set to `done` after this report). One documentation drift was corrected: `eval-and-tracing-notes.md` called ADR 0025 "Proposed"; it is Accepted in the register and index, so the note was fixed to match.

No architectural decision across the phase lacks an ADR. The one new tooling decision in this trio (OpenTelemetry for tracing, Task 0.9) is recorded as ADR 0025, now Accepted, and listed in the index. The eval harness is eve-native (ADR 0002). The baseline artefact is documentation honouring ADR 0006.

## Method

Checks were re-run in this environment, not read off the task file:

- `pnpm build` for the scaffold and the gate dependency (done-when 3, 6).
- `pnpm test` (full suite) and the isolated production-refusal pattern for the auth and observability seams (done-when 1, 4, 6).
- `node --test src/observability/whoami-trace.test.ts` for the real trace (done-when 6).
- `pnpm eval` for the eval gate on the empty suite (done-when 6).
- `node src/connect/proof.ts` for the Connect round-trip (done-when 2; expected to surface the recorded blocker).
- Live HTTP checks against the production deployment `https://h6e-olive.vercel.app`: liveness `/eve/v1/health`, the intake placeholder `/intake` with a browser UA and a bot UA, and the unauthenticated whoami refusal (done-when 1, 3, 5).
- `gh run list` for the CI gate history, and a read of `.github/workflows/ci.yml` to confirm the eval gate and the build-and-check gate run on every change (done-when 3, 6).
- A read of the committed `firewall-config.json` against the F2 live result (done-when 5).

The Vercel CLI is not installed in this environment; the live deployment was reached over HTTPS directly. Node 26 is the local runtime, so eve prints an engine warning (it wants Node 24, as CI pins); the warning is cosmetic and does not change any exit code.

## Tasks 0.9 and 0.10: requirement verdicts (against re-run evidence)

| Req | What it requires | Verdict | Evidence |
|-----|------------------|---------|----------|
| G1 | Eval harness runs in CI as a real gate, passes on the empty suite, fails the build if it cannot run | Done | `pnpm eval` exits 0: "evals.config.ts loaded; harness can run", "empty suite: 0 eval cases discovered. Harness green." The gate loads `evals.config.ts` and exits 1 if it cannot (a broken config fails the build). `ci.yml` runs `pnpm eval` as a named "Eval gate" step on every PR to `main` and push to `main`. Recent CI runs conclude `success`. |
| G2 | Tracing wired so at least one path emits a real trace | Done | The authenticated whoami path emits a real OpenTelemetry span: trace id `9c3d013befa0d71a17ac6467a29f9ef5` (32 hex, real W3C), span `internal.whoami`, attributes route/method/status/outcome only. `whoami-trace.test.ts` passes (2 cases: authorised path and refused path both trace). Console exporter only, no egress (ADR 0025, ADR 0006). |
| G3 | A short note on where Phase 2 attaches eval cases and recommendation traces | Done | `eval-and-tracing-notes.md` records where `*.eval.ts` cases attach under `evals/`, where the default judge model and bias cases land, and that recommendation traces auto-trace as `ai.eve.turn` spans in Phase 2. |
| H1 | Baseline of the three measures recorded as a versioned artefact with figures (or explicit pending), method, date | Done | `docs/metrics/baseline.md` v1.0, established 2026-06-23. All three measures (recruiter admin hours per requisition, time-to-hire by stage, stage-to-stage drop-off) present with a capture method and a capture date, figures marked **pending** per the phase reconciliation (capture due before Phase 1 ships). Aggregate-only, no candidate identifiers (ADR 0006). |
| H2 | Each figure names its owner and re-measurement method | Done | Each of the three figures names the owner (TA operations lead, with a data analyst) and a re-measurement method (repeat the same time-diary/ATS-export instrument over a comparable post-Phase 1 window). A status summary table repeats owner and due. |

## The seven Phase 0 done-when conditions, as one spine

| # | Done-when condition | Verdict | Evidence |
|---|---------------------|---------|----------|
| 1 | An authenticated role-mapped dev request reaches the booting agent and sees its roles; an unauthenticated request is refused | Done | Positive path proven by tests: whoami returns id/email/roles, role-gated, 38/38 auth and observability tests pass. The route is wired onto the booting agent as an eve channel (`internal.ts`, `GET /internal/whoami` via `tracedWhoami`), and the agent demonstrably boots (live liveness 200). Negative path proven live: `GET /internal/whoami` with no session returns HTTP 401, `www-authenticate: Bearer`, `{"code":"authentication_required"}`. |
| 2 | One Connect-issued scoped short-lived token round-trips against a real system with one read, logged, or the recorded blocker if no system is reachable | Blocked (recorded); done-when satisfied via its blocker clause | `node src/connect/proof.ts` runs, fails closed, prints "BLOCKED: Connect round-trip needs a reachable system", lists the missing inputs (`VERCEL_OIDC_TOKEN`, `M365_CONNECT_CONNECTOR`), and exits 2. No connector is provisioned (zero connectors for the team, per `task-0.6-blocker.md`). No read was faked. The audit and read-only-scope machinery is built and tested but unexercised. The round-trip itself is **not** proven; the bullet is met only in its "recorded blocker" form. |
| 3 | CI builds and checks every change and deploys a passing change to a reachable preview; production protected; per-environment secrets | Done (B4 a deferred follow-up) | `ci.yml` runs build-and-check (frozen install, `pnpm build`, `pnpm typecheck`, eval gate) and a gitleaks secret-scan on every PR to `main` and push to `main`; `gh run list` shows recent runs `success`. Production is protected by branch protection requiring those checks, and the Vercel Git integration gives each PR a preview and treats `main` as production; the production alias `h6e-olive.vercel.app` is live (200). Secrets are per-environment in Vercel, none committed (`.gitignore` covers `.env*`; gitleaks runs in CI). B4 (deploy verifies boot, not just build) is a recorded P1 follow-up, not a sign-off blocker. |
| 4 | The dev provider refuses to start in production, verified | Done | `isProductionConfig` (`config.ts`) detects production from `APP_ENV`/`NODE_ENV`/`VERCEL_ENV`; `devProviderFromEnv` (`dev.ts`) fails closed first with `ProductionRefusalError`. Tests "selecting dev under a production configuration refuses to start" and "refuses to start in a production configuration" pass. |
| 5 | The public placeholder is reachable behind WAF and Bot ID, with no intake logic | Done | Live `GET /intake` (browser UA) returns 200 and the static placeholder JSON ("No intake, webhook, or channel logic"). Live `GET /intake` (bot UA) returns 403, `x-vercel-mitigated: deny`, `Forbidden` from the edge, not the app. `firewall-config.json` carries the managed `bot_protection` ruleset (active, `log`) and the custom `/intake` bot-UA deny rule. `intake.ts` holds no intake, webhook, or channel logic. |
| 6 | The eval and tracing harness runs green on an empty suite in CI with one real trace | Done | `pnpm eval` exits 0 on the empty suite and runs as a named CI gate (see done-when 3); a broken `evals.config.ts` would exit 1. One real OpenTelemetry trace is emitted from the whoami path (see G2). Green means wired, not absent. |
| 7 | The metrics baseline artefact is recorded with method and date | Done | `docs/metrics/baseline.md` v1.0, established 2026-06-23, with per-figure method, date, owner, and re-measurement method; figures pending per the recorded reconciliation (see H1, H2). |

Spine reading: the auth seam (1, 4), the CI/deploy gate that ships and protects it (3), the public edge surface in front of it (5), and the observability frame that traces it (6) all hold together and are exercised end to end against the live deployment and the test suite. The metrics baseline (7) is in place as a versioned artefact. The one gap in the spine is the Connect round-trip (2): the proof path is built and fails closed honestly, but no real external system has ever been reached, so that seam is proven only as far as "refuses to fake it". This is the single external dependency the phase has flagged from the start.

## Re-run evidence

### Build, full test suite, production refusal

```
pnpm build      -> exit 0
pnpm test       -> tests 38, pass 38, fail 0   (exit 0)
prod-refusal    -> "selecting dev under a production configuration refuses to start"  pass
```

### Eval gate on the empty suite (`pnpm eval`)

```
[eval-gate] evals.config.ts loaded; harness can run.
[eval-gate] empty suite: 0 eval cases discovered. Harness green.
exit 0
```

### Real trace from the whoami path (`node --test src/observability/whoami-trace.test.ts`)

```
WHOAMI TRACE {
  "traceId": "9c3d013befa0d71a17ac6467a29f9ef5",
  "spanId": "24c90b111f017acc",
  "name": "internal.whoami",
  "attributes": { "http.request.method": "GET", "url.path": "/internal/whoami",
                  "http.response.status_code": 200, "auth.outcome": "authorized" }
}
tests 2, pass 2, fail 0
```

### Connect round-trip (`node src/connect/proof.ts`)

```
Task 0.6 Connect round-trip proof path
Requested scope: ["Calendars.Read"]
BLOCKED: Connect round-trip needs a reachable system.
Missing: VERCEL_OIDC_TOKEN, M365_CONNECT_CONNECTOR (none configured for this project)
exit=2
```

### Live deployment (`https://h6e-olive.vercel.app`)

```
GET /eve/v1/health           -> 200  {"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}
GET /intake   (browser UA)   -> 200  {"ok":true,"surface":"public-intake-placeholder","phase":0,...}
GET /intake   (bot UA)       -> 403  x-vercel-mitigated: deny   Forbidden
GET /internal/whoami (none)  -> 401  www-authenticate: Bearer   {"code":"authentication_required"}
```

### CI gate (recent runs, `gh run list`)

```
success  Merge pull request #10 ...                CI  main  push
success  Task 0.10: metrics baseline artefact      CI  task-0.10-metrics-baseline  pull_request
success  Task 0.9: eval and tracing harness ...    CI  task-0.9-eval-and-tracing-frame  pull_request
```

## Status reconciliation

| Task | Status in `tasks.md` | What the checks show | Action |
|------|----------------------|----------------------|--------|
| 0.1 to 0.8 | done / skipped | Re-proven in Realignments 1 and 2; still hold (live spine checks above) | None. |
| 0.9 | done | G1, G2, G3 all pass | None. `done` is correct. |
| 0.10 | done | H1, H2 pass | None. `done` is correct. |
| 0.6 | skipped | Proof path blocked, no connector, no faked read | None. `skipped` is correct and user-accepted. |
| 0.11 | todo -> done | This report written, done-when checks re-run | Set to `done`. |

No Status line for a delivery task needed correcting. Every claim matched the re-run evidence.

## Slop, scope creep, gold-plating (whole phase)

Nothing across the phase needs cutting. Notes:

- The whoami trace wrapper covers both the authorised and the refused branch of the same route (`whoami-trace.test.ts` has both). This is one span wrapper over one route, not a second feature, and it is within G2. Keep.
- The eval gate (`eval-gate.mjs`) discovers `*.eval.ts` and, when cases exist, delegates to `eve eval --strict --junit`. That delegation path is unused in Phase 0 (zero cases) but adds no eval content; it makes "green means wired" honest and documents the Phase 2 attach point. Minimal, not creep. Keep.
- The Connect proof path stays a single one-off script with no broker, cache, or reuse, which is the intended ADR 0009 boundary. Keep.
- The metrics baseline holds aggregate-only figures with explicit pending markers, exactly the recorded reconciliation, not half-finished work. Keep.
- The F2 custom WAF rule is a coarse user-agent regex, fine as a Phase 0 edge demonstration but not robust bot defence; already recorded as a Phase 1 follow-up in Realignment 2. No action now.

## ADR check (whole phase)

- ADR 0025 (tracing via OpenTelemetry) is Accepted and indexed. It records the one new tooling decision in the phase (the four `@opentelemetry/*` packages and manual spans on non-model paths). No undocumented tracing decision is left.
- The eval harness introduces no new tool: it is eve-native `eve eval` behind a thin exit-code adapter, covered by ADR 0002. The adapter is a build detail, not an architectural decision.
- The Connect one-off boundary is intact (no ADR 0009 broker built). The edge work needs no Phase 0 ADR per the phase spec; its posture folds into ADR 0010 at Phase 1.
- The metrics baseline is documentation honouring ADR 0006 (aggregate, non-identifying). No decision.
- Documentation currency fix applied: `eval-and-tracing-notes.md` called ADR 0025 "Proposed"; it is Accepted, so the note now matches the register and index.

No architectural decision across Phase 0 lacks an ADR, and none contradicts an accepted one.

## Prioritised corrective plan

### Must be fixed before Phase 0 is signed off

Nothing in the codebase or the realignment chain blocks sign-off on the work that was actually built. The realignment chain is whole, every delivery Status matches reality, and the six software done-when conditions are proven against re-run evidence. The only open item is a stakeholder decision, below.

### Human decisions before sign-off

1. **The Connect round-trip (done-when 2) is the one unproven spine seam.** Decide whether Phase 0 sign-off requires a real round-trip or accepts the recorded blocker. If a real round-trip is required: provision a Microsoft 365 Connect connector (or a confirmed ATS read-only connector) for this project, consent a read-only calendar grant, set `M365_CONNECT_CONNECTOR`, `M365_SCHEDULE_ADDRESS`, and optionally `M365_CONNECT_SCOPES`, then re-run `proof.ts` to surface a real read and its two audit records, and set Task 0.6 to `done`. If the recorded blocker is accepted, sign off with Task 0.6 left `skipped` and the dependency carried into Phase 1. This is an engineering-and-stakeholder dependency, not codebase work.

2. **Metrics baseline figures (done-when 7) are pending by design.** The phase spec resolved that figure capture completes before Phase 1 ships, not before Phase 0 build starts, and Task 0.10 records the structure, method, owner, date, and pending markers now. If a human wants the actual figures to be a hard Phase 0 sign-off gate instead, state that and adjust Task 0.10 and the phase acceptance. Owner: TA operations lead with a data analyst.

### Phase 1 follow-ups (recorded, no action now)

3. **B4, boot-verifying deploy gate.** The deploy verifies the build, and the liveness endpoint needs a booted agent to answer, but a failed boot does not yet automatically fail the deploy. Add a post-deploy health gate (a workflow on the Vercel `deployment_status` event, or a deploy-time check). Recorded in `ci-cd.md` and Realignment 1. Not a sign-off blocker.

4. **Edge hardening.** Turn the managed `bot_protection` ruleset from `log` to `challenge`/`deny` once the endpoint is live intake with a bypass for monitoring; replace the coarse user-agent custom rule with proper bot defence; add webhook verification (ADR 0010). Phase 1.

No new Phase 0 delivery work is created by this realignment. Phase 0 is complete on the software it set out to build; the only thing standing between it and an unqualified done-when is the external Connect dependency, which is a human decision, not unfinished code.
