// The per-candidate durable run (ADR 0029, ADR 0030).
//
// One Workflow SDK run per candidate holds the token named by the opaque key,
// processes the deliveries the verified /intake route resumes it with, sends
// the once-only acknowledgement, moves itself to the deployment that is now
// serving (handoff), and ends at journey end or after 30 days of silence.
//
// This module is the workflow body bundle. eve's build refuses a body that
// reaches `workflow/api`, Node builtins or `eve/context`, so it imports only
// `workflow`, the steps module, and the pure protocol and reducer modules.
// The body sequences steps; the decisions are in candidate-run-machine.ts.

import { createHook, sleep } from "workflow";
import {
  auditStep,
  bootStep,
  cancelRunStep,
  clockStep,
  handleDeliveryStep,
  intervalsStep,
  logStep,
  parseStateStep,
  resolveServingDeploymentStep,
  resumeTokenStep,
  runEndedStep,
  startSuccessorStep,
  tokenOwnerStep,
  type Boot,
} from "./candidate-run-steps.ts";
import {
  abandonHandoff,
  closingRecord,
  nextWake,
  onMessage,
  recoveryBackoffMs,
  SERVING,
  whatIsDue,
  type CandidateRunInput,
  type CloseReason,
  type HeldMessage,
  type Intervals,
  type RunMessage,
  type RunMode,
  type Step,
} from "./candidate-run-machine.ts";
import { applyAdvance, initialState, terminate, type CandidateState } from "./candidate-workflow.ts";

export type { CandidateRunInput };

export type CandidateRunResult =
  | { readonly outcome: "closed"; readonly reason: CloseReason }
  | { readonly outcome: "handed-over"; readonly successorRunId: string }
  | { readonly outcome: "duplicate-start"; readonly ownerRunId: string }
  | { readonly outcome: "refused"; readonly reason: string };

// eve's ambient `workflow` types export createHook but not the Hook type.
type Hook<T> = ReturnType<typeof createHook<T>>;

type Wake = { readonly kind: "timer" } | { readonly kind: "message"; readonly message: RunMessage };

function hookOrTimer(hook: Hook<RunMessage>, timer: Promise<void>): Promise<Wake> {
  return Promise.race([
    hook.then((message): Wake => ({ kind: "message", message })),
    timer.then((): Wake => ({ kind: "timer" })),
  ]);
}

// The SDK rejects a hook await with HookForceClaimedError when another run
// takes the token. Matched by name: the class identity differs between the
// workflow VM and the host, as eve's own hook-ownership helper notes.
function isForceClaimed(error: unknown): error is { claimedByRunId: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "HookForceClaimedError" &&
    "claimedByRunId" in error &&
    typeof error.claimedByRunId === "string"
  );
}

// Inside eve's workflow VM a conflicting `getConflict()` rejects with
// HookConflictError carrying `conflictingRunId` rather than resolving with
// the owner (the VM cannot build a Run object), which is also how eve's own
// hook-ownership helper reads it. Both shapes resolve to the owner's run id.
async function tokenConflict(hook: Hook<RunMessage>): Promise<string | null> {
  try {
    const owner = await hook.getConflict();
    return owner ? owner.runId : null;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "HookConflictError" &&
      "conflictingRunId" in error &&
      typeof error.conflictingRunId === "string"
    ) {
      return error.conflictingRunId;
    }
    throw error;
  }
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    return `${error.name}: ${message}`;
  }
  return String(error);
}

