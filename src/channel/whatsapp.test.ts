// Tests for the verified WhatsApp ingress and the role-naming acknowledgement
// (Task 1.3). Deterministic, no eve runtime: the pure core carries the security
// boundary and the acknowledgement, so the four required behaviours are proven
// directly (a valid signed event accepted and correlated, an unsigned or forged
// event rejected and never processed, a replayed event deduplicated, and a new
// verified application acknowledged by role name). Run with `pnpm test src/channel`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  acceptInbound,
  acknowledgement,
  applicationEvent,
  parseInboundApplications,
  resolveRole,
  roleCatalogFromEnv,
  sendWhatsAppText,
  verifyMetaSignature,
  verifySubscription,
  whatsAppCredentialsFromEnv,
  type InboundApplication,
  type IngressDecision,
  type RoleCatalog,
} from "./whatsapp.ts";
import { ingest, initialState, type CandidateState, type Effect } from "../workflow/candidate-workflow.ts";
import { candidateKey, messageIdHash } from "../workflow/candidate-key.ts";

const APP_SECRET = "per-environment-app-secret-not-committed";
const KEY_SECRET = "per-environment-candidate-key-secret";
const T0 = 1_700_000_000_000;

// What the run's delivery step does with a verified application: key it, hash
// the message id, and ingest the event with the acknowledgement as the effect.
function correlate(
  state: CandidateState | null,
  app: InboundApplication,
  role: string,
  perform: (effect: Effect) => void | Promise<void>,
): Promise<CandidateState> {
  const before = state ?? initialState(candidateKey(app.number, KEY_SECRET), app.number, T0);
  return ingest(before, applicationEvent(app, role, messageIdHash(app.messageId, KEY_SECRET), T0 + 1), perform);
}

