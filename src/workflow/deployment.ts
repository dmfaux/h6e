// Which deployment this process is. Mirrors eve's own session runtime:
// VERCEL_DEPLOYMENT_ID on Vercel, the World's id elsewhere (the local world
// under `pnpm start`). Never "latest" (ADR 0029).

import { getWorld } from "workflow/api";

export async function currentDeploymentId(
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const id = env.VERCEL_DEPLOYMENT_ID?.trim() || (await (await getWorld()).getDeploymentId());
  if (!id || id === "latest") throw new Error("could not resolve an exact deployment id");
  return id;
}

// The route the run fetches to learn which deployment currently serves the
// environment's own domain (ADR 0029, Triggers). Production is served from
// VERCEL_PROJECT_PRODUCTION_URL, a preview from VERCEL_BRANCH_URL.
export const DEPLOYMENT_ROUTE = "/candidate-run/deployment";

export function servingDomain(env: Record<string, string | undefined> = process.env): string | null {
  const host = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_BRANCH_URL;
  return host ? host : null;
}
