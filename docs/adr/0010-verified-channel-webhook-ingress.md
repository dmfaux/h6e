# 0010. Verified channel webhook ingress

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

Phase 1 turns the Phase 0 intake placeholder into live channel ingress. Inbound events arrive from WhatsApp (via the WhatsApp Business API) and from Teams (via the Microsoft bot and Graph webhooks). These are public internet endpoints that start candidate workflows and trigger internal actions and external calls, so an unverified or forged event could launch workflows, send messages to candidates, or write to the ATS and calendars. The public edge already carries WAF and Bot ID from Phase 0, but those filter abuse and bots; they do not establish that an event genuinely came from the provider.

## Decision

Every inbound channel webhook is verified as authentic before it is processed: the request is checked against the provider's signing or shared-secret scheme, and only verified events advance to a workflow. Verification sits at ingress, behind the existing WAF and Bot ID edge. Events that fail verification are rejected and never processed. Inbound delivery is treated as at-least-once, so events are made idempotent and correlated to the right candidate, and a replayed or duplicated valid event causes no duplicate side effects. Verification secrets are managed per environment, like other secrets (Phase 0, requirement B3).

## Consequences

Forged or replayed events cannot drive the agent, which protects candidates and the external systems the agent writes to, and keeps the audit trail honest. The cost is per-provider verification handling and a verification secret to manage for each channel, plus the discipline of idempotent event handling in the workflow. This sits alongside, not instead of, the edge protection from Phase 0.

## Alternatives considered

Relying on WAF and Bot ID alone. Rejected: they filter abuse and automated traffic but do not prove provider authenticity, so a correctly shaped forged event would pass.

Verifying only WhatsApp and trusting Teams as an internal channel. Rejected: both are public webhook endpoints and both trigger actions with side effects, so both are verified.
