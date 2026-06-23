# Realignment 2: Tasks 0.5 to 0.7

- Type: realignment (Task 0.8). Builds nothing.
- Date: 2026-06-23
- Scope: re-prove Tasks 0.5 (route guard and whoami), 0.6 (Connect round-trip), and 0.7 (public intake placeholder behind WAF and Bot ID) against re-run evidence, not against the Status claims in `tasks.md`. Correct any drifted Status. Flag slop, scope creep, and undocumented decisions. Confirm the Connect work stayed a one-off (no ADR 0009 broker) and that the edge work needs no Phase 0 ADR.

## Summary

All three tasks hold up against re-run evidence, with one task correctly parked.

- Task 0.5 (guard and whoami): all in-scope requirements pass. Status `done` is correct, no change.
- Task 0.6 (Connect round-trip): the proof path still surfaces the recorded blocker and refuses to fake a response. The round-trip is not proven because no Connect connector is provisioned. Status `skipped` is correct and accepted by the user per `task-0.6-blocker.md`, no change.
- Task 0.7 (edge placeholder): the deployed placeholder responds, and a bot probe is denied at the edge by the live Vercel firewall. Status `done` is correct, no change.

No Status line for Tasks 0.5 to 0.7 needed correcting: every claim matched the re-run evidence.

No architectural decision in Tasks 0.5 to 0.7 lacks an ADR. The Connect work stayed a deliberate one-off and did not build the ADR 0009 broker. The edge work needs no Phase 0 ADR, which the phase spec states directly (`phase-0.md`, resolved open question, lines 189 to 190).

One out-of-scope integrity finding: Task 0.4 is marked `done` but its sole deliverable, `realignment-1.md`, does not exist and was never committed. This is outside the 0.8 mandate (which covers 0.5 to 0.7) so its Status is left unchanged here, but it is flagged as the top corrective item below because it undermines the realignment chain.

> Update (2026-06-23): resolved. `docs/phase-0/realignment-1.md` has since been written, performing the Task 0.4 realignment over Tasks 0.1 to 0.3 against re-run evidence (all of A1, A2, B1 to B4, C1, D1 to D5; every Status correct, B4 a recorded deferred follow-up). Task 0.4's `done` Status is now legitimate. See corrective-plan item 1 below.

## Method

Checks were re-run, not read off the task file:

- `pnpm test src/auth` for the guard, whoami, and the rest of the auth seam.
- `node src/connect/proof.ts` for the Connect round-trip (no environment configured, so it should surface the recorded blocker).
- Live HTTP checks against the production deployment `https://h6e-olive.vercel.app` for the placeholder (F1), the edge bot block (F2), liveness (C1, context), and an unauthenticated whoami refusal (C2).
- The live Vercel firewall config via the security API, compared against the committed snapshot `firewall-config.json`.

The Vercel CLI is not installed in this environment; the live deployment URL and firewall config were read through the Vercel REST API using the CLI auth token already on the machine.

## Requirement verdicts (against re-run evidence)

| Req | What it requires | Verdict | Evidence |
|-----|------------------|---------|----------|
| C2 | Authed role-mapped request reaches the agent and sees its id, email, roles; no-session request refused; no business logic beyond this | Done | 36 auth tests pass, including whoami returning id/email/roles, no-session refused (401), wrong-secret refused, role-gated refusal (403), and 500 on a missing secret. Live `GET /internal/whoami` with no session returns 401 with `www-authenticate: Bearer`. `whoami.ts` returns id, email, roles and nothing more. |
| D1 | Guard depends only on the auth interface and roles, never on a provider | Done | Test "the guard's source does not import or call any provider" passes. `guard.ts` imports only `session`, `roles`, `types`, `errors`. Grep for `providers/` in `guard.ts` and `whoami.ts` returns nothing. |
| D5 | Roles are part of the interface; a guard can require a specific role | Done | Tests for role-gated admit and refuse pass; "defines the recruiter, hiring-manager, and internal-engineering roles" passes. `internal.ts` requires `ROLES.internalEngineering` on the whoami route. |
| E1 | A scoped short-lived Connect credential makes one real read | Blocked (not done) | Proof path runs and reaches the blocker: no `VERCEL_OIDC_TOKEN` and no `M365_CONNECT_CONNECTOR`, no connector provisioned for the team (zero connectors, per the blocker note). It refuses to fake a response and exits 2. No real read occurred. |
| E2 | The round-trip is audit-logged (who, what, when, scope, target) | Partial (machinery built, not exercised) | `proof.ts` has the audit machinery (`connect.token.issued`, `connect.read.performed`, each carrying who/what/when/scope/target). No real round-trip happened, so no real audit record exists yet. The capability is built and correct; it is unexercised because E1 is blocked. |
| E3 | The requested scope is read-only and narrow | Done in code (proven by the guard) | `assertReadOnly()` refuses any write-looking scope and fails closed; the default scope is `Calendars.Read` only. The discipline is proven by code even though no live request was made. |
| F1 | Public intake placeholder reachable, returns a placeholder, carries WAF and Bot ID, no intake or channel logic | Done | Live `GET /intake` with a browser UA returns HTTP 200 and the static placeholder JSON. Live firewall config has the managed `bot_protection` ruleset (active, `log`) and the custom deny rule. `intake.ts` carries no intake, webhook, channel, or candidate logic. |
| F2 | A bot probe is challenged or blocked at the edge, not by the application | Done | Live `GET /intake` with a bot UA returns HTTP 403, `x-vercel-mitigated: deny`, body `Forbidden` as `text/plain`. That is the Vercel edge, not the app (the app returns JSON). The live custom rule matches `path eq /intake` and a bot user-agent regex. |

