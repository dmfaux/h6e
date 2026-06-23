# 0025. Tracing via OpenTelemetry through eve's instrumentation seam

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Engineering

## Context

ADR 0004 requires tracing and evals to exist before any screening ships, so Phase 0 stands up the empty observability frame now (Task 0.9). ADR 0002 commits us to the Vercel Agent Stack and prefers eve-native observability.

eve gives us two observability surfaces for free: framework-owned Workflow run tags (`$eve.*`) on Vercel Workflow runs, and automatic AI-SDK spans on model turns, both configured through `agent/instrumentation.ts`. Neither covers the path Task 0.9 must trace. The authenticated whoami path (Task 0.5) is a plain HTTP route on an eve channel, not a model turn, so it produces no AI-SDK turn span, and Workflow run tags describe agent runs rather than guarded internal routes. To emit a real trace from that path we have to open a span ourselves, which means choosing a tracing API and an exporter. ADR 0002 covers the eve framework but does not name a tracing library, so this concrete choice needs recording.

A compliance constraint applies. ADR 0006 (data minimisation) keeps the system of record in the corporate tenant and limits what may flow out. A trace can carry identifiers and, in later phases, model inputs and outputs, so the exporter destination is a data-protection decision, not just an operational one.

## Decision

We trace through eve's instrumentation seam using OpenTelemetry, the standard eve's own observability is built on.

- `agent/instrumentation.ts` exports `defineInstrumentation` and, in its `setup`, registers a vendor-neutral OpenTelemetry `NodeTracerProvider` (`@opentelemetry/sdk-trace-node`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/api`, `@opentelemetry/resources`) with the service name resolved from the agent name.
- Spans on non-model paths are opened manually with the OpenTelemetry API. The authenticated whoami path is wrapped in one span in `src/observability/whoami-trace.ts`, carrying only non-identifying attributes (route, method, status, outcome).
- In Phase 0 the exporter is local only: a console span processor writes spans to the platform log. No trace data leaves the tenant. `recordInputs` and `recordOutputs` are off, so when model turns arrive later, message history and outputs are not recorded onto spans until an exporter and its data-retention path are approved.

The eval harness is the separate half of Task 0.9 and introduces no new tool: it is eve-native `eve eval` (ADR 0002), so this ADR is about tracing only.

## Consequences

We get real OpenTelemetry traces (real W3C trace ids, real spans) from any path we choose to instrument, on the eve-blessed standard, with no third-party backend and no data egress in Phase 0. Because we use the vendor-neutral OTel SDK rather than a backend-specific exporter, swapping in an approved backend later (Braintrust, Honeycomb, Datadog, or `@vercel/otel`) is a change confined to `agent/instrumentation.ts`.

The costs: a small, vendor-neutral dependency set (four `@opentelemetry/*` packages) that we now own and keep current; manual spans on non-model paths, since eve only auto-traces model turns, so each internal route we want traced needs an explicit wrapper like the whoami one; and a console exporter that is fine for a low-volume internal frame but is not a destination for production-scale or sensitive telemetry. A future change that turns on a real exporter must first clear the data path under ADR 0006 and, once model inputs and outputs ride on spans, ADR 0014.

## Alternatives considered

`@vercel/otel` with `registerOTel`, as the eve instrumentation guide shows. It is the most eve-idiomatic setup, but it is oriented to a third-party backend exporter and to the Vercel and Next runtime, and it is heavier than we need for a local, non-exporting Phase 0 frame. We can adopt it later behind the same `instrumentation.ts` seam without disturbing the manual spans, so deferring it costs nothing.

Relying only on eve's automatic tracing (AI-SDK turn spans and `$eve.*` Workflow run tags) and not instrumenting the whoami path. Rejected because neither surface covers a non-model HTTP route, so Task 0.9 would have no real trace to show and the frame could not prove tracing is wired rather than absent.

A hand-rolled trace id printed to a log, with no OpenTelemetry. Rejected: it would satisfy the letter of "a trace id" while being observability cosplay, not a real trace, and it would not extend to the AI-SDK spans that later phases depend on.
