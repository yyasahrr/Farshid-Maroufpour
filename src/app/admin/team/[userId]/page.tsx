import { notFound, redirect } from "next/navigation";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  barberSchedule,
  barberServices,
  barberSkills,
  barbers,
  blockedTimes,
  classes,
  portfolioItems,
  services,
  skills,
  userRoles,
  users,
} from "@/db/schema";
import { DashboardShell } from "@/components/dashboard-shell";
import { TeamMemberEditor } from "@/components/admin/team-member-editor";
import { getCurrentUser } from "@/lib/session";
import { rolesFromLegacyRole, type Role } from "@/lib/rbac";
import { TEAM_ROLE_LABELS_FA } from "@/lib/team";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

const TEAM_ROLES: readonly Role[] = ["BARBER", "INSTRUCTOR", "RECEPTIONIST", "MANAGER", "FINANCE", "SUPER_ADMIN"];

export default async function TeamMemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const { userId: rawId } = await params;
  const userId = Number(rawId);
  if (!Number.isSafeInteger(userId) || userId < 1) notFound();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) notFound();
  const [membershipRows, barber] = await Promise.all([
    db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)),
    db.select().from(barbers).where(eq(barbers.userId, userId)).limit(1).then((rows) => rows[0] ?? null),
  ]);
  const roles = membershipRows.length ? [...new Set(membershipRows.map((row) => row.role as Role))] : rolesFromLegacyRole(target.role);
  if (!roles.some((role) => TEAM_ROLES.includes(role))) notFound();
  const isSelf = current.id === target.id;
  if (!current.permissions.has("staff:manage") && !isSelf) notFound();

  const [allServices, serviceLinks, allSkills, skillLinks, schedule, blocks, portfolio, relatedClasses] = barber
    ? await Promise.all([
        db.select().from(services).orderBy(asc(services.name)),
        db.select({ serviceId: barberServices.serviceId, customPrice: barberServices.customPrice, customDuration: barberServices.customDuration, customBarberDuration: barberServices.customBarberDuration }).from(barberServices).where(eq(barberServices.barberId, barber.id)),
        db.select().from(skills).orderBy(asc(skills.name)),
        db.select({ skillId: barberSkills.skillId, status: barberSkills.status }).from(barberSkills).where(eq(barberSkills.barberId, barber.id)),
        db.select().from(barberSchedule).where(eq(barberSchedule.barberId, barber.id)).orderBy(asc(barberSchedule.weekday)),
        db.select().from(blockedTimes).where(and(eq(blockedTimes.barberId, barber.id), gte(blockedTimes.date, todayISO()))).orderBy(asc(blockedTimes.date), asc(blockedTimes.startMin)).limit(40),
        db.select().from(portfolioItems).where(eq(portfolioItems.barberId, barber.id)).orderBy(asc(portfolioItems.id)),
        db.select().from(classes).where(eq(classes.instructorBarberId, barber.id)).orderBy(asc(classes.startsOn)),
      ])
    : [[], [], [], [], [], [], [], []];

  const canManage = current.permissions.has("staff:manage");
  const canAssignPrivilegedRoles = current.permissions.has("roles:manage");
  const roleSummary = roles.map((role) => TEAM_ROLE_LABELS_FA[role] ?? role).join(" · ");
  const sections = [
    { id: "profile", label: "پروفایل عمومی", group: "این عضو" },
    ...(roles.includes("BARBER") ? [
      { id: "services", label: "خدمات" },
      { id: "skills", label: "مهارت‌ها" },
      { id: "schedule", label: "برنامه کاری" },
      { id: "portfolio", label: "نمونه‌کارها" },
    ] : []),
    ...(roles.includes("INSTRUCTOR") ? [{ id: "academy", label: "آموزش" }] : []),
    { id: "access", label: "دسترسی‌ها" },
  ].filter((section) => section.id === "access" || section.id === "academy" || Boolean(barber));

  return (
    <DashboardShell title="مدیریت عضو تیم" subtitle={`${target.name} · ${roleSummary}`} sections={sections}>
      <TeamMemberEditor
        user={{ id: target.id, name: target.name, phone: target.phone, role: target.role }}
        roles={roles}
        barber={barber}
        services={allServices}
        serviceLinks={serviceLinks}
        skills={allSkills}
        skillLinks={skillLinks}
        schedule={schedule}
        blocks={blocks}
        portfolio={portfolio}
        classes={relatedClasses}
        canManage={canManage}
        canAssignPrivilegedRoles={canAssignPrivilegedRoles}
        canApproveSkills={current.permissions.has("skills:approve")}
        canEditRoles={canManage || canAssignPrivilegedRoles}
        isSelf={isSelf}
      />
    </DashboardShell>
  );
}
