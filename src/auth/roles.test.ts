import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, ALL_ROLES, isRole } from "./roles.ts";

// Requirement D5: at least recruiter, hiring-manager, and an internal
// engineering role are defined as part of the interface.
test("defines the recruiter, hiring-manager, and internal-engineering roles", () => {
  assert.equal(ROLES.recruiter, "recruiter");
  assert.equal(ROLES.hiringManager, "hiring-manager");
  assert.equal(ROLES.internalEngineering, "internal-engineering");
  assert.ok(ALL_ROLES.includes("recruiter"));
  assert.ok(ALL_ROLES.includes("hiring-manager"));
  assert.ok(ALL_ROLES.includes("internal-engineering"));
});

test("isRole accepts known roles and rejects everything else", () => {
  assert.ok(isRole("recruiter"));
  assert.ok(isRole("hiring-manager"));
  assert.ok(isRole("internal-engineering"));
  assert.equal(isRole("admin"), false);
  assert.equal(isRole(""), false);
  assert.equal(isRole(42), false);
  assert.equal(isRole(undefined), false);
});
