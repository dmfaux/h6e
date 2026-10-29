# Task 1.3: blockers

This records what blocks Task 1.3 (live WhatsApp ingress and application
acknowledgement), in the same fail-closed pattern as the Phase 0 Connect blocker
(`docs/phase-0/task-0.6-blocker.md`): the machinery is built and proven
deterministically, and what cannot be exercised is recorded rather than faked.
One blocker remains, and it is provisioning. The code blocker (no model-free path into the durable workflow) is resolved by the candidate run of ADR 0029.

## What is built and proven

- Verified ingress (ADR 0010): Meta's `X-Hub-Signature-256` is checked over the
  raw request bytes before anything is parsed or processed, and the verify-token
  handshake is checked on the setup GET. Forged, unsigned, and tampered events
  are refused. A null entry or a sender that is not an E.164 number is dropped
  at parse time rather than failing the batch. See `src/channel/whatsapp.ts`
  and `src/channel/whatsapp.test.ts`.
- Correlation and idempotency (I3, ADR 0010, Task 1.2): the reducer and
  `ingest` in `src/workflow/candidate-workflow.ts` deduplicate on a keyed hash
  of the provider message id, acknowledge once per run, and commit the event
  only after its effects complete, so a failed acknowledgement is retried on
  redelivery.
- Role-naming acknowledgement (A1): resolved from a structured requisition
  reference (a click-to-WhatsApp referral or an interactive reply id), never
  from message text, and never from a prototype key of the catalogue.
- The Meta Cloud API transport (ADR 0028): the outbound send (`sendWhatsAppText`)
  and the credential and role-catalogue loaders are unit-tested with an injected
  fetch, so the wire shape is proven without a network call.
- The live surface (`agent/channels/intake.ts`, `src/channel/intake-route.ts`):
  the Phase 0 `/intake` placeholder is the live WhatsApp webhook, on the same
  URL behind the same edge protection (below), and hands each verified
  application to its candidate run.

## Resolved: the hand-off into the durable workflow

On eve 0.85 the only way into a durable session is a model turn, and a hook-cancelled turn discards `defineState` (evidence in ADR 0029). ADR 0029 therefore moved the candidate workflow to a Workflow SDK run started from the route. That run is built (`src/workflow/candidate-run.ts`), and `/intake` now resumes or starts it for each verified application. The route answers Meta 200 only once every application is durably accepted, and 5xx otherwise. The local boot proof and the preview handoff proof are recorded in `docs/phase-1/task-1.3-handoff-proof.md`. No session is created and no model is called.

## Blocker (provisioning): no WhatsApp number or Cloud API credentials

The ADR gate for the transport is cleared: ADR 0028 is Accepted (it
superseded ADR 0026 with the same decision on corrected context). The
remaining blockers here are provisioning, not code:

1. No WhatsApp Business (Meta) number is provisioned for this project. This is
   the external-prerequisite gap the Phase 1 task breakdown flags as a day-one
   confirmation (`docs/phase-1/tasks.md`, open questions) and that Phase 0
   recorded as unprovisioned (`docs/phase-0/realignment-3.md`).
2. The per-environment Cloud API credentials are therefore not set:
   `WHATSAPP_APP_SECRET` (signature verification), `WHATSAPP_VERIFY_TOKEN`
   (subscription handshake), `WHATSAPP_PHONE_NUMBER_ID` and
   `WHATSAPP_ACCESS_TOKEN` (outbound send), and `WHATSAPP_ROLE_CATALOG` (the
   requisition-to-role map). These are never committed.

POPIA note: legal sign-off for routing real candidate messages through WhatsApp
and Meta is recorded as needed before a real candidate is onboarded, not before
build (`docs/phase-1/tasks.md`, open questions). It is not a code blocker for
this task but gates the pilot go-live.

## Edge protection (requirement I1, still in force)

The surface URL is unchanged (`/intake`), so the Phase 0 edge protection still
fronts it without change (`docs/phase-0/edge-protection.md`,
`docs/phase-0/firewall-config.json`):

- The WAF custom rule `Intake placeholder edge bot block` keys on
  `path eq /intake` and denies bot-signature user agents at the edge.
- The managed `bot_protection` ruleset is active (`log` mode).

Go-live step (not a code change): before the managed `bot_protection` ruleset is
turned up from `log` to `challenge` or `deny`, add a bypass for Meta's webhook
source on `/intake`. Meta's webhook deliveries are server-to-server POSTs with no
browser, so a challenge cannot be answered and a deny would likely block every
inbound message (inferred from how the managed ruleset classifies non-browser
clients; not yet observed, because no number is provisioned). Meta publishes its
webhook IP ranges; the bypass keys on those ranges and the path. This needs the
live Vercel project and an API token, so it is part of provisioning, alongside
the number and credentials above.

## To unblock

Provision a WhatsApp Business number and a Meta app, and set the `WHATSAPP_*` secrets and `CANDIDATE_KEY_SECRET` per environment. Add the Meta IP bypass on `/intake`, then drive one real inbound application and confirm that the role-naming acknowledgement is delivered. Record that exchange to close the live leg.
