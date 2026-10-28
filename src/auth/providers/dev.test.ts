import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevProvider, devProviderFromEnv } from "./dev.ts";
import { verifySession } from "../session.ts";
import type { DevUser } from "../config.ts";
import {
  AuthConfigError,
  InvalidCredentialsError,
  ProductionRefusalError,
  SessionVerificationError,
} from "../errors.ts";

const secret = "test-signing-secret";

const users: DevUser[] = [
  {
    id: "u-recruiter",
    email: "thandi@example.co.za",
    username: "thandi",
    password: "correct horse battery staple",
    roles: ["recruiter"],
  },
  {
    id: "u-eng",
    email: "eng@example.co.za",
    username: "eng",
    password: "another-strong-password",
    roles: ["internal-engineering", "hiring-manager"],
  },
];

// Successful sign-in issuing a role-bearing session (goal evidence a).
test("signs in a configured user and issues a role-bearing session", async () => {
  const provider = createDevProvider({ users, secret });
  const result = await provider.signIn({
    username: "thandi",
    password: "correct horse battery staple",
  });

  assert.equal(result.user.id, "u-recruiter");
  assert.equal(result.user.email, "thandi@example.co.za");
  assert.deepEqual(result.user.roles, ["recruiter"]);

  // The issued session is a real signed token that verifies back to the user
  // with the roles intact (ADR 0008).
  const verified = verifySession(result.session, { secret });
  assert.deepEqual(verified, result.user);
  assert.ok(verified.roles.includes("recruiter"));
});

test("carries multiple roles through to the session", async () => {
  const provider = createDevProvider({ users, secret });
  const result = await provider.signIn({
    username: "eng",
    password: "another-strong-password",
  });
  const verified = verifySession(result.session, { secret });
  assert.deepEqual(verified.roles, ["internal-engineering", "hiring-manager"]);
});

// Bad-credential refusal (goal evidence a).
test("refuses a wrong password", async () => {
  const provider = createDevProvider({ users, secret });
  await assert.rejects(
    provider.signIn({ username: "thandi", password: "wrong" }),
    InvalidCredentialsError,
  );
});

test("refuses an unknown username", async () => {
  const provider = createDevProvider({ users, secret });
  await assert.rejects(
    provider.signIn({ username: "nobody", password: "whatever" }),
    InvalidCredentialsError,
  );
});

test("refuses to construct without a signing secret", () => {
  assert.throws(
    () => createDevProvider({ users, secret: "" }),
    AuthConfigError,
  );
});

test("refuses to construct with no configured users", () => {
  assert.throws(
    () => createDevProvider({ users: [], secret }),
    AuthConfigError,
  );
});

// Requirement D4 / ADR 0003: the dev provider fails closed in production.
test("refuses to start in a production configuration", () => {
  assert.throws(
    () => createDevProvider({ users, secret, isProduction: true }),
    ProductionRefusalError,
  );
});

// The env boundary rejects a session TTL that is not a positive whole number
// of seconds, the same way it rejects malformed DEV_AUTH_USERS, rather than
// minting sessions that are expired on arrival.
const envUsers = JSON.stringify(users);

test("refuses a SESSION_TTL_SECONDS that is not a positive whole number", () => {
  for (const bad of ["abc", "0", "-5", "1.5"]) {
    assert.throws(
      () =>
        devProviderFromEnv({
          SESSION_SECRET: secret,
          DEV_AUTH_USERS: envUsers,
          SESSION_TTL_SECONDS: bad,
        }),
      AuthConfigError,
      `SESSION_TTL_SECONDS=${bad} must be refused`,
    );
  }
});

test("honours a valid SESSION_TTL_SECONDS when minting a session", async () => {
  const provider = devProviderFromEnv({
    SESSION_SECRET: secret,
    DEV_AUTH_USERS: envUsers,
    SESSION_TTL_SECONDS: "120",
  });
  const before = Date.now();
  const { session } = await provider.signIn({
    username: "thandi",
    password: "correct horse battery staple",
  });
  assert.equal(verifySession(session, { secret, now: before + 60_000 }).id, "u-recruiter");
  assert.throws(
    () => verifySession(session, { secret, now: before + 122_000 }),
    SessionVerificationError,
  );
});
