// The /intake route's outcomes against fake run deliveries. Run with
// `pnpm test src/channel`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleIntakePost, type IntakeDeps } from "./intake-route.ts";
import { candidateKey, messageIdHash } from "../workflow/candidate-key.ts";
import type { Delivery } from "../workflow/candidate-run-machine.ts";

const APP_SECRET = "per-environment-app-secret";
const KEY_SECRET = "per-environment-candidate-key-secret";

function payload(messages: { number: string; id: string; ref?: string }[]): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: messages.map((m) => ({
                  from: m.number,
                  id: m.id,
                  type: "text",
                  text: { body: "hi" },
                  ...(m.ref ? { referral: { source_type: "ad", source_id: m.ref } } : {}),
                })),
              },
            },
          ],
        },
      ],
    }),
  );
}

function sign(body: Uint8Array, secret = APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function deps(overrides: Partial<IntakeDeps> = {}) {
  const delivered: { key: string; delivery: Delivery }[] = [];
  const logs: string[] = [];
  const d: IntakeDeps = {
    appSecret: APP_SECRET,
    keySecret: KEY_SECRET,
    catalog: { "REQ-1": "Warehouse Picker" },
    currentDeploymentId: async () => "dpl_here",
    deliver: async (key, delivery) => {
      delivered.push({ key, delivery });
      return { action: delivered.length === 1 ? "started" : "resumed", runId: "wrun_1" };
    },
    log: (line) => logs.push(line),
    ...overrides,
  };
  return { d, delivered, logs };
}

test("a forged signature is refused before anything is parsed or delivered", async () => {
  const { d, delivered } = deps();
  const body = payload([{ number: "27820000001", id: "wamid.A", ref: "REQ-1" }]);
  const res = await handleIntakePost(body, sign(body, "wrong"), d);
  assert.equal(res.status, 403);
  assert.deepEqual(delivered, []);
});

test("a verified application with a role is keyed opaquely and delivered, and the log names no number", async () => {
  const { d, delivered, logs } = deps();
  const body = payload([{ number: "27820000001", id: "wamid.A", ref: "REQ-1" }]);
  const res = await handleIntakePost(body, sign(body), d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, processed: 1 });
  assert.deepEqual(delivered, [
    {
      key: candidateKey("+27820000001", KEY_SECRET),
      delivery: {
        kind: "delivery",
        number: "+27820000001",
        messageIdHash: messageIdHash("wamid.A", KEY_SECRET),
        role: "Warehouse Picker",
        acceptedBy: "dpl_here",
      },
    },
  ]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /started wrun_1 key=candidate:[0-9a-f]{64}/);
  assert.equal(logs[0].includes("27820000001"), false);
  assert.equal(logs[0].includes("wamid"), false);
});

test("a message without a role is verified but not delivered", async () => {
  const { d, delivered } = deps();
  const body = payload([{ number: "27820000001", id: "wamid.A" }]);
  const res = await handleIntakePost(body, sign(body), d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, processed: 0 });
  assert.deepEqual(delivered, []);
});

test("a missing candidate key secret refuses with 500 rather than keying weakly", async () => {
  const { d, delivered } = deps({ keySecret: null });
  const body = payload([{ number: "27820000001", id: "wamid.A", ref: "REQ-1" }]);
  const res = await handleIntakePost(body, sign(body), d);
  assert.equal(res.status, 500);
  assert.deepEqual(delivered, []);
});

test("a batch answers 200 only when every application was accepted, else 503 so Meta redelivers", async () => {
  let calls = 0;
  const { d, logs } = deps({
    deliver: async () => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error("world down"), { name: "WorkflowWorldError" });
      return { action: "resumed", runId: "wrun_ok" };
    },
  });
  const body = payload([
    { number: "27820000001", id: "wamid.A", ref: "REQ-1" },
    { number: "27820000002", id: "wamid.B", ref: "REQ-1" },
  ]);
  const res = await handleIntakePost(body, sign(body), d);
  assert.equal(res.status, 503);
  assert.match(logs[0], /1\/2 accepted/);
  assert.match(logs[0], /failed: WorkflowWorldError \(world down\)/);
});

test("a deployment id that cannot be resolved answers 503 and delivers nothing", async () => {
  const { d, delivered } = deps({
    currentDeploymentId: async () => {
      throw new Error("no world");
    },
  });
  const body = payload([{ number: "27820000001", id: "wamid.A", ref: "REQ-1" }]);
  const res = await handleIntakePost(body, sign(body), d);
  assert.equal(res.status, 503);
  assert.deepEqual(delivered, []);
});
