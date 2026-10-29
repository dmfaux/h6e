// The opaque candidate key and message-id hash (ADR 0029).
//
// The verified WhatsApp number identifies a candidate (ADR 0003), but the
// number must not sit in hook records, run metadata, spans, logs or audit
// records, which outlive a run's payload (ADR 0006, ADR 0029). So everywhere
// outside the run's own state the candidate is named by a keyed HMAC of the
// number, and a WhatsApp message id (which is reported to encode the sender's
// number) by a keyed HMAC of the id. Both are pure functions of their input and
// the per-environment secret, so the route and the run derive the same key.

import { createHmac } from "node:crypto";

export class InvalidWhatsAppNumberError extends Error {
  constructor(raw: string) {
    super(`Not a valid E.164 WhatsApp number: ${JSON.stringify(raw)}`);
    this.name = "InvalidWhatsAppNumberError";
  }
}

export class CandidateKeySecretMissingError extends Error {
  constructor() {
    super("CANDIDATE_KEY_SECRET is not set; a candidate cannot be keyed without it");
    this.name = "CandidateKeySecretMissingError";
  }
}

/** Normalise an already-verified number to E.164 so formatting differences key the same run. */
export function normalizeE164(raw: string): string {
  const stripped = raw.trim().replace(/[\s()\-.]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(stripped)) {
    throw new InvalidWhatsAppNumberError(raw);
  }
  return stripped;
}

const KEY_PREFIX = "candidate:";

function keyed(secret: string, input: string): string {
  if (!secret) throw new CandidateKeySecretMissingError();
  return createHmac("sha256", secret).update(input, "utf8").digest("hex");
}

/** The hook token and correlation key for a candidate: `candidate:` plus HMAC-SHA-256 of the E.164 number. */
export function candidateKey(verifiedWhatsAppNumber: string, secret: string): string {
  return KEY_PREFIX + keyed(secret, normalizeE164(verifiedWhatsAppNumber));
}

/** The dedup key for a WhatsApp message id, never the raw `wamid.` value. */
export function messageIdHash(messageId: string, secret: string): string {
  return keyed(secret, messageId);
}

export function candidateKeySecretFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.CANDIDATE_KEY_SECRET;
  if (!secret) throw new CandidateKeySecretMissingError();
  return secret;
}