export async function candidateRun(input: CandidateRunInput): Promise<CandidateRunResult> {
  "use workflow";
  const key = input.key;
  const boot = await bootStep(key);
  const intervals = await intervalsStep();

  let hook: Hook<RunMessage>;
  let state: CandidateState;
  let pending: readonly HeldMessage[];

  if (input.start === "fresh") {
    // Two first messages from one number can both start a run. The token is
    // unique per World, so the loser forwards its delivery to the owner and
    // ends without doing anything else (ADR 0029, Ingress).
    hook = createHook<RunMessage>({ token: key });
    const owner = await tokenConflict(hook);
    if (owner) {
      await resumeTokenStep(key, input.first);
      await logStep(`duplicate start forwarded key=${key} owner=${owner}`);
      return { outcome: "duplicate-start", ownerRunId: owner };
    }
    state = initialState(key, input.first.number, boot.now);
    pending = [input.first];
  } else {
    // A successor validates the state before it claims anything, and refuses
    // through the token, which still reaches the predecessor (ADR 0029,
    // Claim or refuse).
    const parsed = await parseStateStep(input.state);
    if (!parsed.ok) {
      await resumeTokenStep(key, { kind: "handoff.rejected", successorRunId: boot.runId });
      await logStep(`successor refused state key=${key} predecessor=${input.predecessorRunId} reason=${parsed.reason}`);
      return { outcome: "refused", reason: parsed.reason };
    }
    hook = createHook<RunMessage>({ token: key, experimental_force: true });
    const stillHeld = await tokenConflict(hook);
    if (stillHeld) {
      // The predecessor's runtime predates hook takeover, so the World declined.
      await resumeTokenStep(key, { kind: "handoff.rejected", successorRunId: boot.runId });
      await logStep(`successor could not claim key=${key} holder=${stillHeld}`);
      return { outcome: "refused", reason: "token could not be taken over" };
    }
    state = parsed.state;
    pending = [];
  }

  const run = new Serving(key, boot, intervals, hook, state, pending, input.start === "successor" ? input.predecessorRunId : null);
  // A run ends only through journey end, idle expiry, a completed handoff, or
  // a refused or cancelled successor. Anything else that escapes the loop
  // would release the token, and the next delivery would start an empty run
  // (ADR 0029, "Never end holding the token by accident"). So an unexpected
  // failure is recorded, the body backs off, and it resumes with the state
  // it had, abandoning any handoff that was in flight rather than starting a
  // second successor. Only a takeover of the token by a run we did not start
  // ends it, because serving without the token is impossible.
  for (let failures = 0; ; ) {
    try {
      return await run.serve();
    } catch (error) {
      if (isForceClaimed(error)) {
        await logStep(`token taken by run ${error.claimedByRunId}; closing key=${key}`);
        return run.close("token-claimed");
      }
      failures += 1;
      const reason = describe(error);
      await auditStep({
        audit: "candidate.run.recovered",
        key,
        reason,
        at: new Date(await clockStep()).toISOString(),
        failures,
      });
      await sleep(recoveryBackoffMs(failures));
      const closed = await run.recover(reason);
      if (closed) return closed;
    }
  }
}

// The successor's prelude: process nothing until the predecessor commits what
// it held, buffering what arrives meanwhile. The commit's messages come first,
// then the buffer; dedup absorbs any overlap. A predecessor that ended without
// committing (its deployment gone, say) is noticed on a deadline, and the
// successor then serves with its buffer alone.
async function awaitCommit(
  hook: Hook<RunMessage>,
  predecessorRunId: string,
  intervals: Intervals,
): Promise<readonly HeldMessage[]> {
  const buffered: HeldMessage[] = [];
  for (;;) {
    const woke = await hookOrTimer(hook, sleep(2 * intervals.handoffDeadlineMs));
    if (woke.kind === "timer") {
      if (await runEndedStep(predecessorRunId)) {
        await logStep(`predecessor ${predecessorRunId} ended without committing; serving ${buffered.length} buffered`);
        return buffered;
      }
      continue;
    }
    const message = woke.message;
    if (message.kind === "handoff.commit") return [...message.held, ...buffered];
    if (message.kind === "handoff.rejected") continue;
    buffered.push(message);
  }
}

class Serving {
  private mode: RunMode = SERVING;
  private handoffAt: number;
  private wake: Promise<void> | null = null;
  private successorRunId: string | null = null;

  constructor(
    private readonly key: string,
    private readonly boot: Boot,
    private readonly intervals: Intervals,
    private hook: Hook<RunMessage>,
    private state: CandidateState,
    private pending: readonly HeldMessage[],
    /** The predecessor whose commit a successor waits for before serving. */
    private commitFrom: string | null,
  ) {
    this.handoffAt = boot.now + intervals.handoffMs;
  }

  async serve(): Promise<CandidateRunResult> {
    if (this.commitFrom !== null) {
      this.pending = await awaitCommit(this.hook, this.commitFrom, this.intervals);
      this.commitFrom = null;
    }
    const queued = this.pending;
    this.pending = [];
    const closed = await this.execute(queued.map((message): Step => ({ do: "process", message })));
    if (closed) return this.close(closed);

    for (;;) {
      if (this.mode.mode === "handing-off") {
        const result = await this.handOff(this.mode.target);
        if (result) return result;
        continue;
      }
      if (this.wake === null) {
        const now = await clockStep();
        const due = whatIsDue(now, this.handoffAt, this.state.lastActivityAt, this.intervals);
        if (due === "idle-expiry") return this.close("idle-expiry");
        if (due === "handoff") {
          const target = await resolveServingDeploymentStep();
          if (target && target !== this.boot.deploymentId) {
            this.mode = { mode: "handing-off", target, held: [] };
            continue;
          }
          this.handoffAt = now + this.intervals.handoffMs;
          continue;
        }
        this.wake = sleep(new Date(nextWake(this.handoffAt, this.state.lastActivityAt, this.intervals)));
      }
      const woke = await hookOrTimer(this.hook, this.wake);
      if (woke.kind === "timer") {
        this.wake = null;
        continue;
      }
      const next = onMessage(this.mode, woke.message, this.boot.deploymentId);
      this.mode = next.mode;
      const closed = await this.execute(next.steps);
      if (closed) return this.close(closed);
    }
  }

