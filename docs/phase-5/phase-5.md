# Phase 5: Entra cutover

**Status:** Draft for review
**Type:** Phase spec (one level below the PRD, one level above implementation)
**Phase:** 5 of the programme defined in `docs/prd/prd.md`

## Summary and how it fits

Phase 5 flips the internal identity layer from the development credential provider to Entra-via-Passport, behind the auth interface that has fronted every internal surface since Phase 0, with no change to application code. It is the payoff for the swappable-auth seam the programme has carried from the start: if the seam held, the swap is a configuration change and one live adapter, and nothing downstream of the interface moves. It is also the smallest-surface phase. It adds no candidate behaviour, no model call, no Sandbox, no channel, and no reporting. It changes who authenticates internal users and where their roles come from, and nothing else.

The phase has two cutover paths that resolve to the same role set the application already uses. Browser and HTTP surfaces (recruiter tooling from Phase 1, the funnel dashboard from Phase 4, and any web approval surface) get Passport in front of them, doing the Entra sign-in. The Teams channel surface (recruiter and hiring-manager interaction from Phase 1, the shortlist decision gate from Phase 2, the assessment result from Phase 3) keeps the channel-identity interface from ADR 0011 unchanged and switches only its mapping source, from configured channel-sender-to-role mapping to Entra claims. Both paths read roles from one source (proposed ADR 0023). The dev provider is then decommissioned for internal production surfaces and confirmed unable to start in production. The acceptance bar is outcome-based and unusual: the proof of done is that no downstream code changed.

This is also the phase that lights the Entra-fronted production environment for internal surfaces, because the only thing keeping Phases 1 to 4 in a non-production pilot was the dev provider's refusal to start in production (ADR 0003). Phase 5 removes that constraint. Whether the business then widens beyond the pilot cohort is a separate go decision Phase 5 unblocks, not work Phase 5 performs (see Scope and the consistency note).

Binding ADRs: 0003 (the swappable auth interface and the Entra-via-Passport provider, the decision this phase executes), 0008 (the provider-independent stateless signed session, which Passport must mint from Entra claims unchanged), 0011 (channel-bound identity resolution, whose mapping source becomes Entra claims here), 0005 (Passport must be public beta or GA, not private beta, and Enterprise Managed Users stays excluded), 0006 (no new candidate-data flow), 0007 (one stack, one repo, one auth layer), 0004 with 0016 and 0019 (the decision-gate attribution that must survive the swap), and 0001 (record any new architectural decision as an ADR). One new decision is proposed for this phase and referenced below, pending acceptance: ADR 0023 (Entra app-role claims as the single source of internal roles), which settles the choice ADR 0003 and ADR 0011 deliberately left open.

## Scope

### Includes, made concrete

- **The live Entra-via-Passport provider.** The Phase 0 stub becomes a working provider behind the ADR 0003 interface: it runs the Entra sign-in, validates the result against the corporate tenant, returns an authenticated user with id, email, and roles, and mints the same stateless signed session every provider mints (ADR 0008). It is selected by the existing environment variable, with no new interface.
- **Passport in front of every browser and HTTP internal surface.** Recruiter tooling (Phase 1), the funnel dashboard (Phase 4), and any web approval surface sit behind Passport and Entra: an unauthenticated request is sent to Entra sign-in, a wrong-role request is refused, and a signed-in user reaches every surface without a second login (ADR 0008).
- **Entra-sourced channel identity for Teams.** The channel-identity resolver (ADR 0011) keeps its interface and switches its mapping source from configuration to Entra claims, resolving a Teams sender's Azure AD identity to the same roles. The Phase 2 hiring-manager decision gate and the Phase 3 recruiter result surface keep working and stay attributable to a named corporate identity.
- **Roles from one source.** Entra app-role claims map to the application's existing roles (recruiter, hiring-manager, TA-lead reporting, internal engineering), feeding both the browser login and the channel resolver, least-privilege, with no new role invented (proposed ADR 0023).
- **Decommissioning the dev provider.** The dev credential provider is disabled for all internal production surfaces, no internal production surface accepts a dev-credential session, and the production-refusal guard (built in Phase 0, ADR 0003) is verified rather than assumed. The dev provider is retained only for local and preview non-production use.
- **The Entra-fronted production environment for internal surfaces.** Internal surfaces run in production behind Entra, with the corporate tenant's conditional access and MFA applied (inherited, not re-implemented). The cutover is configuration per environment, not a code change.
- **The seam-held proof, traced and audited.** Sign-ins, claim-to-role resolutions, and refusals are traced and audited on the Phase 0 harness, and the change set shows the swap touched no downstream application code.

