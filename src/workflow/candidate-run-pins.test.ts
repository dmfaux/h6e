// Guards on the run's pinned facts about the vendored Workflow SDK and on the
// interval override. Run with `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { HOOK_FORCE_CLAIM_SPEC_VERSION, INTERVALS, intervalsFromEnv } from "./candidate-run-machine.ts";

// The constant sits in the bundled SDK as
// `SPEC_VERSION_SUPPORTS_HOOK_FORCE_CLAIM:()=>8`. eve's ambient `workflow`
// modules do not export it, so the pin is checked against the bundle and
// fails the moment an eve upgrade moves it.
function vendoredHookForceClaimSpecVersion(): number {
  const require = createRequire(import.meta.url);
  const chunks = join(dirname(require.resolve("eve/package.json")), "dist", "src", "compiled", "_chunks", "workflow");
  const found = new Set<number>();
  for (const file of readdirSync(chunks)) {
    if (!file.endsWith(".js")) continue;
    const source = readFileSync(join(chunks, file), "utf8");
    for (const m of source.matchAll(/SPEC_VERSION_SUPPORTS_HOOK_FORCE_CLAIM:\(\)=>(\d+)/g)) found.add(Number(m[1]));
  }
  assert.equal(found.size, 1, `expected one SPEC_VERSION_SUPPORTS_HOOK_FORCE_CLAIM in eve's bundle, found: ${[...found].join(", ") || "none"}`);
  return [...found][0];
}

test("the successor spec version pin matches the vendored SDK's hook takeover version", () => {
  assert.equal(HOOK_FORCE_CLAIM_SPEC_VERSION, vendoredHookForceClaimSpecVersion());
});

test("the handoff interval is overridable off production only, and the idle window never", () => {
  assert.deepEqual(intervalsFromEnv({}), INTERVALS);
  assert.deepEqual(intervalsFromEnv({ CANDIDATE_HANDOFF_INTERVAL_MS: "60000", VERCEL_ENV: "preview" }), {
    ...INTERVALS,
    handoffMs: 60_000,
  });
  assert.deepEqual(intervalsFromEnv({ CANDIDATE_HANDOFF_INTERVAL_MS: "60000" }), { ...INTERVALS, handoffMs: 60_000 });
  assert.deepEqual(intervalsFromEnv({ CANDIDATE_HANDOFF_INTERVAL_MS: "60000", VERCEL_ENV: "production" }), INTERVALS);
  assert.deepEqual(intervalsFromEnv({ CANDIDATE_HANDOFF_INTERVAL_MS: "soon" }), INTERVALS);
  assert.deepEqual(intervalsFromEnv({ CANDIDATE_HANDOFF_INTERVAL_MS: "0" }), INTERVALS);
});
