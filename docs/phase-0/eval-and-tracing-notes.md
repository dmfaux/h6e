# Eval and tracing frame: where Phase 2 plugs in

This note records what Task 0.9 stood up and where the next phase attaches, so the empty frame is legible to whoever fills it (requirement G3). Phase 0 builds the empty frame and one real trace only. No eval content, no bias or disparate-impact checks, and no recommendation trace are in scope here; those are Phase 2, under ADR 0013 and the evals-policy ADR authored at Phase 2 start.

## What exists now

- Eval harness: the eve-native `eve eval` (ADR 0002), run through a thin gate at `scripts/eval-gate.mjs` (the `pnpm eval` script). The gate runs in CI as a real gate. It passes on the empty suite but fails the build if the harness cannot run (a broken `evals/evals.config.ts`) or, once cases exist, if any eval fails. Green means wired, not absent.
- Run-wide config: `evals/evals.config.ts` (`defineEvalConfig`). No default judge model and no external reporter yet, so the empty frame needs no model-provider credentials and no data leaves the tenant.
- Tracing: `agent/instrumentation.ts` registers a vendor-neutral OpenTelemetry provider (ADR 0025, Accepted). The authenticated whoami path is wrapped in one real span at `src/observability/whoami-trace.ts`, proved by `src/observability/whoami-trace.test.ts`. Phase 0 exports spans to the console only (no egress, ADR 0006).

## Where Phase 2 attaches eval cases

- Add `*.eval.ts` files under `evals/` (for example `evals/screening/<case>.eval.ts`). eve discovers them automatically; the file path is the eval id. The gate stops treating the suite as empty and delegates to `eve eval --strict --junit`, so a failing or below-threshold eval blocks the merge.
- Set a default `judge` model in `evals.config.ts` when LLM-as-judge assertions land, and add the bias and disparate-impact eval cases required before any screening ships (ADR 0004, ADR 0013). The evals-policy ADR authored at Phase 2 start governs what those cases must cover.
- CI must then provide model-provider credentials (AI Gateway) to the eval step, because non-empty evals drive the agent against a live model. The empty Phase 0 frame deliberately needs none.

## Where Phase 2 attaches recommendation traces

- The recommendation (screening and ranking) path is a model turn, so eve auto-traces it as an `ai.eve.turn` span tree once it exists; no manual span is needed there, unlike the non-model whoami route. Attach per-call context (requisition, candidate reference after redaction, model and ruleset version) through the `events["step.started"]` hook in `agent/instrumentation.ts`, which rides values onto the AI-SDK spans.
- Before turning on any exporter that carries recommendation traces off-box, clear the data path under ADR 0006, and keep `recordInputs`/`recordOutputs` off until the exporter and its retention path are approved (ADR 0014). The recommendation trace itself is Phase 2 work and is explicitly not built here.
