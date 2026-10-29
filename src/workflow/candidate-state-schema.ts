// The versioned schema a successor run parses its inherited state against
// (ADR 0029, "Claim or refuse"). Parsed in a step, never in the body: zod is
// not part of the body bundle.

import { z } from "zod";
import { SCHEMA_VERSION, type CandidateState } from "./candidate-workflow.ts";

const candidateStateSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    key: z.string().startsWith("candidate:"),
    number: z.string().regex(/^\+[1-9]\d{7,14}$/),
    outstandingDocuments: z.array(z.string()),
    slot: z.enum(["none", "offered", "booked"]),
    handover: z.boolean(),
    terminated: z.boolean(),
    processedEvents: z.array(z.string()),
    completedEffects: z.array(z.string()),
    lastActivityAt: z.number().int().nonnegative(),
  })
  .strict();

export type ParsedState = { readonly ok: true; readonly state: CandidateState } | { readonly ok: false; readonly reason: string };

export function parseCandidateState(input: unknown): ParsedState {
  const result = candidateStateSchema.safeParse(input);
  if (result.success) return { ok: true, state: result.data };
  // The reason names paths and expectations only; a value could be the number.
  const reason = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.code}`)
    .join("; ");
  return { ok: false, reason };
}
