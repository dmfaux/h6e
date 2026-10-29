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

## Prototype findings

Run on 2026-10-28 and 2026-10-29 against the prototype on branch `prototype/adr-0029-workflow-ingress` (commits 332b8b7, 07f23a5, a1a57d6, 53af53e). Method: Meta-shaped payloads signed with the configured app secret, posted to `/intake`, locally (`pnpm build`, then `tail -f /dev/null | PORT=3920 pnpm start`, with a Graph stub on port 3918) and on Vercel preview deployments of the branch (with `WHATSAPP_GRAPH_BASE_URL` pointed at the deployment's own `/prototype/fake-graph` route). Secret-gated prototype routes (`/prototype/run`, `/prototype/handover`, `/prototype/run-by-id`) observed the runs from outside. Only fake numbers of the form +2782000000x were used. The branch-scoped preview secrets were removed afterwards.

### Question 1: does `start()` from `workflow/api` work from an eve channel route?

Pass, locally and on Vercel.

Local, 2026-10-29, fresh build of 53af53e: a forged signature got 403. Application A for +27820000011 answered `{"action":"started","runId":"wrun_01M62XBMAZ24VXZQ15NR9V76F1"}`. A redelivery of the same message id answered `resumed` with the same run id. Application B (same number, new message id) answered `resumed` with the same run id. Application C for +27820000012 started `wrun_01M62XBX69RKA9RPZ1ADJCKW23`. The Graph stub logged exactly one POST per number. The step log read `acknowledged=true processedEvents=1 completedEffects=1` once per run and `acknowledged=false` for every later delivery. The console span exporter printed `workflow.start candidateRun`, `workflow.run workflow//./src/workflow/candidate-run//candidateRun`, `step.execute handleDelivery`, `step.execute initialState`, `world.hooks.getByToken`, `hook.resume` and the usual `world.*` spans, and zero `invoke_agent` or `chat` spans. The same sequence passed on 2026-10-28 against the 332b8b7 build (runs `wrun_01M60ZY1Q5T1AW0NM3TFPBHXW0` and `wrun_01M60ZYAM4BZCXQ1FVH7CNNZXH`, two stub posts for two numbers).

Vercel preview, 2026-10-28, deployment `h6e-4s7cl76yz`: forged 403; +27820000003 started `wrun_41M616X2P50GR82JP3G77C0FBW`, its redelivery and its second message both `resumed` that run, +27820000004 started `wrun_41M616XGAP0GN21E99FKC7RHWM`. Runtime logs show one `[fake-graph] POST` per number and `acknowledged=true` once per run. `vercel logs --environment preview --since 24h -q invoke_agent` and `-q "chat anthropic"` returned no records.

One gap in the prototype against this ADR's Consequences: the route awaits `start()` or `resumeHook()` and answers Meta 200 before the acknowledgement step has run, so the "answer Meta 5xx on a failed send" story is not implemented. The run design supports it (the ack is a step whose outcome the route could wait on), but it was not proven.

### Question 2: trace policy retention, and state across deliveries and redeploys

Pass on both parts, with one consequence that must be designed for before acceptance.

Retention. eve 0.85 passes `experimental_retention: 0` to the Workflow SDK only for the runs it starts for its own sessions (`startSession` in `execution/workflow-runtime.js` derives it from the resolved trace policy). An authored `start()` from `workflow/api` passes no retention option, so the World's default retention applies, not ADR 0027's policy. Confirmed empirically: runs `wrun_41M619GT690GWXNQ8GV7H7A2QG` (completed 2026-10-28T18:44:19Z) and `wrun_41M61CYCFR0GKCGV2QSNTPMFAD` (completed 2026-10-28T19:13:12Z) were read by id on 2026-10-29T04:09Z from a later deployment and returned `status: "completed"` with the full return value (the candidate state with `processedEvents` and `completedEffects`). So completed payloads are not deleted under the current policy. The flip side is that per-candidate state is retained for the plan's default period after the run ends, which ADR 0006 has to weigh. The Workflow SDK documents that at `experimental_retention: 0` the purge usually wins the race against `returnValue`, so if retention 0 is chosen the final state must leave the run through a step we control, not be read back.

Across deliveries. A run parked on its hook accepted three and four deliveries spread over fifteen hours and kept its state (for example +27820000008 ended with `processedEvents: ["wamid.xdeploy3.B","wamid.r2x1.B","wamid.r2x2.B"]`, `completedEffects: ["ack:started:candidate:+27820000008"]`). Locally the run also survived a server restart: the restarted server resumed `wrun_01M62XBX69RKA9RPZ1ADJCKW23` and its handover state held both deliveries.

Across redeploys. Run `wrun_41M61YWT460GV41KED3QXPY7KE` was started on deployment `h6e-nxu0id6w3` (`dpl_BbTHpWKo2xHXK9YZjGsYmBLeywC2`) on 2026-10-28T19:13Z. Two further deployments of the branch followed (`h6e-rdcz3snfz`, `dpl_Hc2RdrQ2bVPjznBYrczmwXsu4kmH`, 04:05Z, and `h6e-hv8fneopj`, `dpl_3XvMfnL74FS4ikDwBUjw2Lpn4gfL`, 04:10Z on 2026-10-29). A delivery through the branch alias after each one was accepted by the new deployment and answered `resumed` with the same run id, `/prototype/run` still reported `running`, and the final handover state carried all three deliveries. The same held the day before for +27820000007 across `h6e-4s7cl76yz` to `h6e-nxu0id6w3` (`processedEvents: ["wamid.vprev3.A","wamid.vprev3.B","wamid.xdeploy1.B"]`).

The consequence. In every cross-deployment case the step executed on the deployment that created the run. The runtime log for `POST /intake` carries the new deployment id and, about half a second later, the `[candidate-run] delivery handled` line under `POST /.well-known/workflow/v1/flow` carries `dpl_BbTHpWKo2xHXK9YZjGsYmBLeywC2`, in the old deployment's log format. A Workflow run is pinned to its creating deployment for its whole life. eve's own sessions have a deployment handoff; a bare run does not. For a per-candidate run that waits for weeks this means the deployment that received a candidate's first message must stay available until that candidate's run ends, code fixes do not reach existing runs, and Vercel's deployment retention settings become load-bearing. Before acceptance, the design needs a handoff of its own, for example the route noticing the owner deployment differs from the current one, handing the run over, and starting a fresh run on the current deployment seeded with the returned state. The primitives for that are proven here; the prototype's run body does not yet accept an initial state.

### Question 3: how a Phase 2 eve session picks up Phase 1 state

Answered in writing; the primitives are proven, the session-side call was not run.

The hook token is Task 1.2's workflow key (`candidate:+27...`), so any host code that knows the verified number can find the run with `getHookByToken(key)`, end it with `resumeHook(key, { kind: "handover" })`, and read its final state with `getRun(runId).returnValue`. The prototype's `/prototype/handover` route did exactly this locally and on preview and received the full state each time (for example the 007 and 008 states quoted above). eve's documentation (`docs/tools/workflows.mdx`) places `start`, `getRun` and `resumeHook` from `workflow/api` inside `"use step"` functions of a `defineWorkflowTool`, so the Phase 2 session keyed on the same number can run that handover in a step on its first turn and seed its `defineState` slot from the returned state. What was not run is an actual eve session doing this, because Phase 1 has no model credentials and a session turn would be a model call; it should be the first Phase 2 spike. If retention is set to 0 for these runs, the handover must push the state to the session rather than have the session read `returnValue` (see Question 2).

### Not safe to ship from the prototype

The three `/prototype/*` read and handover routes authenticate with the webhook app secret sent as a request header, which reuses a signing secret as a bearer and exposes per-candidate state and run ids. `/prototype/fake-graph/...` is an unauthenticated POST that logs request bodies. `WHATSAPP_GRAPH_BASE_URL` lets an environment misconfiguration redirect candidate messages, which carry the number, to an arbitrary host. The route answers Meta before the acknowledgement step has run. All of these are for the prototype only and must not survive into the Task 1.3 implementation.
