import { test } from "node:test";
import assert from "node:assert/strict";
import { mintSession, verifySession } from "./session.ts";
import { SessionVerificationError } from "./errors.ts";
import type { AuthenticatedUser } from "./types.ts";

const secret = "test-signing-secret-not-a-real-one";
const user: AuthenticatedUser = {
  id: "u-1",
  email: "recruiter@example.com",
  roles: ["recruiter", "internal-engineering"],
};

// Session mint-and-verify round trip (goal evidence a).
test("mints a session that verifies back to the same id, email, and roles", () => {
  const token = mintSession(user, { secret });
  const verified = verifySession(token, { secret });
  assert.deepEqual(verified, user);
});

test("a session is a three-part signed token, not a server-side id", () => {
  const token = mintSession(user, { secret });
  assert.equal(token.split(".").length, 3);
});

test("rejects a token signed with a different secret", () => {
  const token = mintSession(user, { secret });
  assert.throws(
    () => verifySession(token, { secret: "a-different-secret" }),
    SessionVerificationError,
  );
});

test("rejects a tampered payload", () => {
  const token = mintSession(user, { secret });
  const [header, , signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({
      sub: "u-1",
      email: "attacker@example.com",
      roles: ["internal-engineering"],
      iat: 0,
      exp: 9999999999,
    }),
  ).toString("base64url");
  assert.throws(
    () => verifySession(`${header}.${forged}.${signature}`, { secret }),
    SessionVerificationError,
  );
});

test("rejects an expired session", () => {
  const issuedAt = 1_000_000_000_000; // fixed epoch ms
  const token = mintSession(user, {
    secret,
    ttlSeconds: 60,
    now: issuedAt,
  });
  // Verify one hour later: well past the 60s lifetime.
  assert.throws(
    () => verifySession(token, { secret, now: issuedAt + 60 * 60 * 1000 }),
    SessionVerificationError,
  );
  // Still valid within the lifetime.
  const stillValid = verifySession(token, {
    secret,
    now: issuedAt + 30 * 1000,
  });
  assert.deepEqual(stillValid, user);
});

test("rejects a malformed token", () => {
  assert.throws(
    () => verifySession("not-a-token", { secret }),
    SessionVerificationError,
  );
});