### Excludes, pushed to a named phase or out of the programme

- **Enterprise Managed Users and automated account lifecycle.** Private beta, excluded by ADR 0005 and a PRD non-goal. Builder and staff account provisioning stays manual and corporate-IT-owned. Adopt only when EMU reaches GA, as a new ADR (parked future).
- **Any change to candidate-side WhatsApp identity.** Candidates stay identified by their verified WhatsApp number with no login (ADR 0003). The candidate channel is untouched by this phase.
- **Any change to application behaviour, business logic, or data flow.** Workflows, screening, marking, the dashboard's metrics, and the Connect, model, and Sandbox boundaries are unchanged. If a downstream change turns out to be needed to make the swap work, that is a finding against the ADR 0003 seam, not Phase 5 scope (see Risks).
- **A new authorisation model or new roles.** Phase 5 maps the existing role set to Entra claims; it does not redesign role-based access or add roles.
- **New session features beyond ADR 0008.** Server-side revocation, idle timeout, or a session store are out unless a new ADR supersedes ADR 0008 (open question for security).
- **The business go-live and cohort widening.** Phase 5 makes the Entra-fronted production environment possible for internal surfaces. Whether to then run candidate operations in production at scale, and widen beyond the pilot cohort, is a separate decision for the stakeholder, legal, and security (the same sign-off the earlier specs defer to Phase 5 or explicit approval). Phase 5 unblocks it; it does not own the rollout.

## Dependencies

### Inward (what earlier phases must already provide)

- **From Phase 0:** the auth interface (ADR 0003) with id, email, and roles; the Entra-via-Passport provider present as a stub selectable by the environment variable; stateless signed sessions (ADR 0008); the dev provider with its production-refusal guard; route guards that depend only on the interface and roles; a deploying eve project on Vercel through CI with preview and a protected production environment and per-environment secrets; and the eval and tracing harness running in CI as a real gate.
- **From Phase 1:** the channel-identity resolver (ADR 0011) with its configured mapping (the source this phase switches), the recruiter and hiring-manager roles, the browser and HTTP recruiter tooling, and the Teams surface.
- **From Phase 2:** the hiring-manager decision gate in Teams (ADR 0016), whose authorisation must keep resolving to a named, attributable person after the swap (ADR 0004).
- **From Phase 3:** the recruiter assessment-result surface in Teams (ADR 0019), gated the same way.
- **From Phase 4:** the funnel dashboard as a browser surface that depends only on id, email, and roles (ADR 0003) and the TA-lead reporting role, built so the provider swap touches no dashboard code.
- **External prerequisites:** the corporate Entra tenant, an app registration or enterprise application for our application with Passport configured against it, app-role assignments populated by corporate IT, the tenant's conditional access and MFA policies scoped to our application, and a production environment to cut over to. The Entra tenant and app registration are to this phase what the named ATS is to Phase 1 and the named warehouse is to Phase 4: the one external dependency that can stall the build.

### Outward (what Phase 5 leaves for later)

Phase 5 is the last planned phase, so it leaves work to the parked future and to operations, not to a next phase.

- **To the parked future:** Enterprise Managed Users for automated account lifecycle when it reaches GA (a new ADR), bring-your-own-cloud for data residency when GA (the ADR 0006 fallback), and additional candidate channels on the same Chat SDK codebase. None is scheduled.
- **To operations and the business:** the production go-live and the decision to widen the candidate cohort, which Phase 5 unblocks but does not perform.

