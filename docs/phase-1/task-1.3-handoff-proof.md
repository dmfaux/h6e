# Task 1.3: candidate run proof

ADR 0029 requires the candidate run's deployment handoff to be proven on preview deployments before Task 1.3 is marked done. This records that proof and the local boot proof. Only fake numbers of the form +2782000000x were used. Keys are the opaque `candidate:` HMAC, shortened here to 12 hex characters.

## Local boot proof

`pnpm build && node scripts/candidate-run-proof/prove.mjs` boots the built agent against a fresh local World, posts signed Meta-shaped webhooks and intercepts Graph sends with a preloaded fetch wrapper (`scripts/candidate-run-proof/intercept-graph.mjs`), so no production code path changes. Run on 2026-10-29, all 18 checks passed:

- A forged signature answered 403.
- A first application started a run, and a redelivery and a second message resumed the same run.
- Two concurrent first messages for one number ended with one owner and one acknowledgement. The losing run logged `duplicate start forwarded`.
- Each of three numbers received exactly one Graph send.
- 114 workflow spans were exported, with no `invoke_agent` or `chat` span, and no number or raw message id appeared in any log line.

## Preview proof

The proof ran on 2026-10-29 on branch `proof/task-1.3-handoff`, commit `8259d51`. That branch adds one commit, never to be merged: a fake Graph route and two successor toggles, all gated on `PROOF_MODE=1`. Branch-scoped preview secrets were set for the run and removed afterwards. Each deployment was a `vercel redeploy`, which moves the branch alias.

| | Deployment | Toggles |
|---|---|---|
| D1 | `dpl_5PXz8e8EppdLi99PExGiJzWdYbX2` | none |
| D2 | `dpl_FPoHRx3y9End8DP4p6kDpDy4qY1P` | none |
| D3 | `dpl_7kYRhmRxSpDG3J2BsV9ZCrE29g22` | successor refuses the state |
| D4 | `dpl_PN2jW7Y3hW6F2H3MjuHYhEhmCigW` | successor stalls past the deadline |
| D5 | `dpl_12LdTnDJNeitgS5xZgqmGBPpUW2K` | handoff interval 4 minutes |
| D6 | `dpl_E5rKj4fyEtWj6pzYfhP4K1jnzHDv` | handoff interval 4 minutes |

| Scenario | Result | Evidence |
|---|---|---|
| Delivery handoff | Pass | The run started on D1. A delivery accepted on D2 started successor `wrun_41M63JXSXX0GKY060W00G56E0Y` on D2, D1 logged `handed over … held=1`, and D2 handled the delivery (`processedEvents=2 completedEffects=1`). A later delivery went straight to D2 with no further handoff. |
| Timer handoff | Pass | A run idle on D5 handed itself to D6, the deployment the branch alias served, four minutes after boot with no delivery. On its own timer, the successor looked up the serving deployment, got itself back, and re-armed. |
| Refusal | Pass | The D3 successor sent `handoff.rejected` and completed. The D1 run kept the token, wrote `candidate.handoff.failed` (`held: 1`) and processed the delivery itself. Its next handoff succeeded. |
| Deadline and cancel | Pass | The D4 successor stalled. After 10 minutes the D1 run cancelled it, wrote `candidate.handoff.failed` (`held: 2`), processed both held deliveries and kept the token. The cancelled successor never claimed. |
| Concurrent first messages | Pass | With eight concurrent first messages for one number, seven runs started, six logged `duplicate start forwarded` to one owner, and the result was one acknowledgement with `processedEvents=8`. Two or four concurrent messages never hit the start race on the Vercel World, because every one after the first resumed the owner. |
| Concurrent deliveries during a handoff | Pass | Two deliveries sent together right after D2 went live were held by the D1 run and committed (`handed over … held=2`). D2 processed both, with one acknowledgement overall. |

Across the branch's preview logs, searches for `invoke_agent`, `chat anthropic`, `2782000000` and `wamid` each returned no records. Each candidate key received exactly one fake Graph send.

## Not exercised

These branches are covered by pure tests only:

- the deadline branch where the successor's claim lands just before the cancel
- the successor's path when its predecessor ends without committing
- the body's recovery loop
- idle expiry and terminate, at their real intervals

## Observations for operations

- Every successor's forced `createHook` records an error-status span (HTTP 409 `EntityConflictError` on `hook_created`), which the SDK treats as a normal duplicate-write signal. So error-rate alerting will count one per handoff.
- A cancelled run's pending sleep still wakes at its original time and is answered 410 `RunExpiredError`, which does no harm.
- `vercel logs -q` returns at most 50 records per query. So the stuck-handoff alerting ADR 0029 requires should match specific strings (`candidate.handoff.failed`) rather than scan raw logs.
- Eight proof runs are still parked on the D1, D2 and D6 previews. Five of the D6 runs wake every 4 minutes until their deployment expires or the 30-day idle window closes. They hold only fake numbers. They can be cancelled from the Vercel dashboard's Workflow view.
