// The candidate run's protocol, as pure decisions (ADR 0029, ADR 0030).
//
// The run body (candidate-run.ts) only sequences steps. Every decision it has
// to make is here, as a function of plain values: what a message does in each
// mode, whether a delivery triggers a deployment handoff, when the run next
// wakes, and what is due when it does. This module imports nothing, so the
// body can import it and the tests prove it without a runtime.

import type { AdvanceAction } from "./candidate-workflow.ts";

// --- Messages on the hook token ------------------------------------------

export interface Delivery {
  readonly kind: "delivery";
  /** The verified E.164 number. Inside the payload only; the token is the opaque key. */
  readonly number: string;
  /** Keyed hash of the WhatsApp message id, never the raw id. */
  readonly messageIdHash: string;
  readonly role: string;
  /** The deployment whose route accepted this delivery; a different one triggers a handoff. */
  readonly acceptedBy: string;
}

export interface Terminate {
  readonly kind: "terminate";
}

export interface Advance {
  readonly kind: "advance";
  readonly action: AdvanceAction;
}

/** What an old run holds while a handoff is in flight and hands to its successor. */
export type HeldMessage = Delivery | Terminate | Advance;

export interface HandoffRejected {
  readonly kind: "handoff.rejected";
  readonly successorRunId: string;
}

export interface HandoffCommit {
  readonly kind: "handoff.commit";
  readonly held: readonly HeldMessage[];
}

export type RunMessage = HeldMessage | HandoffRejected | HandoffCommit;

// --- Run input ---------------------------------------------------------------

export type CandidateRunInput =
  | { readonly start: "fresh"; readonly key: string; readonly first: Delivery }
  | { readonly start: "successor"; readonly key: string; readonly state: unknown; readonly predecessorRunId: string };

// --- Modes ----------------------------------------------------------------

export type RunMode =
  | { readonly mode: "serving" }
  | {
      readonly mode: "handing-off";
      readonly target: string;
      readonly held: readonly HeldMessage[];
    };

export const SERVING: RunMode = { mode: "serving" };

/** What the body does, in order, after a message. */
export type Step =
  | { readonly do: "process"; readonly message: HeldMessage }
  | { readonly do: "begin-handoff"; readonly target: string }
  | { readonly do: "handoff-failed"; readonly reason: string }
  | { readonly do: "ignore"; readonly message: RunMessage["kind"] };

export function triggersHandoff(delivery: Delivery, currentDeploymentId: string): boolean {
  return delivery.acceptedBy !== currentDeploymentId;
}

// The mode transition table. A delivery accepted by another deployment moves
// the run into a handoff and is held, not processed (ADR 0029). While handing
// off, everything the candidate or an engineer sends is held in arrival order
// so the successor processes it after the commit.
export function onMessage(
  mode: RunMode,
  message: RunMessage,
  currentDeploymentId: string,
): { mode: RunMode; steps: readonly Step[] } {
  switch (mode.mode) {
    case "serving":
      switch (message.kind) {
        case "delivery":
          if (triggersHandoff(message, currentDeploymentId)) {
            return {
              mode: { mode: "handing-off", target: message.acceptedBy, held: [message] },
              steps: [{ do: "begin-handoff", target: message.acceptedBy }],
            };
          }
          return { mode, steps: [{ do: "process", message }] };
        case "terminate":
        case "advance":
          return { mode, steps: [{ do: "process", message }] };
        case "handoff.commit":
          // Only a successor that stopped waiting for its predecessor sees a
          // commit while serving. The held messages are still the candidate's;
          // dedup absorbs any overlap with what it processed itself.
          return { mode, steps: message.held.map((held) => ({ do: "process", message: held })) };
        case "handoff.rejected":
          return { mode, steps: [{ do: "ignore", message: message.kind }] };
      }
      break;
    case "handing-off":
      switch (message.kind) {
        case "delivery":
        case "terminate":
        case "advance":
          return { mode: { ...mode, held: [...mode.held, message] }, steps: [] };
        case "handoff.rejected":
          return {
            mode: SERVING,
            steps: [
              { do: "handoff-failed", reason: `successor ${message.successorRunId} refused the state` },
              ...mode.held.map((held): Step => ({ do: "process", message: held })),
            ],
          };
        case "handoff.commit":
          return { mode, steps: [{ do: "ignore", message: message.kind }] };
      }
  }
}

