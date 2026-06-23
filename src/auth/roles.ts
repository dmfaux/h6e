// Internal roles are part of the auth interface from day one (ADR 0003), so
// route guards (Task 0.5) read roles through the interface and never reach
// into a provider. The Entra-via-Passport provider (Phase 5, ADR 0023) will
// map Entra app-role claims onto these same role strings.

export const ROLES = {
  recruiter: "recruiter",
  hiringManager: "hiring-manager",
  internalEngineering: "internal-engineering",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ALL_ROLES as readonly string[]).includes(value)
  );
}
