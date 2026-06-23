#!/usr/bin/env node
// Eval gate (Task 0.9, requirement G1). Runs the eve-native eval harness as a
// real CI gate.
//
// eve's `eve eval` treats a literally empty suite as a configuration error
// (exit 2) and, on the empty path, returns before it ever loads
// evals/evals.config.ts. Phase 0 ships the empty frame on purpose (no eval
// cases until Phase 2), so this thin wrapper makes "green means wired, not
// absent" true:
//
//   1. It loads evals/evals.config.ts itself, so a harness that cannot run (a
//      broken config) fails the build rather than passing silently.
//   2. It discovers *.eval.ts cases. Zero cases is the legitimate empty frame
//      -> exit 0. One or more cases (Phase 2 onward) -> delegate to
//      `eve eval --strict --junit` and propagate its exit code, so a failing
//      eval blocks the build.
//
// This wrapper adds no eval content; it only adapts eve's empty-suite exit code
// to the Phase 0 requirement. The harness itself stays eve-native (ADR 0002).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evalsDir = join(root, "evals");
const configPath = join(evalsDir, "evals.config.ts");

// 1. The harness must be able to load its run-wide config. defineEvalConfig
// validates the input and throws on a bad config, so a broken harness fails
// here (requirement G1: fail the build if the harness cannot run).
try {
  const mod = await import(pathToFileURL(configPath).href);
  if (!mod.default) {
    throw new Error("evals/evals.config.ts has no default export");
  }
  console.log("[eval-gate] evals.config.ts loaded; harness can run.");
} catch (error) {
  console.error(
    "[eval-gate] harness cannot run: failed to load evals/evals.config.ts",
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// 2. Discover eval case files under evals/.
function discoverEvalCases(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".eval.ts")) {
      found.push(entry.name);
    }
  }
  return found;
}

const cases = discoverEvalCases(evalsDir);

if (cases.length === 0) {
  // The empty frame: the harness ran and discovered zero cases. Phase 2 adds
  // the first *.eval.ts cases here (see docs/phase-0/eval-and-tracing-notes.md).
  console.log("[eval-gate] empty suite: 0 eval cases discovered. Harness green.");
  process.exit(0);
}

// 3. Real cases present (Phase 2 onward): run the native harness as the gate.
// --strict turns soft threshold misses into failures; --junit emits CI
// annotations. The eval environment must provide model-provider credentials
// once cases exist (see the notes file).
console.log(
  `[eval-gate] ${cases.length} eval case(s) discovered; running eve eval --strict.`,
);
const result = spawnSync(
  process.execPath,
  [
    join(root, "node_modules/eve/bin/eve.js"),
    "eval",
    "--strict",
    "--junit",
    join(root, ".eve/junit.xml"),
  ],
  { stdio: "inherit", cwd: root },
);
process.exit(result.status ?? 1);
