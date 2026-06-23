// Tests for the Connect scoped-credential broker (Task 1.1).
//
// Deterministic, no live Connect: a fake token provider and a fake env drive
// issuance, refusals, the audit-record shape, and a simulated transient
// failure. Run with `pnpm test src/connect`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectError, type ConnectTokenResponse } from "@vercel/connect";
import {
  createBroker,
  CAPABILITIES,
  BrokerRefusalError,
  BrokerUnavailableError,
  type TokenProvider,
} from "./broker.ts";

const ENV = {
  M365_CONNECT_CONNECTOR: "scl_test_m365",
  ATS_CONNECT_CONNECTOR: "scl_test_ats",
};

const SECRET_TOKEN = "tok_secret_value_must_never_be_audited";

// A fake issuance that records what scopes Connect was asked for.
function fakeProvider(seen: { connector?: string; scopes?: readonly string[] } = {}): TokenProvider {
  return async (connector, scopes) => {
    seen.connector = connector;
    seen.scopes = scopes;
    const res: ConnectTokenResponse = {
      token: SECRET_TOKEN,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes: short-lived
      connector: { id: "id_1", uid: "oauth/microsoft-365", type: "microsoft-365" },
    };
    return res;
  };
}

// --- (1) Capability-to-scope mapping ------------------------------------

test("each named capability maps to its least-privilege scope and mode", () => {
  assert.deepEqual(CAPABILITIES["calendar.freebusy.read"].scopes, ["Calendars.Read"]);
  assert.equal(CAPABILITIES["calendar.freebusy.read"].mode, "read");

  assert.deepEqual(CAPABILITIES["calendar.event.write"].scopes, ["Calendars.ReadWrite"]);
  assert.equal(CAPABILITIES["calendar.event.write"].mode, "write");

  assert.deepEqual(CAPABILITIES["document.attach"].scopes, ["Files.ReadWrite"]);
  assert.equal(CAPABILITIES["document.attach"].mode, "write");

  assert.deepEqual(CAPABILITIES["candidate.logistics.read"].scopes, ["logistics.read"]);
  assert.equal(CAPABILITIES["candidate.logistics.read"].mode, "read");
});

test("issuing a capability requests exactly its scopes from Connect", async () => {
  const seen: { scopes?: readonly string[] } = {};
  const broker = createBroker({ env: ENV, getToken: fakeProvider(seen), onAudit() {} });
  const lease = await broker.issue({
    capability: "calendar.freebusy.read",
    who: "scheduling-job",
    operation: "derive interview slots",
  });
  assert.deepEqual(seen.scopes, ["Calendars.Read"]);
  assert.deepEqual(lease.scopes, ["Calendars.Read"]);
});

// --- (2) Least-privilege: refuse write/over-broad on a read capability ---

test("refuses a write scope requested against a read-only capability", async () => {
  const provider = fakeProvider();
  let called = false;
  const broker = createBroker({
    env: ENV,
    getToken: async (c, s) => ((called = true), provider(c, s)),
    onAudit() {},
  });
  await assert.rejects(
    broker.issue({
      capability: "calendar.freebusy.read",
      who: "test",
      operation: "sneak a write",
      scopes: ["Calendars.ReadWrite"],
    }),
    BrokerRefusalError,
  );
  assert.equal(called, false, "must refuse before ever calling Connect");
});

test("refuses an over-broad scope outside the capability's allowed set", async () => {
  const broker = createBroker({ env: ENV, getToken: fakeProvider(), onAudit() {} });
  await assert.rejects(
    broker.issue({
      capability: "calendar.freebusy.read",
      who: "test",
      operation: "widen",
      scopes: ["Calendars.Read", "Mail.Read"],
    }),
    BrokerRefusalError,
  );
});

// --- (3) Never a decision-or-status scope (ADR 0012, ADR 0004) ----------

test("refuses any decision-or-status scope, even on a write capability", async () => {
  const broker = createBroker({ env: ENV, getToken: fakeProvider(), onAudit() {} });
  for (const decisionScope of ["Candidate.Status.Write", "pipeline.advance", "shortlist", "offer.create"]) {
    await assert.rejects(
      broker.issue({
        capability: "calendar.event.write",
        who: "test",
        operation: "move candidate",
        scopes: [decisionScope],
      }),
      BrokerRefusalError,
      `decision scope "${decisionScope}" must be refused`,
    );
  }
});

