import { defineChannel, GET, POST } from "eve/channels";
import { roleCatalogFromEnv, verifySubscription } from "../../src/channel/whatsapp.ts";
import { handleIntakePost } from "../../src/channel/intake-route.ts";
import { deliverToCandidateRun } from "../../src/workflow/candidate-run-api.ts";
import { currentDeploymentId, liveCandidateRunApi } from "../../src/workflow/candidate-run-runtime.ts";
import { DEPLOYMENT_ROUTE } from "../../src/workflow/deployment.ts";

// Task 1.3: the live WhatsApp webhook surface (requirements A1, I1, I2, I3;
// ADRs 0010, 0028, 0029). This is the Phase 0 `/intake` placeholder turned
// live, on the same URL behind the same Vercel WAF and bot protection
// (docs/phase-0/edge-protection.md, firewall-config.json: the rule keys on
// `path eq /intake`).
//
// Verification sits at ingress, behind the edge (ADR 0010): every inbound POST
// is checked against Meta's X-Hub-Signature-256 over the raw bytes before
// anything is parsed or processed, and a forged or unsigned event is refused
// (403). Each verified application with a role is keyed opaquely and handed to
// its durable candidate run (src/workflow/candidate-run.ts): the run that
// holds the key is resumed, or a fresh one is started. No session, no model.
//
// Boundary (Task 1.3): verified ingress and the acknowledgement only. No FAQ
// or free-text understanding (Task 1.4), no documents (Task 1.5), no
// scheduling (Task 1.7), no model call. Secrets are read from the
// environment, never compiled in.

export default defineChannel({
  routes: [
    // Meta webhook verify-token handshake. Echo hub.challenge only when the
    // configured per-environment verify token matches; otherwise refuse.
    GET("/intake", async (request) => {
      const challenge = verifySubscription(
        new URL(request.url).searchParams,
        process.env.WHATSAPP_VERIFY_TOKEN ?? "",
      );
      return challenge === null
        ? new Response("forbidden", { status: 403 })
        : new Response(challenge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
    }),

    POST("/intake", async (request) =>
      handleIntakePost(new Uint8Array(await request.arrayBuffer()), request.headers.get("x-hub-signature-256"), {
        appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
        keySecret: process.env.CANDIDATE_KEY_SECRET || null,
        catalog: roleCatalogFromEnv(),
        currentDeploymentId,
        deliver: (key, delivery) => deliverToCandidateRun(key, delivery, liveCandidateRunApi),
      }),
    ),

    // Which deployment serves this domain right now. A candidate run fetches
    // it on its own domain to pick the target of its 7-day self-handoff
    // (ADR 0029, Triggers), since "latest" would undo an Instant Rollback.
    // Public: it reveals only the deployment id, and the run has no session.
    GET(DEPLOYMENT_ROUTE, async () =>
      currentDeploymentId().then(
        (deploymentId) =>
          new Response(JSON.stringify({ deploymentId }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          }),
        () => new Response("unavailable", { status: 503 }),
      ),
    ),
  ],
});
