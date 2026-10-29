// Tests for the candidate run's state and reducer (Tasks 1.2 and 1.3).
//
// Deterministic, no runtime: the pure core carries the logic. A step boundary
// is simulated with a JSON round-trip, which is what the Workflow SDK does
// when it records a step result. Run with `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACK_EFFECT_ID,
  applyAdvance,
  applyEvent,
  CORRELATION_WINDOW,
  ingest,
  initialState,
  runEffects,
  STATE_FIELDS,
  terminate,
  type CandidateState,
  type Effect,
  type InboundEvent,
} from "./candidate-workflow.ts";

const KEY = "candidate:" + "ab".repeat(32);
const NUMBER = "+27821234567";
const T0 = 1_700_000_000_000;

function fresh(): CandidateState {
  return initialState(KEY, NUMBER, T0);
}

function application(id: string, at = T0 + 1000, number = NUMBER): InboundEvent {
  return { kind: "application-received", id, number, role: "Warehouse Picker", at };
}

function crossStepBoundary(state: CandidateState): CandidateState {
  return JSON.parse(JSON.stringify(state)) as CandidateState;
}

// --- Idempotent dedup of a replayed event (ADR 0010) --------------------

test("a replayed event creates no second acknowledgement and changes nothing", () => {
  const first = applyEvent(fresh(), application("h1"));
  assert.deepEqual(first.effects, [{ id: ACK_EFFECT_ID, kind: "candidate-acknowledged", role: "Warehouse Picker" }]);
  assert.deepEqual(first.state.processedEvents, ["h1"]);
  assert.equal(first.state.lastActivityAt, T0 + 1000);

  const replay = applyEvent(first.state, application("h1"));
  assert.equal(replay.state, first.state);
  assert.deepEqual(replay.effects, []);
});

test("a second application from the same candidate is recorded but acknowledged at most once", async () => {
  let acks = 0;
  const perform = async () => {
    acks += 1;
  };
  const once = await ingest(fresh(), application("h1"), perform);
  assert.equal(acks, 1);
  assert.deepEqual(once.completedEffects, [ACK_EFFECT_ID]);

  const twice = await ingest(once, application("h2", T0 + 5000), perform);
  assert.equal(acks, 1);
  assert.deepEqual(twice.processedEvents, ["h1", "h2"]);
  assert.equal(twice.lastActivityAt, T0 + 5000);
});

test("an application for a different number never rekeys a run", () => {
  const other = applyEvent(fresh(), application("h2", T0 + 1, "+27829999999"));
  assert.equal(other.state.number, NUMBER);
  assert.deepEqual(other.effects, []);
  assert.deepEqual(other.state.processedEvents, []);
});

// --- State survives a step boundary ---------------------------------------

test("state and dedup survive a step boundary and keep deduplicating", () => {
  const started = applyEvent(fresh(), application("h1")).state;
  const withDocs = applyEvent(started, {
    kind: "documents-updated",
    id: "h2",
    documents: ["id-copy", "matric-certificate"],
    at: T0 + 2000,
  }).state;

  const resumed = crossStepBoundary(withDocs);
  assert.deepEqual(resumed.outstandingDocuments, ["id-copy", "matric-certificate"]);
  assert.deepEqual(resumed.processedEvents, ["h1", "h2"]);

  const replayAfterBoundary = applyEvent(resumed, {
    kind: "documents-updated",
    id: "h2",
    documents: ["something-else"],
    at: T0 + 3000,
  });
  assert.deepEqual(replayAfterBoundary.effects, []);
  assert.deepEqual(replayAfterBoundary.state.outstandingDocuments, ["id-copy", "matric-certificate"]);
});

// --- A resume does not repeat a completed side effect ----------------------