test("no registered capability carries a decision-or-status scope", () => {
  const decision = /status|stage|decision|disposition|outcome|advance|reject|shortlist|offer|hire|pipeline/i;
  for (const cap of Object.values(CAPABILITIES)) {
    for (const scope of cap.scopes) {
      assert.ok(!decision.test(scope), `${cap.name} scope "${scope}" looks like a decision scope`);
    }
  }
});

// --- (4) Audit-record shape on issuance and use -------------------------

test("audit records issuance and use with who/what/when/scope/target, token never logged", async () => {
  const records: any[] = [];
  const broker = createBroker({
    env: ENV,
    getToken: fakeProvider(),
    onAudit: (r) => records.push(r),
  });

  const lease = await broker.issue({
    capability: "calendar.freebusy.read",
    who: "scheduling-job",
    operation: "read free/busy to offer slots",
  });

  let tokenSeenInClosure = "";
  const result = await lease.use("getSchedule free/busy read", async (token) => {
    tokenSeenInClosure = token;
    return "availabilityView:0000";
  });

  assert.equal(result, "availabilityView:0000");
  assert.equal(tokenSeenInClosure, SECRET_TOKEN, "the closure receives the real credential");

  assert.equal(records.length, 2);
  const [issued, used] = records;
  assert.equal(issued.event, "connect.credential.issued");
  assert.equal(used.event, "connect.credential.used");

  for (const r of records) {
    assert.equal(typeof r.who, "string");
    assert.equal(typeof r.what, "string");
    assert.ok(!Number.isNaN(Date.parse(r.when)), "when is an ISO timestamp");
    assert.ok(Array.isArray(r.scope));
    assert.equal(typeof r.target, "string");
    assert.equal(r.capability, "calendar.freebusy.read");
    // The token value must never appear anywhere in an audit record.
    assert.ok(!JSON.stringify(r).includes(SECRET_TOKEN), "audit must not contain the token");
  }
  assert.equal(used.detail.ok, true);
  // The lease is shown short-lived, not a static credential.
  assert.equal(issued.detail.shortLived, true);
  // The broker also keeps the records on its own audit log.
  assert.equal(broker.auditLog.length, 2);
});

test("a failed use is still audited (audit completeness)", async () => {
  const records: any[] = [];
  const broker = createBroker({ env: ENV, getToken: fakeProvider(), onAudit: (r) => records.push(r) });
  const lease = await broker.issue({
    capability: "document.attach",
    who: "document-flow",
    operation: "attach CV",
  });
  await assert.rejects(
    lease.use("attach to system of record", async () => {
      throw new Error("upstream attach failed");
    }),
    /upstream attach failed/,
  );
  const used = records.find((r) => r.event === "connect.credential.used");
  assert.ok(used, "the use is audited even though it failed");
  assert.equal(used.detail.ok, false);
});

// --- (5) Graceful degradation on a transient Connect failure (F4) -------

test("a transient Connect failure surfaces as a retriable BrokerUnavailableError, no fake credential", async () => {
  const broker = createBroker({
    env: ENV,
    getToken: async () => {
      throw new ConnectError("upstream 503", { status: 503, code: "bad_gateway" });
    },
    onAudit() {},
  });
  await assert.rejects(
    broker.issue({ capability: "calendar.freebusy.read", who: "test", operation: "read" }),
    (err: unknown) => {
      assert.ok(err instanceof BrokerUnavailableError);
      assert.equal(err.retriable, true);
      return true;
    },
  );
  assert.equal(broker.auditLog.length, 0, "no issuance is audited when nothing was issued");
});

test("a permanent Connect failure is unavailable but not retriable", async () => {
  const broker = createBroker({
    env: ENV,
    getToken: async () => {
      throw new ConnectError("Connector not found", { status: 404, code: "not_found" });
    },
    onAudit() {},
  });
  await assert.rejects(
    broker.issue({ capability: "calendar.freebusy.read", who: "test", operation: "read" }),
    (err: unknown) => err instanceof BrokerUnavailableError && err.retriable === false,
  );
});

test("a missing connector fails closed as unavailable before calling Connect", async () => {
  let called = false;
  const broker = createBroker({
    env: {}, // no connector configured
    getToken: async () => ((called = true), fakeProvider()("x", [])),
    onAudit() {},
  });
  await assert.rejects(
    broker.issue({ capability: "calendar.freebusy.read", who: "test", operation: "read" }),
    BrokerUnavailableError,
  );
  assert.equal(called, false);
});
