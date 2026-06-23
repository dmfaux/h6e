# 0026. WhatsApp candidate channel transport over Meta's Business Cloud API

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, legal

## Context

ADR 0002 builds the channels on the eve Chat SDK, and the Phase 1 spec names the candidate channel as WhatsApp over the WhatsApp Business API, with Meta as the processor in the candidate data path. The POPIA basis recorded in the phase spec names Meta (WhatsApp Business API) and Microsoft as the only operators in that path, under signed operator agreements.

The eve version in this repo (0.12) ships native channel adapters for Slack, Teams, Discord, Telegram, Twilio, GitHub, and Linear, plus a custom-channel extension point (`defineChannel`). It ships no native Meta or WhatsApp adapter. So the spec's "WhatsApp Business API, Chat SDK" does not map to a ready adapter, and the concrete transport is undecided. The realistic options are: a custom eve channel speaking to Meta's WhatsApp Business Cloud API directly; the Twilio channel using Twilio's WhatsApp product; or a third-party BSP (for example 360dialog). The choice changes who sits in the candidate personal-information path, which is a compliance decision under ADR 0006 and POPIA, not only an engineering one.

## Decision

The candidate WhatsApp channel is a custom eve channel (`defineChannel`) that speaks to Meta's WhatsApp Business Cloud API directly, with no Twilio or BSP intermediary. Inbound webhooks are verified at ingress per ADR 0010 (Meta's `X-Hub-Signature-256` over the app secret, and the webhook verify-token handshake), and only verified events advance to a candidate workflow. This keeps the candidate personal-information path to exactly the operators the POPIA basis already names (Meta and Microsoft), and keeps the channel on the Chat SDK surface (a custom channel is the Chat SDK's documented extension point), honouring ADR 0002.

## Consequences

We hold the processor set to Meta and Microsoft, so no new operator agreement or legal sign-off is needed beyond what the phase spec already records, which serves ADR 0006 minimisation. The cost is that we build and maintain the Meta Cloud API wire (webhook verification, message send, media download, template handling) ourselves rather than getting it from an adapter, on a channel surface eve does not yet cover natively. If eve later ships a native WhatsApp adapter, migrating to it is a channel-layer change behind the same workflow and auth seams, not a rewrite. If a future requirement (for example richer media or voice) makes a BSP or Twilio compelling, that is a new ADR and a new legal sign-off, because it adds an operator to the candidate data path.

## Alternatives considered

Twilio's WhatsApp product through the existing eve Twilio channel. Rejected: it inserts Twilio as a second processor in the candidate personal-information path, which the recorded POPIA basis does not cover and ADR 0006 minimisation argues against, and it needs its own operator agreement and legal sign-off for no Phase 1 benefit.

A third-party BSP (for example 360dialog). Rejected for the same processor-minimisation reason, with the added risk that a given BSP's maturity and beta status would have to be checked against ADR 0005.

Waiting for a native eve WhatsApp adapter. Rejected: none is on the eve 0.12 roadmap in this repo, and Phase 1 cannot block on it; the custom channel keeps the workflow and auth seams stable so a later adapter swap stays a channel-layer change.
