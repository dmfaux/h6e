// Task 0.6: Connect scoped-token round-trip against one real system.
//
// A single proof path, not a reusable broker. ADR 0009 says Phase 0 proves
// exactly one Connect round-trip and deliberately leaves the reusable
// token-brokering pattern to Phase 1, so this file is intentionally a one-off
// script: it obtains one scoped, short-lived credential through Connect for one
// real system (Microsoft 365 / Outlook, read-only calendar free/busy by
// default), makes one minimal non-PII read, and audit-logs the issuance and the
// use. It does not abstract, cache, or generalise anything for reuse.
//
// Honours: ADR 0009 (one round-trip only, no broker), ADR 0006 (minimal,
// non-PII read; the system of record stays put, no candidate records copied
// in), ADR 0005 (Connect is permitted public beta).

import {
  getTokenResponse,
  ConnectError,
  type ConnectTokenResponse,
} from "@vercel/connect";

// --- Configuration -------------------------------------------------------

// The Connect connector identifier for Microsoft 365 (its human-readable UID
// `oauth/...` or opaque `scl_...` key). Configured per environment, never
// committed. Absent until a real M365 connector is provisioned in Vercel
// Connect, which is the one external dependency Phase 0 flags as able to stall
// the round-trip.
const CONNECTOR = process.env.M365_CONNECT_CONNECTOR;

// The read-only, narrow scope requested (requirement E3). Microsoft Graph's
// read-only calendar permission, enough to read free/busy and nothing more.
// No write scope is ever requested here; the guard below enforces that.
const SCOPES = (process.env.M365_CONNECT_SCOPES ?? "Calendars.Read")
  .split(/[\s,]+/)
  .filter(Boolean);

// Microsoft Graph free/busy endpoint. Returns availabilityView blocks
// (free / busy / tentative), not event subjects, attendees, or any candidate
// PII (ADR 0006). The address read is the agent's own service mailbox, set per
// environment; it is not a candidate.
const GRAPH_GET_SCHEDULE = "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";
const SCHEDULE_ADDRESS = process.env.M365_SCHEDULE_ADDRESS;

// Who is acting. The agent identity (this Vercel project), not a person. Used
// only to attribute the audit record; no candidate identity is involved.
const ACTOR = process.env.CONNECT_ACTOR ?? "recruitment-agent (Phase 0 proof path)";

// --- Audit log -----------------------------------------------------------

// One audit record per audited event. Captures who, what, when, scope, and
// target (requirement E2). Never records the token value or any read payload,
// only that issuance and use happened and against what.
interface AuditRecord {
  event: "connect.token.issued" | "connect.read.performed";
  who: string;
  what: string;
  when: string; // ISO 8601 UTC
  scope: string[];
  target: string;
  detail?: Record<string, unknown>;
}

const auditLog: AuditRecord[] = [];

function audit(record: Omit<AuditRecord, "when">): AuditRecord {
  const full: AuditRecord = { ...record, when: new Date().toISOString() };
  auditLog.push(full);
  // Emit as a structured line so the round-trip is auditable from run output.
  console.log("AUDIT " + JSON.stringify(full));
  return full;
}

// --- Guards --------------------------------------------------------------

// Refuse to request any write-looking scope (requirement E3, ADR 0009: Phase 0
// adds no write scope). Fails closed rather than silently widening the grant.
function assertReadOnly(scopes: string[]): void {
  const writeish = scopes.filter((s) => /write|send|manage|\.readwrite|full/i.test(s));
  if (writeish.length > 0) {
    throw new Error(
      `Refusing to request non-read-only scope(s): ${writeish.join(", ")}. ` +
        `Phase 0 requests a read-only narrow scope only (E3, ADR 0009).`,
    );
  }
}

// --- Blocking note -------------------------------------------------------

// The round-trip cannot be proven without a reachable system. Rather than fake
// a response, surface exactly what is missing and stop (the goal's instruction,
// and the phase spec's "Connect proof blocked on external access" risk).
function blocked(reason: string, missing: string[]): never {
  console.error("");
  console.error("BLOCKED: Connect round-trip needs a reachable system.");
  console.error("Reason: " + reason);
  if (missing.length > 0) {
    console.error("Missing:");
    for (const m of missing) console.error("  - " + m);
  }
  console.error(
    "Action: provision a Microsoft 365 Connect connector (or a confirmed ATS " +
      "read-only connector) in Vercel Connect for this project, consent a " +
      "read-only calendar grant, then re-run. Task 0.6 stays not-done until a " +
      "real read response and its audit record are surfaced.",
  );
  process.exitCode = 2;
  // Throwing keeps the failure terminal and prevents any pretend success.
  throw new Error("BLOCKED: " + reason);
}

