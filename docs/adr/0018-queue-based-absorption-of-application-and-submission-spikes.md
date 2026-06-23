# 0018. Queue-based absorption of application and submission spikes

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering (proposed)

## Context

Phase 3 must process application or submission floods (a popular graduate role can take thousands of applications, and later assessment submissions, in a single day) without falling over and without dropping candidates. Phases 1 and 2 deliberately targeted ordinary volume and deferred flood handling here, with Phase 1 noting only that backpressure must not drop candidates. The load lands on bounded, costly resources: the Sandbox (marking jobs, ADR 0015 and 0017), model calls through the gateway broker (rate-limited and paid per call, ADR 0014), and external systems through Connect (ADR 0009). The durable per-candidate workflow (Workflow SDK, Phase 1) gives each candidate crash-safe state, but it does not by itself shape how thousands of concurrent arrivals are paced against those bounded resources. A spike processed greedily would exhaust the Sandbox or the provider rate limit, fail calls, and risk losing candidates; a spike rejected at the door would drop them.

## Decision

Spike-prone work (application intake from Phase 1 and assessment submission marking in Phase 3) is absorbed through a queue with backpressure rather than processed greedily on arrival. On a spike the agent still accepts and acknowledges the candidate immediately and persists their submission to the system of record (ADR 0006), then enqueues the heavy work (marking, model calls) for paced processing. Processing runs at a sustainable, configurable rate bounded by the Sandbox and provider limits, in a fair order that does not let a single large requisition starve others, with idempotent handling so a retried or duplicated item causes no duplicate side effects (consistent with ADR 0010), and with retry and a dead-letter path so an item that repeatedly fails is surfaced to a human rather than silently lost. No candidate is dropped because of load: the bound is on processing rate, not on admission. Queue depth, age, and dead-letter counts are observable and alert when a spike outpaces sustainable throughput. This governs how work is paced under load; it does not change the per-candidate durable workflow, which remains the unit of state, nor the human gates and write boundaries of ADRs 0004, 0016, and 0019.

## Consequences

A flood is absorbed rather than dropped or crashed: candidates are acknowledged at once and their heavy processing is paced against the real limits of the Sandbox and the model providers, which is what "processed without falling over" requires. Fair ordering stops one graduate-intake requisition monopolising throughput. Idempotency and dead-lettering make the queue safe on at-least-once delivery and stop silent loss. The cost is added moving parts (a queue, its rate and fairness configuration, dead-letter monitoring) and added latency under load: a candidate in a spike is acknowledged immediately but waits longer for a result, which is the right trade against dropping them, and the wait must stay within the courtesy limits the Phase 1 candidate-experience risk set. The queue sits alongside the durable workflow rather than replacing it.

## Alternatives considered

Relying on the durable workflow and the platform to scale elastically with no queue. Rejected: durability protects state across crashes but does not pace work against bounded Sandbox and provider limits, so a spike would still exhaust them and fail calls.

Shedding load at admission when a spike exceeds capacity (rejecting or deferring new applicants). Rejected: dropping candidates because a role is popular is the exact failure the PRD forbids, and a popular graduate role is precisely when early-stage leakage is most costly.

Processing strictly first-in-first-out across all requisitions. Rejected: a single large intake would starve every other requisition; fair ordering across requisitions is needed so smaller pipelines keep moving during a flood.