/** The steps that take a failed handoff back to serving: the audit record, then the held messages. */
export function abandonHandoff(mode: RunMode, reason: string): { mode: RunMode; steps: readonly Step[] } {
  if (mode.mode !== "handing-off") return { mode, steps: [] };
  return {
    mode: SERVING,
    steps: [{ do: "handoff-failed", reason }, ...mode.held.map((held): Step => ({ do: "process", message: held }))],
  };
}

// --- Timers (ADR 0029 Timers, ADR 0030) -------------------------------------
//
// The run waits on its hook raced against one sleep, until the earliest of
// the next handoff and the idle expiry. Both are absolute times derived from
// values the state or the body carries, so a successor re-arms them exactly.
// The intervals live here, in one place; tests pass their own.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface Intervals {
  /** How long a run stays on one deployment before moving itself (ADR 0029). */
  readonly handoffMs: number;
  /** Silence after which a run ends (ADR 0030). Changing it is a change to that ADR. */
  readonly idleExpiryMs: number;
  /** How long an old run waits for its successor to claim the token or refuse. */
  readonly handoffDeadlineMs: number;
}

export const HANDOFF_INTERVAL_MS = 7 * DAY_MS;
export const IDLE_EXPIRY_MS = 30 * DAY_MS;
export const HANDOFF_DEADLINE_MS = 10 * MINUTE_MS;

export const INTERVALS: Intervals = {
  handoffMs: HANDOFF_INTERVAL_MS,
  idleExpiryMs: IDLE_EXPIRY_MS,
  handoffDeadlineMs: HANDOFF_DEADLINE_MS,
};

export function idleExpiryAt(lastActivityAt: number, intervals: Intervals): number {
  return lastActivityAt + intervals.idleExpiryMs;
}

export function nextWake(handoffAt: number, lastActivityAt: number, intervals: Intervals): number {
  return Math.min(handoffAt, idleExpiryAt(lastActivityAt, intervals));
}

export type Due = "idle-expiry" | "handoff" | null;

// Ending beats moving: a run that is both idle-expired and due a handoff ends.
export function whatIsDue(now: number, handoffAt: number, lastActivityAt: number, intervals: Intervals): Due {
  if (now >= idleExpiryAt(lastActivityAt, intervals)) return "idle-expiry";
  if (now >= handoffAt) return "handoff";
  return null;
}

// --- Audit records (ADR 0029, ADR 0030) -----------------------------------
//
// One structured record per event, carrying the opaque key and counts, never
// the number or a raw message id. Task 1.11 replaces the sink; the shape is
// what it will carry.

export type CloseReason = "terminated" | "idle-expiry" | "token-claimed";

export type AuditRecord =
  | {
      readonly audit: "candidate.run.closed";
      readonly key: string;
      readonly reason: CloseReason;
      readonly at: string;
      readonly processedEvents: number;
      readonly completedEffects: number;
      readonly outstandingDocuments: number;
      readonly slot: string;
      readonly handover: boolean;
    }
  | {
      readonly audit: "candidate.handoff.failed";
      readonly key: string;
      readonly reason: string;
      readonly at: string;
      readonly target: string;
      readonly held: number;
    }
  | {
      readonly audit: "candidate.run.recovered";
      readonly key: string;
      readonly reason: string;
      readonly at: string;
      readonly failures: number;
    };

export function closingRecord(
  state: {
    readonly key: string;
    readonly processedEvents: readonly string[];
    readonly completedEffects: readonly string[];
    readonly outstandingDocuments: readonly string[];
    readonly slot: string;
    readonly handover: boolean;
  },
  reason: CloseReason,
  now: number,
): AuditRecord {
  return {
    audit: "candidate.run.closed",
    key: state.key,
    reason,
    at: new Date(now).toISOString(),
    processedEvents: state.processedEvents.length,
    completedEffects: state.completedEffects.length,
    outstandingDocuments: state.outstandingDocuments.length,
    slot: state.slot,
    handover: state.handover,
  };
}

// How long the body pauses before resuming after an unexpected failure, so a
// repeating fault cannot spin the run while it keeps the token.
export function recoveryBackoffMs(failures: number): number {
  return Math.min(MINUTE_MS * 2 ** Math.max(0, failures - 1), 60 * MINUTE_MS);
}
