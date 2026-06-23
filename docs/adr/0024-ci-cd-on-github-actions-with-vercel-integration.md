# 0024. CI/CD on GitHub Actions with the Vercel GitHub integration

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Engineering

## Context

ADR 0002 fixes the stack (the Vercel Agent Stack via eve) and ADR 0007 fixes one repository deployed on Vercel, but neither names the version-control host or how changes build, check, and deploy. Phase 0 has to stand up a concrete pipeline: build and check every change, a preview per change, and a protected production environment with secrets handled per environment (Phase 0 requirements B1 to B4). Choosing the VCS host and the CI approach shapes how every later phase ships and is costly to reverse, so it is an architectural decision and belongs in the register. The Phase 0 spec records a working answer in its open questions; this ADR makes that answer explicit so the decision is not left only in a phase spec.

## Decision

Source lives in GitHub. The build-and-check gate runs in GitHub Actions on every change. Deployment is through the Vercel GitHub integration: a preview deployment per pull request, and production deploys from the main branch only, through the pipeline, never by hand. Secrets are held as Vercel environment variables per environment, plus GitHub Actions secrets for any CI-only need, with no secret committed to the repository (requirement B3). The production environment is protected so it deploys only through the agreed source.

## Consequences

We get one mainstream, well-understood pipeline: a check gate in Actions, a preview URL per pull request for review before production, and clean per-environment secret separation. The cost is coupling to GitHub and to the Vercel GitHub integration, and two secret stores to keep in step (Vercel environment variables and Actions secrets) rather than one. Moving off GitHub or off the Vercel integration later would be a new decision recorded as its own ADR. This ADR records only the pipeline shape; it does not change the production-refusal rule for the dev auth provider (ADR 0003) or the secrets discipline (requirement B3), which stand alongside it.

## Alternatives considered

Vercel's own Git deployment without a separate CI gate. Rejected: it deploys on push but gives weaker control over the build-and-check gate that requirement B1 needs, and we want the check to block the deploy explicitly.

A self-hosted or third-party CI runner instead of GitHub Actions. Rejected: more infrastructure to run and secure for no benefit at this stage, and it cuts against the one-stack, low-operational-surface posture of ADR 0002 and ADR 0007.
