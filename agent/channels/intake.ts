import { defineChannel, GET, POST } from "eve/channels";

// The public intake placeholder (Task 0.7, requirement F1). This is the only
// internet-facing, unauthenticated surface the agent exposes besides liveness:
// it occupies the URL Phase 1's WhatsApp and Teams intake and webhook ingress
// will later use (ADR 0010), and nothing more. It is a placeholder by design.
//
// It carries no intake logic, no webhook verification, no channel or messaging
// logic, and no candidate-data handling. All of that is Phase 1 (ADR 0010),
// which turns this surface into verified channel ingress sitting behind the same
// edge protection. In Phase 0 the route returns a static placeholder response so
// the surface is reachable and provable, and so the edge protection (Vercel WAF
// and bot challenge) has something to sit in front of.
//
// Edge protection is configured at the platform, not in this handler: Vercel's
// WAF custom rules and bot-challenge run at the edge before a request reaches
// this code (requirement F2). That keeps the placeholder free of any
// application-level filtering, which is the point of doing it at the edge.

const placeholder = () =>
  new Response(
    JSON.stringify({
      ok: true,
      surface: "public-intake-placeholder",
      phase: 0,
      note: "Placeholder only. No intake, webhook, or channel logic. Phase 1 (ADR 0010) makes this a verified channel ingress behind the same WAF and bot protection.",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );

export default defineChannel({
  routes: [
    GET("/intake", async () => placeholder()),
    POST("/intake", async () => placeholder()),
  ],
});
