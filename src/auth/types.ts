import type { Role } from "./roles.ts";

// The auth interface (ADR 0003). Internal surfaces depend on this shape, never
// on a provider directly. An authenticated user always carries id, email, and
// roles (requirement D1).
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
}

// The dev credential provider authenticates a username and password
// (requirement D2). The Entra provider will not use these; it is an inert stub
// in Phase 0 and authenticates from Entra claims in Phase 5.
export interface Credentials {
  username: string;
  password: string;
}

// A successful sign-in returns the authenticated user and a stateless signed
// session token carrying that user (ADR 0008). There is no server-side session
// store.
export interface SignInResult {
  user: AuthenticatedUser;
  session: string;
}

// Both providers (dev now, Entra-via-Passport later) sit behind this interface
// and mint the same session shape. Selection between them is by environment
// variable (requirement D3); guards depend only on this interface.
export interface AuthProvider {
  readonly name: string;
  signIn(credentials: Credentials): Promise<SignInResult>;
}
