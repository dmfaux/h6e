// Task 1.3: verified WhatsApp ingress and the role-naming acknowledgement.
//
// This is the transport for the candidate WhatsApp channel (ADR 0028: a custom
// eve channel over Meta's WhatsApp Business Cloud API, no Twilio or BSP). It
// carries the verified-ingress logic (ADR 0010): an inbound webhook is proven
// authentic before anything is processed, and only verified provider events
// advance to a candidate workflow.
//
// Everything here is a pure function over its inputs (raw body, headers, parsed
// payload, plain state), so the security boundary and the acknowledgement are
// proven deterministically without an eve runtime, the same way Task 1.2 proves
// its reducer. The route in src/channel/intake-route.ts wires the verification
// to the live HTTP surface and hands each verified application to the durable
// candidate run of ADR 0029 (src/workflow/candidate-run.ts).
//
// Boundary (Task 1.3): verified ingress and a role-naming acknowledgement only.
// No FAQ or free-text understanding (Task 1.4), no documents (Task 1.5), no
// scheduling (Task 1.7), no model call. The role is taken from structured Meta
// payload fields (a click-to-WhatsApp referral or an interactive reply id), never
// interpreted from message text.

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeE164 } from "../workflow/candidate-key.ts";
import type { InboundEvent } from "../workflow/candidate-workflow.ts";

// --- Webhook authenticity (I2, ADR 0010, ADR 0028) ----------------------
//
// Meta signs the raw request body with HMAC-SHA256 over the app secret and sends
// it as `X-Hub-Signature-256: sha256=<hex>`. We recompute over the exact bytes
// we received (the route passes the request body as bytes, so no decode step
// sits between the wire and the HMAC) and compare in constant time. A missing,
// mis-signed, or tampered-with body fails. The secret is a per-environment value
// (Phase 0 B3, ADR 0010), never committed.

export type RawBody = string | Uint8Array;

export function verifyMetaSignature(
  rawBody: RawBody,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const hmac = createHmac("sha256", appSecret);
  if (typeof rawBody === "string") hmac.update(rawBody, "utf8");
  else hmac.update(rawBody);
  const expected = "sha256=" + hmac.digest("hex");
  return constantTimeEqual(signatureHeader, expected);
}

// --- Subscription verify-token handshake (Meta GET) ---------------------
//
// On webhook setup Meta calls GET with hub.mode=subscribe and a verify token we
// chose; we echo hub.challenge only when the token matches the configured
// per-environment token. Anything else is refused.

