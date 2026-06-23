# Realignment 1: Tasks 0.1 to 0.3

- Type: realignment (Task 0.4). Builds nothing.
- Date: 2026-06-23
- Scope: re-prove Tasks 0.1 (repository scaffold and booting agent with liveness), 0.2 (CI/CD pipeline, environments, per-environment secrets), and 0.3 (auth interface, dev provider, signed session, roles, provider selection, production refusal) against re-run evidence, not against the Status claims in `tasks.md`. Mark each in-scope requirement (A1, A2, B1 to B4, C1, D1 to D5) done, partial, missing, or drifted. Correct any drifted Status. Flag slop, scope creep, and any architectural decision lacking an ADR.

## Provenance note

This report is the deliverable of Task 0.4. It was found absent during Task 0.8 (Realignment 2): Task 0.4 was marked `done` but `realignment-1.md` did not exist and was never committed. This report closes that gap by performing the Task 0.4 realignment against current re-run evidence. The history is left intact: Realignment 2 records that the gap existed, and its update note records that this report resolved it.

## Summary

Tasks 0.1 to 0.3 hold up against re-run evidence. Every Status line is correct as it stands; none needed changing.

- Task 0.1 (scaffold and liveness): the eve project builds and the liveness endpoint is publicly healthy. Status `done` is correct.
- Task 0.2 (CI/CD and environments): the build-and-check gate runs on every change and is green, production is protected behind branch protection, and no secrets are committed. Status `done` is correct. B4 (deploy verifies boot) remains a documented, deferred follow-up, consistent with how Task 0.2 recorded it.
- Task 0.3 (auth seam): the auth interface, dev provider, stateless signed session, roles, provider selection, and production refusal all pass their tests. Status `done` is correct.

No architectural decision in Tasks 0.1 to 0.3 lacks an ADR. The stack and repo shape match ADR 0002 and ADR 0007, the CI/CD matches ADR 0024, the auth interface matches ADR 0003, and the session matches ADR 0008.

## Method

Checks were re-run, not read off the task file:

- `pnpm build` for the scaffold (A1, A2).
- `pnpm test` and `pnpm typecheck` for the auth seam and the build gate (D1 to D5, A2).
- `gh run list` for the CI gate history (B1, B2).
- A git-tracked-files scan plus `.gitignore` inspection for committed secrets (B3).
- A live HTTP check against the production deployment `https://h6e-olive.vercel.app` for liveness (C1) and a read of the deployment list and production alias for preview/production reachability (B2).

The Vercel CLI is not installed in this environment; the live deployment URL and deployment list were read through the Vercel REST API using the CLI auth token already on the machine.

## Requirement verdicts (against re-run evidence)

| Req | What it requires | Verdict | Evidence |
|-----|------------------|---------|----------|
| A1 | One repository holding an eve project that builds with the documented commands | Done | `pnpm build` exits 0; nitro emits the server bundle (`eve.mjs`, `index.mjs`, total 5.52 MB) at `.output`. Single repo, eve project layout (`agent/`, `src/`). |
| A2 | eve conventions, no second repository or external build tool in the critical path | Done | One repo, eve `build`/`dev`/`start` scripts, `pnpm typecheck` (tsc) exits 0. No separate build system; Vercel builds the same source via the integration. |
| B1 | A build-and-check gate runs on every change | Done | `.github/workflows/ci.yml` runs `build-and-check` (frozen install, `pnpm build`, `pnpm typecheck`) and `secret-scan` (gitleaks) on pull requests to `main` and pushes to `main`. `gh run list` shows recent runs concluding `success`. |
| B2 | Preview deploy per PR via the Vercel integration; production protected, deploying only from main | Done | Branch protection on `main` requires `build-and-check` and `secret-scan` to pass before merge, so a failing check blocks the production deploy (documented in `ci-cd.md`, enforced by the workflow triggers). The Vercel Git integration gives each PR a preview and treats `main` as production; the production alias `h6e-olive.vercel.app` is reachable. |
| B3 | Per-environment secrets, none committed | Done | No tracked `.env`/secret/key files (only `.env.example`); `.gitignore` covers `.env` and `.env*.local` while allowing `.env.example`. gitleaks runs in CI on every change. Per-environment values live in the Vercel project (Preview vs Production). |
| B4 | The deploy verifies the agent booted (not just built) before reporting healthy | Partial (deferred, documented) | `ci-cd.md` records B4 as a P1 deferred follow-up: the deploy is healthy-by-hand (preview/production `GET /eve/v1/health` returns `{"ok":true,"status":"ready",...}`, which needs a booted agent), but a failed boot does not yet automatically fail the deploy. Tracked for a Phase 0 follow-up. This matches how Task 0.2 recorded B4, so it is not drift. |
| C1 | The agent boots and answers an unauthenticated liveness check | Done | Live `GET /eve/v1/health` returns HTTP 200 with `{"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}`, no login required. |
| D1 | Auth interface returns id, email, roles, and is the only thing guards depend on | Done | Auth tests pass; the guard's source imports no provider (tested). |
| D2 | Dev credential provider authenticates a username and password and issues a session | Done | Tests: signs in a configured user and issues a role-bearing session; refuses wrong password; refuses unknown username. |
| D3 | Provider selection by env var, with the Entra-via-Passport provider present as an inert stub | Done | Tests: `AUTH_PROVIDER=entra` selects the inert Entra stub; `AUTH_PROVIDER=dev` selects the dev provider; default is dev; unknown values are rejected. |
| D4 | Dev provider refuses to start in production, failing closed | Done | Tests: "refuses to start in a production configuration"; "selecting dev under a production configuration refuses to start". |
| D5 | Roles are part of the interface; at least recruiter, hiring manager, and an internal engineering role; a guard can require a specific role | Done | Tests: "defines the recruiter, hiring-manager, and internal-engineering roles"; role-gated guard admits and refuses by role. |

