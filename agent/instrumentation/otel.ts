import { otel } from "eve/instrumentation/otel";

// Process-wide OpenTelemetry settings (ADR 0027, superseding ADR 0025). eve owns
// the tracer provider; this file only sets the capture ceiling every destination
// shares. Inputs and outputs stay off: when model turns arrive in later phases,
// message history and model outputs must not be recorded onto spans until an
// exporter and its data-retention path are approved (ADR 0006, ADR 0014).

export default otel({
  tracePolicy: () => ({ emit: true, recordInputs: false, recordOutputs: false }),
});
