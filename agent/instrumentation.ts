import { defineInstrumentation } from "eve/instrumentation";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";

// eve auto-discovers agent/instrumentation.ts and runs setup() at server
// startup, before any agent code. Its presence enables telemetry (ADR 0025,
// ADR 0002: tracing must exist before any screening ships, ADR 0004). This is
// the empty observability frame: it registers a real OpenTelemetry provider so
// spans are produced and surfaced, including the manual span on the
// authenticated whoami path (src/observability/whoami-trace.ts, requirement G2).
//
// Phase 0 exporter choice is deliberately local. Spans are written to the
// console (the platform log), so a real trace is surfaced in deploy logs with
// no trace data leaving the corporate tenant (ADR 0006). Phase 2 swaps the
// console processor for an approved OTel backend once the data path is cleared
// (see docs/phase-0/eval-and-tracing-notes.md and ADR 0025).
//
// recordInputs/recordOutputs are off: when model turns arrive in later phases,
// full message history and model outputs must not be recorded onto spans until
// the exporter and its data-retention path are approved (ADR 0006, ADR 0014).

export default defineInstrumentation({
  recordInputs: false,
  recordOutputs: false,
  setup: ({ agentName }) => {
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ "service.name": agentName }),
      spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    });
    provider.register();
  },
});
