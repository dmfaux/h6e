# 0011. Channel-bound internal identity resolution before Entra

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

ADR 0003 puts internal surfaces behind one auth interface that returns an authenticated user with id, email, and roles, with two implementations selected by environment variable: a dev credential provider now and Entra-via-Passport later. That model fits browser and HTTP surfaces where a user signs in. Phase 1 adds an inbound internal surface that does not work that way: recruiters and hiring managers act in Teams, where the user is identified by the channel's sender identity, not by a username and password, and not yet by Entra (the Entra cutover is Phase 5). Teams actions can read and write external systems, so they must be authorised against the same role model, without reaching into a provider and without pulling the Entra integration forward.

## Decision

For inbound channel surfaces (Teams in Phase 1), the auth interface resolves the channel sender identity to the same authenticated user shape (id, email, roles) used everywhere else, via a configured channel-identity mapping. This is a new resolution path behind the existing interface, not a new contract: route guards and tools still depend only on id, email, and roles, never on the channel or a provider. In Phase 1 the mapping is configuration (channel sender to role), the dev-phase analogue of the dev credential provider's configured user list. In Phase 5 the mapping source becomes Entra group or app-role claims, with no change to the interface or to anything downstream of it. Unmapped channel senders are refused, and the mapping and the actions it authorises are audit-logged.

## Consequences

Teams actions are role-gated from day one, and the Phase 5 Entra swap stays a change of mapping source rather than a rewrite, which preserves the ADR 0003 seam. The cost is a configured mapping that must be kept correct and least-privilege during the pilot, and one more thing to migrate at Phase 5. This extends where the interface gets its input from; it does not change the interface contract that guards depend on.

## Alternatives considered

Trusting any member of the Teams workspace. Rejected: it is not least-privilege, and the agent can trigger external reads and writes.

Pulling the Entra integration forward to authorise Teams. Rejected: it drags Phase 5 work into Phase 1 against the phasing, for no early benefit.

A separate, provider-coupled Teams auth path. Rejected: it reintroduces exactly the provider coupling ADR 0003 exists to remove, and would turn the Phase 5 swap back into a rewrite for this surface.