// --- Proof path ----------------------------------------------------------

async function run(): Promise<void> {
  console.log("Task 0.6 Connect round-trip proof path");
  console.log("Target: Microsoft 365 / Outlook, read-only calendar free/busy");
  console.log("Requested scope: " + JSON.stringify(SCOPES));
  console.log("");

  assertReadOnly(SCOPES);

  // Preconditions for a real attempt. Missing OIDC means the Vercel project
  // identity that Connect authenticates against is absent; missing connector
  // means no M365 connector is configured to obtain a token from.
  const missing: string[] = [];
  if (!process.env.VERCEL_OIDC_TOKEN) {
    missing.push(
      "VERCEL_OIDC_TOKEN (the Vercel project identity Connect exchanges; " +
        "present on Vercel, or via `vercel env pull` locally)",
    );
  }
  if (!CONNECTOR) {
    missing.push(
      "M365_CONNECT_CONNECTOR (the Microsoft 365 Connect connector id; none " +
        "is configured for this project)",
    );
  }
  if (missing.length > 0) {
    blocked("required inputs for a real Connect round-trip are not present", missing);
  }

  // 1. Obtain a scoped, short-lived credential through Connect (requirement E1).
  let issued: ConnectTokenResponse;
  try {
    issued = await getTokenResponse(CONNECTOR!, {
      subject: { type: "app" }, // the agent itself, not a candidate
      scopes: SCOPES,
    });
  } catch (error) {
    if (error instanceof ConnectError) {
      blocked(
        `Connect could not issue a token for connector "${CONNECTOR}" ` +
          `(code=${error.code ?? "?"}, status=${error.status ?? "?"}): ${error.message}`,
        [
          "a Microsoft 365 Connect connector installed and consented with a " +
            "read-only calendar grant",
        ],
      );
    }
    throw error;
  }

  const expiresInMs = issued.expiresAt - Date.now();
  // Prove it is short-lived and Connect-issued, not a long-lived static
  // credential. The token value itself is never printed.
  console.log("");
  console.log("Connect-issued token (value withheld):");
  console.log(
    "  " +
      JSON.stringify({
        connector: issued.connector,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        expiresInMinutes: Math.round(expiresInMs / 60000),
        shortLived: expiresInMs > 0 && expiresInMs <= 24 * 60 * 60 * 1000,
        static: false,
      }),
  );

  audit({
    event: "connect.token.issued",
    who: ACTOR,
    what: "issued a scoped short-lived credential via Vercel Connect",
    scope: SCOPES,
    target: `Microsoft 365 (connector ${issued.connector.uid}/${issued.connector.type})`,
    detail: { expiresAt: new Date(issued.expiresAt).toISOString() },
  });

  // 2. Make one minimal, non-PII read with the issued token (requirement E1).
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const body = {
    schedules: [SCHEDULE_ADDRESS ?? "me"],
    startTime: { dateTime: now.toISOString(), timeZone: "UTC" },
    endTime: { dateTime: end.toISOString(), timeZone: "UTC" },
    availabilityViewInterval: 60,
  };

  let response: Response;
  try {
    response = await fetch(GRAPH_GET_SCHEDULE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${issued.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    blocked(
      "the Microsoft Graph free/busy read could not be reached: " +
        (error instanceof Error ? error.message : String(error)),
      ["network reachability to https://graph.microsoft.com"],
    );
  }

  const text = await response.text();
  if (!response.ok) {
    blocked(
      `Microsoft Graph returned ${response.status} ${response.statusText} for the ` +
        `free/busy read: ${text.slice(0, 400)}`,
      ["a consented read-only calendar grant for the configured mailbox"],
    );
  }

  // availabilityView is non-PII: a string of free/busy codes, no subjects.
  console.log("");
  console.log("Real read response from Microsoft 365 (free/busy):");
  console.log("  HTTP " + response.status);
  console.log("  " + text.slice(0, 600));

  audit({
    event: "connect.read.performed",
    who: ACTOR,
    what: "read calendar free/busy (availabilityView) via Microsoft Graph getSchedule",
    scope: SCOPES,
    target: GRAPH_GET_SCHEDULE,
    detail: { httpStatus: response.status, usedConnectToken: true },
  });

  console.log("");
  console.log("Round-trip complete. Audit records:");
  for (const r of auditLog) console.log("  " + JSON.stringify(r));
}

run().catch((error) => {
  // blocked() already printed a clear note and set a non-zero exit code; any
  // other error is a genuine failure. Never fall back to a faked success.
  if (!(error instanceof Error) || !error.message.startsWith("BLOCKED:")) {
    console.error("Proof path failed: " + (error instanceof Error ? error.stack : String(error)));
    process.exitCode = 1;
  }
});
