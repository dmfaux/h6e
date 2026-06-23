// Public surface of the internal auth module (ADR 0003, ADR 0008).
//
// Internal surfaces depend on this interface, never on a provider directly.
// Task 0.5 builds the route guard and whoami endpoint on top of these exports;
// this task (0.3) stops at the interface, the providers, the session, and
// provider selection.

export { ROLES, ALL_ROLES, isRole } from "./roles.ts";
export type { Role } from "./roles.ts";

export type {
  AuthenticatedUser,
  Credentials,
  SignInResult,
  AuthProvider,
} from "./types.ts";

export {
  mintSession,
  verifySession,
  type MintOptions,
  type VerifyOptions,
} from "./session.ts";

export {
  isProductionConfig,
  parseDevUsers,
  type Env,
  type DevUser,
} from "./config.ts";

export {
  createDevProvider,
  devProviderFromEnv,
  type DevProviderConfig,
} from "./providers/dev.ts";
export { createEntraProvider } from "./providers/entra.ts";

export { selectAuthProvider, type ProviderChoice } from "./select.ts";

export {
  guard,
  extractSessionToken,
  type GuardOptions,
  type GuardDecision,
} from "./guard.ts";
export {
  handleWhoami,
  toWhoami,
  type WhoamiOptions,
  type WhoamiIdentity,
} from "./whoami.ts";

export {
  InvalidCredentialsError,
  SessionVerificationError,
  ProductionRefusalError,
  NotImplementedError,
  AuthConfigError,
} from "./errors.ts";
