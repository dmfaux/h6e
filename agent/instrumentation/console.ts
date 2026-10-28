import { otelIntegration } from "eve/instrumentation/otel";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { candidateSafeExportPolicy } from "../../src/observability/span-attributes.ts";

// The deployed trace destination (ADR 0027): spans are written to the console,
// the platform log, so a real trace is surfaced in deploy logs with no trace
// data leaving the tenant (ADR 0006). The export policy strips any candidate
// number from span attributes before this destination sees them. Phase 2 swaps
// this for an approved OTel backend once the data path is cleared.

export default otelIntegration({
  exportPolicy: candidateSafeExportPolicy,
  spanProcessors: [new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() })],
});
