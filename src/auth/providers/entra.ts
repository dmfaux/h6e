import type { AuthProvider } from "../types.ts";
import { NotImplementedError } from "../errors.ts";

// The Entra-via-Passport provider (ADR 0003). In Phase 0 it is an inert stub:
// present and selectable by AUTH_PROVIDER=entra, but it does no authentication.
// The real integration, mapping Entra app-role claims onto our roles, is
// Phase 5 (ADR 0023). It deliberately mints the same session shape as the dev
// provider once implemented, so the swap is configuration only.

export function createEntraProvider(): AuthProvider {
  return {
    name: "entra",
    async signIn(): Promise<never> {
      throw new NotImplementedError(
        "The Entra-via-Passport provider is an inert Phase 0 stub (ADR 0003). " +
          "It is selectable by AUTH_PROVIDER=entra but is not implemented until " +
          "Phase 5 (ADR 0023).",
      );
    },
  };
}
