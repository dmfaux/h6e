// Task 1.1: Reusable Connect scoped-credential broker.
//
// The single internal path from the agent to external systems (ATS, Microsoft
// 365 calendars). A caller (a workflow tool or a scheduled job) names a
// capability for one operation and gets back a short-lived, least-privilege
// credential scoped to that operation only. Every issuance and every use is
// audit-logged with who, what, when, scope, and target. This replaces the
// Phase 0 one-off in proof.ts (F1, F2, F3, F4).
//
// Honours: ADR 0009 (one reusable broker, the only path to external systems),
// ADR 0006 (minimal, non-PII reads; the system of record stays put), ADR 0012
// and ADR 0004 (logistics scopes only, never a decision-or-status scope),
// ADR 0005 (Connect is permitted public beta, so it must degrade gracefully).

import {
  getTokenResponse,
  ConnectError,
  type ConnectTokenResponse,
} from "@vercel/connect";

// --- Capability registry (F1) -------------------------------------------
//
// The named capabilities the agent may exercise this phase, each mapped to the
// least-privilege scope it needs and nothing more. A read capability carries
// read scopes only; a write capability carries the narrowest logistics write
// scope (ADR 0012 permits creating/updating calendar events and attaching
// candidate documents, and nothing that moves a candidate's status). The
// connector id itself is configured per environment, never committed.

export type CapabilityMode = "read" | "write";

export interface Capability {
  /** Stable name a caller requests, for example "calendar.freebusy.read". */
  readonly name: string;
  /** The target system, for the audit "target" and operator clarity. */
  readonly system: "m365" | "ats";
  /** Env var holding the Vercel Connect connector id for this system. */
  readonly connectorEnv: string;
  /** Least-privilege scopes this capability is allowed to obtain. */
  readonly scopes: readonly string[];
  readonly mode: CapabilityMode;
}

export const CAPABILITIES = {
  // Read interviewer/hiring-manager free/busy to derive interview slots. The
  // exact read proven against a real system in proof.ts.
  "calendar.freebusy.read": {
    name: "calendar.freebusy.read",
    system: "m365",
    connectorEnv: "M365_CONNECT_CONNECTOR",
    scopes: ["Calendars.Read"],
    mode: "read",
  },
  // Create, update, or cancel an interview calendar event (a logistics write,
  // ADR 0012; never a candidate status change).
  "calendar.event.write": {
    name: "calendar.event.write",
    system: "m365",
    connectorEnv: "M365_CONNECT_CONNECTOR",
    scopes: ["Calendars.ReadWrite"],
    mode: "write",
  },
  // Attach a candidate-supplied document to the system of record (a logistics
  // write, ADR 0012; the agent does not become the durable store, ADR 0006).
  "document.attach": {
    name: "document.attach",
    system: "m365",
    connectorEnv: "M365_CONNECT_CONNECTOR",
    scopes: ["Files.ReadWrite"],
    mode: "write",
  },
  // Read a single candidate logistics field from the ATS (outstanding items,
  // slot status). Read-only; the connector and its scope vocabulary are set
  // per environment once an ATS is named (a Phase 1 open question).
  // ponytail: ATS scope is a least-privilege read placeholder until the ATS is
  // confirmed; swap the scope token when the connector is provisioned.
  "candidate.logistics.read": {
    name: "candidate.logistics.read",
    system: "ats",
    connectorEnv: "ATS_CONNECT_CONNECTOR",
    scopes: ["logistics.read"],
    mode: "read",
  },
} as const satisfies Record<string, Capability>;

export type CapabilityName = keyof typeof CAPABILITIES;

// --- Scope guards -------------------------------------------------------

// Any scope that could move a candidate through the pipeline or record an
// outcome is forbidden outright, on every capability, no matter who asks
// (ADR 0012, ADR 0004). This is the hard line: the broker can never be the
// thing that decides about a candidate.
const DECISION_SCOPE = /status|stage|decision|disposition|outcome|advance|reject|shortlist|\boffer\b|hire|pipeline/i;

