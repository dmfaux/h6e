import { defineEvalConfig } from "eve/evals";

// Run-wide configuration for the eval suite (eve-native eval harness, ADR 0002).
// Phase 0 stands up the empty frame only: there are no `*.eval.ts` cases yet, so
// `eve eval` discovers an empty suite and passes. The harness still runs as a
// real CI gate, so a harness that cannot run (a config or boot error) fails the
// build rather than passing silently. Eval content arrives in Phase 2 (ADR 0013
// and the evals-policy ADR authored at Phase 2 start); see docs/phase-0/eval-and-
// tracing-notes.md for where Phase 2 attaches cases and recommendation traces.
//
// Everything here is optional. We deliberately set no default `judge` model: the
// empty frame makes no model calls, so the harness needs no model-provider
// credentials to run green. Phase 2 adds a judge default when LLM-as-judge
// assertions land. No external reporter is configured (no data leaves the tenant,
// ADR 0006); CI uses --junit for machine-readable output instead.
export default defineEvalConfig({});
