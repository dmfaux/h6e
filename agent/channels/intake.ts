import { defineChannel, GET, POST } from "eve/channels";
import {
  acceptInbound,
  resolveRole,
  roleCatalogFromEnv,
  verifySubscription,
} from "../../src/channel/whatsapp.ts";

// Task 1.3: the live WhatsApp webhook surface (requirements A1, I1, I2, I3;
// ADRs 0010, 0028). This is the Phase 0 `/intake` placeholder turned live, on
// the same URL behind the same Vercel WAF and bot protection (docs/phase-0/
// edge-protection.md, firewall-config.json: the rule keys on `path eq /intake`).
//
// Verification sits at ingress, behind the edge (ADR 0010): every inbound POST
// is checked against Meta's X-Hub-Signature-256 over the raw bytes before
// anything is parsed or processed, and a forged or unsigned event is refused
// (403) and never reaches a workflow. The verification, parsing and role
// resolution are pure functions in src/channel/whatsapp.ts, proven by
// src/channel/whatsapp.test.ts.
//
// Fail closed, pending ADR 0029. A verified application is not handed to the
// durable candidate workflow from here. The only way into a durable eve session
// is a message send, and a send starts a model turn: the candidate's delivery
// would reach a model (ADR 0006, ADR 0014; Phase 1 makes no model call), and a
// turn a hook cancels before the model discards the `defineState` writes made
// in it, so neither path reaches `ingest` durably (evidence in ADR 0029). Until
// that ADR is accepted, this route verifies, parses and counts, answers Meta
// 200 so a verified event is not redelivered as a storm, and processes nothing:
// no session, no acknowledgement, no model. The gap is recorded in
// docs/phase-1/task-1.3-blocker.md and Task 1.3 is partial.
//
// Boundary (Task 1.3): verified ingress only. No FAQ or free-text understanding
// (Task 1.4), no documents (Task 1.5), no scheduling (Task 1.7), no model call.
// Secrets are read from the environment, never compiled in. Log lines carry
// counts and outcomes, never a number.

const appSecret = () => process.env.WHATSAPP_APP_SECRET ?? "";
const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN ?? "";

export default defineChannel({
  routes: [
    // Meta webhook verify-token handshake. Echo hub.challenge only when the
    // configured per-environment verify token matches; otherwise refuse.
    GET("/intake", async (request) => {
      const challenge = verifySubscription(new URL(request.url).searchParams, verifyToken());
      return challenge === null
        ? new Response("forbidden", { status: 403 })
        : new Response(challenge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
    }),

    // Inbound webhook. Verify authenticity over the raw bytes, then (for now)
    // only account for what arrived.
    POST("/intake", async (request) => {
      const raw = new Uint8Array(await request.arrayBuffer());
      const decision = acceptInbound(raw, request.headers.get("x-hub-signature-256"), appSecret());
      if (!decision.ok) {
        // Failed verification: rejected and never processed (ADR 0010).
        return new Response("forbidden", { status: 403 });
      }

      const catalog = roleCatalogFromEnv();
      const applications = decision.applications.filter(
        (application) => resolveRole(application.requisitionRef, catalog) !== null,
      ).length;
      console.warn(
        `[intake] ${applications} verified application(s) received; not processed: candidate workflow path pending ADR 0029`,
      );
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }),
  ],
});