function sign(body: string, secret = APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

// A realistic WhatsApp Cloud API inbound: a click-to-WhatsApp application whose
// referral names the requisition (source_id). No free text is interpreted.
function applicationPayload(messageId = "wamid.HBgABC", number = "27821234567"): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "27115550000", phone_number_id: "PNID" },
              contacts: [{ wa_id: number, profile: { name: "Applicant" } }],
              messages: [
                {
                  from: number,
                  id: messageId,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hi, I saw the advert" },
                  referral: { source_type: "ad", source_id: "REQ-1024", headline: "We are hiring" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

const CATALOG: RoleCatalog = { "REQ-1024": "Warehouse Picker", "REQ-2048": "Delivery Driver" };

function verifiedApplications(body: string): IngressDecision {
  return acceptInbound(body, sign(body), APP_SECRET);
}

// --- (1) A valid signed event is accepted and correlated to a workflow ---

test("a valid signed event is verified, parsed, and correlated to a workflow", async () => {
  const body = applicationPayload();
  assert.equal(verifyMetaSignature(body, sign(body), APP_SECRET), true);

  const decision = verifiedApplications(body);
  assert.equal(decision.ok, true);
  assert.ok(decision.ok); // narrow
  assert.equal(decision.applications.length, 1);
  const app = decision.applications[0];
  assert.equal(app.number, "+27821234567");
  assert.equal(app.messageId, "wamid.HBgABC");
  assert.equal(app.requisitionRef, "REQ-1024");

  const role = resolveRole(app.requisitionRef, CATALOG);
  assert.equal(role, "Warehouse Picker");

  const acks: string[] = [];
  const result = await correlate(null, app, role!, (e) => {
    acks.push(e.role);
  });
  // Correlated: the run is keyed on the opaque key of the verified number
  // (ADR 0029), and the hashed message id is recorded so a redelivery is a no-op.
  assert.equal(result.key, candidateKey("+27821234567", KEY_SECRET));
  assert.match(result.key, /^candidate:[0-9a-f]{64}$/);
  assert.deepEqual(result.processedEvents, [messageIdHash("wamid.HBgABC", KEY_SECRET)]);
  assert.equal(result.processedEvents[0].includes("wamid"), false);
  assert.deepEqual(acks, ["Warehouse Picker"]);
});

// --- (2) An unsigned or forged event is rejected and never processed -----

test("an unsigned event is rejected and never parsed", () => {
  const body = applicationPayload();
  assert.equal(verifyMetaSignature(body, null, APP_SECRET), false);
  const decision = acceptInbound(body, null, APP_SECRET);
  assert.deepEqual(decision, { ok: false }); // no applications computed at all
});

test("a forged signature is rejected and never parsed", () => {
  const body = applicationPayload();
  const forged = sign(body, "attacker-guessed-secret");
  assert.equal(verifyMetaSignature(body, forged, APP_SECRET), false);
  assert.deepEqual(acceptInbound(body, forged, APP_SECRET), { ok: false });
});

test("a tampered body under an otherwise-valid signature is rejected", () => {
  // The attacker captured a valid signature for one body and swaps the payload.
  const original = applicationPayload("wamid.ORIGINAL");
  const tampered = applicationPayload("wamid.SWAPPED");
  assert.equal(verifyMetaSignature(tampered, sign(original), APP_SECRET), false);
  assert.deepEqual(acceptInbound(tampered, sign(original), APP_SECRET), { ok: false });
});

test("a rejected event drives no acknowledgement", async () => {
  const body = applicationPayload();
  const decision = acceptInbound(body, sign(body, "wrong-secret"), APP_SECRET);
  let acked = 0;
  if (decision.ok) {
    // Not reached: the guard returned ok:false, so processing never starts.
    for (const app of decision.applications) {
      await correlate(null, app, "X", () => {
        acked++;
      });
    }
  }
  assert.equal(acked, 0);
});

// --- (3) A replayed valid event causes no duplicate side effect ----------

test("a replayed valid event causes no duplicate acknowledgement", async () => {
  const body = applicationPayload();
  const decision = verifiedApplications(body);
  assert.ok(decision.ok);
  const app = decision.applications[0];
  const role = resolveRole(app.requisitionRef, CATALOG)!;

  let acks = 0;
  const perform = () => {
    acks++;
  };

  const first = await correlate(null, app, role, perform);
  assert.equal(acks, 1);

  // Meta redelivers the same webhook (at-least-once). Same message id, so the
  // run dedups it: no second run, no second acknowledgement.
  const replay = await correlate(first, app, role, perform);
  assert.equal(acks, 1); // still one
  assert.deepEqual(replay, first);
});

// --- (4) A new verified application is acknowledged by role name (A1) ----

test("a new verified application produces an acknowledgement that names the role", async () => {
  const body = applicationPayload();
  const decision = verifiedApplications(body);
  assert.ok(decision.ok);
  const app = decision.applications[0];
  const role = resolveRole(app.requisitionRef, CATALOG)!;

  let message = "";
  await correlate(null, app, role, (e) => {
    message = acknowledgement(e.role);
  });
  assert.match(message, /Warehouse Picker/);
  assert.match(message, /received your application/);
  console.log("Role-naming acknowledgement:", message);
});

// --- Subscription handshake ---------------------------------------------

test("the verify-token handshake echoes the challenge only for the right token", () => {
  const q = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "the-configured-token",
    "hub.challenge": "1158201444",
  });
  assert.equal(verifySubscription(q, "the-configured-token"), "1158201444");
  assert.equal(verifySubscription(q, "a-different-token"), null);

  const missingMode = new URLSearchParams({ "hub.verify_token": "the-configured-token", "hub.challenge": "x" });
  assert.equal(verifySubscription(missingMode, "the-configured-token"), null);

  // No configured token: refuse rather than echo anything.
  assert.equal(verifySubscription(q, ""), null);
});

// --- Only real inbound messages become applications ----------------------

test("delivery status callbacks are not treated as applications", () => {
  const statusPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [{ id: "wamid.X", status: "delivered", recipient_id: "27821234567" }],
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(parseInboundApplications(statusPayload), []);
});

test("an application with no structured requisition reference resolves no role", () => {
  const noRef = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [{ from: "27821234567", id: "wamid.Y", type: "text", text: { body: "hello" } }],
            },
          },
        ],
      },
    ],
  };
  const apps = parseInboundApplications(noRef);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].requisitionRef, null);
  // No role: not a Task 1.3 application (unrecognised input is Task 1.4).
  assert.equal(resolveRole(apps[0].requisitionRef, CATALOG), null);
});

