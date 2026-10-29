// The candidate run's state and its pure reducer (Tasks 1.2 and 1.3).
//
// The state is what one durable Workflow SDK run holds for one candidate
// (ADR 0029): the opaque key, the number (only because the acknowledgement
// send needs it), minimal logistics, and the correlation bookkeeping that makes
// at-least-once delivery idempotent. Deliberately not a candidate record: no
// name, ID number, address, photo, email or CV (ADR 0006, ADR 0012).
//
// Everything here is pure and imports nothing, so the run body can import it
// (eve's build refuses a body that reaches Node builtins) and the tests prove
// it without a runtime. Clocks, crypto, sends and logs live in the run's steps.

export type SlotStatus = "none" | "offered" | "booked";

export interface CandidateState {
  /** Bumped when the shape changes; a successor refuses a version it cannot read (ADR 0029). */
  readonly schemaVersion: 1;
  /** The opaque candidate key: `candidate:` plus a keyed hash of the number. */
  readonly key: string;
  /** The verified E.164 number. Held here only because the acknowledgement is sent to it. */
  readonly number: string;
  readonly outstandingDocuments: readonly string[];
  readonly slot: SlotStatus;
  readonly handover: boolean;
  /** The journey has ended (ADR 0030); no further events apply. */
  readonly terminated: boolean;
  /** Keyed hashes of message ids already processed, never raw ids (ADR 0010, ADR 0029). */
  readonly processedEvents: readonly string[];
  /** Ids of side effects already completed, so a replayed step never repeats one. */
  readonly completedEffects: readonly string[];
  /** Epoch ms of the last candidate delivery; the idle window counts from here (ADR 0030). */
  readonly lastActivityAt: number;
}

export const SCHEMA_VERSION = 1;

export function initialState(key: string, number: string, now: number): CandidateState {
  return {
    schemaVersion: SCHEMA_VERSION,
    key,
    number,
    outstandingDocuments: [],
    slot: "none",
    handover: false,
    terminated: false,
    processedEvents: [],
    completedEffects: [],
    lastActivityAt: now,
  };
}

// The exact field set the state may hold, so a test can assert no candidate
// record field creeps in (ADR 0006).
export const STATE_FIELDS = [
  "schemaVersion",
  "key",
  "number",
  "outstandingDocuments",
  "slot",
  "handover",
  "terminated",
  "processedEvents",
  "completedEffects",
  "lastActivityAt",
] as const;

// How many recent event and effect ids a run keeps. Meta redelivers within
// hours, never across hundreds of later messages, so a sliding window bounds
// the state for a multi-week journey.
export const CORRELATION_WINDOW = 200;

function remember(ids: readonly string[], id: string): string[] {
  return [...ids, id].slice(-CORRELATION_WINDOW);
}

// --- Inbound events and side effects ------------------------------------
//
// An event is a correlated, at-least-once inbound delivery whose `id` is the
// dedup key (the keyed hash of the provider message id). An effect is a side
// effect the reducer decided on, identified by a stable id so it runs at most
// once per run. Effect ids never embed the number.

export type InboundEvent =
  | {
      readonly kind: "application-received";
      readonly id: string;
      readonly number: string;
      readonly role: string;
      readonly at: number;
    }
  | { readonly kind: "documents-updated"; readonly id: string; readonly documents: readonly string[]; readonly at: number }
  | { readonly kind: "handover-requested"; readonly id: string; readonly at: number };

export const ACK_EFFECT_ID = "acknowledge-application";
export const ACK_EFFECT_KIND = "candidate-acknowledged";

export type Effect = { readonly id: typeof ACK_EFFECT_ID; readonly kind: typeof ACK_EFFECT_KIND; readonly role: string };

// --- Pure reducer (ADR 0010) --------------------------------------------

export function applyEvent(
  state: CandidateState,
  event: InboundEvent,
): { state: CandidateState; effects: Effect[] } {
  // A duplicate delivery of the same event is a no-op: no state change and no
  // side effect, so a replay creates no second run and no duplicate action.
  if (state.processedEvents.includes(event.id)) {
    return { state, effects: [] };
  }
  if (state.terminated) {
    return { state, effects: [] };
  }

  const processedEvents = remember(state.processedEvents, event.id);
  const lastActivityAt = Math.max(state.lastActivityAt, event.at);

  switch (event.kind) {
    case "application-received": {
      // A run belongs to one number. An application for another number is a
      // routing fault, not a rekey: refuse it, unrecorded.
      if (event.number !== state.number) {
        return { state, effects: [] };
      }
      // The role-naming acknowledgement is a once-only effect: the effect
      // runner skips it once completed, so a later application from the same
      // candidate is recorded but not acknowledged again.
      return {
        state: { ...state, processedEvents, lastActivityAt },
        effects: [{ id: ACK_EFFECT_ID, kind: ACK_EFFECT_KIND, role: event.role }],
      };
    }
    case "documents-updated":
      return {
        state: { ...state, outstandingDocuments: [...event.documents], processedEvents, lastActivityAt },
        effects: [],
      };
    case "handover-requested":
      return { state: { ...state, handover: true, processedEvents, lastActivityAt }, effects: [] };
  }
}

// --- Once-only effect runner ---------------------------------------------

export async function runEffects(
  state: CandidateState,
  effects: readonly Effect[],
  perform: (effect: Effect) => void | Promise<void>,
): Promise<CandidateState> {
  let next = state;
  for (const effect of effects) {
    // An effect completed in an earlier step is never performed again, even
    // when the step re-runs after a crash or a replay.
    if (next.completedEffects.includes(effect.id)) continue;
    await perform(effect);
    next = { ...next, completedEffects: remember(next.completedEffects, effect.id) };
  }
  return next;
}

// The event is committed only after its effects complete: a failed effect (an
// acknowledgement the Cloud API refused) rejects without a new state, so the
// caller keeps the old one and the next redelivery of the same message id
// retries instead of being deduplicated away.
export async function ingest(
  state: CandidateState,
  event: InboundEvent,
  perform: (effect: Effect) => void | Promise<void>,
): Promise<CandidateState> {
  const { state: advanced, effects } = applyEvent(state, event);
  return runEffects(advanced, effects, perform);
}

// --- Engineer advance (E4) ------------------------------------------------
//
// Logistics-only nudges an engineer applies to a live run. These never move a
// candidate's pipeline status (ADR 0012, ADR 0004).

export type AdvanceAction =
  | { readonly type: "set-documents"; readonly documents: readonly string[] }
  | { readonly type: "request-handover" }
  | { readonly type: "resolve-handover" }
  | { readonly type: "set-slot"; readonly slot: SlotStatus };

export function applyAdvance(state: CandidateState, action: AdvanceAction): CandidateState {
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

export function terminate(state: CandidateState): CandidateState {
  return { ...state, terminated: true };
}
