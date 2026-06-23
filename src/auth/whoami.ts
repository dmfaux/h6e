import { guard, type GuardDecision, type GuardOptions } from "./guard.ts";
import { AuthConfigError } from "./errors.ts";
import type { Role } from "./roles.ts";
import type { AuthenticatedUser } from "./types.ts";

// The authenticated whoami surface (requirement C2). It sits behind the route
// guard, is served from the agent's HTTP surface (so the request reaches the
// booting agent), and returns the caller's own resolved id, email, and roles
// and nothing more. There is no business logic here: it proves the
// auth-to-agent path and stops. The channel in agent/channels wires it onto the
// agent boot path; this module stays free of any framework coupling and returns
// a Web-standard Response.

export type WhoamiOptions = GuardOptions;

export interface WhoamiIdentity {
  id: string;
  email: string;
  roles: Role[];
}

// Projects exactly id, email, and roles from the verified user: the surface
// returns the caller's identity and nothing more (requirement C2).
export function toWhoami(user: AuthenticatedUser): WhoamiIdentity {
  return { id: user.id, email: user.email, roles: user.roles };
}

export function handleWhoami(
  request: Request,
  options: WhoamiOptions,
): Response {
  let decision: GuardDecision;
  try {
    decision = guard(request, options);
  } catch (error) {
    if (error instanceof AuthConfigError) {
      return errorResponse(500, "server_misconfigured", "Auth is not configured.");
    }
    throw error;
  }

  if (!decision.ok) {
    return errorResponse(decision.status, decision.code, decision.message);
  }

  return new Response(JSON.stringify(toWhoami(decision.user)), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Refusals carry only a small machine-readable error so nothing about the
// session or the user leaks. A 401 advertises the bearer scheme.
function errorResponse(status: number, code: string, message: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (status === 401) {
    headers["www-authenticate"] = "Bearer";
  }
  return new Response(JSON.stringify({ ok: false, code, error: message }), {
    status,
    headers,
  });
}