test("an interactive reply id is read as the requisition reference", () => {
  const interactive = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "27821234567",
                  id: "wamid.Z",
                  type: "interactive",
                  interactive: { type: "list_reply", list_reply: { id: "REQ-2048", title: "Driver" } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const apps = parseInboundApplications(interactive);
  assert.equal(apps[0].requisitionRef, "REQ-2048");
  assert.equal(resolveRole(apps[0].requisitionRef, CATALOG), "Delivery Driver");
});

// --- The live Meta leg shape (exercised without a network call) ----------

test("sendWhatsAppText posts to the Cloud API endpoint for the phone number id", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await sendWhatsAppText(
    { phoneNumberId: "PNID", accessToken: "SECRET-TOKEN" },
    "+27821234567",
    "hello there",
    fakeFetch,
  );
  assert.equal(calls.length, 1);
  const captured = calls[0];
  assert.match(captured.url, /graph\.facebook\.com\/v\d+\.\d+\/PNID\/messages/);
  const headers = captured.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer SECRET-TOKEN");
  const sent = JSON.parse(String(captured.init.body));
  assert.equal(sent.to, "27821234567"); // E.164 without the +
  assert.equal(sent.text.body, "hello there");
});

test("the live leg is blocked until per-environment credentials are provisioned", () => {
  assert.equal(whatsAppCredentialsFromEnv({}), null);
  assert.equal(whatsAppCredentialsFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "p" }), null);
  assert.deepEqual(
    whatsAppCredentialsFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "p", WHATSAPP_ACCESS_TOKEN: "t" }),
    { phoneNumberId: "p", accessToken: "t" },
  );
});

// --- Review fixes (chore/stack-update) -----------------------------------

function payloadWithMessages(messages: unknown[]): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA_ID", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages } }] }],
  };
}

const validMessage = {
  from: "27821234567",
  id: "wamid.OK",
  type: "text",
  text: { body: "hi" },
  referral: { source_type: "ad", source_id: "REQ-1024" },
};

test("a null or non-object entry in messages is skipped, not a 500", () => {
  const apps = parseInboundApplications(payloadWithMessages([null, 42, "x", validMessage]));
  assert.deepEqual(apps, [{ number: "+27821234567", messageId: "wamid.OK", requisitionRef: "REQ-1024" }]);
});

test("a message whose sender is not an E.164 number is dropped at parse time", () => {
  const bad = ["12", "0821234567", "abc", ""].map((from, i) => ({ ...validMessage, from, id: `wamid.bad${i}` }));
  const apps = parseInboundApplications(payloadWithMessages([...bad, validMessage]));
  assert.deepEqual(apps.map((a) => a.messageId), ["wamid.OK"]);
});

test("role resolution reads only the catalogue's own string entries", () => {
  assert.equal(resolveRole("constructor", {}), null);
  assert.equal(resolveRole("__proto__", { "REQ-1": "Picker" }), null);
  assert.equal(resolveRole("toString", { "REQ-1": "Picker" }), null);
  assert.equal(resolveRole("REQ-1", { "REQ-1": "Picker" }), "Picker");
});

test("the role catalogue keeps only non-empty string values", () => {
  const catalog = roleCatalogFromEnv({
    WHATSAPP_ROLE_CATALOG: JSON.stringify({ "REQ-1": 42, "REQ-2": "Picker", "REQ-3": "", "REQ-4": null }),
  });
  assert.deepEqual(catalog, { "REQ-2": "Picker" });
  assert.deepEqual(roleCatalogFromEnv({ WHATSAPP_ROLE_CATALOG: "[1,2]" }), {});
  assert.deepEqual(roleCatalogFromEnv({ WHATSAPP_ROLE_CATALOG: "{not json" }), {});
});

test("the signature is verified over the exact bytes received", () => {
  const body = new TextEncoder().encode(applicationPayload("wamid.BYTES").replace("advert", "advert for the caf\u00e9"));
  const signature = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
  const decision = acceptInbound(body, signature, APP_SECRET);
  assert.equal(decision.ok, true);
  assert.ok(decision.ok);
  assert.equal(decision.applications[0].messageId, "wamid.BYTES");
  // One flipped byte fails verification before anything is parsed.
  const tampered = Uint8Array.from(body);
  tampered[tampered.length - 2] ^= 0x01;
  assert.deepEqual(acceptInbound(tampered, signature, APP_SECRET), { ok: false });
});
