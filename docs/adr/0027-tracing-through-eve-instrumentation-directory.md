# 0027. Tracing through eve's instrumentation directory

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Engineering (David Faux)
- **Supersedes:** 0025

## Context

ADR 0025 traced through a single `agent/instrumentation.ts` that called `defineInstrumentation` and registered our own `NodeTracerProvider` from `@opentelemetry/sdk-trace-node` and `@opentelemetry/sdk-trace-base`. eve 0.62 removed that API: flat `instrumentation.ts` modules are no longer discovered, and on eve 0.85 the build fails while the file exists. eve now owns the tracer provider and takes configuration from path-named files under `agent/instrumentation/`. Separately, OpenTelemetry deprecated `sdk-trace-node` and `sdk-trace-base` in favour of a single `@opentelemetry/sdk-trace` package (3.x).

Two eve defaults matter for data minimisation (ADR 0006). Once an OpenTelemetry destination exists, eve records inputs and outputs during development and for public conversations unless a trace policy says otherwise. And eve exports traces to Vercel Agent Runs (Beta, enabled per team) by default in preview and production. Neither destination has an approved retention and access path, and Agent Runs must be checked against ADR 0005 before it is enabled.

One version constraint shapes the dependency choice. eve bundles its own copy of `@opentelemetry/api` (1.9.1 in eve 0.85) and registers the global tracer provider through it. The OpenTelemetry API only hands a caller the registered provider when the registered copy is at least the caller's version within the same major. A newer `@opentelemetry/api` on our side therefore silently gets a no-op tracer, and the whoami span is never exported, which the stack upgrade reproduced (api 1.10.0 against eve's 1.9.1) while the unit test still passed because it registered its own provider on the same copy.

The posture ADR 0025 set is unchanged: real OpenTelemetry spans, console-only export in this phase, no recorded inputs or outputs. Only the mechanism has to move.

## Decision

We trace through eve's instrumentation directory, with eve owning the OpenTelemetry provider.

- `agent/instrumentation/otel.ts` default-exports `otel({ tracePolicy })` with a policy that emits spans but never records inputs or outputs.
- `agent/instrumentation/console.ts` default-exports `otelIntegration` with a console span processor from `@opentelemetry/sdk-trace`. This is the only deployed trace destination. On a developer machine `eve dev` also keeps its local trace spool; `agent/instrumentation/local.ts` declares that destination with the same export policy so it is covered by the same rules.
- Both destinations apply the export policy in `src/observability/span-attributes.ts`, which rewrites any E.164 number in a span attribute before export. eve stamps the session's inbox token on its workflow hook spans, and for a candidate session that token carries the workflow key, so without this policy the candidate's number reaches the exporter even with inputs and outputs off.
- `agent/instrumentation/agent-runs.ts` default-exports `disableInstrumentation()`, so no trace data goes to Vercel Agent Runs until that destination is approved.
- Manual spans on non-model paths (the whoami wrapper in `src/observability/whoami-trace.ts`) keep using `@opentelemetry/api`, which resolves to the provider eve registers. For that to hold, our `@opentelemetry/api` is pinned to the version eve bundles (1.9.1), and `@opentelemetry/sdk-trace` to the 2.x line (2.12.0) whose peer range accepts it; sdk-trace 3.x requires api 1.10. The test in `src/observability/otel-api-compat.test.ts` registers a provider the way eve's copy does, stamped with the version read from eve's bundle, and fails if our copy stops being served by it. This is the one case where the rule to run the latest production version yields to compatibility with what is installed.

## Consequences

The dependency set shrinks to `@opentelemetry/api` and `@opentelemetry/sdk-trace`, and we no longer construct or register a provider ourselves. Each eve upgrade must re-check the bundled api version against our pin; the compatibility test makes a drift fail `pnpm test` rather than silently dropping spans. Adding an approved backend later is one more file under `agent/instrumentation/`, and the shared trace policy remains a ceiling that no destination can widen.

The cost is a tighter coupling to eve's instrumentation contract, which has changed shape before and may again. Agent Runs being on by default means any new eve-managed destination must be checked against ADR 0006 on each upgrade. The trace policy also selects eve's default Workflow run-data retention: excluding inputs and outputs requests deletion of durable payloads when a run ends, which suits data minimisation but must be considered by anything that relies on reading completed run payloads.

## Alternatives considered

Pinning eve below 0.62 to keep ADR 0025's mechanism. Rejected: it leaves the stack more than twenty minor versions behind, against the rule to run current production versions, for no change in behaviour.

Keeping Agent Runs on. Rejected for now: it sends trace data to a destination whose retention (30 days in beta) and access have not been cleared under ADR 0006. It can be enabled with an export policy once cleared.

Registering our own global provider alongside eve's. Rejected: two providers compete for the global tracer and eve's spans and ours would diverge.
