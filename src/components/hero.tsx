import Image from "next/image";
import { Icon } from "@/components/icons";
import { HeroBooking, type HeroBookingData } from "@/components/hero-booking";
import { AtelierVideo } from "@/components/atelier-video";

export type HeroStatistics = {
  barbers: number;
  reservations: number;
  rating: number | null;
};

export function AgencyHero({
  booking,
  statistics,
}: {
  booking: HeroBookingData;
  statistics: HeroStatistics;
}) {
  return (
    <section className="atelier-hero" aria-labelledby="atelier-headline">
      <Image
        src="/images/atelier-hero.jpg"
        alt="آرایشگر در حال اصلاح مو در فضایی گرم با آینه‌های برنجی و میز ابزار پیرایش"
        fill
        priority
        sizes="100vw"
        quality={90}
        className="atelier-hero-photo"
      />
      <div className="hero-light-wash" aria-hidden="true" />
      <div className="hero-copy">
        <p className="hero-eyebrow">
          <span />
          <span>آکادمی زیبایی فرشید معروف پور</span>
          <span />
        </p>
        <h1 id="atelier-headline">
          استایل تو، در <em>زمان تو</em>
        </h1>
        <p className="hero-description">
          رزرو آنلاین خدمات آرایش مردانه، با بهترین آرایشگران و در فضایی مدرن
        </p>
        <ul className="hero-promises" aria-label="تجربه ما">
          <li>
            <Icon name="diamond" weight="strong" />
            <span>کیفیت ممتاز</span>
          </li>
          <li>
            <Icon name="clock" weight="strong" />
            <span>صرفه‌جویی در زمان</span>
          </li>
          <li>
            <Icon name="star" weight="strong" />
            <span>تجربه‌ای متفاوت</span>
          </li>
        </ul>
      </div>
      <div className="hero-booking-position">
        <HeroBooking {...booking} />
      </div>
      <div
        className="hero-statistics"
        role="group"
        aria-label="آمار ثبت‌شده سالن"
      >
        <div className="hero-stat">
          <Icon name="star" className="solid-star" weight="strong" />
          <dl>
            <dt>رضایت مشتریان</dt>
            <dd dir="ltr" className="ui-num">
              {statistics.rating === null ? "—" : statistics.rating.toFixed(1)}
            </dd>
          </dl>
        </div>
        <span className="hero-stat-divider" aria-hidden="true" />
        <div className="hero-stat">
          <Icon name="users" weight="strong" />
          <dl>
            <dt>نوبت ثبت‌شده</dt>
            <dd dir="ltr" className="ui-num">{statistics.reservations.toLocaleString("en-US")}</dd>
          </dl>
        </div>
        <span className="hero-stat-divider" aria-hidden="true" />
        <div className="hero-stat">
          <Icon name="scissors" weight="strong" />
          <dl>
            <dt>آرایشگر حرفه‌ای</dt>
            <dd dir="ltr" className="ui-num">{statistics.barbers.toLocaleString("en-US")}</dd>
          </dl>
        </div>
      </div>
      <aside className="hero-signature">
        <p>
          مراقبت،
          <br />
          یک سبک زندگیه.
        </p>
        <span dir="ltr">
          A BETTER YOU
          <br />
          EVERY DAY
        </span>
        <AtelierVideo />
      </aside>
    </section>
  );
}
