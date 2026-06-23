import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAuthProvider } from "./select.ts";
import type { Env } from "./config.ts";
import {
  AuthConfigError,
  NotImplementedError,
  ProductionRefusalError,
} from "./errors.ts";

const devUsers = JSON.stringify([
  {
    id: "u-1",
    email: "dev@example.co.za",
    username: "dev",
    password: "dev-password",
    roles: ["internal-engineering"],
  },
]);

function baseEnv(overrides: Env): Env {
  return {
    SESSION_SECRET: "test-secret",
    DEV_AUTH_USERS: devUsers,
    ...overrides,
  };
}

// Provider selection by env var, picking the inert stub (goal evidence a).
test("AUTH_PROVIDER=entra selects the inert Entra stub", async () => {
  const provider = selectAuthProvider(baseEnv({ AUTH_PROVIDER: "entra" }));
  assert.equal(provider.name, "entra");
  // The stub is selectable but inert: it authenticates nothing.
  await assert.rejects(
    provider.signIn({ username: "x", password: "y" }),
    NotImplementedError,
  );
});

test("AUTH_PROVIDER=dev selects the dev credential provider", () => {
  const provider = selectAuthProvider(
    baseEnv({ AUTH_PROVIDER: "dev", APP_ENV: "development" }),
  );
  assert.equal(provider.name, "dev");
});

test("defaults to the dev provider when AUTH_PROVIDER is unset", () => {
  const provider = selectAuthProvider(baseEnv({ APP_ENV: "development" }));
  assert.equal(provider.name, "dev");
});

// Requirement D4: selecting the dev provider under a production configuration
// refuses to start (this is the boot path that select.ts drives).
test("selecting dev under a production configuration refuses to start", () => {
  assert.throws(
    () =>
      selectAuthProvider(baseEnv({ AUTH_PROVIDER: "dev", APP_ENV: "production" })),
    ProductionRefusalError,
  );
});

test("rejects an unknown AUTH_PROVIDER value", () => {
  assert.throws(
    () => selectAuthProvider(baseEnv({ AUTH_PROVIDER: "ldap" })),
    AuthConfigError,
  );
});
