# 0008. Stateless signed sessions for internal auth

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

ADR 0003 defines a swappable auth interface for internal surfaces: it returns an authenticated user with id, email, and roles, ships a dev credential provider for early build and an Entra-via-Passport provider for later, selects between them by environment variable, and requires the dev provider to refuse to start in production. It deliberately stops at the interface. It does not say how an authenticated session is represented, how it is carried between requests, or whether internal auth needs a server-side session store.

Phase 0 has to answer that, because it builds the dev provider and the route guards. Two constraints shape the answer. First, Phase 0 is a deliberately thin walking skeleton (see the Phase 0 spec and the PRD): adding a session datastore is stateful infrastructure the skeleton does not otherwise need. Second, the session representation must survive the later swap to Entra (ADR 0003, Phase 5) without a downstream rewrite, which is the whole point of the swappable interface.

## Decision

Internal auth sessions are self-contained, signed tokens carried by the client, with no server-side session store. Both providers behind the ADR 0003 interface mint the same session shape, carrying id, email, and roles: the dev credential provider issues it after checking a username and password against a configured user list; the Entra-via-Passport provider issues it from Entra claims later. The signing secret is an environment secret, set distinctly per environment. Route guards read identity and roles from the verified token and never reach into a provider. Sessions are short-lived.

This does not change ADR 0003's production-refusal rule; it only fixes how the session itself is shaped, so that rule continues to apply to provider selection as before.

## Consequences

The Phase 0 spine stays stateless: no database or key-value store is pulled in just to hold sessions, which keeps the skeleton thin. The Entra swap stays clean because the session contract is provider-independent: Passport mints the same token from Entra claims and the route guards do not change. The signing secret becomes a managed secret per environment, one more thing that must be set correctly in production.

The cost is that stateless tokens cannot be revoked server-side before they expire, so we keep them short-lived and accept that trade for internal, low-volume, build-team use during early phases. If internal surfaces later need immediate revocation, idle timeouts, or other server-side session features, that is a new decision recorded as its own ADR, not a quiet addition of a session store.

## Alternatives considered

A server-side session store (a database or key-value store) keyed by a session id cookie. Rejected for now: it adds a stateful dependency the walking skeleton does not otherwise need, and that the Entra swap would not require either, to buy revocation we do not yet need.

Provider-specific session handling, where the dev provider stores sessions one way and Entra does it another. Rejected: it reintroduces exactly the provider coupling ADR 0003 exists to remove, and would turn the Phase 5 swap back into a rewrite.
