import { verifySession } from "./session.ts";
import type { Role } from "./roles.ts";
import type { AuthenticatedUser } from "./types.ts";
import { AuthConfigError, SessionVerificationError } from "./errors.ts";

// The route guard (ADR 0003, ADR 0008). It is the single gate an internal
// surface sits behind. It depends only on the auth interface: it verifies a
// stateless signed session and reads id, email, and roles from the verified
// token (ADR 0008). It never imports or reaches into a provider (requirement
// D1). The dev provider and the future Entra-via-Passport provider mint the
// same session shape, so swapping the provider does not change the guard.

// A browser caller may carry the session in a cookie; an API caller carries it
// in an `Authorization: Bearer <session>` header. Both hold the same stateless
// signed token (ADR 0008); neither is a server-side session id.
const SESSION_COOKIE = "session";

export interface GuardOptions {
  // The per-environment signing secret (ADR 0008). Required.
  secret: string;
  // Optional role requirement (requirement D5). When set, a verified session
  // that does not carry this role is refused with 403.
  requiredRole?: Role;
  // Injectable clock (epoch milliseconds), for deterministic tests.
  now?: number;
}

// The guard returns a decision rather than throwing for auth outcomes, so a
// caller (the whoami surface, or any future internal surface) maps it to a
// response. A missing signing secret is a deployment fault, not an auth
// outcome, and is thrown instead (see below).
export type GuardDecision =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403; code: string; message: string };

export function guard(request: Request, options: GuardOptions): GuardDecision {
  if (!options.secret) {
    // A missing secret is a misconfiguration, not an auth decision. Surface it
    // loudly rather than silently refusing (and so masking) every caller.
    throw new AuthConfigError(
      "A session signing secret is required to guard a route (ADR 0008).",
    );
  }

  const token = extractSessionToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "authentication_required",
      message: "No session was presented.",
    };
  }

  let user: AuthenticatedUser;
  try {
    user = verifySession(token, { secret: options.secret, now: options.now });
  } catch (error) {
    if (error instanceof SessionVerificationError) {
      return {
        ok: false,
        status: 401,
        code: "invalid_session",
        message: "The session is invalid or has expired.",
      };
    }
    throw error;
  }

  if (options.requiredRole && !user.roles.includes(options.requiredRole)) {
    return {
      ok: false,
      status: 403,
      code: "insufficient_role",
      message: `This surface requires the ${options.requiredRole} role.`,
    };
  }

  return { ok: true, user };
}

// Pulls the session token from an `Authorization: Bearer <token>` header, then
// falls back to a `session` cookie. Returns null when neither is present.
export function extractSessionToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) {
      return match[1].trim();
    }
  }
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const fromCookie = readCookie(cookie, SESSION_COOKIE);
    if (fromCookie) {
      return fromCookie;
    }
  }
  return null;
}

function readCookie(header: string, name: string): string | null {
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) {
      return decodeURIComponent(pair.slice(index + 1).trim());
    }
  }
  return null;
}
