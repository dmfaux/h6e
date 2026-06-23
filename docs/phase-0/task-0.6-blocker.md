# Task 0.6 blocker: Connect round-trip needs a reachable system

- Status: blocked, recorded for engineering and stakeholder
- Date: 2026-06-23
- Task: 0.6 (Connect scoped-token round-trip against one real system)
- Requirements at stake: E1, E2, E3

## Summary

The single proof path for the Connect round-trip is built and verified working
up to the external boundary, but it cannot be completed because no real external
system is reachable at run time. There is no Microsoft 365 Connect connector
provisioned for this project and no confirmed ATS. Per the task's own rule, the
round-trip is not faked and Task 0.6 is not marked done. This is the one external
dependency the Phase 0 spec flags as able to stall the phase (the day-one open
question, and the "Connect proof blocked on external access" risk).

## What was proven

The proof path (`src/connect/proof.ts`) is wired correctly and the Connect
service is reachable:

- The Vercel project identity works. `vercel env pull` yields a `VERCEL_OIDC_TOKEN`
  for `dmfauxs-projects/h6e`, which is the identity Connect exchanges for a
  scoped credential.
- The Connect API is reachable and authenticated our project. A live
  `getTokenResponse` call against conventional Microsoft connector identifiers
  returned a structured `404 not_found`:

  ```
  Connect could not issue a token for connector "oauth/microsoft"
  (code=not_found, status=404): Connector not found: oauth/microsoft
  ```

  The same `Connector not found` result came back for `oauth/microsoft-365`,
  `microsoft`, and `oauth/m365`. A reachable, authenticating Connect service that
  cannot find any Microsoft connector is decisive: the round-trip machinery is
  sound, the connector simply does not exist yet.

- The connector list is empty by enumeration, not just by guessed names. A
  read-only `GET https://api.vercel.com/v1/connect/connectors?teamId=team_wfiP4Eb0yTxCm6DJQrZv73WC`
  with a Vercel access token returned `HTTP 200` with `count: 0`. The team has no
  Connect connectors of any kind configured (no M365, no ATS).

So the credential-exchange path is proven up to the connector boundary. What is
missing is the connector and a consented grant on a real tenant. This is
established conclusively: zero connectors exist for the team, so there is nothing
to exchange a token against.

## What is missing (the blocker)

1. A Microsoft 365 Connect connector provisioned in Vercel Connect for this
   project (an Entra app registration in a reachable M365 tenant, wired as an
   OAuth connector in Connect).
2. A consented read-only calendar grant for that connector (delegated or
   application `Calendars.Read`, no write scope).
3. A reachable M365 tenant or mailbox to read free/busy from.

Fallback per the phase spec: a confirmed ATS with a read-only scope, if M365 is
not available first. No ATS is confirmed.

## How to clear it

1. Confirm a Microsoft 365 test tenant (or a confirmed ATS) is reachable.
2. Provision the connector in Vercel Connect and consent a read-only calendar
   grant.
3. Set the per-environment configuration the proof path reads (never committed):
   - `M365_CONNECT_CONNECTOR` (the connector UID `oauth/...` or key `scl_...`)
   - `M365_SCHEDULE_ADDRESS` (the agent service mailbox to read free/busy for)
   - optionally `M365_CONNECT_SCOPES` (defaults to read-only `Calendars.Read`)
4. Re-run the proof path:

   ```sh
   vercel env pull .env.development.local   # gets VERCEL_OIDC_TOKEN
   node --env-file=.env.development.local src/connect/proof.ts
   ```

   On success it surfaces a Connect-issued short-lived token (value withheld,
   expiry shown), the real free/busy read response, and two audit records
   (`connect.token.issued`, `connect.read.performed`) each carrying who, what,
   when, scope, and target. Only then is Task 0.6 set to done.

## ADR boundaries held while blocked

- ADR 0009: one proof path only. No reusable token broker is built; the proof
  path is a deliberate one-off and does not abstract or cache for reuse.
- ADR 0006: the read is minimal and non-PII (calendar free/busy availabilityView,
  not event subjects or attendees) and the system of record stays put. No
  candidate records are copied into the agent. The proof path withholds the token
  value and reads no candidate data.
- ADR 0005: Connect is used as a permitted public-beta component.
- E3: the requested scope is read-only and narrow; the proof path refuses to
  request any write-looking scope (fails closed).
