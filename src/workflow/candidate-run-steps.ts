// The "use step" functions of the candidate run (ADR 0029). Every clock read,
// env read, crypto, send, log, and every call into the Workflow runtime API
// lives here. The body in candidate-run.ts stays deterministic and reaches the
// outside world only through these.

import { getRun, getHookByToken, resumeHook, start } from "workflow/api";
import { getWorkflowMetadata } from "workflow";
import {
  acknowledgement,
  applicationEvent,
  sendWhatsAppText,
  whatsAppCredentialsFromEnv,
} from "../channel/whatsapp.ts";
import { ingest, type CandidateState } from "./candidate-workflow.ts";
import { parseCandidateState, type ParsedState } from "./candidate-state-schema.ts";
import {
  HOOK_FORCE_CLAIM_SPEC_VERSION,
  intervalsFromEnv,
  type AuditRecord,
  type CandidateRunInput,
  type Delivery,
  type Intervals,
  type RunMessage,
} from "./candidate-run-machine.ts";
import { currentDeploymentId, DEPLOYMENT_ROUTE, servingDomain } from "./deployment.ts";

export interface Boot {
  readonly now: number;
  readonly deploymentId: string;
  readonly runId: string;
  readonly workflowId: string;
}

export async function bootStep(key: string): Promise<Boot> {
  "use step";
  const meta = getWorkflowMetadata();
  const deploymentId = await currentDeploymentId();
  console.log(`[candidate-run] boot key=${key} run=${meta.workflowRunId} deployment=${deploymentId}`);
  return { now: Date.now(), deploymentId, runId: meta.workflowRunId, workflowId: meta.workflowName };
}

export async function clockStep(): Promise<number> {
  "use step";
  return Date.now();
}

export async function intervalsStep(): Promise<Intervals> {
  "use step";
  return intervalsFromEnv(process.env);
}

// Process one delivery: dedup, advance the state, and send the once-only
// role-naming acknowledgement. Missing credentials throw, so the event stays
// uncommitted rather than silently counting as acknowledged.
export async function handleDeliveryStep(state: CandidateState, delivery: Delivery): Promise<CandidateState> {
  "use step";
  const event = applicationEvent(delivery, delivery.role, delivery.messageIdHash, Date.now());
  let acknowledged = false;
  const after = await ingest(state, event, async (effect) => {
    const creds = whatsAppCredentialsFromEnv();
    if (!creds) throw new Error("WhatsApp credentials are not configured; cannot acknowledge");
    await sendWhatsAppText(creds, state.number, acknowledgement(effect.role));
    acknowledged = true;
  });
  console.log(
    `[candidate-run] delivery key=${state.key} acknowledged=${acknowledged} processedEvents=${after.processedEvents.length} completedEffects=${after.completedEffects.length}`,
  );
  return after;
}

/** Send a message to whichever run holds the token. */
export async function resumeTokenStep(key: string, message: RunMessage): Promise<string> {
  "use step";
  const resumed = await resumeHook(key, message);
  console.log(`[candidate-run] sent ${message.kind} key=${key} to=${resumed.runId}`);
  return resumed.runId;
}

// Ask our own domain which deployment serves it. Null means no domain is
// configured (the local world) or the answer was unusable; the caller then
// re-arms rather than guessing. Never "latest" (ADR 0029).
export async function resolveServingDeploymentStep(): Promise<string | null> {
  "use step";
  const domain = servingDomain();
  if (!domain) return null;
  const res = await fetch(`https://${domain}${DEPLOYMENT_ROUTE}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.warn(`[candidate-run] serving deployment lookup answered ${res.status}`);
    return null;
  }
  const body = (await res.json()) as { deploymentId?: unknown };
  return typeof body.deploymentId === "string" && body.deploymentId && body.deploymentId !== "latest"
    ? body.deploymentId
    : null;
}

export async function startSuccessorStep(
  workflowId: string,
  key: string,
  state: CandidateState,
  predecessorRunId: string,
  target: string,
): Promise<string> {
  "use step";
  const input: CandidateRunInput = { start: "successor", key, state, predecessorRunId };
  const run = await start({ workflowId }, [input], {
    deploymentId: target,
    specVersion: HOOK_FORCE_CLAIM_SPEC_VERSION,
    experimental_retention: 0,
  });
  console.log(`[candidate-run] successor started key=${key} run=${run.runId} target=${target}`);
  return run.runId;
}

export async function cancelRunStep(runId: string, reason: string): Promise<void> {
  "use step";
  await getRun(runId).cancel({ cancelReason: reason });
}

export type TokenOwner =
  | { readonly owner: "me" }
  | { readonly owner: "none" }
  | { readonly owner: "other"; readonly runId: string; readonly running: boolean };

/** Who holds the token now, from the World's view. */
export async function tokenOwnerStep(key: string, myRunId: string): Promise<TokenOwner> {
  "use step";
  let runId: string;
  try {
    runId = (await getHookByToken(key)).runId;
  } catch (error) {
    if (isNamed(error, "HookNotFoundError")) return { owner: "none" };
    throw error;
  }
  if (runId === myRunId) return { owner: "me" };
  const status = await getRun(runId).status;
  return { owner: "other", runId, running: status === "pending" || status === "running" };
}

export async function runEndedStep(runId: string): Promise<boolean> {
  "use step";
  try {
    const status = await getRun(runId).status;
    return status !== "pending" && status !== "running";
  } catch (error) {
    if (isNamed(error, "WorkflowRunNotFoundError") || isNamed(error, "RunExpiredError")) return true;
    throw error;
  }
}

export async function parseStateStep(input: unknown): Promise<ParsedState> {
  "use step";
  return parseCandidateState(input);
}

// One structured line per record, the same console sink the Connect broker
// uses. Task 1.11 replaces the sink with the audit trail; the record shape is
// what it will carry.
export async function auditStep(record: AuditRecord): Promise<void> {
  "use step";
  console.log("AUDIT " + JSON.stringify(record));
}

export async function logStep(line: string): Promise<void> {
  "use step";
  console.log(`[candidate-run] ${line}`);
}

function isNamed(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}