## Re-run evidence

### Task 0.5: guard and whoami tests (`pnpm test src/auth`)

```
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

Cases that bear directly on C2, D1, D5: admits an authenticated request and resolves id/email/roles; refuses a request with no session; refuses a session signed with a different secret; refuses an expired session; a role-gated guard admits the required role and refuses without it; the guard's source does not import or call any provider; returns id/email/roles and nothing more; returns 500 when the signing secret is not configured.

### Task 0.6: Connect proof path (`node src/connect/proof.ts`)

```
Task 0.6 Connect round-trip proof path
Target: Microsoft 365 / Outlook, read-only calendar free/busy
Requested scope: ["Calendars.Read"]

BLOCKED: Connect round-trip needs a reachable system.
Reason: required inputs for a real Connect round-trip are not present
Missing:
  - VERCEL_OIDC_TOKEN (the Vercel project identity Connect exchanges; ...)
  - M365_CONNECT_CONNECTOR (the Microsoft 365 Connect connector id; none is configured for this project)
Action: provision a Microsoft 365 Connect connector ... Task 0.6 stays not-done until a real read response and its audit record are surfaced.
exit=2
```

The proof path behaves exactly as the blocker records: it fails closed, surfaces what is missing, and does not pretend success. This matches `task-0.6-blocker.md` (zero connectors for the team, confirmed by enumeration). The skip is accepted by the user.

### Task 0.7: deployed placeholder and live edge protection

F1, placeholder with a normal browser UA:

```
HTTP/2 200
content-type: application/json; charset=utf-8
{"ok":true,"surface":"public-intake-placeholder","phase":0,"note":"Placeholder only. ..."}
```

F2, the same path with a bot UA, denied at the edge:

```
HTTP/2 403
content-type: text/plain; charset=utf-8
x-vercel-mitigated: deny
Forbidden
```

C2 context, unauthenticated whoami refused on the live deployment:

```
HTTP/2 401
www-authenticate: Bearer
{"ok":false,"code":"authentication_required","error":"No session was presented."}
```

C1 context, liveness open and healthy:

```
HTTP/2 200
{"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}
```

Live firewall config (security API), matching the committed `firewall-config.json`:

```
managed bot_protection: {"active": true, "action": "log", ...}
custom rules:
  - Intake placeholder edge bot block | active=True | action={"mitigate": {"action": "deny"}}
      cond: path eq /intake
      cond: user_agent re bot|Bot|crawler|spider|scrapy|wget|python|curl|headless
```

## Status reconciliation

| Task | Status in `tasks.md` | What the checks show | Action |
|------|----------------------|----------------------|--------|
| 0.5 | done | All of C2, D1, D5 pass | None. `done` is correct. |
| 0.6 | skipped (blocker recorded) | Proof path blocked, no connector, no faked read | None. `skipped` is correct and user-accepted. |
| 0.7 | done | F1 and F2 pass against the live deployment and live firewall | None. `done` is correct. |

No Status line for Tasks 0.5 to 0.7 required correction. Every claim matched the re-run evidence.

## Slop, scope creep, gold-plating

Nothing in Tasks 0.5 to 0.7 needs cutting. Minor notes:

- Guard reads the session from a cookie as well as an `Authorization: Bearer` header (`guard.ts`). This is a small accommodation for browser and API callers, not gold-plating, and stays within C2. It is tested. Keep.
- The whoami route returns id, email, roles and nothing more, which is exactly C2's ceiling. No business logic leaked in. Good.
- The intake placeholder exposes both `GET` and `POST` (`intake.ts`). `POST` anticipates the Phase 1 webhook shape but adds no logic now; both return the same static placeholder. This is minimal, not creep. Keep.
- The Connect proof path is a single one-off script with no abstraction, cache, or reuse (`proof.ts`). This is the intended Phase 0 boundary, not slop. Keep.
- The F2 custom WAF rule is a coarse user-agent regex (`curl|python|wget|headless` and similar). It is fine as a Phase 0 demonstration that the edge, not the app, does the blocking, but it is not robust bot defence and should not be mistaken for one. It is recorded as a Phase 1 follow-up below, not as Phase 0 slop.

## ADR check

- Connect one-off boundary intact. `proof.ts` builds no reusable broker. ADR 0009 (Accepted) states Phase 0 proves exactly one round-trip and leaves the broker to Phase 1; the code honours that. No new ADR needed, and nothing to supersede.
- Edge work needs no Phase 0 ADR. `phase-0.md` (lines 189 to 190) resolves this open question directly: no separate ADR for Phase 0; ADR 0002 plus the PRD mandate cover a protected placeholder carrying no candidate data; the edge decision folds into the Phase 1 security ADRs (ADR 0010, verified channel webhook ingress) when the endpoint becomes live. Confirmed, no missing ADR.
- The "Bot ID as Vercel WAF bot management" interpretation is documented, not undocumented. `edge-protection.md` records why Vercel BotID (the browser-signal `botid` package) does not fit a server-only webhook surface, and why the faithful edge protection is Vercel WAF bot management (managed `bot_protection` plus the custom rule). F2 itself accepts "Bot ID or WAF". This is an implementation interpretation, correctly recorded and consciously left without a Phase 0 ADR per the phase spec; it carries into ADR 0010 at Phase 1. No action.

No architectural decision in Tasks 0.5 to 0.7 lacks an ADR.

## Out-of-scope finding flagged for a human

Task 0.4 (realignment over Tasks 0.1 to 0.3) is marked `done` in `tasks.md`, but its sole deliverable, `docs/phase-0/realignment-1.md`, does not exist and was never committed (no Task 0.4 commit is in the history). Its `done` Status does not match reality.

This is outside the Task 0.8 mandate, which covers Tasks 0.5 to 0.7, so this report does not change Task 0.4's Status line. It is flagged here because a realignment chain with a missing link weakens the trust in every Status it was meant to verify (A1, A2, B1 to B4, C1, D1 to D5). A human should decide whether to re-run Task 0.4 or correct its Status to `todo`. Task 0.11 (final realignment) will otherwise inherit this gap.

## Prioritised corrective plan

1. Resolve the Task 0.4 gap (out of this task's scope, human decision). Either re-run Task 0.4 to produce `realignment-1.md`, or correct Task 0.4's Status to `todo`. Do this before Phase 0 sign-off so the realignment chain is whole. Highest priority because it is a false `done`. **Done (2026-06-23):** Task 0.4 was re-run and `realignment-1.md` written; all of Tasks 0.1 to 0.3 re-prove `done` against re-run evidence (B4 a recorded deferred follow-up). The realignment chain is now whole.
2. Clear the Task 0.6 blocker when an external system is reachable (human and engineering dependency). Provision a Microsoft 365 Connect connector (or a confirmed ATS read-only connector), consent a read-only calendar grant, set `M365_CONNECT_CONNECTOR`, `M365_SCHEDULE_ADDRESS`, and optionally `M365_CONNECT_SCOPES`, then re-run `proof.ts` to surface a real read and its two audit records. Only then set Task 0.6 to `done`. This is the one external dependency the phase flags as able to stall sign-off.
3. Phase 1 follow-ups for the edge (no action now, recorded so they are not lost): turn the managed `bot_protection` ruleset from `log` to `challenge` or `deny` once the endpoint is live intake and monitoring has a bypass; replace the coarse user-agent custom rule with proper bot defence; add webhook verification (ADR 0010). These belong to Phase 1, not Phase 0.

No new Phase 0 delivery work is created by this realignment for Tasks 0.5 to 0.7. They are complete (0.5, 0.7) or correctly parked (0.6).
