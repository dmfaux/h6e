import { localTraces } from "eve/instrumentation/otel";
import { candidateSafeExportPolicy } from "../../src/observability/span-attributes.ts";

// The local trace spool that `eve dev` reads on a developer machine (ADR 0027).
// Declared here only so the same attribute policy applies to it as to the
// console destination: a developer's local trace is still a trace (ADR 0006).

export default localTraces({ exportPolicy: candidateSafeExportPolicy });
