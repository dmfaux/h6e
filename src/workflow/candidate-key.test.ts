// The opaque candidate key and message-id hash (ADR 0029). Run with
// `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateKey,
  candidateKeySecretFromEnv,
  CandidateKeySecretMissingError,
  InvalidWhatsAppNumberError,
  messageIdHash,
  normalizeE164,
} from "./candidate-key.ts";

const SECRET = "per-environment-candidate-key-secret";

test("the key is stable for one number and the same under formatting differences", () => {
  const key = candidateKey("+27821234567", SECRET);
  assert.equal(key, candidateKey("+27821234567", SECRET));
  assert.equal(candidateKey("+27 82 123 4567", SECRET), key);
  assert.equal(candidateKey("+27-82-123-4567", SECRET), key);
  assert.match(key, /^candidate:[0-9a-f]{64}$/);
});

test("the key carries no digits of the number in clear and differs per number and per secret", () => {
  const key = candidateKey("+27821234567", SECRET);
  assert.equal(key.includes("27821234567"), false);
  assert.equal(key.includes("821234567"), false);
  assert.notEqual(candidateKey("+27829999999", SECRET), key);
  assert.notEqual(candidateKey("+27821234567", "another-environment"), key);
});

test("the message-id hash is keyed too and never the raw id", () => {
  const hash = messageIdHash("wamid.HBgLMjc4MjEyMzQ1NjcVAgARGBI=", SECRET);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, messageIdHash("wamid.HBgLMjc4MjEyMzQ1NjcVAgARGBI=", SECRET));
  assert.notEqual(hash, messageIdHash("wamid.other", SECRET));
  assert.notEqual(hash, messageIdHash("wamid.HBgLMjc4MjEyMzQ1NjcVAgARGBI=", "another-environment"));
});

test("an unverifiable number cannot be keyed", () => {
  assert.throws(() => candidateKey("", SECRET), InvalidWhatsAppNumberError);
  assert.throws(() => candidateKey("not-a-number", SECRET), InvalidWhatsAppNumberError);
  assert.throws(() => candidateKey("0821234567", SECRET), InvalidWhatsAppNumberError);
  assert.equal(normalizeE164(" +27 (82) 123-4567 "), "+27821234567");
});

test("a missing secret refuses to key anything rather than keying weakly", () => {
  assert.throws(() => candidateKey("+27821234567", ""), CandidateKeySecretMissingError);
  assert.throws(() => messageIdHash("wamid.X", ""), CandidateKeySecretMissingError);
  assert.throws(() => candidateKeySecretFromEnv({}), CandidateKeySecretMissingError);
  assert.equal(candidateKeySecretFromEnv({ CANDIDATE_KEY_SECRET: "s" }), "s");
});
