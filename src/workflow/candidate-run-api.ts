// The route-side resume-or-start decision (ADR 0029, Ingress), over an
// injected runtime API so it is proven without a World. The live binding to
// `workflow/api` is candidate-run-runtime.ts.

import type { Delivery } from "./candidate-run-machine.ts";

export interface DeliveryReceipt {
  readonly action: "started" | "resumed";
  readonly runId: string;
}

/** The two runtime calls a delivery needs. */
export interface CandidateRunApi {
  resumeHook(key: string, delivery: Delivery): Promise<{ runId: string }>;
  start(key: string, first: Delivery, deploymentId: string): Promise<{ runId: string }>;
}

// Under `eve dev`, a hook whose run belongs to a dormant generation (an earlier
// reload) is reported as this rather than as not found. Starting fresh would
// be wrong: the dormant run still holds the token, so the fresh run would
// forward its delivery to a run that never executes again.
export class DormantRunError extends Error {
  readonly key: string;
  constructor(key: string, cause: unknown) {
    super(`the run holding ${key} belongs to a dormant eve dev generation; restart eve dev or clear .workflow-data`, {
      cause,
    });
    this.name = "DormantRunError";
    this.key = key;
  }
}

function isNamed(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}

/** Resume the run that holds this key, or start one when none does. */
export async function deliverToCandidateRun(
  key: string,
  delivery: Delivery,
  api: CandidateRunApi,
): Promise<DeliveryReceipt> {
  try {
    const resumed = await api.resumeHook(key, delivery);
    return { action: "resumed", runId: resumed.runId };
  } catch (error) {
    if (isNamed(error, "DevelopmentRunUnavailableError")) throw new DormantRunError(key, error);
    if (!isNamed(error, "HookNotFoundError")) throw error;
  }
  const run = await api.start(key, delivery, delivery.acceptedBy);
  return { action: "started", runId: run.runId };
}
