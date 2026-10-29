import { defineChannel, POST } from "eve/channels";
import { candidateKey } from "../../src/workflow/candidate-key.ts";

// PROOF ONLY (proof/task-1.3-handoff, never merged). A fake WhatsApp Graph
// send endpoint on the deployment itself, active only under PROOF_MODE=1.
// Logs the opaque key of the recipient, never the body or the number.

let count = 0;

export default defineChannel({
  routes: [
    POST("/proof/fake-graph/v21.0/:phoneNumberId/messages", async (request) => {
      if (process.env.PROOF_MODE !== "1") return new Response("not found", { status: 404 });
      let key = "?";
      try {
        const to = (JSON.parse(await request.text()) as { to?: unknown }).to;
        if (typeof to === "string" && process.env.CANDIDATE_KEY_SECRET) {
          key = candidateKey(`+${to}`, process.env.CANDIDATE_KEY_SECRET);
        }
      } catch {}
      count += 1;
      console.log(`[fake-graph] POST n=${count} key=${key} deployment=${process.env.VERCEL_DEPLOYMENT_ID}`);
      return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "proof-out" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  ],
});
