# 0003. Microsoft-first identity behind a swappable auth interface

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

The target is a South African corporate that runs Microsoft 365 and Entra ID, with internal SSO, MFA, and conditional access already managed there. Internal surfaces (recruiter tooling, approval flows, the dashboard) must eventually sit behind that. But during early build we want simple credential login so we are not blocked on IdP integration to test the pipeline.

## Decision

Internal identity is Microsoft Entra ID, fronted by Vercel Passport, for the long term. All internal surfaces depend on our own auth interface, never on a provider directly. The interface returns an authenticated user with id, email, and roles. We ship two implementations behind it: a development credential provider (username and password) used during early build, and an Entra-via-Passport provider that replaces it by configuration. Selection is by environment variable. The dev provider cannot run in production. Roles are mapped through the interface from day one, so route guards never reach into provider internals.

Candidate identity is out of scope for this decision: candidates are identified by their verified WhatsApp number through Chat SDK, not by any login.

## Consequences

We can build and test internal surfaces immediately without an IdP, then swap to Entra later as a configuration change and one new adapter, with no downstream code change if the seam holds. The risk is the dev provider leaking into production; this is mitigated by gating it to refuse to start outside development. We do not get automated account lifecycle from the directory (that is Enterprise Managed Users, excluded by ADR 0005), so builder-account provisioning is manual for now.

## Alternatives considered

Integrating Entra from the start. Rejected: blocks early testing on IdP setup and tenant access for no early benefit.

Abstracting identity but hardwiring authorisation to the dev provider's assumptions. Rejected: this is the usual reason an auth swap becomes a rewrite, so roles are part of the interface from the start.