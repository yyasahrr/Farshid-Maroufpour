/**
 * Role-based access control.
 *
 * Roles are identities a user can hold several of at once (see `user_roles`).
 * Permissions are the verbs the backend guards. UI never invents its own rule:
 * a screen shows an action only if `can(permissions, "...")` is true, and every
 * server route re-checks the same permission — client state is never trusted.
 */

export const ROLES = [
  "CLIENT",
  "TRAINEE",
  "BARBER",
  "INSTRUCTOR",
  "RECEPTIONIST",
  "MANAGER",
  "FINANCE",
  "SUPER_ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "booking:create", // book for self / walk-in on behalf of a client
  "booking:manage", // move, cancel, check-in, complete, no-show for ANY booking
  "booking:self", // manage own schedule as a barber
  "customers:view",
  "customers:notes",
  "services:view",
  "services:manage",
  "staff:view",
  "staff:manage",
  "skills:approve",
  "academy:view",
  "academy:manage",
  "payments:collect",
  "payments:refund",
  "finance:view",
  "reports:view",
  "reports:detailed",
  "roles:manage",
  "settings:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CLIENT: ["booking:create"],
  TRAINEE: ["booking:create", "academy:view"],
  BARBER: ["booking:self", "services:view", "academy:view"],
  INSTRUCTOR: ["booking:self", "services:view", "academy:view", "academy:manage"],
  RECEPTIONIST: [
    "booking:create",
    "booking:manage",
    "customers:view",
    "customers:notes",
    "services:view",
    "staff:view",
    "academy:view",
    "payments:collect",
  ],
  MANAGER: [
    "booking:create",
    "booking:manage",
    "customers:view",
    "customers:notes",
    "services:view",
    "services:manage",
    "staff:view",
    "staff:manage",
    "skills:approve",
    "academy:view",
    "academy:manage",
    "payments:collect",
    "payments:refund",
    "finance:view",
    "reports:view",
    "audit:view",
  ],
  FINANCE: ["finance:view", "reports:view", "reports:detailed", "payments:refund"],
  SUPER_ADMIN: [...PERMISSIONS],
};

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role as Role];
    if (perms) for (const p of perms) out.add(p);
  }
  return out;
}

export function can(permissions: ReadonlySet<Permission>, permission: Permission): boolean {
  return permissions.has(permission);
}

/** Legacy single-role value → the role set it implies, for migration + compat. */
export function rolesFromLegacyRole(role: string | null | undefined): Role[] {
  switch (role) {
    case "SUPER_ADMIN":
      return ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"];
    case "RECEPTIONIST":
      return ["RECEPTIONIST"];
    case "BARBER":
      return ["BARBER"];
    case "CLIENT":
      return ["CLIENT"];
    default:
      return ["CLIENT"];
  }
}
