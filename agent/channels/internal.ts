import { defineChannel, GET } from "eve/channels";
import { ROLES } from "../../src/auth/index.ts";
import { handleWhoami } from "../../src/auth/whoami.ts";

// The agent's authenticated internal surface (requirement C2). This is the
// whoami endpoint wired onto the agent boot path from Task 0.1: a custom eve
// channel exposing one guarded HTTP route, served by the booting agent. It
// carries no messaging or business logic; it runs the route guard from
// src/auth and returns the caller's id, email, and roles.
//
// The route requires the internal-engineering role (requirement D5): engineering
// access to the whoami surface. The liveness check (/eve/v1/health) stays
// public; this one does not. The guard depends only on the auth interface,
// never on a provider (ADR 0003), and reads identity and roles from the
// verified session token (ADR 0008). The signing secret is a per-environment
// secret read from the environment, never compiled in.

export default defineChannel({
  routes: [
    GET("/internal/whoami", async (request) =>
      handleWhoami(request, {
        secret: process.env.SESSION_SECRET ?? "",
        requiredRole: ROLES.internalEngineering,
      }),
    ),
  ],
});
