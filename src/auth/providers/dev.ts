import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthProvider, Credentials, SignInResult } from "../types.ts";
import type { DevUser, Env } from "../config.ts";
import { isProductionConfig, parseDevUsers } from "../config.ts";
import { mintSession } from "../session.ts";
import {
  AuthConfigError,
  InvalidCredentialsError,
  ProductionRefusalError,
} from "../errors.ts";

// The dev credential provider (ADR 0003, requirement D2). It authenticates a
// username and password against a configured user list and, on success, issues
// a stateless signed session carrying roles (ADR 0008). It must refuse to start
// in a production configuration (D4).

export interface DevProviderConfig {
  users: DevUser[];
  secret: string;
  sessionTtlSeconds?: number;
  isProduction?: boolean;
}

export function createDevProvider(config: DevProviderConfig): AuthProvider {
  // Fail closed first: never construct the dev provider in production (D4).
  if (config.isProduction) {
    throw new ProductionRefusalError(
      "The dev credential provider refuses to start in a production " +
        "configuration (ADR 0003, requirement D4). Use AUTH_PROVIDER=entra in " +
        "production.",
    );
  }
  if (!config.secret) {
    throw new AuthConfigError(
      "SESSION_SECRET must be set for the dev credential provider (ADR 0008)",
    );
  }
  if (config.users.length === 0) {
    throw new AuthConfigError(
      "The dev credential provider needs at least one configured user " +
        "(DEV_AUTH_USERS)",
    );
  }

  const users = config.users;
  const secret = config.secret;
  const ttlSeconds = config.sessionTtlSeconds;

  return {
    name: "dev",
    async signIn(credentials: Credentials): Promise<SignInResult> {
      const user = findUser(users, credentials);
      if (!user) {
        throw new InvalidCredentialsError();
      }
      const authenticated = {
        id: user.id,
        email: user.email,
        roles: user.roles,
      };
      const session = mintSession(authenticated, { secret, ttlSeconds });
      return { user: authenticated, session };
    },
  };
}

// Convenience factory that reads the dev provider's configuration from the
// environment. Selection wiring (select.ts) uses this; tests inject config
// directly via createDevProvider.
export function devProviderFromEnv(env: Env): AuthProvider {
  return createDevProvider({
    users: parseDevUsers(env.DEV_AUTH_USERS),
    secret: env.SESSION_SECRET ?? "",
    isProduction: isProductionConfig(env),
    sessionTtlSeconds: env.SESSION_TTL_SECONDS
      ? Number(env.SESSION_TTL_SECONDS)
      : undefined,
  });
}

// Scans every user with constant-time comparisons on both fields, so a wrong
// username and a wrong password are indistinguishable by timing or by which
// branch failed. Usernames are not secret, but this avoids early-exit
// enumeration.
function findUser(users: DevUser[], credentials: Credentials): DevUser | null {
  let match: DevUser | null = null;
  for (const user of users) {
    const usernameOk = constantTimeEqual(user.username, credentials.username);
    const passwordOk = constantTimeEqual(user.password, credentials.password);
    if (usernameOk && passwordOk) {
      match = user;
    }
  }
  return match;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}
