// Prototype for ADR 0029 (Proposed): the per-candidate workflow as a durable
// Workflow SDK run, started from the verified /intake route and resumed by a
// hook token for later deliveries. Throwaway: it exists to settle the ADR's open
// questions, not to be the final Task 1.3 implementation.
//
// Shape: one run per workflow key (Task 1.2's `candidate:+27...`). The run
// registers a hook whose token is the key, so the route can find the run for a
// number without a lookup table (`getHookByToken`). Each delivery is a hook
// payload; the pure reducer and once-only effect runner from candidate-workflow
// carry over unchanged and run inside a "use step" so a replay never repeats a
// completed acknowledgement.
//
// This module is the workflow body bundle. eve's build refuses a body module
// that reaches `workflow/api`, Node builtins or `eve/context`, so it imports
// only `workflow` and the step module. The route side is candidate-run-api.ts.

import { createHook } from "workflow";
import {
  forwardDelivery,
  handleDelivery,
  initialState,
  type CandidateDelivery,
} from "./candidate-run-steps.ts";
import type { CandidateLogistics } from "./candidate-workflow.ts";

export type { CandidateDelivery };

export interface CandidateRunInput {
  readonly key: string;
  readonly first: CandidateDelivery;
}

export type CandidateRunResult =
  | { readonly outcome: "handed-over"; readonly state: CandidateLogistics }
  | { readonly outcome: "duplicate-start"; readonly ownerRunId: string };

// The durable body. Deterministic: no clock, env, or I/O here; those live in
// the steps.
export async function candidateRun(input: CandidateRunInput): Promise<CandidateRunResult> {
  "use workflow";
  const inbox = createHook<CandidateDelivery>({ token: input.key });
  // Two first deliveries for one number can race two starts. The token is
  // unique per world, so the loser forwards its delivery to the owner and ends.
  const owner = await inbox.getConflict();
  if (owner) {
    await forwardDelivery(input.key, input.first);
    return { outcome: "duplicate-start", ownerRunId: owner.runId };
  }
  let state = await handleDelivery(await initialState(), input.key, input.first);
  for await (const delivery of inbox) {
    if (delivery.kind === "handover") break;
    state = await handleDelivery(state, input.key, delivery);
  }
  return { outcome: "handed-over", state };
}