## User stories by persona

### Recruiter (internal tooling and Teams)

- As a recruiter, I sign in to recruiter tooling with my normal corporate Microsoft account, with the MFA I already use, and not a separate username and password, and I see the same tooling and the same permissions as before.
- As a recruiter, my Teams interactions and the assessment results I read still work and are still gated to my role, now resolved from my corporate identity.

### Hiring manager (Teams)

- As a hiring manager, my approve, reject, or adjust on a shortlist still works, is still attributed to me by name, and is now backed by my verified corporate identity rather than a configured mapping.

### TA lead (dashboard)

- As a TA lead, I open the funnel dashboard with my corporate login and no separate sign-in, and see the same metrics I saw before.

### Engineer

- As an engineer, I flip the provider by configuration per environment and confirm that no application code changed to make the swap, so I know the abstraction held.
- As an engineer, I can trace a sign-in and a claim-to-role resolution end to end, and confirm in CI that the dev provider refuses to start in production.

### Corporate IT and security administrator

- As an IT administrator, I control who has which role in the application by assigning app roles in Entra, so access follows the directory rather than a configuration file the application team maintains.
- As a security owner, internal access now runs behind the corporate identity provider with conditional access and MFA, and the development login is gone from production, which I can verify.

### Legal and data

- As legal, I can point to internal access sitting behind the corporate IdP with MFA, the development provider decommissioned, and every candidate-affecting decision attributed to a verified corporate identity, as a stronger access-control record under POPIA section 71 and the Employment Equity Act.

### Candidate

- As a candidate, nothing changes: I am still reached on WhatsApp by my number, with no login, and Phase 5 does not touch my experience.

## Functional requirements by area

Acceptance criteria describe observable behaviour, not implementation. Priority is within-phase: P0 is must, P1 is should.

### A. The Entra-via-Passport provider

- **A1 (P0).** The Entra provider behind the auth interface returns an authenticated user with id, email, and roles from Entra, selected by the existing environment variable (ADR 0003). Acceptance: with the Entra provider selected, a corporate user completes Entra sign-in and reaches an internal surface as their resolved user; the interface contract is unchanged.
- **A2 (P0).** The provider mints the same stateless signed session every provider mints (ADR 0008), carrying id, email, and roles. Acceptance: the session issued after Entra sign-in has the same shape route guards already read; no session store is introduced.
- **A3 (P0).** Route guards read identity and roles from the interface only, never from the provider (ADR 0003). Acceptance: guards make allow or deny decisions from id, email, and roles alone, with no reference to Passport or Entra internals.

### B. Passport in front of browser and HTTP surfaces

- **B1 (P0).** Every browser and HTTP internal surface (recruiter tooling, the dashboard, any web approval surface) sits behind Passport and Entra. Acceptance: an unauthenticated request is sent to Entra sign-in; a wrong-role request is refused after sign-in.
- **B2 (P0).** There is no separate login across internal surfaces (ADR 0008). Acceptance: a user signed in to one internal surface reaches the others, including the dashboard, without a second sign-in.
- **B3 (P0).** No application code in the dashboard or the recruiter tooling changed to enable the swap (ADR 0003). Acceptance: switching the provider environment variable changes no downstream application code; the change set is confined to provider configuration and the provider adapter.

### C. Entra-sourced channel identity for Teams

- **C1 (P0).** The channel-identity resolver resolves a Teams sender to the application's roles from Entra claims instead of the configured mapping, with its interface unchanged (ADR 0011). Acceptance: a corporate user with an app-role assignment resolves to their role in Teams; a sender with no assignment is refused; nothing downstream of the interface changed.
- **C2 (P0).** The Phase 2 decision gate and the Phase 3 result surface stay attributable to a named corporate identity (ADR 0004, 0016, 0019). Acceptance: a shortlist decision and an action on a mark are attributed to the resolved corporate identity; an unauthorised sender cannot decide or act.
- **C3 (P1).** The configured channel-sender-to-role mapping is retired once Entra resolution is verified at parity, leaving Entra as the single source. Acceptance: after parity is confirmed, the legacy configuration mapping is removed and resolution still holds.

