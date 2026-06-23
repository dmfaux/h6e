# CI/CD pipeline and environments (Task 0.2)

This records how the pipeline built in Task 0.2 works, so a later realignment can re-prove it. It implements requirements B1 to B3 and honours ADR 0024 (CI/CD on GitHub Actions with the Vercel GitHub integration) and ADR 0007 (one repo).

## Shape

- Source lives in GitHub: `dmfaux/h6e`.
- Every change runs a build-and-check gate in GitHub Actions (`.github/workflows/ci.yml`): install with a frozen lockfile, `pnpm build`, `pnpm typecheck`, and a gitleaks secret scan. The gate runs on pull requests targeting `main` and on pushes to `main` (requirement B1).
- Deployment is the Vercel GitHub integration, not the CLI and not by hand (ADR 0024). The Vercel project `h6e` (team `dmfauxs-projects`) is Git-connected to the repo: each pull request gets a preview deployment, and `main` is the production branch. Vercel builds the source in its hosted environment, where `eve build` emits the Vercel Build Output bundle.
- Production is protected. A branch-protection rule on `main` requires the `build-and-check` and `secret-scan` checks to pass before a pull request can merge. Because production deploys only from `main` and `main` only advances through a passing pull request, a failing check blocks the production deploy (requirements B1, B2).

## Secrets (requirement B3)

- No secret is committed. `.env*` is gitignored; only `.env.example` (names, no values) is tracked.
- Per-environment values live in the Vercel project, set separately for Preview and Production (for example `SESSION_SECRET`, distinct per environment per ADR 0008, and `APP_ENV`). CI-only needs use GitHub Actions secrets.
- A gitleaks scan over the repository tree and git history finds nothing committed, and the same scan runs in CI on every change.

## pnpm cooldown note

CI installs with `pnpm install --frozen-lockfile --config.minimumReleaseAge=0`. The committed lockfile is the supply-chain control in CI; pnpm 11's default `minimumReleaseAge` cooldown is a resolution-time guard for interactive installs and can wrongly fail an already-pinned dependency under a frozen install, so it is disabled for the CI install only.

## B4 (deferred follow-up)

B4 (the deploy verifies the agent booted, not just built, before being reported healthy) is P1 and is deferred. Vercel reports a deployment Ready on a successful build; it does not yet curl `GET /eve/v1/health` on the new deployment and fail the deploy if the agent did not boot. Follow-up: add a post-deployment health gate (a workflow on the Vercel `deployment_status` event, or a Vercel deploy-time check) that hits the liveness endpoint and marks the deployment failed if it is not healthy. Tracked for a Phase 0 follow-up; the realignment tasks (0.4, 0.11) revisit it.
