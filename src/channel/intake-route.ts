// The /intake webhook decision (ADR 0010, ADR 0028, ADR 0029): verify, parse,
// key each application opaquely, and hand it to its candidate run. Pure over
// its dependencies, so the route's outcomes (403, 200, 500, 503) are proven
// without a World; agent/channels/intake.ts binds the live ones.

import { candidateKey, messageIdHash } from "../workflow/candidate-key.ts";
import type { Delivery } from "../workflow/candidate-run-machine.ts";
import type { DeliveryReceipt } from "../workflow/candidate-run-api.ts";
import { acceptInbound, resolveRole, type RoleCatalog } from "./whatsapp.ts";

export interface IntakeDeps {
  readonly appSecret: string;
  /** Null when CANDIDATE_KEY_SECRET is unset: the route then refuses to process. */
  readonly keySecret: string | null;
  readonly catalog: RoleCatalog;
  currentDeploymentId(): Promise<string>;
  deliver(key: string, delivery: Delivery): Promise<DeliveryReceipt>;
  log?(line: string): void;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Meta retries a webhook it did not get a 2xx for, so every failure after
// verification answers 5xx (ADR 0029: 200 only once every application in the
// batch is durably accepted by a run). Log lines carry counts, outcomes, run
// ids and opaque keys, never a number or a raw message id.
export async function handleIntakePost(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  deps: IntakeDeps,
): Promise<Response> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const decision = acceptInbound(rawBody, signatureHeader, deps.appSecret);
  if (!decision.ok) return new Response("forbidden", { status: 403 });

  const applications = decision.applications.flatMap((application) => {
    const role = resolveRole(application.requisitionRef, deps.catalog);
    return role === null ? [] : [{ application, role }];
  });
  if (applications.length === 0) {
    log(`[intake] ${decision.applications.length} message(s) verified, 0 with a role; nothing to deliver`);
    return json({ ok: true, processed: 0 }, 200);
  }
  if (deps.keySecret === null) {
    log(`[intake] ${applications.length} application(s) refused: CANDIDATE_KEY_SECRET is not set`);
    return json({ ok: false, error: "not configured" }, 500);
  }
  const keySecret = deps.keySecret;

  let acceptedBy: string;
  try {
    acceptedBy = await deps.currentDeploymentId();
  } catch (error) {
    log(`[intake] ${applications.length} application(s) not accepted: ${name(error)}`);
    return json({ ok: false, error: "not accepted" }, 503);
  }

  const outcomes = await Promise.allSettled(
    applications.map(({ application, role }) => {
      const key = candidateKey(application.number, keySecret);
      const delivery: Delivery = {
        kind: "delivery",
        number: application.number,
        messageIdHash: messageIdHash(application.messageId, keySecret),
        role,
        acceptedBy,
      };
      return deps.deliver(key, delivery).then((receipt) => ({ key, receipt }));
    }),
  );

  const accepted = outcomes.flatMap((o) => (o.status === "fulfilled" ? [o.value] : []));
  const failed = outcomes.flatMap((o) => (o.status === "rejected" ? [name(o.reason)] : []));
  const summary = accepted.map(({ key, receipt }) => `${receipt.action} ${receipt.runId} key=${key}`).join(", ");
  if (failed.length > 0) {
    log(`[intake] ${accepted.length}/${applications.length} accepted (${summary}); failed: ${failed.join(", ")}`);
    return json({ ok: false, error: "not accepted" }, 503);
  }
  log(`[intake] ${accepted.length} application(s) accepted: ${summary}`);
  return json({ ok: true, processed: accepted.length }, 200);
}

function name(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    return message ? `${error.name} (${message})` : error.name;
  }
  return String(error);
}