### D. Roles from one source

- **D1 (P0).** Entra app-role claims map to the existing roles only (recruiter, hiring-manager, TA-lead reporting, internal engineering), with no new role introduced (proposed ADR 0023). Acceptance: each existing role resolves from an Entra claim; an identity with no assignment resolves to no role and is refused.
- **D2 (P0).** The same role source feeds both the browser login and the Teams resolver, so a user's roles are consistent across surfaces. Acceptance: a user with a given role sees it applied the same way in tooling, the dashboard, and Teams.
- **D3 (P1).** The claim-to-role mapping is least-privilege and versioned. Acceptance: the mapping is recorded as versioned configuration; a change to it is reviewable.

### E. Decommissioning the dev provider

- **E1 (P0).** The dev credential provider is disabled for all internal production surfaces; no internal production surface accepts a dev-credential session (ADR 0003). Acceptance: no internal production surface authenticates a user through the dev provider.
- **E2 (P0).** The dev provider provably cannot start in production, verified in CI, failing closed (ADR 0003, carried from Phase 0). Acceptance: a production-configured boot with the dev provider selected refuses to start, and the check runs in CI rather than being asserted by hand.
- **E3 (P1).** The dev provider remains usable only in local and preview non-production environments. Acceptance: local and preview can still sign in through the dev provider; production cannot.

### F. The Entra-fronted production environment and cutover

- **F1 (P0).** Internal surfaces run in the Entra-fronted production environment, and the cutover is by configuration per environment, not a code change (ADR 0003). Acceptance: production selects the Entra provider by its environment variable, and the same build runs in preview with the dev provider.
- **F2 (P0).** The corporate tenant's conditional access and MFA apply to internal sign-in, inherited and not re-implemented. Acceptance: internal sign-in is subject to the tenant's MFA and conditional access policies.
- **F3 (P1).** A defined rollback or contingency exists if Passport regresses, given the dev provider cannot be the production fallback (ADR 0003, 0005). Acceptance: a documented rollback returns internal surfaces to a safe state without running the dev provider in production.

### G. Observability, audit, and eval

- **G1 (P0).** Sign-ins, claim-to-role resolutions, and refusals are traced and audited on the Phase 0 harness. Acceptance: an engineer can trace a sign-in and see the resolved roles, and an authentication or authorisation refusal is recorded.
- **G2 (P0).** The seam-held proof is captured: a record that the swap changed no downstream application code. Acceptance: the change set or a CI check shows no downstream application code changed to make the swap.
- **G3 (P1).** A CI check guards the dev provider's production-refusal and the claim-to-role mapping so a regression fails the build. Acceptance: a change that lets the dev provider start in production, or that breaks the claim-to-role mapping, fails CI.

## Components and surfaces, and how they connect

A component-level view, not a class-level one.

- **The auth interface** (Phase 0, ADR 0003) is unchanged: it returns id, email, and roles, and route guards depend only on it. In production it now selects the Entra provider.
- **The Entra-via-Passport provider** is the new live adapter that replaces the Phase 0 stub. It runs the Entra sign-in for browser and HTTP surfaces, validates the result against the corporate tenant, maps app-role claims to the application's roles (proposed ADR 0023), and mints the stateless signed session (ADR 0008).
- **The channel-identity resolver** (ADR 0011) keeps its interface and switches its source: it resolves a Teams sender's Azure AD identity to the application's roles from Entra app-role assignments, where before it read a configured mapping.
- **The browser and HTTP surfaces** (recruiter tooling, the dashboard, any web approval surface) are fronted by Passport. They are unchanged; only the provider behind their guard changes.
- **The Teams surface** (recruiter and hiring-manager interaction, the decision gate, the assessment result) is unchanged; only the source of its sender-to-role resolution changes.
- **The dev credential provider** is decommissioned for production and retained for local and preview, with the production-refusal guard as the backstop.
- **The corporate Entra tenant and app registration** are the external identity provider, owned by corporate IT, holding the app-role assignments and the conditional access and MFA policies.
- **The observability harness** (Phase 0) traces and audits sign-ins, resolutions, and refusals, and runs the production-refusal and mapping checks as CI gates.

