import Image from "next/image";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Panel } from "@/components/dashboard-shell";
import { UploadButton } from "@/components/admin/upload-button";
import { GALLERY_CATEGORY_KEYS, galleryCategoryLabel } from "@/lib/gallery";
import { TEAM_ROLE_LABELS_FA, MANAGER_ASSIGNABLE_ROLES, timeInputValue } from "@/lib/team";
import type { Role } from "@/lib/rbac";
import { WEEKDAY_LABELS, formatPersianDate, formatPrice } from "@/lib/time";
import {
  createBarberBlockAction,
  createPortfolioItemAction,
  createTeamSkillAction,
  deleteBarberBlockAction,
  deletePortfolioItemAction,
  saveBarberPublicProfileAction,
  saveBarberScheduleAction,
  saveBarberServicesAction,
  saveBarberSkillsAction,
  copyBarberScheduleAction,
  updatePortfolioItemAction,
  updateTeamRolesAction,
  updateTeamAccountNameAction,
} from "@/lib/actions/team";
import { rolesFromLegacyRole } from "@/lib/rbac";
import { Icon } from "@/components/icons";
import type { classes, services, skills, barberSchedule, blockedTimes, portfolioItems, barbers } from "@/db/schema";

type DbBarber = typeof barbers.$inferSelect;
type DbService = typeof services.$inferSelect;
type DbSkill = typeof skills.$inferSelect;
type DbSchedule = typeof barberSchedule.$inferSelect;
type DbBlock = typeof blockedTimes.$inferSelect;
type DbPortfolio = typeof portfolioItems.$inferSelect;
type DbClass = typeof classes.$inferSelect;

export type TeamMemberEditorData = {
  user: { id: number; name: string; phone: string; role: string };
  roles: Role[];
  barber: DbBarber | null;
  services: DbService[];
  serviceLinks: { serviceId: number; customPrice: number | null; customDuration: number | null; customBarberDuration: number | null }[];
  skills: DbSkill[];
  skillLinks: { skillId: number; status: string }[];
  schedule: DbSchedule[];
  blocks: DbBlock[];
  portfolio: DbPortfolio[];
  classes: DbClass[];
  canManage: boolean;
  canAssignPrivilegedRoles: boolean;
  canApproveSkills: boolean;
  canEditRoles: boolean;
  isSelf: boolean;
};

const fieldClass = "ops-field mt-1 w-full";
const checkClass = "focus-ring h-4 w-4 accent-[#0f5a3b]";
const startRoles: Role[] = ["CLIENT", "TRAINEE", "BARBER", "INSTRUCTOR", "RECEPTIONIST", "MANAGER", "FINANCE", "SUPER_ADMIN"];

function RoleChips({ roles }: { roles: Role[] }) {
  return <ul className="flex flex-wrap gap-1.5">{roles.map((role) => <li key={role} className="ops-chip ops-chip-mute">{TEAM_ROLE_LABELS_FA[role] ?? role}</li>)}</ul>;
}

