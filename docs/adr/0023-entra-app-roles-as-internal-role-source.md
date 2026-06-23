# 0023. Entra app-role claims as the single source of internal roles

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security, corporate IT (proposed)

## Context

ADR 0003 puts every internal surface behind one auth interface that returns an authenticated user with id, email, and roles, with Entra-via-Passport as the production provider. It deliberately left one thing open: it says roles map from "Entra group or app-role claims" without choosing between them. ADR 0011 added the channel-identity path for Teams, whose mapping source also "becomes Entra group or app-role claims" at Phase 5. Phase 5 is where the choice can no longer be deferred, because two consumers behind the same interface must both derive the same role set from the same source: the Passport provider for browser and HTTP sign-in, and the channel-identity resolver for Teams senders.

The choice is architectural, not cosmetic. It fixes the claim contract between our application and the corporate Entra tenant, and it fixes the model by which corporate IT administers who may act in our system. Internal authorisation gates who can make or influence a candidate-affecting decision (ADR 0004): the named human who approves, rejects, or adjusts a shortlist (ADR 0016) and the recruiter who acts on a mark (ADR 0019) are authorised by their role. The role source is therefore part of the access-control evidence that the human-in-the-loop guarantee is defensible under POPIA section 71 and the Employment Equity Act.

## Decision

Internal roles are sourced from Entra app-role assignments on our application's enterprise application (app registration), surfaced as the application-roles claim, not from raw Entra security-group membership.

Both consumers behind the ADR 0003 interface derive the same roles from this single source. The Entra-via-Passport provider reads the roles claim from the signed-in user's token. The channel-identity resolver (ADR 0011) resolves a Teams sender's Azure AD identity to its app-role assignments for the same application. The mapping from an Entra app role to the application's existing roles (recruiter, hiring-manager, TA-lead reporting, internal engineering) is explicit, versioned configuration. An identity with no app-role assignment resolves to no role and is refused, which keeps the posture least-privilege by default. Phase 5 introduces no new role; it maps the roles the application already uses.

Corporate IT may still assign a security group to an app role where the tenant supports it, so group-based administration is available without our application ever consuming raw group claims.

## Consequences

App roles are scoped to our application, so corporate IT administers access per application (assigning users or groups to our app roles on the enterprise application) without entangling our authorisation with the corporate's broader, shared group taxonomy. That keeps least-privilege clean and gives a clear audit of who can act in our system. Because the roles claim travels in the token, the browser path needs no extra directory lookup; the Teams path may need a Microsoft Graph lookup of a sender's app-role assignments where the claim is not already to hand.

The cost is that corporate IT must populate app-role assignments for our enterprise application before cutover, which is coordination work and a precondition that can stall the phase. App roles are also less immediately convenient than reusing a security group the corporate already maintains. If the corporate strongly prefers group-based administration and will not assign groups to app roles, that is a superseding ADR with the reasoning recorded, not a silent switch to consuming group claims.

This decision does not change the ADR 0003 interface, the ADR 0008 session shape, or the ADR 0011 resolution contract. It only fixes where the roles come from, so everything downstream of the interface is unaffected, which is the property Phase 5 must preserve.

## Alternatives considered

Entra security-group claims as the role source. Rejected as the default: group claims expose the corporate's wider group taxonomy to our application, are coarser for least-privilege, couple our authorisation to groups maintained for other purposes, and hit the token group-overage limit for users in many groups, which forces a Graph lookup anyway. Kept as the documented fallback if corporate IT requires group-based administration, ideally via groups assigned to our app roles so our application still consumes only app-role claims.

A bespoke role store in our application mapping Azure AD object ids to roles. Rejected: it reintroduces a hand-maintained identity-to-role mapping exactly like the pre-Entra channel configuration that the Phase 5 step in ADR 0011 exists to retire, and it would not inherit the directory-driven joiner, mover, and leaver lifecycle that sourcing from Entra gives.
