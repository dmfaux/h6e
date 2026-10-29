// The candidate run's protocol decisions (ADR 0029, ADR 0030), proven on plain
// values. Run with `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abandonHandoff,
  closingRecord,
  HANDOFF_INTERVAL_MS,
  IDLE_EXPIRY_MS,
  INTERVALS,
  nextWake,
  onMessage,
  recoveryBackoffMs,
  SERVING,
  triggersHandoff,
  whatIsDue,
  type Delivery,
  type RunMessage,
  type RunMode,
} from "./candidate-run-machine.ts";
import { parseCandidateState } from "./candidate-state-schema.ts";
import { initialState } from "./candidate-workflow.ts";

const HERE = "dpl_here";
const THERE = "dpl_there";
const KEY = "candidate:" + "cd".repeat(32);

function delivery(acceptedBy: string, messageIdHash = "h1"): Delivery {
  return { kind: "delivery", number: "+27820000001", messageIdHash, role: "Picker", acceptedBy };
}

const handingOff: RunMode = { mode: "handing-off", target: THERE, held: [delivery(THERE, "h0")] };

// --- The mode transition table ----------------------------------------------

test("a delivery accepted by the current deployment is processed in place", () => {
  const out = onMessage(SERVING, delivery(HERE), HERE);
  assert.deepEqual(out, { mode: SERVING, steps: [{ do: "process", message: delivery(HERE) }] });
});

test("a delivery accepted by another deployment starts a handoff and is held, not processed", () => {
  assert.equal(triggersHandoff(delivery(THERE), HERE), true);
  assert.equal(triggersHandoff(delivery(HERE), HERE), false);
  const out = onMessage(SERVING, delivery(THERE), HERE);
  assert.deepEqual(out, {
    mode: { mode: "handing-off", target: THERE, held: [delivery(THERE)] },
    steps: [{ do: "begin-handoff", target: THERE }],
  });
});

test("every message kind in every mode lands on the table", () => {
  const terminate: RunMessage = { kind: "terminate" };
  const advance: RunMessage = { kind: "advance", action: { type: "set-slot", slot: "booked" } };
  const rejected: RunMessage = { kind: "handoff.rejected", successorRunId: "wrun_succ" };
  const commit: RunMessage = { kind: "handoff.commit", held: [delivery(HERE, "h7"), terminate] };

  // Serving: terminate and advance are processed; a stray commit's held
  // messages are processed; a stray rejection is ignored.
  assert.deepEqual(onMessage(SERVING, terminate, HERE).steps, [{ do: "process", message: terminate }]);
  assert.deepEqual(onMessage(SERVING, advance, HERE).steps, [{ do: "process", message: advance }]);
  assert.deepEqual(onMessage(SERVING, commit, HERE).steps, [
    { do: "process", message: delivery(HERE, "h7") },
    { do: "process", message: terminate },
  ]);
  assert.deepEqual(onMessage(SERVING, rejected, HERE), { mode: SERVING, steps: [{ do: "ignore", message: "handoff.rejected" }] });

  // Handing off: deliveries, terminate and advance are held in arrival order
  // and nothing is processed.
  const afterDelivery = onMessage(handingOff, delivery(HERE, "h1"), HERE);
  assert.deepEqual(afterDelivery.steps, []);
  const afterTerminate = onMessage(afterDelivery.mode, terminate, HERE);
  const afterAdvance = onMessage(afterTerminate.mode, advance, HERE);
  assert.deepEqual(afterAdvance.mode, {
    mode: "handing-off",
    target: THERE,
    held: [delivery(THERE, "h0"), delivery(HERE, "h1"), terminate, advance],
  });

  // A refusal returns to serving, audits the failure, then processes what was held.
  assert.deepEqual(onMessage(afterAdvance.mode, rejected, HERE), {
    mode: SERVING,
    steps: [
      { do: "handoff-failed", reason: "successor wrun_succ refused the state", target: THERE, held: 4 },
      { do: "process", message: delivery(THERE, "h0") },
      { do: "process", message: delivery(HERE, "h1") },
      { do: "process", message: terminate },
      { do: "process", message: advance },
    ],
  });

  // An old run cannot receive a commit; it is ignored.
  assert.deepEqual(onMessage(handingOff, commit, HERE), { mode: handingOff, steps: [{ do: "ignore", message: "handoff.commit" }] });
});

