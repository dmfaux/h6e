import type { AuthProvider } from "./types.ts";
import type { Env } from "./config.ts";
import { AuthConfigError } from "./errors.ts";
import { devProviderFromEnv } from "./providers/dev.ts";
import { createEntraProvider } from "./providers/entra.ts";

// Provider selection by environment variable (requirement D3, ADR 0003).
// AUTH_PROVIDER picks the implementation behind the auth interface:
//   - "dev" (default): the dev credential provider. Refuses to start in a
//     production configuration (D4), so selecting it in production throws here.
//   - "entra": the inert Entra-via-Passport stub (Phase 5, ADR 0023).
// Guards and callers depend only on the returned AuthProvider, never on which
// one was selected.

export type ProviderChoice = "dev" | "entra";

export function selectAuthProvider(env: Env = process.env): AuthProvider {
  const choice = (env.AUTH_PROVIDER ?? "dev").trim().toLowerCase();
  switch (choice) {
    case "dev":
      return devProviderFromEnv(env);
    case "entra":
      return createEntraProvider();
    default:
      throw new AuthConfigError(
        `Unknown AUTH_PROVIDER "${choice}". Set AUTH_PROVIDER to "dev" or "entra".`,
      );
  }
}
