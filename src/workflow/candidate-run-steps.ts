// Prototype for ADR 0029 (Proposed): the "use step" functions of the
// per-candidate run. Steps may touch env, Node APIs, eve modules and the
// runtime API; the body in candidate-run.ts may not, so everything impure
// lives here and the body reaches it only through these steps.

import {
  acknowledgement,
  correlateApplication,
  sendWhatsAppText,
  whatsAppCredentialsFromEnv,
} from "../channel/whatsapp.ts";
import { resumeHook } from "workflow/api";
import {
  initialLogistics,
  numberFromWorkflowKey,
  type CandidateLogistics,
} from "./candidate-workflow.ts";

export type CandidateDelivery =
  | {
      readonly kind: "application";
      readonly messageId: string;
      readonly requisitionRef: string | null;
      readonly role: string;
    }
  | { readonly kind: "handover" };

export async function handleDelivery(
  state: CandidateLogistics,
  key: string,
  delivery: CandidateDelivery,
): Promise<CandidateLogistics> {
  "use step";
  if (delivery.kind !== "application") return state;
  const number = numberFromWorkflowKey(key);
  const { state: after, acknowledged } = await correlateApplication(
    state,
    { number, messageId: delivery.messageId, requisitionRef: delivery.requisitionRef },
    delivery.role,
    async (effect) => {
      const creds = whatsAppCredentialsFromEnv();
      if (!creds) {
        console.warn("[candidate-run] acknowledgement skipped: no WhatsApp credentials");
        return;
      }
      await sendWhatsAppText(creds, number, acknowledgement(effect.role));
    },
  );
  console.log(
    `[candidate-run] delivery handled on ${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}: acknowledged=${acknowledged} processedEvents=${after.processedEvents.length} completedEffects=${after.completedEffects.length}`,
  );
  return after;
}

export async function forwardDelivery(key: string, delivery: CandidateDelivery): Promise<void> {
  "use step";
  await resumeHook(key, delivery);
}

/** The reducer's starting value, fetched through a step so the body stays pure. */
export async function initialState(): Promise<CandidateLogistics> {
  "use step";
  return initialLogistics();
}
