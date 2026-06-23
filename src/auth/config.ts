import type { Role } from "./roles.ts";
import { isRole } from "./roles.ts";
import { AuthConfigError } from "./errors.ts";

// Environment is read as a plain map so callers and tests can pass an explicit
// object instead of mutating process.env.
export type Env = Record<string, string | undefined>;

// A configured dev user. The dev provider checks a username and password
// against a list of these (requirement D2). Supplied via DEV_AUTH_USERS as a
// JSON array; for production the dev provider does not run at all (D4).
export interface DevUser {
  id: string;
  email: string;
  username: string;
  password: string;
  roles: Role[];
}

// Production is detected from any of the deployment-environment signals. The
// dev provider fails closed if any of them say production (ADR 0003, D4).
export function isProductionConfig(env: Env): boolean {
  return (
    env.APP_ENV === "production" ||
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production"
  );
}

export function parseDevUsers(raw: string | undefined): DevUser[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuthConfigError("DEV_AUTH_USERS is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new AuthConfigError("DEV_AUTH_USERS must be a JSON array");
  }
  return parsed.map((entry, index) => normaliseUser(entry, index));
}

function normaliseUser(entry: unknown, index: number): DevUser {
  if (typeof entry !== "object" || entry === null) {
    throw new AuthConfigError(`DEV_AUTH_USERS[${index}] must be an object`);
  }
  const record = entry as Record<string, unknown>;
  const id = requireString(record.id, index, "id");
  const email = requireString(record.email, index, "email");
  const username = requireString(record.username, index, "username");
  const password = requireString(record.password, index, "password");
  const roles = requireRoles(record.roles, index);
  return { id, email, username, password, roles };
}

function requireString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new AuthConfigError(
      `DEV_AUTH_USERS[${index}].${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireRoles(value: unknown, index: number): Role[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AuthConfigError(
      `DEV_AUTH_USERS[${index}].roles must be a non-empty array of known roles`,
    );
  }
  return value.map((role) => {
    if (!isRole(role)) {
      throw new AuthConfigError(
        `DEV_AUTH_USERS[${index}].roles contains an unknown role: ${String(role)}`,
      );
    }
    return role;
  });
}