function ProfileImage({ url, name }: { url: string; name: string }) {
  if (!url) return <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-[#e2efe8] text-4xl font-black text-[#0f5a3b]">{name.slice(0, 1)}</div>;
  return <Image src={url} alt={name} fill sizes="(max-width:640px) 30vw, 180px" className="object-cover" unoptimized={url.startsWith("http")} />;
}

export function TeamMemberEditor(data: TeamMemberEditorData) {
  const { user, barber, roles, isSelf } = data;
  const hasBarberRole = roles.includes("BARBER");
  const hasInstructorRole = roles.includes("INSTRUCTOR");
  const serviceLinkMap = new Map(data.serviceLinks.map((link) => [link.serviceId, link]));
  const skillLinkMap = new Map(data.skillLinks.map((link) => [link.skillId, link]));
  const scheduleMap = new Map(data.schedule.map((row) => [row.weekday, row]));
  const visibleTabs = [
    ...(barber ? [{ href: "#profile", label: "عمومی" }] : []),
    ...(barber && hasBarberRole ? [{ href: "#services", label: "خدمات" }, { href: "#skills", label: "مهارت‌ها" }, { href: "#schedule", label: "برنامه کاری" }, { href: "#portfolio", label: "نمونه‌کارها" }] : []),
    ...(hasInstructorRole ? [{ href: "#academy", label: "آموزش" }] : []),
    { href: "#access", label: "دسترسی‌ها" },
  ];

  return (
    <div className="space-y-6">
      <header className="ops-panel !bg-[#f7f7f2]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/admin/team" className="ops-link text-xs">← بازگشت به اعضای تیم</Link>
            <h1 className="mt-2 truncate text-2xl font-black sm:text-3xl">{user.name}</h1>
            <p dir="ltr" className="mt-1 text-start text-sm tabular-nums text-bone/60">{user.phone}</p>
            <div className="mt-3"><RoleChips roles={roles.length ? roles : rolesFromLegacyRole(user.role)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {barber?.active && <Link href={`/barbers/${barber.slug}`} target="_blank" rel="noreferrer" className="ops-btn min-h-11"><Icon name="user" className="h-4 w-4" />مشاهده پروفایل عمومی</Link>}
            {barber && data.canManage && <Link href={`/admin?barber=${barber.id}`} className="ops-btn ops-btn-quiet min-h-11"><Icon name="calendar" className="h-4 w-4" />برنامهٔ عملیاتی</Link>}
            {barber && !data.canManage && isSelf && <Link href="/barber" className="ops-btn ops-btn-quiet min-h-11"><Icon name="calendar" className="h-4 w-4" />محیط آرایشگری</Link>}
          </div>
        </div>
        <nav aria-label="بخش‌های پرونده عضو" className="hide-scrollbar mt-5 flex gap-2 overflow-x-auto border-t border-[#c59b4b]/20 pt-4">
          {visibleTabs.map((tab) => <a key={tab.href} href={tab.href} className="focus-ring min-h-11 shrink-0 rounded-full border border-[#c59b4b]/30 bg-white px-4 py-2.5 text-xs font-bold text-bone/75 hover:border-[#0f5a3b]/60 hover:text-[#0f5a3b]">{tab.label}</a>)}
        </nav>
      </header>

      {barber && (
        <Panel id="profile" title="پروفایل عمومی" description="این اطلاعات مشتریان در کارت آرایشگر و صفحهٔ عمومی می‌بینند؛ حساب و شمارهٔ ورود جداگانه مدیریت می‌شود.">
          <ActionForm action={saveBarberPublicProfileAction} submitLabel="ذخیرهٔ پروفایل" className="space-y-4">
            <input type="hidden" name="barberId" value={barber.id} />
            <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
              <div>
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
                  <ProfileImage url={barber.imageUrl} name={barber.name} />
                </div>
                <label htmlFor={`profile-image-${barber.id}`} className="ops-label mt-3 block">عکس پروفایل</label>
                <input id={`profile-image-${barber.id}`} name="imageUrl" dir="ltr" defaultValue={barber.imageUrl} className={fieldClass} placeholder="/uploads/photo.webp" />
                {(data.canManage || isSelf) && <div className="mt-2"><UploadButton targetId={`profile-image-${barber.id}`} label="آپلود / تعویض عکس" accept="image/jpeg,image/png,image/webp,image/avif" /></div>}
                <p className="mt-2 text-[11px] leading-5 text-bone/55">پیشنهاد نمایش: نسبت عمودی ۴:۵. فایل اصلی برش یا بازنویسی نمی‌شود.</p>
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`profile-name-${barber.id}`} className="ops-label">نام نمایشی</label>
                  <input id={`profile-name-${barber.id}`} name="name" defaultValue={barber.name} required minLength={2} maxLength={80} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor={`profile-title-${barber.id}`} className="ops-label">عنوان حرفه‌ای</label>
                  <input id={`profile-title-${barber.id}`} name="title" defaultValue={barber.title} required minLength={2} maxLength={60} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`profile-bio-${barber.id}`} className="ops-label">معرفی کوتاه</label>
                  <textarea id={`profile-bio-${barber.id}`} name="bio" defaultValue={barber.bio} maxLength={600} rows={3} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`profile-about-${barber.id}`} className="ops-label">دربارهٔ من</label>
                  <textarea id={`profile-about-${barber.id}`} name="readme" defaultValue={barber.readme} maxLength={4000} rows={6} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor={`profile-experience-${barber.id}`} className="ops-label">سال‌های سابقه</label>
                  <input id={`profile-experience-${barber.id}`} name="experienceYears" type="number" min={0} max={70} defaultValue={barber.experienceYears} required className={fieldClass} />
                </div>
                <div className="flex items-end">
                  {data.canManage && hasBarberRole ? (
                    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold">
                      <input type="checkbox" name="active" defaultChecked={barber.active} className={checkClass} />
                      نمایش پروفایل در سایت و امکان رزرو جدید
                    </label>
                  ) : (
                    <p className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs leading-6 text-bone/60">{data.canManage ? "برای انتشار عمومی و دریافت نوبت، این حساب باید نقش آرایشگر داشته باشد." : "وضعیت انتشار و امکان رزرو را مدیر سالن تنظیم می‌کند؛ ویرایش متن پروفایل در اختیار شماست."}</p>
                  )}
                </div>
                {data.canManage ? (
                  <details className="rounded-xl border border-[var(--color-border)] bg-white p-3 sm:col-span-2">
                    <summary className="focus-ring min-h-9 cursor-pointer text-xs font-bold">تنظیمات پیشرفتهٔ آدرس</summary>
                    <p className="mt-2 text-xs leading-6 text-amber-800">با تغییر آدرس پروفایل، لینک قبلی ممکن است دیگر کار نکند.</p>
                    <label htmlFor={`profile-slug-${barber.id}`} className="ops-label mt-2 block">آدرس انگلیسی پروفایل</label>
                    <input id={`profile-slug-${barber.id}`} name="slug" dir="ltr" defaultValue={barber.slug} pattern="[a-zA-Z0-9-]+" maxLength={40} required className={fieldClass} />
                    <Link href={`/barbers/${barber.slug}`} target="_blank" rel="noreferrer" className="ops-link mt-2 inline-block">پیش‌نمایش مسیر فعلی ↗</Link>
                  </details>
                ) : (
                  <input type="hidden" name="slug" value={barber.slug} />
                )}
              </div>
            </div>
          </ActionForm>
          {!barber.active && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900">این پروفایل فعلاً عمومی نیست و برای رزروهای تازه پیشنهاد نمی‌شود. تاریخچهٔ نوبت‌ها و نمونه‌کارها حفظ شده‌اند.</p>}
        </Panel>
      )}

      {barber && hasBarberRole && (
        <Panel id="services" title="خدمات قابل ارائه" description="خدمات انتخاب‌شده در رزرو آنلاین قابل برنامه‌ریزی‌اند. قیمت و مدت اختصاصی اختیاری است و در صورت خالی‌بودن از تنظیم پایهٔ سالن ارث می‌رسد.">
          {data.services.length ? (
            data.canManage ? (
            <ActionForm action={saveBarberServicesAction} submitLabel="ذخیرهٔ خدمات" className="space-y-3">
              <input type="hidden" name="barberId" value={barber.id} />
              <ul className="grid gap-3 xl:grid-cols-2">
                {data.services.map((service) => {
                  const link = serviceLinkMap.get(service.id);
                  return (
                    <li key={service.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                      <label className="flex min-h-11 items-start gap-3">
                        <input type="checkbox" name="serviceId" value={service.id} defaultChecked={Boolean(link)} className={`${checkClass} mt-1`} />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm">{service.name}{!service.active && <span className="ops-chip ops-chip-mute me-2">غیرفعال در سالن</span>}</strong>
                          <span className="mt-1 block text-xs leading-5 text-bone/55">پایه: {formatPrice(service.basePrice)} · {service.durationMin.toLocaleString("fa-IR")} دقیقه</span>
                        </span>
                      </label>
                      <details className="mt-3 border-t border-[var(--color-border)] pt-2">
                        <summary className="focus-ring min-h-10 cursor-pointer text-xs font-bold text-[#0f5a3b]">تنظیمات اختصاصی</summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <div>
                            <label htmlFor={`price-${barber.id}-${service.id}`} className="ops-label">قیمت اختصاصی (تومان)</label>
                            <input id={`price-${barber.id}-${service.id}`} name={`price-${service.id}`} type="number" min={0} max={100000000} defaultValue={link?.customPrice ?? ""} placeholder={String(service.basePrice)} className={fieldClass} />
                          </div>
                          <div>
                            <label htmlFor={`duration-${barber.id}-${service.id}`} className="ops-label">مدت خدمت (دقیقه)</label>
                            <input id={`duration-${barber.id}-${service.id}`} name={`duration-${service.id}`} type="number" min={10} max={360} defaultValue={link?.customDuration ?? ""} placeholder={String(service.durationMin)} className={fieldClass} />
                          </div>
                          <div>
                            <label htmlFor={`barber-duration-${barber.id}-${service.id}`} className="ops-label">زمان کار آرایشگر</label>
                            <input id={`barber-duration-${barber.id}-${service.id}`} name={`barber-duration-${service.id}`} type="number" min={5} max={360} defaultValue={link?.customBarberDuration ?? ""} placeholder={String(service.barberDurationMin)} className={fieldClass} />
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </ActionForm>
            ) : (
              <ul className="grid gap-3 xl:grid-cols-2">
                {data.services.filter((service) => serviceLinkMap.has(service.id)).map((service) => {
                  const link = serviceLinkMap.get(service.id)!;
                  return <li key={service.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4"><strong>{service.name}</strong><p className="ops-meta mt-2">{formatPrice(link.customPrice ?? service.basePrice)} · {(link.customDuration ?? service.durationMin).toLocaleString("fa-IR")} دقیقه</p></li>;
                })}
                {!data.services.some((service) => serviceLinkMap.has(service.id)) && <li className="ops-empty xl:col-span-2">هنوز خدمتی برای این آرایشگر فعال نشده است.</li>}
              </ul>
            )
          ) : <p className="ops-empty">هنوز خدمتی در سالن تعریف نشده است.<span className="ops-meta">ابتدا خدمات را از بخش «سرویس‌ها و قیمت‌ها» بسازید.</span></p>}
        </Panel>
      )}

      {barber && hasBarberRole && (
        <Panel id="skills" title="مهارت‌های آرایشگر" description="فقط مهارت‌های تأییدشده در ارزیابی ظرفیت خدمات استفاده می‌شوند. انتخاب یا برداشتن مهارت در این بخش به موتور رزرو وصل است.">
          {data.canApproveSkills ? (
            <>
              {data.skills.length ? (
                <ActionForm action={saveBarberSkillsAction} submitLabel="ذخیرهٔ مهارت‌های تأییدشده">
                  <input type="hidden" name="barberId" value={barber.id} />
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {data.skills.map((skill) => {
                      const link = skillLinkMap.get(skill.id);
                      return <li key={skill.id}><label className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3"><input type="checkbox" name="skillId" value={skill.id} defaultChecked={link?.status === "APPROVED"} className={checkClass} /><span className="flex-1 text-sm font-semibold">{skill.name}</span>{link && <span className={`ops-chip ${link.status === "APPROVED" ? "ops-chip-ok" : link.status === "PENDING" ? "ops-chip-wait" : "ops-chip-mute"}`}>{link.status === "APPROVED" ? "تأییدشده" : link.status === "PENDING" ? "در انتظار" : "ردشده"}</span>}</label></li>;
                    })}
                  </ul>
                </ActionForm>
              ) : <p className="ops-empty">هنوز مهارتی ثبت نشده است.<span className="ops-meta">با افزودن اولین مهارت شروع کنید.</span></p>}
              <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                <h3 className="text-sm font-bold">افزودن مهارت به فهرست سالن</h3>
                <ActionForm action={createTeamSkillAction} submitLabel="افزودن مهارت" className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1"><label htmlFor={`new-skill-${barber.id}`} className="ops-label">نام مهارت</label><input id={`new-skill-${barber.id}`} name="name" minLength={2} maxLength={60} required className={fieldClass} /></div>
                </ActionForm>
              </div>
            </>
          ) : (
            <div className="ops-empty">مدیریت مهارت‌های تأییدشده فقط با دسترسی مدیریت انجام می‌شود.<span className="ops-meta">مهارت‌های فعلی: {data.skills.filter((skill) => skillLinkMap.get(skill.id)?.status === "APPROVED").map((skill) => skill.name).join("، ") || "هنوز مهارتی تأیید نشده است."}</span></div>
          )}
        </Panel>
      )}

      {barber && hasBarberRole && (
        <Panel id="schedule" title="برنامهٔ کاری و عدم حضور" description="ساعت‌های هفتگی و بازه‌های مرخصی/جلسه مستقیماً به تقویم واقعی رزرو وصل هستند.">
          <ActionForm action={saveBarberScheduleAction} submitLabel="ذخیرهٔ برنامهٔ هفتگی">
            <input type="hidden" name="barberId" value={barber.id} />
            <ul className="space-y-2">
              {WEEKDAY_LABELS.map((label, weekday) => {
                const row = scheduleMap.get(weekday);
                const defaultOff = weekday === 6;
                return <li key={weekday} className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3 sm:grid-cols-[90px_minmax(0,1fr)_150px] sm:items-center">
                  <strong className="text-sm">{label}</strong>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label htmlFor={`start-${barber.id}-${weekday}`} className="ops-label">از ساعت</label><input id={`start-${barber.id}-${weekday}`} name={`start-${weekday}`} type="time" step={300} defaultValue={timeInputValue(row?.startMin ?? 600)} className={fieldClass} /></div>
                    <div><label htmlFor={`end-${barber.id}-${weekday}`} className="ops-label">تا ساعت</label><input id={`end-${barber.id}-${weekday}`} name={`end-${weekday}`} type="time" step={300} defaultValue={timeInputValue(row?.endMin ?? 1320)} className={fieldClass} /></div>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg bg-[#f7f7f2] px-3 text-sm font-semibold"><input type="checkbox" name={`off-${weekday}`} defaultChecked={row?.dayOff ?? defaultOff} className={checkClass} />تعطیل</label>
                </li>;
              })}
            </ul>
          </ActionForm>

          <details className="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-4">
            <summary className="focus-ring min-h-11 cursor-pointer font-bold">کپی برنامهٔ یک روز برای روزهای دیگر</summary>
            <ActionForm action={copyBarberScheduleAction} submitLabel="کپی برنامه" className="mt-3">
              <input type="hidden" name="barberId" value={barber.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor={`copy-source-${barber.id}`} className="ops-label">کپی از روز</label><select id={`copy-source-${barber.id}`} name="sourceWeekday" className={fieldClass}>{WEEKDAY_LABELS.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></div>
                <fieldset className="sm:col-span-2"><legend className="ops-label mb-2">روزهای مقصد</legend><div className="flex flex-wrap gap-2">{WEEKDAY_LABELS.map((label, index) => <label key={index} className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border)] px-3 text-xs"><input type="checkbox" name="targetWeekday" value={index} className={checkClass} />{label}</label>)}</div></fieldset>
              </div>
            </ActionForm>
          </details>

          <div className="mt-6 border-t border-[var(--color-border)] pt-5">
            <h3 className="text-sm font-black">ثبت مرخصی، جلسه یا عدم حضور</h3>
            <p className="mt-1 text-xs leading-6 text-bone/55">برای بازه‌ای که رزرو نباید پیشنهاد شود، تاریخ و ساعت را ثبت کنید. برای تمام روز گزینهٔ «تمام روز» را انتخاب کنید.</p>
            <ActionForm action={createBarberBlockAction} submitLabel="ثبت بازهٔ عدم حضور" className="mt-3">
              <input type="hidden" name="barberId" value={barber.id} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><label htmlFor={`block-date-${barber.id}`} className="ops-label">تاریخ</label><input id={`block-date-${barber.id}`} name="date" type="date" required className={fieldClass} /></div>
                <div><label htmlFor={`block-start-${barber.id}`} className="ops-label">از ساعت</label><input id={`block-start-${barber.id}`} name="startTime" type="time" step={300} defaultValue="10:00" className={fieldClass} /></div>
                <div><label htmlFor={`block-end-${barber.id}`} className="ops-label">تا ساعت</label><input id={`block-end-${barber.id}`} name="endTime" type="time" step={300} defaultValue="22:00" className={fieldClass} /></div>
                <div><label htmlFor={`block-reason-${barber.id}`} className="ops-label">علت</label><select id={`block-reason-${barber.id}`} name="reason" className={fieldClass}><option value="مرخصی">مرخصی</option><option value="جلسه">جلسه</option><option value="عدم حضور">عدم حضور</option><option value="ساعت کاری استثنایی">ساعت کاری استثنایی</option></select></div>
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="fullDay" className={checkClass} />تمام روز</label>
              </div>
            </ActionForm>
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-black">بازه‌های ثبت‌شده</h3>
            {data.blocks.length ? <ul className="space-y-2">{data.blocks.map((block) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3"><span><strong className="text-sm">{block.reason}</strong><span className="ops-meta ms-2">{formatPersianDate(block.date)} · {block.fullDay ? "تمام روز" : `${timeInputValue(block.startMin)} تا ${timeInputValue(block.endMin)}`}</span></span><form action={deleteBarberBlockAction}><input type="hidden" name="barberId" value={barber.id} /><input type="hidden" name="blockId" value={block.id} /><button type="submit" className="ops-btn ops-btn-danger min-h-11">برداشتن بازه</button></form></li>)}</ul> : <p className="ops-empty">مرخصی یا بازهٔ مسدودی ثبت نشده است.<span className="ops-meta">ثبت بازه‌ها در همین‌جا روی پیشنهادهای نوبت اثر می‌گذارد.</span></p>}
          </div>
        </Panel>
      )}

      {barber && hasBarberRole && (
        <Panel id="portfolio" title="نمونه‌کارها" description="هر نمونه‌کار از همین رکورد برای پروفایل عمومی، گالری کارها و بخش نمونه‌کار خانه استفاده می‌شود.">
          {data.portfolio.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {data.portfolio.map((item) => (
                <li key={item.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
                  <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#e2efe8]"><ProfileImage url={item.imageUrl} name={item.title} /></div>
                    <div className="min-w-0">
                      <ActionForm action={updatePortfolioItemAction} submitLabel="ذخیرهٔ نمونه‌کار" className="space-y-2">
                        <input type="hidden" name="barberId" value={barber.id} /><input type="hidden" name="itemId" value={item.id} />
                        <div><label htmlFor={`work-title-${item.id}`} className="ops-label">عنوان</label><input id={`work-title-${item.id}`} name="title" defaultValue={item.title} minLength={2} maxLength={100} required className={fieldClass} /></div>
                        <div><label htmlFor={`work-category-${item.id}`} className="ops-label">دسته‌بندی</label><select id={`work-category-${item.id}`} name="category" defaultValue={item.category} className={fieldClass}>{GALLERY_CATEGORY_KEYS.map((key) => <option key={key} value={key}>{galleryCategoryLabel(key)}</option>)}</select></div>
                        <div><label htmlFor={`work-image-${item.id}`} className="ops-label">آدرس تصویر</label><input id={`work-image-${item.id}`} name="imageUrl" dir="ltr" defaultValue={item.imageUrl} required className={fieldClass} /></div>
                        <div className="mt-2"><UploadButton targetId={`work-image-${item.id}`} label="تعویض تصویر" accept="image/jpeg,image/png,image/webp,image/avif" /></div>
                      </ActionForm>
                    </div>
                  </div>
                  <details className="mt-3 border-t border-[var(--color-border)] pt-2">
                    <summary className="focus-ring min-h-11 cursor-pointer text-xs font-bold text-rose-800">حذف نمونه‌کار</summary>
                    <p className="py-2 text-sm">این نمونه‌کار حذف شود؟</p>
                    <form action={deletePortfolioItemAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="barberId" value={barber.id} /><input type="hidden" name="itemId" value={item.id} /><button type="submit" className="ops-btn ops-btn-danger min-h-11">بله، حذف نمونه‌کار</button><span className="text-xs text-bone/55">فایل اصلی حذف نمی‌شود.</span></form>
                  </details>
                </li>
              ))}
            </ul>
          ) : <p className="ops-empty">هنوز نمونه‌کاری ثبت نشده است.<span className="ops-meta">اولین تصویر را همین‌جا اضافه کنید؛ نیازی به ویرایش seed.sql نیست.</span></p>}
          <div className="mt-5 rounded-2xl border border-dashed border-[#0f5a3b]/40 bg-white/70 p-4">
            <h3 className="text-sm font-black">افزودن نمونه‌کار</h3>
            <ActionForm action={createPortfolioItemAction} submitLabel="افزودن نمونه‌کار" className="mt-3">
              <input type="hidden" name="barberId" value={barber.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor={`new-work-title-${barber.id}`} className="ops-label">عنوان</label><input id={`new-work-title-${barber.id}`} name="title" required minLength={2} maxLength={100} className={fieldClass} /></div>
                <div><label htmlFor={`new-work-category-${barber.id}`} className="ops-label">دسته‌بندی</label><select id={`new-work-category-${barber.id}`} name="category" className={fieldClass}>{GALLERY_CATEGORY_KEYS.map((key) => <option key={key} value={key}>{galleryCategoryLabel(key)}</option>)}</select></div>
                <div className="sm:col-span-2"><label htmlFor={`new-work-image-${barber.id}`} className="ops-label">تصویر نمونه‌کار</label><input id={`new-work-image-${barber.id}`} name="imageUrl" dir="ltr" required className={fieldClass} placeholder="ابتدا تصویر را آپلود کنید" /><div className="mt-2"><UploadButton targetId={`new-work-image-${barber.id}`} label="آپلود تصویر" accept="image/jpeg,image/png,image/webp,image/avif" /></div></div>
              </div>
            </ActionForm>
          </div>
        </Panel>
      )}

      {hasInstructorRole && (
        <Panel id="academy" title="ارتباط با آکادمی" description="مدرس و آرایشگر در صورت داشتن هر دو نقش، از همین حساب و پروفایل حرفه‌ای استفاده می‌کنند.">
          {barber ? <>
            <h3 className="text-sm font-bold">کارگاه‌های مرتبط</h3>
            {data.classes.length ? <ul className="mt-2 space-y-2">{data.classes.map((item) => <li key={item.id} className="rounded-xl border border-[var(--color-border)] bg-white p-3"><strong>{item.title}</strong><span className="ops-meta ms-2">{formatPersianDate(item.startsOn)} · {item.status === "OPEN" ? "در حال ثبت‌نام" : item.status}</span></li>)}</ul> : <p className="ops-empty mt-2">هنوز کارگاهی به این مدرس وصل نشده است.<span className="ops-meta">هنگام ساخت کارگاه، همین عضو را از فهرست مدرس‌ها انتخاب کنید.</span></p>}
          </> : <p className="ops-empty">برای نمایش اطلاعات عمومی، این مدرس به پروفایل حرفه‌ای نیاز دارد.</p>}
          <Link href="/academy" className="ops-btn ops-btn-quiet mt-4 min-h-11">مشاهدهٔ آکادمی</Link>
        </Panel>
      )}

      <Panel id="access" title="دسترسی‌ها و حساب کاربری" description="شمارهٔ ورود متعلق به حساب کاربری است. دسترسی پنل‌ها از نقش‌ها محاسبه می‌شود؛ رمز عبور در پنل مدیریت قابل مشاهده نیست.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="text-xs text-bone/55">حساب کاربری</p>
            <p dir="ltr" className="mt-1 text-start text-sm tabular-nums">{user.phone}</p>
            {data.canManage ? (
              <ActionForm action={updateTeamAccountNameAction} submitLabel="ذخیره نام حساب" className="mt-3">
                <input type="hidden" name="userId" value={user.id} />
                <label htmlFor={`account-name-${user.id}`} className="ops-label">نام حساب کاربری</label>
                <input id={`account-name-${user.id}`} name="name" defaultValue={user.name} minLength={2} maxLength={80} required className={fieldClass} />
              </ActionForm>
            ) : (
              <p className="mt-2 text-sm font-bold">{user.name}{isSelf && <Link href="/account#staff-account-title" className="ops-link ms-2">ویرایش نام حساب</Link>}</p>
            )}
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4"><p className="text-xs text-bone/55">پنل‌های قابل دسترس</p><ul className="mt-2 flex flex-wrap gap-1.5">{roles.map((role) => <li key={role} className="ops-chip ops-chip-mute">{TEAM_ROLE_LABELS_FA[role] ?? role}</li>)}</ul></div>
        </div>
        {data.canEditRoles ? (
          <div className="mt-5 border-t border-[var(--color-border)] pt-5">
            <h3 className="text-sm font-black">نقش‌ها</h3>
            <p className="mt-1 text-xs leading-6 text-bone/55">تغییر نقش، دسترسی پنل را تغییر می‌دهد. نقش‌های مدیریتی و مالی فقط با سطح دسترسی مالک قابل تغییرند؛ حساب خودتان از این فرم قابل ارتقا نیست. اگر همهٔ نقش‌های قابل‌تغییر را بردارید، دسترسی تیمی غیرفعال و حساب به مشتری عادی تبدیل می‌شود؛ نوبت‌ها و تاریخچه حذف نمی‌شوند.</p>
            {isSelf ? <p className="ops-empty mt-3">برای جلوگیری از ارتقای دسترسی توسط خود فرد، نقش‌های حساب خودتان را از این صفحه تغییر نمی‌دهیم.</p> : (
              <ActionForm action={updateTeamRolesAction} submitLabel="اعمال دسترسی‌ها" className="mt-3">
                <input type="hidden" name="userId" value={user.id} />
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {startRoles.filter((role) => data.canAssignPrivilegedRoles || MANAGER_ASSIGNABLE_ROLES.includes(role)).map((role) => <li key={role}><label className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3"><input type="checkbox" name="roles" value={role} defaultChecked={roles.includes(role)} className={checkClass} /><span className="text-sm font-semibold">{TEAM_ROLE_LABELS_FA[role] ?? role}</span></label></li>)}
                </ul>
                {!data.canAssignPrivilegedRoles && roles.filter((role) => !MANAGER_ASSIGNABLE_ROLES.includes(role)).length > 0 && <div className="mt-3"><p className="text-xs text-bone/55">نقش‌هایی که این مدیر اختیار تغییرشان را ندارد:</p><div className="mt-2"><RoleChips roles={roles.filter((role) => !MANAGER_ASSIGNABLE_ROLES.includes(role))} /></div></div>}
              </ActionForm>
            )}
          </div>
        ) : <p className="mt-4 text-xs text-bone/55">فقط نقش‌هایی را می‌بینید که برای این حساب ثبت شده‌اند. برای تغییر نقش با مدیر سالن هماهنگ کنید.</p>}
      </Panel>
    </div>
  );
}