test("a completed side effect is not performed again on resume", async () => {
  const effects: Effect[] = [{ id: ACK_EFFECT_ID, kind: "candidate-acknowledged", role: "Driver" }];
  let performed = 0;
  const perform = async () => {
    performed += 1;
  };

  const afterFirst = await runEffects(fresh(), effects, perform);
  assert.equal(performed, 1);
  assert.deepEqual(afterFirst.completedEffects, [ACK_EFFECT_ID]);

  const afterResume = await runEffects(crossStepBoundary(afterFirst), effects, perform);
  assert.equal(performed, 1);
  assert.deepEqual(afterResume.completedEffects, [ACK_EFFECT_ID]);
});

// --- Commit after effects --------------------------------------------------

test("a failed acknowledgement leaves the event uncommitted, so a redelivery retries it", async () => {
  const before = fresh();
  await assert.rejects(
    ingest(before, application("h1"), async () => {
      throw new Error("Cloud API 503");
    }),
    /Cloud API 503/,
  );
  assert.deepEqual(before.processedEvents, []);
  assert.deepEqual(before.completedEffects, []);

  const roles: string[] = [];
  const after = await ingest(before, application("h1"), async (e) => {
    roles.push(e.role);
  });
  assert.deepEqual(roles, ["Warehouse Picker"]);
  assert.deepEqual(after.processedEvents, ["h1"]);
  assert.deepEqual(after.completedEffects, [ACK_EFFECT_ID]);

  const replay = await ingest(after, application("h1"), async (e) => {
    roles.push(e.role);
  });
  assert.deepEqual(roles, ["Warehouse Picker"]);
  assert.deepEqual(replay, after);
});

// --- Engineer advance and terminate (E4, ADR 0030) --------------------------

test("an engineer can advance logistics state and a terminated run accepts no events", () => {
  let s = fresh();
  s = applyAdvance(s, { type: "request-handover" });
  assert.equal(s.handover, true);
  s = applyAdvance(s, { type: "set-slot", slot: "booked" });
  assert.equal(s.slot, "booked");
  s = applyAdvance(s, { type: "resolve-handover" });
  assert.equal(s.handover, false);

  const ended = terminate(s);
  assert.equal(ended.terminated, true);
  const afterEvent = applyEvent(ended, { kind: "handover-requested", id: "h9", at: T0 + 9 });
  assert.deepEqual(afterEvent.effects, []);
  assert.equal(afterEvent.state, ended);
});

// --- Minimal state shape ----------------------------------------------------

test("the state holds only keys, the number, and logistics, never a candidate record", () => {
  const example = applyEvent(
    applyEvent(fresh(), application("h1")).state,
    { kind: "documents-updated", id: "h2", documents: ["id-copy"], at: T0 + 2 },
  ).state;
  assert.deepEqual(Object.keys(example).sort(), [...STATE_FIELDS].sort());
  assert.equal(example.schemaVersion, 1);
  assert.equal(example.key, KEY);
  console.log("Minimal candidate run state shape:");
  console.log(JSON.stringify(example, null, 2));
});

test("effect ids and event ids never embed the number", () => {
  const { state, effects } = applyEvent(fresh(), application("h1"));
  for (const id of [...effects.map((e) => e.id), ...state.processedEvents, ...state.completedEffects]) {
    assert.equal(id.includes("27821234567"), false, id);
  }
});

test("dedup and effect bookkeeping are bounded to the correlation window", async () => {
  let state = fresh();
  for (let i = 0; i < CORRELATION_WINDOW + 5; i++) {
    state = applyEvent(state, { kind: "handover-requested", id: `h${i}`, at: T0 + i }).state;
  }
  assert.equal(state.processedEvents.length, CORRELATION_WINDOW);
  assert.equal(state.processedEvents[0], "h5");
  assert.equal(state.processedEvents.at(-1), `h${CORRELATION_WINDOW + 4}`);
  assert.deepEqual(applyEvent(state, { kind: "handover-requested", id: `h${CORRELATION_WINDOW + 4}`, at: T0 }).effects, []);
});
