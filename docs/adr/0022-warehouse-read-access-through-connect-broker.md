# 0022. Warehouse read access through the Connect broker

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

ADR 0009 established a single internal broker over Connect as the only path from our code to external systems (the ATS and Microsoft 365 calendars in Phase 1), issuing short-lived, least-privilege, audit-logged credentials. Phase 4 adds a new external system to reach: the corporate warehouse (Synapse or Fabric), which the funnel dashboard reads (ADR 0021).

How that credential is obtained and used matters here in a way it did not for the workflow tools. The dashboard is a browser-rendered surface, so a warehouse credential must never reach the client. The access must be read-only with no path to writing the warehouse (a PRD exclude). And it must be audited like every other external access, because warehouse reads are part of the compliance trail even when the data is aggregate.

## Decision

All warehouse access goes through the same Connect broker as the ATS and calendars (ADR 0009), as a new named read-only capability. The dashboard's server side requests a short-lived, least-privilege credential scoped to reading the agreed funnel datasets or views only. The broker never issues a write scope to the warehouse, and no warehouse write capability exists in the code.

The credential is obtained and used server-side only and is never exposed to the browser. Every issuance and use is audit-logged (who, what dataset, when, scope, target), consistent with ADR 0009. The broker remains the only path from our code to the warehouse.

## Consequences

The warehouse joins the one audited, least-privilege external-access path, so the reporting surface inherits the same scoping and audit discipline as the rest of the system, and the read-only-forever posture is enforced at the broker rather than trusted. Concentrating warehouse access in the broker also localises the blast radius if Connect or the warehouse connector regresses, which is a benefit on beta software (ADR 0005).

The cost is extending a beta-dependency abstraction (Connect) to another system and connector, and a server-side-only access pattern the dashboard architecture must respect: no direct browser-to-warehouse calls, and the rendering layer reads through our server, not the data store.

## Alternatives considered

A direct warehouse connection string or service credential held by the dashboard. Rejected: it contradicts the scoped, short-lived, audited posture of ADR 0009 and ADR 0006, risks the credential reaching the client, and breaks the single-path audit trail.

A separate, dashboard-specific access path outside the broker. Rejected: it reintroduces the per-site credential handling ADR 0009 exists to prevent and spreads beta-API coupling across another surface.
