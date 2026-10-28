// The span attribute export policy: no candidate number reaches a trace
// destination (ADR 0006). Run with `pnpm test src/observability`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateSafeExportPolicy, redactNumbers } from "./span-attributes.ts";

test("a workflow hook token carrying the candidate address is rewritten", () => {
  assert.deepEqual(redactNumbers("eve:inbox:v1:intake:candidate:+27820000001"), {
    replace: true,
    value: "eve:inbox:v1:intake:candidate:[number]",
  });
  assert.deepEqual(redactNumbers("candidate:+27820000001 and +447700900123"), {
    replace: true,
    value: "candidate:[number] and [number]",
  });
});

test("attributes without a number pass through unchanged", () => {
  assert.deepEqual(redactNumbers("internal.whoami"), { emit: true });
  assert.deepEqual(redactNumbers("4bf92f3577b34da6a3ce929d0e0e4736"), { emit: true });
  assert.deepEqual(redactNumbers(200), { emit: true });
  assert.deepEqual(redactNumbers(true), { emit: true });
  assert.deepEqual(redactNumbers(["a", "b"]), { emit: true });
  assert.deepEqual(redactNumbers(undefined), { emit: true });
});

test("a string array with a number is rewritten element by element", () => {
  assert.deepEqual(redactNumbers(["candidate:+27820000001", "ok"]), {
    replace: true,
    value: ["candidate:[number]", "ok"],
  });
});

test("the destination policy applies the rewrite to every attribute", () => {
  const span = { attributes: {}, audience: "private" as const, name: "x", spanId: "s", traceId: "t" };
  const decision = candidateSafeExportPolicy.attribute?.({
    key: "workflow.hook.token",
    span,
    value: "eve:inbox:v1:intake:candidate:+27820000001",
  });
  assert.deepEqual(decision, { replace: true, value: "eve:inbox:v1:intake:candidate:[number]" });
});