How they connect: a corporate user reaching a browser surface is redirected by Passport to the Entra tenant; on success Passport hands the result to the Entra provider, which maps app-role claims to roles and mints the session, and the route guard reads id, email, and roles exactly as before. A Teams sender's Azure AD identity is resolved by the channel-identity resolver against the same app-role assignments to the same roles. The dev provider serves neither path in production. No surface downstream of the interface changed, which is the whole point.

## Integration points and boundary contracts

Named contracts, not schemas.

- **Auth interface to the Entra-via-Passport provider.** Out: an Entra sign-in handshake. In: an authenticated user with id, email, and roles, or a refusal. This boundary, stubbed and inert since Phase 0, now carries real traffic; the contract it returns is the same one the dev provider returned.
- **Passport to the corporate Entra tenant (OIDC).** Out: a sign-in request to the application's app registration in the corporate tenant. In: the signed-in user's claims (the application-roles claim, email, and the directory object id). Crossing the boundary: corporate staff identity claims only, never candidate data. Scope: the minimum claims needed to resolve id, email, and roles.
- **Channel-identity resolver to Entra (app-role assignments).** Out: a lookup of a Teams sender's app-role assignments for the application, by their Azure AD identity (from a claim where present, or a Microsoft Graph lookup where not). In: the role-bearing assignment. Crossing the boundary: internal user identity only.
- **No new Connect scope, no warehouse or ATS change, no model call, no Sandbox run, and no candidate-data flow.** Phase 5 adds nothing to the external-system, model, or candidate boundaries. This is stated as a contract: the only new boundary traffic is internal staff identity from the corporate's own IdP.
- **Observability backend.** Out: traces of sign-ins and resolutions, and durable audit records of authentication and authorisation events and refusals. The production-refusal and mapping checks are internal to CI.

## Data handling and compliance

Phase 5 introduces no candidate personal information, which is the right shape for an identity cutover under ADR 0006.

- **Personal information touched:** internal staff identity only (corporate email, Azure AD object id, and app-role assignments), sourced from the corporate's own directory. No candidate PII is introduced, moved, or changed. The candidate WhatsApp identity is untouched (ADR 0003).
- **No new candidate-data flow (ADR 0006):** the system of record is unaffected, no model is called, and no document or submission moves. The only new data path is staff identity from the corporate tenant, which stays inside the Microsoft estate.
- **A stronger access-control record:** internal access moves behind the corporate IdP with MFA and conditional access, and every candidate-affecting decision (ADR 0004, 0016, 0019) is now attributed to a verified corporate identity rather than a configured channel mapping. This strengthens, rather than changes, the human-in-the-loop evidence under POPIA section 71 and the Employment Equity Act.
- **Sessions (ADR 0008):** stateless signed sessions, now minted from Entra claims, unchanged in shape. The known trade-off stands: a stateless token cannot be revoked server-side before it expires, so sessions are kept short-lived. If running behind the corporate IdP in production raises a requirement for immediate revocation or idle timeout, that is a new ADR superseding ADR 0008, not a quiet change (open question, security).
- **Secrets:** the Entra client credential and the session signing secret are managed per environment and never committed (Phase 0 requirement B3, ADR 0008), set distinctly for the production environment now being lit.
- **Beta components (ADR 0005):** Passport must be public beta or GA, not private beta, at cutover. Enterprise Managed Users stays excluded, so account lifecycle remains manual.

## Access and identity