// A write-looking scope (same shape as the Phase 0 proof guard). Used to refuse
// a write scope requested against a read-only capability.
const WRITE_SCOPE = /write|send|manage|\.readwrite|full|delete|create/i;

function assertNoDecisionScope(scopes: readonly string[]): void {
  const offending = scopes.filter((s) => DECISION_SCOPE.test(s));
  if (offending.length > 0) {
    throw new BrokerRefusalError(
      `Refusing a decision-or-status scope: ${offending.join(", ")}. ` +
        `The agent never holds a credential that can change a candidate's ` +
        `status or outcome (ADR 0012, ADR 0004).`,
    );
  }
}

// --- Errors -------------------------------------------------------------

// A caller asked for something the broker must never grant (over-broad scope,
// a write on a read capability, a decision scope, an unknown capability). Fail
// closed; this is a programming error, never retry it.
export class BrokerRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerRefusalError";
  }
}

// Connect itself could not issue the credential (network, 5xx, missing
// connector, unconsented grant). The request was legitimate; the dependency is
// unavailable. Callers degrade gracefully: retry later if `retriable`, else
// surface the blocker. The broker never fabricates a credential (ADR 0005).
export class BrokerUnavailableError extends Error {
  readonly retriable: boolean;
  readonly cause?: unknown;
  constructor(message: string, retriable: boolean, cause?: unknown) {
    super(message);
    this.name = "BrokerUnavailableError";
    this.retriable = retriable;
    this.cause = cause;
  }
}

// --- Audit record (F2) --------------------------------------------------

// One record per audited event: who, what, when, scope, target, plus the
// named capability. Never the token value or any read payload, only that an
// issuance or a use happened and against what.
export interface AuditRecord {
  event: "connect.credential.issued" | "connect.credential.used";
  who: string;
  what: string;
  when: string; // ISO 8601 UTC
  scope: readonly string[];
  target: string;
  capability: string;
  detail?: Record<string, unknown>;
}

// --- Broker -------------------------------------------------------------

// The Connect call, isolated so tests can drive issuance and simulate a
// transient Connect failure without a live connector.
export type TokenProvider = (
  connector: string,
  scopes: readonly string[],
) => Promise<ConnectTokenResponse>;

const defaultTokenProvider: TokenProvider = (connector, scopes) =>
  getTokenResponse(connector, {
    subject: { type: "app" }, // the agent itself, never a candidate
    scopes: [...scopes],
  });

export interface IssueRequest {
  capability: CapabilityName;
  /** Who is acting: the agent identity, a workflow tool, or a job id. */
  who: string;
  /** What this credential is for, recorded verbatim in the audit "what". */
  operation: string;
  /**
   * Optional explicit scope request. When given, every scope must be within
   * the capability's allowed scopes; a write or out-of-set scope is refused.
   * Omit it to take the capability's least-privilege scopes as-is.
   */
  scopes?: string[];
  /** Optional audit target override; defaults to the capability's system. */
  target?: string;
}

export interface BrokerOptions {
  getToken?: TokenProvider;
  env?: Record<string, string | undefined>;
  /** Sink for audit records; defaults to console + the in-memory log. */
  onAudit?: (record: AuditRecord) => void;
}

// A short-lived scoped credential. The raw token never leaves the lease: a
// caller passes a closure to `use`, which audits the use and hands the token
// to the closure only for the duration of the call.
export interface Lease {
  readonly capability: CapabilityName;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
  readonly connector: ConnectTokenResponse["connector"];
  use<T>(operation: string, fn: (token: string) => Promise<T>): Promise<T>;
}

export interface Broker {
  readonly auditLog: readonly AuditRecord[];
  issue(request: IssueRequest): Promise<Lease>;
}

