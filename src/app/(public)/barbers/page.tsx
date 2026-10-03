import { BarberCard } from "@/components/barber-card";
import { EmptyState } from "@/components/ui-cards";
import { getBarberCards } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "آرایشگران", description: "آرایشگران، خدمات و نزدیک‌ترین وقت‌های آزاد را ببینید و نوبت خود را انتخاب کنید." };

export default async function BarbersPage() {
  const barbers = await getBarberCards();
  return <div className="ui-shell"><div className="ui-container ui-page">
    <div className="ui-pagehead"><h1 data-reveal="">آرایشگران</h1><p data-reveal="">کار و سبک هر متخصص را بشناسید. زمان‌های آزاد بر پایهٔ برنامه واقعی سالن به‌روز می‌شوند.</p></div>
    {barbers.length ? (
      <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {barbers.map((barber) => (
          <div key={barber.id} data-reveal="">
            <BarberCard barber={barber} />
          </div>
        ))}
      </div>
    ) : (
      <EmptyState title="آرایشگری برای رزرو فعال نیست" description="برای هماهنگی با پذیرش تماس بگیرید." />
    )}
  </div></div>;
}