## Re-run evidence

### Tasks 0.1 / 0.3: build, typecheck, tests

```
pnpm build      -> exit 0  (nitro server bundle emitted at .output)
pnpm typecheck  -> exit 0  (tsc)
pnpm test       -> tests 36, pass 36, fail 0
```

### Task 0.2: CI gate (recent runs)

```
completed  success  Merge pull request #6 ...                CI  main                              push          ...
completed  success  Task 0.7: ...                            CI  task-0.7-intake-placeholder-edge  pull_request  ...
completed  success  Merge pull request #5 ...                CI  main                              push          ...
completed  success  Task 0.6: ...                            CI  task-0.6-connect-roundtrip        pull_request  ...
```

The gate runs on both pull requests to `main` and pushes to `main`, and concludes `success`.

### Task 0.2: secrets (B3)

```
tracked env/secret files: none (only .env.example)
.gitignore: .env, .env*.local ignored; !.env.example tracked
```

### Task 0.1 / 0.2: liveness on the live deployment (C1, B2)

```
GET https://h6e-olive.vercel.app/eve/v1/health
HTTP/2 200
{"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}
```

## Status reconciliation

| Task | Status in `tasks.md` | What the checks show | Action |
|------|----------------------|----------------------|--------|
| 0.1 | done | Build and liveness pass | None. `done` is correct. |
| 0.2 | done | CI gate green on every change; production protected; no committed secrets; B4 deferred as recorded | None. `done` is correct. |
| 0.3 | done | All of D1 to D5 pass | None. `done` is correct. |

No Status line for Tasks 0.1 to 0.3 required correction.

## Slop, scope creep, gold-plating

Nothing in Tasks 0.1 to 0.3 needs cutting. Notes:

- B4 (boot-verifying deploy) is the one open item, and it is correctly recorded as a deferred P1 follow-up in `ci-cd.md` rather than silently dropped or half-built. It is carried forward, not slop.
- Vercel Standard Protection (preview SSO) is deliberately off so the unauthenticated liveness endpoint is honestly public, with the real gate at the app layer (Tasks 0.3, 0.5) and the public edge surface built in Task 0.7. This is a recorded, intentional choice, not creep.
- The auth seam is fully tested (36 cases) and stays within the interface, dev provider, session, roles, selection, and production refusal. No business logic leaked in.

## ADR check

- ADR 0002 (eve stack) and ADR 0007 (one repo): the single-repo eve project honours both. No deviation.
- ADR 0024 (CI/CD on GitHub Actions with the Vercel integration): the gate plus the Vercel Git integration match the ADR. No deviation.
- ADR 0003 (swappable auth interface): the interface returns id/email/roles and the guard depends only on it. No deviation.
- ADR 0008 (stateless signed sessions): sessions are three-part signed tokens, verified back, with no server-side store. No deviation.

No architectural decision in Tasks 0.1 to 0.3 lacks an ADR, and none contradicts an accepted one.

## Prioritised corrective plan

1. B4 boot-verifying deploy gate (P1 follow-up, not a Phase 0 sign-off blocker). Add a post-deployment health gate that hits the liveness endpoint and fails the deployment if it is not healthy (a workflow on the Vercel `deployment_status` event, or a Vercel deploy-time check). Revisited at Task 0.11.

No new Phase 0 delivery work is created by this realignment for Tasks 0.1 to 0.3. They are complete.
