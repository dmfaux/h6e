# 0028. WhatsApp channel: keep the custom channel over the Chat SDK adapter

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Project lead, engineering, legal
- **Supersedes:** 0026

## Context

ADR 0026 chose a custom eve channel over Meta's WhatsApp Business Cloud API, with no Twilio or BSP intermediary. Two of its premises are now false. It says the eve in this repo (0.12) "ships no native Meta or WhatsApp adapter" and that waiting for one is not an option because "none is on the eve 0.12 roadmap". On eve 0.85 the picture is different: eve exports `eve/channels/chat-sdk`, which bridges any Vercel Chat SDK adapter, and `@chat-adapter/whatsapp` 4.43.0 exists (MIT, in `vercel/chat`, published under the latest tag, public). The register must not keep a decision standing on false context, so the question is reopened here. The processor argument in ADR 0026 still holds: the adapter talks to Meta's Cloud API directly, so Meta remains the only operator in the candidate data path alongside Microsoft, and the POPIA basis does not change.

What the adapter would bring, from its package and eve's Chat SDK channel documentation (`node_modules/eve/docs/channels/chat-sdk.mdx`):

- It owns provider auth, webhook verification and delivery. Our `X-Hub-Signature-256` check and verify-token handshake (ADR 0010) would be replaced by the adapter's.
- It needs a Chat SDK state store (Redis or Postgres; the in-memory store is for development). That is a new durable holder of channel state outside the eve session, which ADR 0006 has to clear.
- With `persistThreadHistory` on, the store keeps inbound messages keyed by the WhatsApp id, so candidate message content lands in a store we do not yet have a retention decision for.
- Its debug logging writes up to 500 characters of the raw webhook body to the log, which would put candidate message text in platform logs unless kept off.
- Every inbound message becomes an eve turn. In Phase 1 that is the problem ADR 0029 records: there is no model-free path into a durable session, so the adapter does not help Task 1.3 and would put candidate messages in front of a model.

## Decision

We keep the candidate WhatsApp channel as a custom eve channel over Meta's WhatsApp Business Cloud API, as ADR 0026 decided, and we do not adopt `@chat-adapter/whatsapp` for Phase 1. This ADR replaces 0026 so the register's context is true: the adapter exists and was evaluated, and the decision rests on the reasons above (our own verification at ingress per ADR 0010, no new state store or log sink holding candidate messages per ADR 0006, and no model turn per candidate message in Phase 1), not on its absence.

## Consequences

The channel code stays ours: verification, message send, and later media download and template handling. That cost is unchanged from ADR 0026. The adapter remains a candidate for Phase 2, when candidate turns do reach a model through the redacting broker (ADR 0014) and the state store, history and logging questions can be answered under ADR 0006 with a retention decision behind them. Re-evaluating then is a channel-layer change behind the same workflow and auth seams.

ADR 0026 is superseded by this ADR. The channel code is unchanged by it, because the decision is the same.

## Alternatives considered

Adopting `@chat-adapter/whatsapp` now through `eve/channels/chat-sdk`. Rejected for Phase 1: it adds a Redis or Postgres store and optional message history that ADR 0006 has not cleared, moves webhook verification out of our code, and makes every candidate message a model turn, which Phase 1 forbids and which ADR 0029 shows cannot be avoided inside eve 0.85.

Twilio's WhatsApp product or a BSP. Still rejected, for ADR 0026's reasons: a second processor in the candidate data path with no Phase 1 benefit.

Leaving ADR 0026 as it is. Rejected: its context is now wrong about the adapter, and a register that is wrong about facts stops being evidence.
