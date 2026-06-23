import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWhoami } from "./whoami.ts";
import { mintSession } from "./session.ts";
import type { AuthenticatedUser } from "./types.ts";

const secret = "test-signing-secret-not-a-real-one";

// The whoami surface is gated on the internal-engineering role (requirement
// D5): engineering access to the whoami surface.
const options = { secret, requiredRole: "internal-engineering" as const };

const engineer: AuthenticatedUser = {
  id: "u-eng-1",
  email: "engineer@example.co.za",
  roles: ["internal-engineering", "recruiter"],
};

const recruiter: AuthenticatedUser = {
  id: "u-rec-1",
  email: "recruiter@example.co.za",
  roles: ["recruiter"],
};

function request(token?: string): Request {
  return new Request("https://agent.example/internal/whoami", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

// An authenticated, role-mapped request returns its own id, email, and roles
// (requirement C2).
test("returns the caller's id, email, and roles for an authenticated request", async () => {
  const response = handleWhoami(request(mintSession(engineer, { secret })), options);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    id: engineer.id,
    email: engineer.email,
    roles: engineer.roles,
  });
});

// The surface returns identity and nothing more (requirement C2): the body has
// exactly id, email, and roles, no other keys.
test("returns id, email, and roles and nothing more", async () => {
  const response = handleWhoami(request(mintSession(engineer, { secret })), options);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["email", "id", "roles"]);
});

// A request with no valid session is refused (requirement C2).
test("refuses a request with no session", async () => {
  const response = handleWhoami(request(), options);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { ok: boolean };
  assert.equal(body.ok, false);
});

test("refuses a session signed with the wrong secret", async () => {
  const token = mintSession(engineer, { secret: "wrong-secret" });
  const response = handleWhoami(request(token), options);
  assert.equal(response.status, 401);
});

// The role gate is enforced on the real endpoint (requirement D5): a valid
// session that lacks internal-engineering is refused with 403.
test("refuses a valid session that lacks the required role", async () => {
  const response = handleWhoami(request(mintSession(recruiter, { secret })), options);
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "insufficient_role");
});

// A misconfigured surface (no signing secret) fails as a server error, not as a
// silent auth refusal.
test("returns 500 when the signing secret is not configured", async () => {
  const response = handleWhoami(request(mintSession(engineer, { secret })), {
    secret: "",
    requiredRole: "internal-engineering",
  });
  assert.equal(response.status, 500);
});
