import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { tracedWhoami, WHOAMI_SPAN_NAME } from "./whoami-trace.ts";
import { mintSession } from "../auth/session.ts";

// Regression guard for the OpenTelemetry API version split (ADR 0027). eve
// bundles its own copy of @opentelemetry/api and registers the global tracer
// provider through it. Our manual spans call `trace.getTracer` through the copy
// in our own node_modules. The OpenTelemetry API only hands a caller the global
// provider when the registered copy's version is at least the caller's (same
// major), so a newer copy on our side silently gets a no-op tracer and the
// whoami span is never exported. The stack upgrade did exactly that (api 1.10
// against eve's 1.9.1) and the unit test above it passed anyway, because it
// registered its own provider on the same copy.
//
// This test registers the provider the way eve's copy does, stamped with the
// version eve actually bundles, and then drives the whoami path through our
// copy. It fails the moment our @opentelemetry/api gets ahead of eve's.

const GLOBAL_KEY = Symbol.for("opentelemetry.js.api.1");

// The version literal sits in the bundled api's registration guard:
// `if (api.version !== "1.9.1") throw ... Registration of version ...`.
function eveBundledOtelApiVersion(): string {
  const require = createRequire(import.meta.url);
  const eveRoot = dirname(require.resolve("eve/package.json"));
  const chunks = join(eveRoot, "dist", "src", "compiled", "_chunks", "workflow");
  const found = new Set<string>();
  for (const file of readdirSync(chunks)) {
    if (!file.endsWith(".js")) continue;
    const source = readFileSync(join(chunks, file), "utf8");
    for (const m of source.matchAll(/version!==[`'"](\d+\.\d+\.\d+)[`'"]/g)) found.add(m[1]);
  }
  assert.equal(found.size, 1, `expected one bundled @opentelemetry/api version in eve, found: ${[...found].join(", ") || "none"}`);
  return [...found][0];
}

test("a manual span reaches the provider registered through eve's bundled OpenTelemetry api", async () => {
  const eveVersion = eveBundledOtelApiVersion();
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });

  const globals = globalThis as unknown as Record<symbol, unknown>;
  const before = globals[GLOBAL_KEY];
  globals[GLOBAL_KEY] = { version: eveVersion, trace: provider };
  try {
    const secret = "test-signing-secret-not-a-real-one";
    const response = tracedWhoami(
      new Request("https://agent.example/internal/whoami", {
        headers: {
          authorization: `Bearer ${mintSession({ id: "u-1", email: "e@example.co.za", roles: ["internal-engineering"] }, { secret })}`,
        },
      }),
      { secret, requiredRole: "internal-engineering" },
    );
    assert.equal(response.status, 200);
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    assert.equal(
      spans.length,
      1,
      `our @opentelemetry/api is not served by a provider registered as v${eveVersion}; pin it to eve's bundled version (ADR 0027)`,
    );
    assert.equal(spans[0].name, WHOAMI_SPAN_NAME);
  } finally {
    globals[GLOBAL_KEY] = before;
  }
});
