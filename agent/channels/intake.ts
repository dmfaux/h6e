import { defineChannel, GET, POST } from "eve/channels";
import {
  acceptInbound,
  resolveRole,
  roleCatalogFromEnv,
  verifySubscription,
  workflowKey,
} from "../../src/channel/whatsapp.ts";
import {
  deliverToCandidateRun,
  handOverCandidateRun,
  inspectCandidateRun,
  readCandidateRun,
} from "../../src/workflow/candidate-run-api.ts";

// Task 1.3: the live WhatsApp webhook surface (requirements A1, I1, I2, I3;
// ADRs 0010, 0026). This is the Phase 0 `/intake` placeholder turned live, on
// the same URL behind the same Vercel WAF and bot protection (docs/phase-0/
// edge-protection.md, firewall-config.json: the rule keys on `path eq /intake`).
//
// Verification sits at ingress, behind the edge (ADR 0010): every inbound POST
// is checked against Meta's X-Hub-Signature-256 over the raw bytes before
// anything is parsed or processed, and a forged or unsigned event is refused
// (403) and never reaches a workflow.
//
// PROTOTYPE (ADR 0029, Proposed): a verified application is handed to a durable
// Workflow SDK run per candidate (src/workflow/candidate-run.ts) instead of an
// eve session turn. The route starts the run for a new number and resumes the
// run's hook for a known one. No session, no model. The two /prototype routes
// exist only to observe the run from outside and are gated on the app secret.

const appSecret = () => process.env.WHATSAPP_APP_SECRET ?? "";
const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function prototypeKey(request: Request): string | null {
  const url = new URL(request.url);
  if (request.headers.get("x-prototype-secret") !== appSecret() || appSecret() === "") return null;
  const number = url.searchParams.get("number");
  return number ? workflowKey(number) : null;
}

export default defineChannel({
  routes: [
    GET("/intake", async (request) => {
      const challenge = verifySubscription(new URL(request.url).searchParams, verifyToken());
      return challenge === null
        ? new Response("forbidden", { status: 403 })
        : new Response(challenge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
    }),

    POST("/intake", async (request) => {
      const raw = new Uint8Array(await request.arrayBuffer());
      const decision = acceptInbound(raw, request.headers.get("x-hub-signature-256"), appSecret());
      if (!decision.ok) {
        return new Response("forbidden", { status: 403 });
      }

      const catalog = roleCatalogFromEnv();
      const receipts = [];
      for (const application of decision.applications) {
        const role = resolveRole(application.requisitionRef, catalog);
        if (role === null) continue;
        receipts.push(
          await deliverToCandidateRun(workflowKey(application.number), {
            kind: "application",
            messageId: application.messageId,
            requisitionRef: application.requisitionRef,
            role,
          }),
        );
      }
      console.log(
        `[intake] ${receipts.length} verified application(s) delivered: ${receipts.map((r) => `${r.action}:${r.runId}`).join(", ")}`,
      );
      return json({ ok: true, processed: receipts.length, receipts });
    }),

    GET("/prototype/run", async (request) => {
      const key = prototypeKey(request);
      if (key === null) return new Response("forbidden", { status: 403 });
      return json(await inspectCandidateRun(key));
    }),

    GET("/prototype/run-by-id", async (request) => {
      const url = new URL(request.url);
      const runId = url.searchParams.get("runId");
      if (request.headers.get("x-prototype-secret") !== appSecret() || appSecret() === "" || !runId) {
        return new Response("forbidden", { status: 403 });
      }
      return json(await readCandidateRun(runId));
    }),

    // Stand-in for Meta's Graph messages endpoint so a deployment can prove a
    // send without a provisioned number: point WHATSAPP_GRAPH_BASE_URL at
    // <deployment>/prototype/fake-graph. Logs the recipient (always a fake
    // +2782000000x number in this prototype) and the body, nothing else.
    POST("/prototype/fake-graph/v21.0/:phoneNumberId/messages", async (request, { params }) => {
      const body = await request.text();
      console.log(`[fake-graph] POST phoneNumberId=${params.phoneNumberId} body=${body}`);
      return json({ messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" }] });
    }),

    POST("/prototype/handover", async (request) => {
      const key = prototypeKey(request);
      if (key === null) return new Response("forbidden", { status: 403 });
      return json(await handOverCandidateRun(key));
    }),
  ],
});
