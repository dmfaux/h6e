// Typed auth errors. Kept distinct so callers (and the route guard in Task 0.5)
// can tell a refused credential from a misconfiguration from a production
// fail-closed, without string matching.

export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid username or password") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class SessionVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionVerificationError";
  }
}

// Thrown when the dev credential provider is asked to start in a production
// configuration. Failing closed here is requirement D4 / ADR 0003.
export class ProductionRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionRefusalError";
  }
}

// Thrown by the inert Entra-via-Passport stub. The real integration is Phase 5.
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

// Thrown for bad or missing auth configuration (unknown provider, missing
// signing secret, malformed dev user list).
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}
