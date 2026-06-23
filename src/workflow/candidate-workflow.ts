// Task 1.2: Durable per-candidate workflow and idempotent event correlation.
//
// Each candidate runs as one durable eve session keyed on the verified WhatsApp
// number. The session holds only minimal logistics and correlation state via
// `defineState` (outstanding documents, slot status, handover flag, plus the
// dedup and once-only bookkeeping), never a duplicated candidate record. Inbound
// deliveries are at-least-once, so a replayed event is a no-op (no second
// workflow, no duplicate side effect), and a step that re-runs after a crash or
// redeploy never repeats a side effect it already completed.
//
// Honours: ADR 0002 (durability is eve's session plus `defineState`, not a
// hand-rolled store or a bespoke workflow engine), ADR 0010 (idempotent,
// correlated ingress), ADR 0006 and ADR 0012 (minimal logistics state only, no
// candidate record duplicated, no decision-or-status state held), ADR 0011 (the
// candidate's identity is the WhatsApp number).
//
// Boundary (Task 1.2): this module is the correlation and durability machinery
// only. It wires no channel (Task 1.3), no FAQ or handover behaviour (Task 1.4),
// no document collection (Task 1.5), no scheduling (Task 1.7), and makes no
// model call. The logistics fields are held here; the behaviour behind them
// lands in those later tasks. The pure functions below carry the logic and the
// tests; the `defineState`-bound functions are thin durable wrappers over them.

import { defineState } from "eve/context";

// --- State shape (E1, K2; ADR 0006, ADR 0012) ---------------------------
//
// Keys, minimal logistics, and correlation bookkeeping. Deliberately NOT a
// candidate record: no name, ID number, address, photo, email, or CV. The
// system of record stays in the ATS or Azure tenant (ADR 0006); this slot only
// correlates a durable workflow to a candidate and tracks its logistics.

export type SlotStatus = "none" | "offered" | "booked";

export interface CandidateLogistics {
  /** Correlation key: workflowKey() of the verified WhatsApp number (E1). */
  readonly key: string;
  /** Logistics: outstanding document labels still to collect (held, not parsed). */
  readonly outstandingDocuments: readonly string[];
  /** Logistics: interview slot status. */
  readonly slot: SlotStatus;
  /** Logistics: a human handover has been requested on this thread. */
  readonly handover: boolean;
  /** Lifecycle: an engineer terminated this workflow (E4); no further events apply. */
  readonly terminated: boolean;
  /** Correlation: dedup keys of inbound events already processed (E3, ADR 0010). */
  readonly processedEvents: readonly string[];
  /** Correlation: ids of side effects already completed, for resume safety (E2). */
  readonly completedEffects: readonly string[];
}

/** The starting value for a candidate's slot, before any event. */
export function initialLogistics(): CandidateLogistics {
  return {
    key: "",
    outstandingDocuments: [],
    slot: "none",
    handover: false,
    terminated: false,
    processedEvents: [],
    completedEffects: [],
  };
}

// The exact field set the state is allowed to hold. Exported so a test can
// assert no extra (candidate-record) field ever creeps in (ADR 0006).
export const STATE_FIELDS = [
  "key",
  "outstandingDocuments",
  "slot",
  "handover",
  "terminated",
  "processedEvents",
  "completedEffects",
] as const;

// --- Workflow key derivation (E1; ADR 0011) -----------------------------
//
// The verified WhatsApp number is the per-candidate workflow key: the channel's
// continuation token (Task 1.3) and the correlation key are one and the same, so
// two deliveries from the same number always address the same durable session
// and there is never a second workflow. Verification itself is ingress's job
// (ADR 0010, Task 1.3); here we only normalise the already-verified number to a
// stable E.164 form so formatting differences key the same workflow.

export class InvalidWhatsAppNumberError extends Error {
  constructor(raw: string) {
    super(`Not a valid E.164 WhatsApp number: ${JSON.stringify(raw)}`);
    this.name = "InvalidWhatsAppNumberError";
  }
}

function normalizeE164(raw: string): string {
  const stripped = raw.trim().replace(/[\s()\-.]/g, "");
  // E.164: a leading + then a non-zero country-code digit and 7 to 14 more.
  if (!/^\+[1-9]\d{7,14}$/.test(stripped)) {
    throw new InvalidWhatsAppNumberError(raw);
  }
  return stripped;
}

export function workflowKey(verifiedWhatsAppNumber: string): string {
  return `candidate:${normalizeE164(verifiedWhatsAppNumber)}`;
}

// --- Inbound events and side effects ------------------------------------
//
// An event is a correlated, at-least-once inbound delivery; `id` is its dedup
// key (the provider's message id in Task 1.3). An effect is a side effect the
// workflow decided to perform, identified by a stable id so it runs at most
// once. Task 1.2 only proves once-only execution; the concrete performers
// (acknowledgements, document writes, calendar writes) arrive in later tasks.

export type InboundEvent =
  | { readonly kind: "application-received"; readonly id: string; readonly number: string }
  | { readonly kind: "documents-updated"; readonly id: string; readonly documents: readonly string[] }
  | { readonly kind: "handover-requested"; readonly id: string };

