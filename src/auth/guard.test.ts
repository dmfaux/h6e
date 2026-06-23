import { test } from "node:test";
import assert from "node:assert/strict";
import { guard } from "./guard.ts";
import { mintSession } from "./session.ts";
import { AuthConfigError } from "./errors.ts";
import type { AuthenticatedUser } from "./types.ts";

const secret = "test-signing-secret-not-a-real-one";

const engineer: AuthenticatedUser = {
  id: "u-eng-1",
  email: "engineer@example.co.za",
  roles: ["internal-engineering"],
};

const recruiter: AuthenticatedUser = {
  id: "u-rec-1",
  email: "recruiter@example.co.za",
  roles: ["recruiter"],
};

function bearer(token: string): Request {
  return new Request("https://agent.example/internal/whoami", {
    headers: { authorization: `Bearer ${token}` },
  });
}

// An authenticated request reaches the guard and resolves to the same id,
// email, and roles carried by the verified session (requirement C2).
test("admits an authenticated request and resolves id, email, and roles", () => {
  const decision = guard(bearer(mintSession(engineer, { secret })), { secret });
  assert.equal(decision.ok, true);
  assert.ok(decision.ok);
  assert.deepEqual(decision.user, engineer);
});

// A request with no session is refused (requirement C2).
test("refuses a request that presents no session", () => {
  const request = new Request("https://agent.example/internal/whoami");
  const decision = guard(request, { secret });
  assert.equal(decision.ok, false);
  assert.ok(!decision.ok);
  assert.equal(decision.status, 401);
  assert.equal(decision.code, "authentication_required");
});

test("refuses a session signed with a different secret", () => {
  const token = mintSession(engineer, { secret: "some-other-secret" });
  const decision = guard(bearer(token), { secret });
  assert.ok(!decision.ok);
  assert.equal(decision.status, 401);
  assert.equal(decision.code, "invalid_session");
});

test("refuses an expired session", () => {
  const issuedAt = 1_000_000_000_000;
  const token = mintSession(engineer, { secret, ttlSeconds: 60, now: issuedAt });
  const decision = guard(bearer(token), {
    secret,
    now: issuedAt + 60 * 60 * 1000,
  });
  assert.ok(!decision.ok);
  assert.equal(decision.status, 401);
  assert.equal(decision.code, "invalid_session");
});

// Requirement D5: a guard can require a specific role. A session that carries
// the required role passes; one that does not is refused with 403.
test("a role-gated guard admits a session carrying the required role", () => {
  const decision = guard(bearer(mintSession(engineer, { secret })), {
    secret,
    requiredRole: "internal-engineering",
  });
  assert.ok(decision.ok);
  assert.deepEqual(decision.user, engineer);
});

test("a role-gated guard refuses a session lacking the required role", () => {
  const decision = guard(bearer(mintSession(recruiter, { secret })), {
    secret,
    requiredRole: "internal-engineering",
  });
  assert.ok(!decision.ok);
  assert.equal(decision.status, 403);
  assert.equal(decision.code, "insufficient_role");
});

// Without a role requirement the guard admits any valid session: role
// enforcement is opt-in per route.
test("with no role requirement, any valid session is admitted", () => {
  const decision = guard(bearer(mintSession(recruiter, { secret })), { secret });
  assert.ok(decision.ok);
  assert.deepEqual(decision.user, recruiter);
});

// The session can also arrive in a cookie (browser callers), not only a header.
test("reads the session from a cookie as well as the Authorization header", () => {
  const token = mintSession(engineer, { secret });
  const request = new Request("https://agent.example/internal/whoami", {
    headers: { cookie: `theme=dark; session=${token}` },
  });
  const decision = guard(request, { secret });
  assert.ok(decision.ok);
  assert.deepEqual(decision.user, engineer);
});

// A missing signing secret is a deployment fault, surfaced loudly rather than
// silently refusing every caller.
test("throws when no signing secret is configured", () => {
  assert.throws(
    () => guard(bearer(mintSession(engineer, { secret })), { secret: "" }),
    AuthConfigError,
  );
});

// The guard depends only on the auth interface, never on a provider
// (requirement D1, ADR 0003). Proven structurally: the guard's own source
// imports nothing from a provider and references no provider sign-in.
test("the guard's source does not import or call any provider", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./guard.ts", import.meta.url), "utf8");
  const imports = source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");
  assert.ok(!/providers\//.test(imports), "the guard imports a provider module");
  assert.ok(!/\.signIn\s*\(/.test(source), "the guard calls a provider sign-in");
});