- **Active provider:** Entra-via-Passport in production (the swap). The dev provider is retired from production and kept for local and preview only (ADR 0003).
- **Roles:** the existing set (recruiter, hiring-manager, TA-lead reporting, internal engineering), sourced from Entra app-role claims (proposed ADR 0023). No new role is introduced.
- **What is gated:** every internal surface, browser and Teams alike. The candidate WhatsApp channel is unchanged and remains identified by the verified number with no login.
- **Production refusal (ADR 0003):** the dev provider still fails closed in production, now verified as the decommission proof rather than as a guard on an unused provider.
- **MFA and conditional access:** inherited from the corporate tenant and applied to internal sign-in; not re-implemented in the application.

## Observability, evals, and tracing

- **Tracing and audit:** sign-ins, claim-to-role resolutions, and refusals are traced and audited on the Phase 0 harness, so an access question (who signed in, what roles resolved, why a request was refused) has an answer.
- **Seam-held proof:** the change set, or a CI check, demonstrates that the swap touched no downstream application code, which is the phase's core acceptance evidence.
- **CI gates:** the dev provider's production-refusal and the claim-to-role mapping are guarded so a regression fails the build.
- **No bias or marking eval is engaged.** Phase 5 makes no candidate-affecting decision and changes no decision logic, so the screening and marking gates (ADR 0013, 0020) are neither exercised nor changed. They remain as they are.

## Risks and mitigations

- **Passport regresses in production and the dev provider cannot be the fallback.** Passport is beta (ADR 0005), and ADR 0003 forbids the dev provider in production, so the usual fallback is closed. Mitigation: prove Passport against the corporate tenant in preview before the production flip; define a rollback that returns internal surfaces to a safe state (for example holding the production cutover, or keeping the pilot environment available) without relaxing the production-refusal; treat the production-refusal as inviolate, not a workaround knob.
- **The seam leaks.** The cutover may reveal that a surface reached into provider internals and now needs a code change, which would break the ADR 0003 guarantee. Mitigation: treat any required downstream change as a finding against the abstraction and fix the seam, not a quiet patch; the phase is not done if downstream code changed.
- **Role-claim mismatch or unpopulated assignments.** Entra app roles may not map cleanly to the application's roles, or corporate IT may not have populated assignments before cutover. Mitigation: proposed ADR 0023 fixes the source and contract early; coordinate app-role assignment with corporate IT before the flip; an unmapped identity resolves to no role and is refused, never to a default grant.
- **Conditional access lockout.** The tenant's MFA or conditional access policies could block legitimate users or the application. Mitigation: agree the policies scoped to the application with corporate IT and test sign-in in preview before production.
- **Channel resolution parity.** Switching Teams from the configured mapping to Entra could silently change who is authorised. Mitigation: verify parity between the retiring configuration mapping and Entra resolution before removing the configuration, and audit Teams authorisations across the switch.
- **Session revocation expectation.** Corporate security may expect immediate revocation that stateless tokens cannot give (ADR 0008). Mitigation: keep sessions short-lived; raise the requirement explicitly (open question); if it is firm, record a new ADR superseding ADR 0008 rather than bolting on a store.
- **A latent dev path into production.** The dev provider remains in the codebase for non-production and could be misconfigured toward production. Mitigation: the production-refusal guard, verified in CI (requirement E2, G3), is the backstop, with least-privilege per-environment configuration.
- **Scope creep during the cutover.** The pull to add a role, a surface, or a feature while the auth is open will appear. Mitigation: Phase 5 changes identity wiring only; anything else is a separate phase or a new ADR.

## Assumptions

Marked as assumptions because the PRD is silent on them. Each is a default that can be corrected without reworking the spec.