export interface Effect {
  readonly id: string;
  readonly kind: string;
}

// --- Pure reducer (E1, E3; ADR 0010) ------------------------------------

export function applyEvent(
  state: CandidateLogistics,
  event: InboundEvent,
): { state: CandidateLogistics; effects: Effect[] } {
  // Idempotent ingress (E3): a duplicate delivery of the same event is a no-op.
  // No state change and no side effect, so a replay creates no second workflow
  // and no duplicate action.
  if (state.processedEvents.includes(event.id)) {
    return { state, effects: [] };
  }
  // A terminated workflow accepts no further events (engineer terminate, E4).
  if (state.terminated) {
    return { state, effects: [] };
  }

  const processedEvents = [...state.processedEvents, event.id];

  switch (event.kind) {
    case "application-received": {
      const key = workflowKey(event.number);
      // Starting the workflow is the once-only side effect. If this number is
      // already keyed, a later application for it records the event but neither
      // restarts the workflow nor re-emits the effect: still one workflow.
      const effects: Effect[] =
        state.key === "" ? [{ id: `started:${key}`, kind: "workflow-started" }] : [];
      return { state: { ...state, key, processedEvents }, effects };
    }
    case "documents-updated":
      return {
        state: { ...state, outstandingDocuments: [...event.documents], processedEvents },
        effects: [],
      };
    case "handover-requested":
      return { state: { ...state, handover: true, processedEvents }, effects: [] };
  }
}

// --- Once-only effect runner (E2; ADR 0002) -----------------------------

export async function runEffects(
  state: CandidateLogistics,
  effects: readonly Effect[],
  perform: (effect: Effect) => void | Promise<void>,
): Promise<CandidateLogistics> {
  let next = state;
  for (const effect of effects) {
    // Resume safety (E2): an effect already completed in a prior step is never
    // performed again, even when the step re-runs after a crash or redeploy.
    // eve replays completed steps; this marker makes our own effects idempotent
    // across that replay.
    if (next.completedEffects.includes(effect.id)) continue;
    await perform(effect);
    next = { ...next, completedEffects: [...next.completedEffects, effect.id] };
    // ponytail: perform-then-record leaves a crash window between the two calls;
    // the upgrade path is an idempotency key on the external call, which the
    // broker and channel own in Tasks 1.3, 1.5, and 1.7.
  }
  return next;
}

// --- Engineer inspect-and-advance (E4) ----------------------------------
//
// Logistics-only operations an engineer applies to a live workflow. These never
// move a candidate's pipeline status (ADR 0012, ADR 0004); they nudge held
// logistics state. Kept as a pure reducer so it is tested without a runtime.

export type AdvanceAction =
  | { readonly type: "set-documents"; readonly documents: readonly string[] }
  | { readonly type: "request-handover" }
  | { readonly type: "resolve-handover" }
  | { readonly type: "set-slot"; readonly slot: SlotStatus };

export function applyAdvance(state: CandidateLogistics, action: AdvanceAction): CandidateLogistics {
  switch (action.type) {
    case "set-documents":
      return { ...state, outstandingDocuments: [...action.documents] };
    case "request-handover":
      return { ...state, handover: true };
    case "resolve-handover":
      return { ...state, handover: false };
    case "set-slot":
      return { ...state, slot: action.slot };
  }
}

// --- Durable binding (ADR 0002) -----------------------------------------
//
// The single durable slot. One value per eve session, so per candidate. eve
// persists it across step boundaries, crashes, redeploys, and multi-day waits.
// This is the whole durable store: no separate database, no bespoke engine. The
// functions below are the thin context-bound wrappers Task 1.3's channel and an
// engineer drive; the logic they call is the pure code above, which the tests
// exercise directly. get()/update() require an active eve context and throw
// outside one (a tool, hook, or channel handler), so they are not unit tested.

export const candidateLogistics = defineState<CandidateLogistics>(
  "candidate.logistics",
  initialLogistics,
);

/** Ingest one inbound event durably: dedup, advance state, run effects once. */
export async function ingest(
  event: InboundEvent,
  perform: (effect: Effect) => void | Promise<void>,
): Promise<CandidateLogistics> {
  const { state, effects } = applyEvent(candidateLogistics.get(), event);
  candidateLogistics.update(() => state);
  const after = await runEffects(candidateLogistics.get(), effects, perform);
  candidateLogistics.update(() => after);
  return after;
}

/** Inspect the current workflow state (E4). */
export function inspect(): CandidateLogistics {
  return candidateLogistics.get();
}

/** Advance a live workflow with a logistics action, no redeploy (E4). */
export function advance(action: AdvanceAction): CandidateLogistics {
  candidateLogistics.update((s) => applyAdvance(s, action));
  return candidateLogistics.get();
}

/** Terminate a live workflow so it accepts no further events (E4). */
export function terminate(): CandidateLogistics {
  candidateLogistics.update((s) => ({ ...s, terminated: true }));
  return candidateLogistics.get();
}
