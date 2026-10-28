// Prototype for ADR 0029 (Proposed): the route-side API over the per-candidate
// run. Host code, never bundled into a workflow body, so it may import
// `workflow/api` (eve resolves it to its vendored Workflow SDK).

import { getHookByToken, getRun, resumeHook, start } from "workflow/api";
import { candidateRun, type CandidateDelivery, type CandidateRunResult } from "./candidate-run.ts";

export interface DeliveryReceipt {
  readonly action: "started" | "resumed";
  readonly runId: string;
}

function isHookNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "HookNotFoundError";
}

/** Resume the run that owns this key, or start one when none does. */
export async function deliverToCandidateRun(
  key: string,
  delivery: CandidateDelivery,
): Promise<DeliveryReceipt> {
  try {
    const hook = await getHookByToken(key);
    await resumeHook(hook, delivery);
    return { action: "resumed", runId: hook.runId };
  } catch (error) {
    if (!isHookNotFound(error)) throw error;
  }
  const run = await start(candidateRun, [{ key, first: delivery }]);
  return { action: "started", runId: run.runId };
}

/** Prototype inspection: which run owns this key, and its status. */
export async function inspectCandidateRun(
  key: string,
): Promise<{ runId: string; status: string } | null> {
  try {
    const hook = await getHookByToken(key);
    return { runId: hook.runId, status: await getRun(hook.runId).status };
  } catch (error) {
    if (isHookNotFound(error)) return null;
    throw error;
  }
}

/** Prototype spike for the Phase 2 question: end the run and read its state back. */
export async function handOverCandidateRun(key: string): Promise<CandidateRunResult | null> {
  const owner = await inspectCandidateRun(key);
  if (owner === null) return null;
  await resumeHook(key, { kind: "handover" } satisfies CandidateDelivery);
  return getRun<CandidateRunResult>(owner.runId).returnValue;
}