- The corporate Entra tenant and an app registration for the application are available, and Passport is supported against them, at phase start. This is the external prerequisite that can stall the build, analogous to the named ATS in Phase 1 and the named warehouse in Phase 4.
- Passport is public beta or GA, not private beta, at cutover, so it is permitted by ADR 0005. If it is private beta, the cutover holds (the ADR 0005 fallback) and the phase raises a blocking note rather than wiring it.
- The existing role set (recruiter, hiring-manager, TA-lead reporting, internal engineering) is the complete set to map. Phase 5 introduces no new role.
- Roles are sourced from Entra app-role claims (proposed ADR 0023), with security groups as the documented fallback if corporate IT requires group-based administration.
- The dev provider is retained for local and preview non-production use and removed from the production path, with the production-refusal guard as the backstop, rather than deleted from the codebase.
- Stateless signed sessions (ADR 0008) remain, minted from Entra claims, with no session store added.
- Phase 5's scope is the identity flip and lighting the Entra-fronted production environment for internal surfaces. The business decision to widen the candidate cohort and run candidate operations in production at scale is a separate go decision that Phase 5 unblocks, owned by the stakeholder, legal, and security.
- Conditional access and MFA are configured and enforced by the corporate tenant and inherited by the application, not re-implemented in it.
- The candidate WhatsApp identity is untouched.

## Open questions

Tagged by owner, and blocking or non-blocking for this spec. Each carries a best-judgment answer (the working decision). Answers marked "needs sign-off" are firm enough to build against but await the named owner's confirmation; the tenant readiness and the corporate's administration preference remain genuine external unknowns answered with a posture and a fallback, not invented detail.

- **Is the corporate Entra tenant, an app registration for the application, and Passport support against it confirmed available at phase start?** (Engineering, stakeholder. Non-blocking for this city-map spec; blocking for the cutover build, which cannot start without a tenant and app registration to sign in against.)
  Answer: This is the one external dependency that can stall the phase, the Phase 5 analogue of "which ATS" and "which warehouse". Posture: the spec stays tenant-agnostic at the contract level, and the cutover build does not start until the tenant and app registration exist, Passport is confirmed against them, and the conditional access and MFA policies for the application are agreed. Confirm tenant and app-registration access early. Owner: engineering, with corporate IT and the stakeholder.

- **Are internal roles sourced from Entra app roles or security groups, and are the assignments populated?** (Stakeholder and corporate IT, security, engineering. Non-blocking for the spec, which names the contract; blocking for the cutover build, which needs the source fixed and the assignments populated.)
  Answer (needs sign-off): App roles on the application's enterprise application, per proposed ADR 0023, so access is administered per application and least-privilege, with security groups as the documented fallback (ideally groups assigned to app roles) if corporate IT requires group-based administration. The assignments must be populated by corporate IT before cutover; an unassigned identity resolves to no role and is refused. Accept ADR 0023 (or its group-based supersession) and populate assignments before the flip. Owner: corporate IT and the stakeholder, with security and engineering.

- **Does running behind the corporate IdP in production require server-side session revocation or idle timeout beyond ADR 0008's stateless tokens?** (Security. Non-blocking for the spec; the spec defaults to keeping stateless short-lived sessions.)
  Answer: Default to keeping the ADR 0008 stateless signed session, minted from Entra claims, kept short-lived so the no-revocation trade-off stays bounded. If corporate security requires immediate revocation, idle timeout, or other server-side session features once real corporate identities sign in to production, that is a new decision recorded as an ADR that supersedes ADR 0008, not a quiet addition of a session store. Raise it before the production flip. Owner: security, with engineering.

- **What conditional access and MFA policies apply to the application, and are the pilot users and the application covered?** (Corporate IT, security. Non-blocking for the spec; coordinate before cutover.)
  Answer: Inherit the corporate tenant's policies; do not re-implement them in the application. Agree the policy scope for the application with corporate IT, confirm pilot users are covered without being locked out, and test sign-in in preview before production. Owner: corporate IT and security.

- **Does Phase 5 own the production go-live and the widening of the candidate cohort, or only the identity flip?** (Stakeholder, project lead, legal, security. Non-blocking for the spec, which scopes Phase 5 to the flip and flags the boundary.)
  Answer: Phase 5 delivers the identity flip and makes the Entra-fronted production environment possible for internal surfaces. The decision to then run candidate operations in production at scale and widen beyond the pilot cohort is a separate go decision, taken by the stakeholder with legal and security, on the same basis the earlier specs defer to "after the Entra cutover or explicit sign-off". Phase 5 unblocks it; the rollout is not Phase 5 work. See the consistency note. Owner: stakeholder, project lead, legal, security.

