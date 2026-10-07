import assert from "node:assert/strict";
import { can, permissionsForRoles, rolesFromLegacyRole } from "../../src/lib/rbac";
import { MANAGER_ASSIGNABLE_ROLES, safeProfileSlug } from "../../src/lib/team";

const manager = permissionsForRoles(["MANAGER"]);
assert.equal(can(manager, "staff:view"), true);
assert.equal(can(manager, "staff:manage"), true);
assert.equal(can(manager, "skills:approve"), true);
assert.equal(can(manager, "roles:manage"), false, "a manager must not grant privileged roles");
assert.equal(MANAGER_ASSIGNABLE_ROLES.includes("CLIENT"), true, "staff can also hold a customer role");
assert.equal(MANAGER_ASSIGNABLE_ROLES.includes("TRAINEE"), true, "staff can also hold a trainee role");
assert.equal(MANAGER_ASSIGNABLE_ROLES.includes("FINANCE"), false, "finance is not manager-assignable");

const receptionist = permissionsForRoles(["RECEPTIONIST"]);
assert.equal(can(receptionist, "staff:view"), true);
assert.equal(can(receptionist, "staff:manage"), false);
assert.equal(can(receptionist, "roles:manage"), false);

const finance = permissionsForRoles(["FINANCE"]);
assert.equal(can(finance, "finance:view"), true);
assert.equal(can(finance, "payments:refund"), true);
assert.equal(can(finance, "staff:view"), false);
assert.equal(can(finance, "booking:manage"), false);

const multiRole = permissionsForRoles(["CLIENT", "BARBER", "INSTRUCTOR"]);
assert.equal(can(multiRole, "booking:create"), true);
assert.equal(can(multiRole, "booking:self"), true);
assert.equal(can(multiRole, "academy:manage"), true);
assert.equal(can(multiRole, "roles:manage"), false);

const owner = permissionsForRoles(["SUPER_ADMIN"]);
assert.equal(can(owner, "roles:manage"), true);
assert.equal(can(owner, "settings:manage"), true);
assert.equal(can(owner, "audit:view"), true);

assert.deepEqual(rolesFromLegacyRole("BARBER"), ["BARBER"]);
assert.deepEqual(rolesFromLegacyRole("MANAGER"), ["MANAGER"]);
assert.equal(safeProfileSlug("سارا"), "sara");
assert.equal(safeProfileSlug("###"), "team-member");

console.log("RBAC and Team utility checks passed.");
