import { test } from "node:test";
import assert from "node:assert/strict";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { tracedWhoami, WHOAMI_SPAN_NAME } from "./whoami-trace.ts";
import { mintSession } from "../auth/session.ts";
import type { AuthenticatedUser } from "../auth/types.ts";

// Proves the authenticated whoami path emits a real OpenTelemetry trace
// (requirement G2). A real (non-exporting) tracer provider is registered with
// an in-memory exporter, the path is driven with a valid role-mapped session,
// and the exported span is read back: a real 32-hex W3C trace id, the span
// name, and non-identifying attributes. This is the empty frame's "one real
// trace": green means tracing is wired, not absent.

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
provider.register();

const secret = "test-signing-secret-not-a-real-one";
const options = { secret, requiredRole: "internal-engineering" as const };

const engineer: AuthenticatedUser = {
  id: "u-eng-1",
  email: "engineer@example.co.za",
  roles: ["internal-engineering", "recruiter"],
};

function request(token?: string): Request {
  return new Request("https://agent.example/internal/whoami", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test("the authenticated whoami path emits a real trace", async () => {
  exporter.reset();

  const response = tracedWhoami(
    request(mintSession(engineer, { secret })),
    options,
  );
  assert.equal(response.status, 200);

  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1, "exactly one span for the whoami request");

  const span = spans[0];
  const { traceId, spanId } = span.spanContext();

  // A real trace: a 32-hex W3C trace id (and a 16-hex span id), not the
  // all-zero invalid id a no-op tracer would produce.
  assert.match(traceId, /^[0-9a-f]{32}$/);
  assert.notEqual(traceId, "0".repeat(32));
  assert.match(spanId, /^[0-9a-f]{16}$/);

  assert.equal(span.name, WHOAMI_SPAN_NAME);
  assert.equal(span.attributes["http.response.status_code"], 200);
  assert.equal(span.attributes["auth.outcome"], "authorized");
  assert.equal(span.attributes["url.path"], "/internal/whoami");

  // Data minimisation (ADR 0006): the span carries no direct identifiers.
  const serialised = JSON.stringify(span.attributes);
  assert.ok(!serialised.includes(engineer.email), "no email on the span");
  assert.ok(!serialised.includes(engineer.id), "no caller id on the span");

  // Surface the trace in the transcript as the "one real trace" evidence.
  console.log(
    "WHOAMI TRACE " +
      JSON.stringify(
        {
          traceId,
          spanId,
          name: span.name,
          attributes: span.attributes,
          statusCode: span.status.code,
        },
        null,
        2,
      ),
  );
});

// A refused request still emits a trace, marked as a refusal rather than an
// error: tracing covers the unhappy path too, without leaking why.
test("a refused whoami request still emits a trace", async () => {
  exporter.reset();

  const response = tracedWhoami(request(), options);
  assert.equal(response.status, 401);

  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0].attributes["auth.outcome"], "refused");
  assert.equal(spans[0].attributes["http.response.status_code"], 401);
});