- **Is the dev credential provider removed from the codebase or retained for non-production?** (Engineering, security. Non-blocking; the spec defaults to retaining it for non-production.)
  Answer: Retain it for local and preview non-production development, disabled on the production path, with the Phase 0 production-refusal guard (verified in CI) as the backstop. Removing it entirely would cost the local development convenience the seam was built to keep, for no security gain beyond what the verified guard already provides. Owner: engineering, with security.

- **Does proposed ADR 0023 (Entra app-role claims as the single source of internal roles) get accepted?** (Project lead, engineering, security, corporate IT. Non-blocking for the spec; it blocks building the role mapping exactly as specified.)
  Answer: Accept as proposed (needs sign-off), unless corporate IT requires group-based administration, in which case supersede it with a group-based decision and the reasoning recorded. It settles the choice ADR 0003 and ADR 0011 left open and feeds both the browser login and the Teams resolver from one source. Flip ADR 0023 to Accepted in the register before building the role mapping. Owner: project lead, with engineering, security, and corporate IT.

## Consistency note (for a human, not resolved here)

Defining this phase surfaces two points worth a human's eye, which I am flagging rather than quietly resolving.

First, the production boundary. Phases 1 to 4 each run in a "non-production pilot environment" for one reason: the dev provider cannot start in production (ADR 0003). Phase 5 removes that constraint, so it is implicitly the moment the whole system can run in production. The PRD scopes Phase 5 narrowly to identity ("flip the identity layer with no change to application code"), and this spec keeps to that scope: it delivers the identity cutover and the Entra-fronted production environment for internal surfaces, and treats the business go-live and the widening of the candidate cohort as a separate decision Phase 5 unblocks. If the programme intends Phase 5 to also own the production rollout of candidate operations, that is a scope expansion to confirm with the stakeholder and a likely PRD clarification, not something to settle by quietly widening this phase.

Second, the wording of the PRD's Phase 5 include. The PRD says "putting Passport in front of every internal surface (recruiter tooling, approval flows, dashboard)". The approval flows live in Teams (the Phase 2 decision gate, the Phase 3 result surface), which Passport does not front directly: Teams users do not sign in to our application through Passport. Those surfaces are authorised by the channel-identity resolver (ADR 0011), whose mapping source becomes Entra claims here. This spec reads the PRD as "every internal surface comes under Entra identity", delivered two ways (Passport for browser and HTTP, Entra-sourced channel resolution for Teams), rather than "every internal surface gets a Passport browser login". That reading is consistent with ADR 0011 and is, I believe, the intended meaning, but I am noting it so the PRD wording is not later read as requiring a Passport login on the Teams surface.

## Done when (phase-level acceptance)

Phase 5 is done when all of the following hold together, proving the cutover end to end and proving the abstraction held, rather than each piece in isolation:

- Internal users authenticate through Entra via Passport across all internal browser and HTTP surfaces (recruiter tooling, any web approval surface, and the dashboard), with the corporate tenant's MFA and conditional access applied, and with no separate login.
- The Teams channel surface (recruiter and hiring-manager interaction, the shortlist decision gate, the assessment result) resolves the sender to the same roles from Entra claims through the unchanged channel-identity interface, and every candidate-affecting decision stays attributable to a named corporate identity (ADR 0004, 0016, 0019).
- Roles resolve correctly from Entra claims, mapped to the application's existing role set, least-privilege, and consistent across the browser and Teams surfaces.
- The dev credential provider is decommissioned for internal production surfaces and provably cannot start in production, verified rather than assumed.
- No downstream application code changed to make the swap, proving the ADR 0003, 0008, and 0011 seam held; the change set is confined to provider configuration and the provider adapter.
- Sign-ins, claim-to-role resolutions, and refusals are traced and audited, and the candidate WhatsApp identity is untouched.

Done is a clean swap of the identity layer that internal users feel only as signing in with their corporate account, and that an auditor can see left every application boundary except identity exactly where it was.