  // The old run's side of a handoff (ADR 0029, Deployment handoff). Returns a
  // result when the run ends, null when it goes back to serving.
  private async handOff(target: string): Promise<CandidateRunResult | null> {
    const successorRunId = await startSuccessorStep(this.boot.workflowId, this.key, this.state, this.boot.runId, target);
    this.successorRunId = successorRunId;
    const deadline = sleep(this.intervals.handoffDeadlineMs);
    for (;;) {
      let woke: Wake;
      try {
        woke = await hookOrTimer(this.hook, deadline);
      } catch (error) {
        if (!isForceClaimed(error)) throw error;
        return this.commit(error.claimedByRunId);
      }
      if (woke.kind === "timer") {
        await cancelRunStep(successorRunId, "candidate run handoff deadline");
        const owner = await tokenOwnerStep(this.key, this.boot.runId);
        if (owner.owner === "other" && owner.running) {
          // The claim landed before the cancel reached it and the successor is
          // still alive: it will serve, so follow the commit path.
          return this.commit(owner.runId);
        }
        if (owner.owner !== "me") {
          // The successor claimed the token and was then cancelled, so the
          // token is free. Retake it without force; if a run we did not start
          // got there first, it is the candidate's run now and gets what we held.
          this.hook = createHook<RunMessage>({ token: this.key });
          const holder = await tokenConflict(this.hook);
          if (holder) return this.commit(holder);
        }
        return this.backToServing("successor did not claim within the deadline");
      }
      const next = onMessage(this.mode, woke.message, this.boot.deploymentId);
      this.mode = next.mode;
      if (this.mode.mode === "serving") {
        // Refused by the successor: the steps carry the audit record and the
        // held messages, which we process ourselves.
        const closed = await this.execute(next.steps);
        if (closed) return this.close(closed);
        this.handoffAt = (await clockStep()) + this.intervals.handoffMs;
        return null;
      }
    }
  }

  private async commit(successorRunId: string): Promise<CandidateRunResult> {
    const held = this.mode.mode === "handing-off" ? this.mode.held : [];
    await resumeTokenStep(this.key, { kind: "handoff.commit", held });
    await logStep(`handed over key=${this.key} to=${successorRunId} held=${held.length}`);
    return { outcome: "handed-over", successorRunId };
  }

  private async backToServing(reason: string): Promise<CandidateRunResult | null> {
    this.successorRunId = null;
    const next = abandonHandoff(this.mode, reason);
    this.mode = next.mode;
    const closed = await this.execute(next.steps);
    if (closed) return this.close(closed);
    // The next trigger is a delivery from a newer deployment or the next timer.
    this.handoffAt = (await clockStep()) + this.intervals.handoffMs;
    return null;
  }

  // After an unexpected failure: a handoff that was in flight is abandoned,
  // its successor cancelled on a best-effort basis, and the held messages
  // processed here, so the retry never starts a second successor. The next
  // trigger retries the handoff.
  async recover(reason: string): Promise<CandidateRunResult | null> {
    if (this.mode.mode !== "handing-off") return null;
    if (this.successorRunId !== null) {
      try {
        await cancelRunStep(this.successorRunId, `candidate run recovered: ${reason}`);
      } catch (error) {
        await logStep(`could not cancel successor ${this.successorRunId}: ${describe(error)}`);
      }
    }
    return this.backToServing(`recovered from ${reason}`);
  }

  private async execute(steps: readonly Step[]): Promise<CloseReason | null> {
    for (const step of steps) {
      switch (step.do) {
        case "process": {
          const message = step.message;
          if (message.kind === "delivery") {
            this.state = await handleDeliveryStep(this.state, message);
          } else if (message.kind === "advance") {
            this.state = applyAdvance(this.state, message.action);
          } else {
            this.state = terminate(this.state);
            return "terminated";
          }
          break;
        }
        case "handoff-failed":
          await auditStep({
            audit: "candidate.handoff.failed",
            key: this.key,
            reason: step.reason,
            at: new Date(await clockStep()).toISOString(),
            target: step.target,
            held: step.held,
          });
          break;
        case "begin-handoff":
        case "ignore":
          break;
      }
    }
    return null;
  }

  async close(reason: CloseReason): Promise<CandidateRunResult> {
    await auditStep(closingRecord(this.state, reason, await clockStep()));
    return { outcome: "closed", reason };
  }
}
