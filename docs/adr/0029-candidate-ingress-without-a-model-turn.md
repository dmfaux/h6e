# 0029. Candidate ingress without a model turn

- **Status:** Proposed
- **Date:** 2026-10-28
- **Deciders:** Project lead, engineering

## Context

Task 1.2 built the per-candidate workflow on eve's durable session and `defineState`, keyed on the verified WhatsApp number (ADR 0002, ADR 0003). Task 1.3 has to hand a verified application from the `/intake` webhook into that workflow, deduplicate it on the provider message id, and send one role-naming acknowledgement. Phase 1 makes no model call, and a candidate's delivery must never reach a model in this phase (ADR 0006, ADR 0014).

On eve 0.85 the only way to put a message into a durable session is a channel send (`from(address).send(...)`), and a send starts a model turn. The first Task 1.3 implementation did exactly that: a review proved by booting the build that each verified application produced an `invoke_agent` turn and a `chat anthropic/claude-sonnet-4.6` provider call carrying the candidate's number, and that nothing in the turn ran `ingest` at all.

Every other eve mechanism was checked against the eve 0.85 documentation and type declarations and by experiment, looking for a path that runs authored code inside the session (so `defineState` is available) without a model call:

- `invokeTool` runs a tool outside any conversation with no model, but "authored state starts from its initial value and is not kept" (`docs/channels/custom.mdx`).
- Dynamic schedule `run` and cross-channel `receive` either start sessions (a turn) or run outside one (no state).
- A channel `events` handler and a global hook both run inside the session with `defineState` available. A hook can cancel the turn before its model call (`ctx.cancel`). Booting the build with this shape showed the turn envelope (`invoke_agent`, outcome `cancelled`), no `chat` span, and the handler's `ingest` running, but eve discards the authored state written in a step whose turn is cancelled: the next delivery for the same number read `key: "", processedEvents: []` and sent a second acknowledgement. Cancelling at `delivery.consumed`, `turn.started` or `model.requested` gave the same result, because they are all in the step eve throws away. The eve documentation does not describe this behaviour either way, so building on it would be building on an accident.
- `eve/patterns/durable-cross-channel-notifications` states the framework position: "eve does not currently provide a direct cross-channel message queue or provider outbox. To post a notification without a model call, use the destination platform's API instead."

So an eve session cannot be driven durably without a model turn in this version. Phase 1's "no model call" boundary and Task 1.2's "state lives in `defineState`" cannot both hold for candidate ingress. One has to move, and that is an architectural decision rather than a fix.

## Decision

Proposed, for a human to accept or replace: the Phase 1 candidate workflow (correlation, dedup, once-only acknowledgement, and the logistics state Tasks 1.4 to 1.7 add) runs as a durable Workflow SDK function started from the verified `/intake` route, not as an eve session turn. The Workflow SDK is the durable-execution layer of the stack we already stand on (ADR 0002), eve itself runs on it, and eve resolves the `workflow` and `workflow/api` specifiers to its vendored copy for authored code (`start`, `getRun`, `createHook`, `resumeHook`, `getHookByToken`, `sleep`), so this adds no vendor and no new dependency. The per-candidate run is keyed on the workflow key from Task 1.2, holds the same minimal state shape (ADR 0006, ADR 0012), and is resumed by hook tokens for later deliveries and waits. The eve session keyed on the same number is reserved for Phase 2, when candidate turns do reach a model through the redacting broker (ADR 0014), and is not created in Phase 1.

Until this is accepted, `/intake` fails closed: it verifies and parses, answers Meta 200 so a verified event is not redelivered as a storm, and processes nothing. No session is created, no acknowledgement is sent, no model is called. Task 1.3 is partial.

## Consequences

Task 1.2's durable binding (`candidateLogistics`, `ingest`, `inspect`, `advance`, `terminate` over `defineState`) moves to the Workflow SDK run's state; the pure reducer, effect runner and their tests carry over unchanged. Task 1.2's status line must be revisited when this lands, because its "built on eve session plus `defineState`, no new ADR needed" no longer describes the system. The engineer inspect-and-advance surface (requirement E4) is rebuilt over `getRun` and hooks rather than session tools.

What is unverified and must be proven by a prototype before acceptance: that `start()` from `workflow/api` works from a channel route in an eve build on Vercel, how run retention interacts with the trace policy (ADR 0027 notes eve deletes completed run payloads under the current policy), and how a Phase 2 eve session later picks up a candidate's Phase 1 state.

The acknowledgement retry story improves: the route can wait on the run step that sends the acknowledgement and answer Meta 5xx on failure, so Meta's redelivery retries it and the message-id dedup keeps it to one send.

## Alternatives considered

A hook-cancelled model turn (the experiment above). Rejected: eve discards the authored state the turn wrote, and the behaviour is undocumented.

Letting the turn run against the model with the number redacted. Rejected: Phase 1 makes no model call, the gateway has no credentials in this phase, and the turn would still cost a provider call per webhook.

A separate durable key-value store (Redis or Postgres from the Vercel Marketplace) written by the route handler, with the eve session untouched. Viable and simpler per candidate, but it adds a store holding candidate correlation data that ADR 0006 has to clear, and it duplicates what the Workflow SDK already provides for free inside the stack. Keep as the fallback if the Workflow SDK path fails its prototype.

Keeping the first implementation (send into the session, model turn per webhook). Rejected: it puts the candidate's number in front of a model (ADR 0006, ADR 0014) and never runs `ingest`, so it fails the task on both counts.