test("abandoning a handoff on the deadline audits and processes the held messages", () => {
  assert.deepEqual(abandonHandoff(handingOff, "deadline"), {
    mode: SERVING,
    steps: [
      { do: "handoff-failed", reason: "deadline", target: THERE, held: 1 },
      { do: "process", message: delivery(THERE, "h0") },
    ],
  });
  assert.deepEqual(abandonHandoff(SERVING, "deadline"), { mode: SERVING, steps: [] });
});

// --- Timers ---------------------------------------------------------------------

test("the next wake is the earlier of the handoff and the idle expiry", () => {
  const started = 1_700_000_000_000;
  const handoffAt = started + HANDOFF_INTERVAL_MS;
  assert.equal(nextWake(handoffAt, started, INTERVALS), handoffAt);
  // A run that has been handed off several times carries lastActivityAt from
  // long ago, so the idle expiry can come before the next handoff.
  const quietSince = started - 25 * 24 * 60 * 60 * 1000;
  assert.equal(nextWake(handoffAt, quietSince, INTERVALS), quietSince + IDLE_EXPIRY_MS);
});

test("what is due at a wake: nothing, a handoff, or the idle expiry, which wins", () => {
  const started = 1_700_000_000_000;
  const handoffAt = started + HANDOFF_INTERVAL_MS;
  assert.equal(whatIsDue(started + 1, handoffAt, started, INTERVALS), null);
  assert.equal(whatIsDue(handoffAt, handoffAt, started, INTERVALS), "handoff");
  assert.equal(whatIsDue(started + IDLE_EXPIRY_MS, handoffAt, started, INTERVALS), "idle-expiry");
  // A delivery after the timer was armed moves the idle expiry later, so the
  // armed wake fires with nothing due and the body re-arms.
  const short = { handoffMs: 1000, idleExpiryMs: 5000, handoffDeadlineMs: 100 };
  assert.equal(whatIsDue(5000, 10_000, 1000, short), null);
  assert.equal(whatIsDue(6000, 10_000, 1000, short), "idle-expiry");
});

test("recovery backoff doubles from a minute and caps at an hour", () => {
  assert.equal(recoveryBackoffMs(1), 60_000);
  assert.equal(recoveryBackoffMs(2), 120_000);
  assert.equal(recoveryBackoffMs(4), 480_000);
  assert.equal(recoveryBackoffMs(20), 3_600_000);
});

// --- Successor schema check ---------------------------------------------------

test("a successor reads the state it was built for and refuses any other version", () => {
  const state = initialState(KEY, "+27820000001", 1_700_000_000_000);
  const roundTripped: unknown = JSON.parse(JSON.stringify(state));
  assert.deepEqual(parseCandidateState(roundTripped), { ok: true, state });

  const wrongVersion = parseCandidateState({ ...state, schemaVersion: 2 });
  assert.deepEqual(wrongVersion, { ok: false, reason: "schemaVersion: invalid_value" });

  const extraField = parseCandidateState({ ...state, fullName: "Someone" });
  assert.equal(extraField.ok, false);
  assert.ok(!extraField.ok && extraField.reason.includes("unrecognized_keys"));
  assert.equal(!extraField.ok && extraField.reason.includes("Someone"), false);

  assert.equal(parseCandidateState(null).ok, false);
  assert.equal(parseCandidateState("candidate:abc").ok, false);
});

// --- Closing audit record ---------------------------------------------------------

test("the closing audit record carries the opaque key and counts, never the number", () => {
  const state = {
    ...initialState(KEY, "+27820000001", 1_700_000_000_000),
    processedEvents: ["h1", "h2"],
    completedEffects: ["acknowledge-application"],
    outstandingDocuments: ["id-copy"],
    slot: "booked",
    handover: true,
  };
  const record = closingRecord(state, "idle-expiry", 1_700_000_000_000);
  assert.deepEqual(record, {
    audit: "candidate.run.closed",
    key: KEY,
    reason: "idle-expiry",
    at: "2023-11-14T22:13:20.000Z",
    processedEvents: 2,
    completedEffects: 1,
    outstandingDocuments: 1,
    slot: "booked",
    handover: true,
  });
  assert.equal(JSON.stringify(record).includes("27820000001"), false);
});