export function createBroker(options: BrokerOptions = {}): Broker {
  const getToken = options.getToken ?? defaultTokenProvider;
  const env = options.env ?? process.env;
  const auditLog: AuditRecord[] = [];

  function audit(record: Omit<AuditRecord, "when">): AuditRecord {
    const full: AuditRecord = { ...record, when: new Date().toISOString() };
    auditLog.push(full);
    if (options.onAudit) options.onAudit(full);
    else console.log("AUDIT " + JSON.stringify(full));
    return full;
  }

  async function issue(request: IssueRequest): Promise<Lease> {
    const capability: Capability | undefined = CAPABILITIES[request.capability];
    if (!capability) {
      throw new BrokerRefusalError(`Unknown capability: ${request.capability}`);
    }

    // Decide the scopes, then run every guard before any credential is sought.
    const requested = request.scopes ?? [...capability.scopes];

    // Hard line first: no decision-or-status scope, ever (ADR 0012, 0004).
    assertNoDecisionScope([...requested, ...capability.scopes]);

    // Least privilege: an explicit request may not exceed the capability.
    if (request.scopes) {
      const overBroad = requested.filter((s) => !capability.scopes.includes(s));
      if (overBroad.length > 0) {
        throw new BrokerRefusalError(
          `Capability "${capability.name}" does not allow scope(s): ` +
            `${overBroad.join(", ")}. Allowed: ${capability.scopes.join(", ")}.`,
        );
      }
      if (capability.mode === "read") {
        const writeish = requested.filter((s) => WRITE_SCOPE.test(s));
        if (writeish.length > 0) {
          throw new BrokerRefusalError(
            `Capability "${capability.name}" is read-only; refusing write ` +
              `scope(s): ${writeish.join(", ")} (least privilege, ADR 0009).`,
          );
        }
      }
    }

    const connector = env[capability.connectorEnv];
    if (!connector) {
      throw new BrokerUnavailableError(
        `No connector configured for "${capability.name}": ` +
          `${capability.connectorEnv} is not set.`,
        false,
      );
    }

    let issued: ConnectTokenResponse;
    try {
      issued = await getToken(connector, requested);
    } catch (error) {
      throw toUnavailable(error, capability.name);
    }

    const target = request.target ?? `${capability.system} (${capability.name})`;

    audit({
      event: "connect.credential.issued",
      who: request.who,
      what: request.operation,
      scope: requested,
      target,
      capability: capability.name,
      detail: {
        connector: issued.connector.uid,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        shortLived:
          issued.expiresAt - Date.now() > 0 &&
          issued.expiresAt - Date.now() <= 24 * 60 * 60 * 1000,
      },
    });

    return {
      capability: request.capability,
      scopes: requested,
      expiresAt: issued.expiresAt,
      connector: issued.connector,
      async use<T>(operation: string, fn: (token: string) => Promise<T>): Promise<T> {
        let ok = true;
        try {
          return await fn(issued.token);
        } catch (error) {
          ok = false;
          throw error;
        } finally {
          audit({
            event: "connect.credential.used",
            who: request.who,
            what: operation,
            scope: requested,
            target,
            capability: capability.name,
            detail: { ok },
          });
        }
      },
    };
  }

  return {
    get auditLog() {
      return auditLog;
    },
    issue,
  };
}

// Map a Connect failure to a graceful-degradation error (F4). 5xx, timeouts,
// and network faults are transient and retriable; auth/not-found are not, but
// both fail closed without a fabricated credential.
function toUnavailable(error: unknown, capability: string): BrokerUnavailableError {
  if (error instanceof ConnectError) {
    const status = error.status ?? 0;
    const retriable = status === 0 || status >= 500 || /timeout|temporar/i.test(error.message);
    return new BrokerUnavailableError(
      `Connect could not issue a credential for "${capability}" ` +
        `(code=${error.code ?? "?"}, status=${error.status ?? "?"}): ${error.message}`,
      retriable,
      error,
    );
  }
  // A non-Connect throw (e.g. a network TypeError from fetch) is transient.
  return new BrokerUnavailableError(
    `Connect call failed for "${capability}": ` +
      (error instanceof Error ? error.message : String(error)),
    true,
    error,
  );
}
