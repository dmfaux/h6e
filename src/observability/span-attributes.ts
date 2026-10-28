import type { SpanAttributeDecision, SpanExportPolicy } from "eve/instrumentation/otel";

// Span attributes must never carry a candidate's number (ADR 0006). The trace
// policy keeps model inputs and outputs off spans, but eve stamps its own
// attributes too: a workflow hook span records the session's inbox token, which
// contains the continuation address, which for a candidate session is the
// workflow key `candidate:+27...`. This policy sits in front of every trace
// destination and rewrites any E.164-looking run of digits in a string
// attribute, wherever it appears, so the number never reaches an exporter.

const E164 = /\+[1-9]\d{7,14}/;
const PLACEHOLDER = "[number]";

const hasNumber = (v: unknown): v is string => typeof v === "string" && E164.test(v);
const scrub = (v: string): string => v.replace(new RegExp(E164, "g"), PLACEHOLDER);

export function redactNumbers(value: unknown): SpanAttributeDecision {
  if (hasNumber(value)) return { replace: true, value: scrub(value) };
  if (Array.isArray(value) && value.some(hasNumber)) {
    return { replace: true, value: value.map((v) => (typeof v === "string" ? scrub(v) : String(v))) };
  }
  return { emit: true };
}

/** The export policy every trace destination applies (agent/instrumentation/*.ts). */
export const candidateSafeExportPolicy: SpanExportPolicy = {
  attribute: ({ value }) => redactNumbers(value),
};
