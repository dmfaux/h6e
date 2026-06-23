// Tests for the durable per-candidate workflow (Task 1.2).
//
// Deterministic, no eve runtime: the pure core carries the logic, so the four
// behaviours are proven directly. A step boundary is simulated with a JSON
// round-trip, which is exactly what eve does when it serializes durable state at
// each checkpoint (ADR 0002). Run with `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workflowKey,
  InvalidWhatsAppNumberError,
  initialLogistics,
  applyEvent,
  runEffects,
  applyAdvance,
  STATE_FIELDS,
  type CandidateLogistics,
  type Effect,
  type InboundEvent,
} from "./candidate-workflow.ts";

// Simulate eve serializing durable state at a step boundary: the value is
// JSON-serialized when the step completes and rehydrated when the next step (or
// a resume after a crash) reads it.
function crossStepBoundary(state: CandidateLogistics): CandidateLogistics {
  return JSON.parse(JSON.stringify(state)) as CandidateLogistics;
}

// --- (1) Key derivation from the verified WhatsApp number (E1) -----------

test("the workflow key is derived from the verified WhatsApp number", () => {
  assert.equal(workflowKey("+27821234567"), "candidate:+27821234567");
});

test("formatting differences key the same workflow (no second workflow)", () => {
  const a = workflowKey("+27 82 123 4567");
  const b = workflowKey("+27-82-123-4567");
  const c = workflowKey("+27821234567");
  assert.equal(a, c);
  assert.equal(b, c);
});

test("an unverifiable or empty number cannot key a workflow", () => {
  assert.throws(() => workflowKey(""), InvalidWhatsAppNumberError);
  assert.throws(() => workflowKey("not-a-number"), InvalidWhatsAppNumberError);
  assert.throws(() => workflowKey("0821234567"), InvalidWhatsAppNumberError); // no country code
});

// --- (2) Idempotent dedup of a replayed event (E3, ADR 0010) ------------

test("a replayed event creates no second workflow and no duplicate side effect", () => {
  const event: InboundEvent = {
    kind: "application-received",
    id: "wamid.ABC",
    number: "+27821234567",
  };

  const first = applyEvent(initialLogistics(), event);
  assert.deepEqual(first.effects, [{ id: "started:candidate:+27821234567", kind: "workflow-started" }]);
  assert.deepEqual(first.state.processedEvents, ["wamid.ABC"]);

  // Same delivery again (at-least-once duplicate): no state change, no effect.
  const replay = applyEvent(first.state, event);
  assert.equal(replay.state, first.state); // unchanged reference: pure no-op
  assert.deepEqual(replay.effects, []);
});

test("a fresh application for an already-keyed number does not restart it", () => {
  const first = applyEvent(initialLogistics(), {
    kind: "application-received",
    id: "wamid.1",
    number: "+27821234567",
  });
  // Different event id, same number: recorded, but no second workflow-started.
  const again = applyEvent(first.state, {
    kind: "application-received",
    id: "wamid.2",
    number: "+27821234567",
  });
  assert.deepEqual(again.effects, []);
  assert.equal(again.state.key, "candidate:+27821234567");
});

// --- (3) State survives a simulated step boundary (E2, ADR 0002) --------

test("state and dedup survive a step boundary and keep deduplicating", () => {
  const started = applyEvent(initialLogistics(), {
    kind: "application-received",
    id: "wamid.1",
    number: "+27821234567",
  }).state;
  const withDocs = applyEvent(started, {
    kind: "documents-updated",
    id: "wamid.2",
    documents: ["id-copy", "matric-certificate"],
  }).state;

  // Checkpoint and resume from the rehydrated value.
  const resumed = crossStepBoundary(withDocs);
  assert.deepEqual(resumed.outstandingDocuments, ["id-copy", "matric-certificate"]);
  assert.deepEqual(resumed.processedEvents, ["wamid.1", "wamid.2"]);

  // An event already processed before the boundary is still deduped after it.
  const replayAfterBoundary = applyEvent(resumed, {
    kind: "documents-updated",
    id: "wamid.2",
    documents: ["something-else"],
  });
  assert.deepEqual(replayAfterBoundary.effects, []);
  assert.deepEqual(replayAfterBoundary.state.outstandingDocuments, ["id-copy", "matric-certificate"]);
});

// --- (4) A resume does not repeat a completed side effect (E2) ----------

test("a completed side effect is not performed again on resume", async () => {
  const effects: Effect[] = [{ id: "started:candidate:+27821234567", kind: "workflow-started" }];
  let performed = 0;
  const perform = async (_e: Effect) => {
    performed += 1;
  };

  // First pass: the effect runs once and is recorded as completed.
  const afterFirst = await runEffects(initialLogistics(), effects, perform);
  assert.equal(performed, 1);
  assert.deepEqual(afterFirst.completedEffects, ["started:candidate:+27821234567"]);

  // Crash and resume: the step re-runs from the checkpointed state with the
  // same effects. The completed effect must not be performed a second time.
  const resumed = crossStepBoundary(afterFirst);
  const afterResume = await runEffects(resumed, effects, perform);
  assert.equal(performed, 1); // still one: not repeated
  assert.deepEqual(afterResume.completedEffects, ["started:candidate:+27821234567"]);
});

// --- Engineer inspect-and-advance and terminate (E4) --------------------

test("an engineer can advance logistics state and terminate the workflow", () => {
  let s = initialLogistics();
  s = applyAdvance(s, { type: "request-handover" });
  assert.equal(s.handover, true);
  s = applyAdvance(s, { type: "set-slot", slot: "booked" });
  assert.equal(s.slot, "booked");

  // Terminate, then prove a terminated workflow accepts no further events.
  const terminated: CandidateLogistics = { ...s, terminated: true };
  const afterEvent = applyEvent(terminated, { kind: "handover-requested", id: "wamid.X" });
  assert.deepEqual(afterEvent.effects, []);
  assert.equal(afterEvent.state, terminated); // unchanged: no-op
});

// --- Minimal state shape: keys + logistics only, no candidate record ----

test("the state holds only keys and logistics, never a candidate record", () => {
  const example: CandidateLogistics = applyEvent(
    applyEvent(initialLogistics(), {
      kind: "application-received",
      id: "wamid.1",
      number: "+27821234567",
    }).state,
    { kind: "documents-updated", id: "wamid.2", documents: ["id-copy", "matric-certificate"] },
  ).state;

  // Exactly the allowed fields, no more: a stray name/CV/ID field would fail.
  assert.deepEqual(Object.keys(example).sort(), [...STATE_FIELDS].sort());

  // Print the example so the minimal shape is visible in the transcript.
  console.log("Minimal candidate workflow state shape:");
  console.log(JSON.stringify(example, null, 2));
});
