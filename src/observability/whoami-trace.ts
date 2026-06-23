import { SpanStatusCode, trace } from "@opentelemetry/api";
import { handleWhoami, type WhoamiOptions } from "../auth/whoami.ts";

// Tracing for the authenticated whoami path (requirement G2, ADR 0025). The
// whoami route is a plain HTTP route on an eve channel, not a model turn, so
// eve's automatic AI-SDK turn tracing does not cover it. This thin wrapper
// opens one OpenTelemetry span around the guarded handler so the path emits a
// real trace (a real W3C trace id, a real span), proving tracing is wired
// rather than absent. The span is exported wherever agent/instrumentation.ts
// registers a provider; in Phase 0 that is a local, non-exporting console
// processor, so no trace data leaves the tenant (ADR 0006).
//
// The span carries only non-identifying attributes (route, method, status,
// outcome). It deliberately does not record the caller's id or email, so the
// trace is safe for any exporter and honours data minimisation (ADR 0006).

const TRACER_NAME = "h6e.internal.whoami";
export const WHOAMI_SPAN_NAME = "internal.whoami";

export function tracedWhoami(
  request: Request,
  options: WhoamiOptions,
): Response {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(WHOAMI_SPAN_NAME, (span) => {
    try {
      const response = handleWhoami(request, options);
      span.setAttribute("http.request.method", request.method);
      span.setAttribute("url.path", safePath(request.url));
      span.setAttribute("http.response.status_code", response.status);
      span.setAttribute(
        "auth.outcome",
        response.status === 200 ? "authorized" : "refused",
      );
      // A 5xx is a server fault (a misconfiguration), not an auth decision;
      // mark only that as a span error so refusals (401/403) stay OK.
      span.setStatus({
        code: response.status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      return response;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// The path is the only part of the URL worth recording, and even that is kept
// defensive: a malformed URL must never break the traced request.
function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "unknown";
  }
}
