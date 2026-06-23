import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevProvider } from "./dev.ts";
import { verifySession } from "../session.ts";
import type { DevUser } from "../config.ts";
import {
  AuthConfigError,
  InvalidCredentialsError,
  ProductionRefusalError,
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