export function verifySubscription(query: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken) return null;
  const mode = query.get("hub.mode");
  const token = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && constantTimeEqual(token, verifyToken)) {
    return challenge;
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// --- Parsing a verified Meta payload (A1, I3) ---------------------------
//
// A normalised application carries only what the workflow needs: the verified
// candidate number, the provider message id (the dedup key, ADR 0010), and an
// optional structured requisition reference. We read messages off the
// WhatsApp Cloud API webhook shape and ignore everything else (status callbacks,
// other change fields), so only a real inbound message becomes an application.

export interface InboundApplication {
  /** Candidate number in E.164 form (the workflow key, ADR 0011). */
  readonly number: string;
  /** Provider message id: the at-least-once dedup key (E3, ADR 0010). */
  readonly messageId: string;
  /** Structured requisition reference, or null. Never read from message text. */
  readonly requisitionRef: string | null;
}

export function parseInboundApplications(payload: unknown): InboundApplication[] {
  const out: InboundApplication[] = [];
  const entries = asArray((payload as Record<string, unknown> | null)?.entry);
  for (const entry of entries) {
    for (const change of asArray((entry as Record<string, unknown>)?.changes)) {
      const c = change as Record<string, unknown>;
      if (c?.field !== "messages") continue;
      const value = c.value as Record<string, unknown> | undefined;
      for (const message of asArray(value?.messages)) {
        if (!message || typeof message !== "object") continue;
        const m = message as Record<string, unknown>;
        const from = typeof m.from === "string" ? m.from : null;
        const id = typeof m.id === "string" ? m.id : null;
        if (!from || !id) continue;
        const number = e164OrNull(ensurePlus(from));
        // A sender that cannot key a workflow is dropped here, so one malformed
        // entry never fails the batch it arrived in.
        if (!number) continue;
        out.push({ number, messageId: id, requisitionRef: extractRequisitionRef(m) });
      }
    }
  }
  return out;
}

// Structured role reference only: a click-to-WhatsApp ad referral, an interactive
// quick-reply / list-reply id, or a legacy button payload. We never parse free
// text to guess a role (that would be Task 1.4 / Phase 2 territory).
function extractRequisitionRef(m: Record<string, unknown>): string | null {
  const referral = m.referral as Record<string, unknown> | undefined;
  if (typeof referral?.source_id === "string" && referral.source_id) return referral.source_id;
  const interactive = m.interactive as Record<string, unknown> | undefined;
  const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined;
  const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
  if (typeof buttonReply?.id === "string" && buttonReply.id) return buttonReply.id;
  if (typeof listReply?.id === "string" && listReply.id) return listReply.id;
  const button = m.button as Record<string, unknown> | undefined;
  if (typeof button?.payload === "string" && button.payload) return button.payload;
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// WhatsApp sends the number without a leading + (e.g. "27821234567").
function ensurePlus(raw: string): string {
  return raw.startsWith("+") ? raw : `+${raw}`;
}

function e164OrNull(candidate: string): string | null {
  try {
    return normalizeE164(candidate);
  } catch {
    return null;
  }
}

// --- Verified ingress decision (I2, the security boundary) --------------
//
// The single guard the channel route handler runs: verify the signature, then
// (and only then) parse. A forged or unsigned body returns { ok: false } and is
// never parsed or processed. Keeping this in one pure function lets a test prove
// "rejected before processing" directly.

export type IngressDecision =
  | { readonly ok: false }
  | { readonly ok: true; readonly applications: InboundApplication[] };

export function acceptInbound(
  rawBody: RawBody,
  signatureHeader: string | null,
  appSecret: string,
): IngressDecision {
  if (!verifyMetaSignature(rawBody, signatureHeader, appSecret)) return { ok: false };
  let payload: unknown;
  try {
    payload = JSON.parse(typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody));
  } catch {
    return { ok: false };
  }
  return { ok: true, applications: parseInboundApplications(payload) };
}

// --- Role resolution and the acknowledgement (A1) -----------------------
//
// The requisition reference maps to a role title via a small catalogue
// (pilot configuration, ADR 0006: no candidate record, just the role label).
// An application whose reference resolves to a role is acknowledged by name.

export type RoleCatalog = Readonly<Record<string, string>>;

export function resolveRole(requisitionRef: string | null, catalog: RoleCatalog): string | null {
  if (!requisitionRef || !Object.hasOwn(catalog, requisitionRef)) return null;
  const role = catalog[requisitionRef];
  return typeof role === "string" && role ? role : null;
}

export function acknowledgement(role: string): string {
  return (
    `Thank you for applying for the ${role} role. ` +
    `We have received your application and will be in touch here on WhatsApp with the next steps.`
  );
}

// --- From a verified application to the run's event (A1, I3) --------------
//
// The reducer dedups on the keyed hash of the message id, never the raw id
// (ADR 0029), and the candidate's number travels inside the event because the
// run checks it against its own. The run's `ingest` then decides the once-only
// role-naming acknowledgement.

export function applicationEvent(
  app: Pick<InboundApplication, "number">,
  role: string,
  messageIdHash: string,
  at: number,
): InboundEvent {
  return { kind: "application-received", id: messageIdHash, number: app.number, role, at };
}

// --- The live Meta leg (ADR 0028) ---------------------------------------
//
// Sending requires a provisioned WhatsApp number and per-environment Cloud API
// credentials. Until those exist the leg is blocked: we record it and do not
// fake an exchange (docs/phase-1/task-1.3-blocker.md). `fetchImpl` is injectable
// so the send shape is tested without a network call.

export interface WhatsAppCredentials {
  readonly phoneNumberId: string;
  readonly accessToken: string;
}

export function whatsAppCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): WhatsAppCredentials | null {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

export function roleCatalogFromEnv(
  env: Record<string, string | undefined> = process.env,
): RoleCatalog {
  const raw = env.WHATSAPP_ROLE_CATALOG;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const catalog: Record<string, string> = {};
      for (const [ref, role] of Object.entries(parsed)) {
        if (typeof role === "string" && role) catalog[ref] = role;
      }
      return catalog;
    }
  } catch {
    // ponytail: a malformed catalogue resolves no roles rather than crashing
    // ingress; a misconfigured pilot fails closed on acknowledgement, not on the
    // security boundary. Upgrade path: validate the catalogue at boot.
  }
  return {};
}

export async function sendWhatsAppText(
  creds: WhatsAppCredentials,
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(creds.phoneNumberId)}/messages`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp Cloud API send failed: ${res.status} ${detail}`);
  }
}
