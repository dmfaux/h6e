import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "./types.ts";
import type { Role } from "./roles.ts";
import { isRole } from "./roles.ts";
import { SessionVerificationError } from "./errors.ts";

// Stateless signed sessions (ADR 0008). A session is a self-contained,
// HMAC-SHA256 signed token (JWT-compatible shape) carried by the client. There
// is no server-side session store. The signing secret is a per-environment
// secret. Both providers mint this same shape, so the Phase 5 Entra swap does
// not change the session contract or the guards that read it.

// Short-lived by default (ADR 0008): stateless tokens cannot be revoked before
// they expire, so we keep the lifetime short.
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

const HEADER = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

interface SessionPayload {
  sub: string;
  email: string;
  roles: Role[];
  iat: number;
  exp: number;
}

export interface MintOptions {
  secret: string;
  ttlSeconds?: number;
  // Injectable clock (epoch milliseconds), for deterministic tests.
  now?: number;
}

export interface VerifyOptions {
  secret: string;
  now?: number;
}

export function mintSession(
  user: AuthenticatedUser,
  options: MintOptions,
): string {
  if (!options.secret) {
    throw new SessionVerificationError(
      "A signing secret is required to mint a session",
    );
  }
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  };
  const body = `${HEADER}.${encode(JSON.stringify(payload))}`;
  return `${body}.${sign(body, options.secret)}`;
}

export function verifySession(
  token: string,
  options: VerifyOptions,
): AuthenticatedUser {
  if (!options.secret) {
    throw new SessionVerificationError(
      "A signing secret is required to verify a session",
    );
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SessionVerificationError("Malformed session token");
  }
  const [header, payloadPart, signature] = parts;
  const body = `${header}.${payloadPart}`;
  if (!signatureMatches(signature, sign(body, options.secret))) {
    throw new SessionVerificationError("Bad session signature");
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as SessionPayload;
  } catch {
    throw new SessionVerificationError("Unreadable session payload");
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new SessionVerificationError("Session has expired");
  }
  if (
    !payload.sub ||
    !payload.email ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every(isRole)
  ) {
    throw new SessionVerificationError(
      "Session payload is missing required claims",
    );
  }

  return { id: payload.sub, email: payload.email, roles: payload.roles };
}

function encode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signatureMatches(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
