import type { ReactNode } from "react";
import { aed, badgeDate, timeRange, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { Icon, type IconName } from "@/components/icon";
import { Photo } from "@/components/photo";
import { getContent } from "@/content";
import type { SiteContent } from "@/content/en";
import { Link } from "@/i18n/navigation";
import { listCustomerBookings, splitBookings } from "@/lib/booking/customer";
import { requirePermission } from "@/lib/dal";

type Booking = Awaited<ReturnType<typeof listCustomerBookings>>[number];
type Labels = SiteContent["account"];

function priceOf(item: Booking, labels: Labels, locale: string) {
  if (item.totalFils !== null && (!item.quoteRequired || item.quoteStatus === "accepted")) return aed(item.totalFils, locale);
  return item.quoteStatus === "sent" ? labels.bookings.quoteReady : labels.bookings.quotePending;
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl glass p-5 shadow-card">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function BookingRow({ item, labels, months, locale, muted }: { item: Booking; labels: Labels; months: string[]; locale: string; muted?: boolean }) {
  const badge = badgeDate(item.startAt, months, locale);
  return (
    <li>
      <Link
        href={`/account/bookings/${item.reference}`}
        className={`group flex items-center gap-4 rounded-2xl glass p-3 transition duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-card sm:p-4 ${muted ? "opacity-80 hover:opacity-100" : ""}`}
      >
        <span className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${muted ? "bg-surface" : "bg-accent-soft"}`}>
          <span className={`text-2xl leading-none font-bold ${muted ? "text-muted" : "text-accent"}`}>{badge.day}</span>
          <span className="mt-1 text-xs font-medium text-muted uppercase">{badge.month}</span>
        </span>
        <span className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-xl sm:block">
          <Photo src={`/images/${item.serviceSlug}.webp`} alt="" sizes="96px" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{locale === "ar" ? item.nameAr : item.nameEn}</span>
          <span className="mt-0.5 block truncate text-sm text-muted">
            <span dir={locale === "ar" ? "rtl" : "ltr"}>{timeRange(item.startAt, item.endAt, locale, !item.quoteRequired)}</span> · {item.area}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {labels.bookings.reference}: <span dir="ltr" className="font-mono">{item.reference}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2 text-end">
          <StatusBadge status={item.status} label={labels.status[item.status]} />
          <span className="text-sm font-semibold">{priceOf(item, labels, locale)}</span>
        </span>
        <Icon name="arrow" className="hidden h-5 w-5 shrink-0 text-accent transition-transform group-hover:translate-x-1 sm:block rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
      </Link>
    </li>
  );
}

export default async function AccountBookingsPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  const { user } = await requirePermission("booking.view_own", locale);
  const content = getContent(locale);
  const labels = content.account;
  const months = content.booking.months;
  const bookings = await listCustomerBookings(user.id);
  const { upcoming, past } = splitBookings(bookings);
  const [next, ...later] = upcoming;
  const completed = bookings.filter((b) => b.status === "completed").length;

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-3xl glass px-6 py-16 text-center shadow-card">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="sparkle" className="h-10 w-10" />
        </span>
        <p className="mt-5 text-lg font-semibold">{labels.bookings.empty}</p>
        <Link href="/book" className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover">
          {labels.bookings.bookNow}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon="calendar" label={labels.stats.upcoming} value={upcoming.length} />
        <Stat icon="clock" label={labels.stats.nextVisit} value={next ? when(next.startAt, months, locale).date : labels.stats.none} />
        <Stat icon="check" label={labels.stats.completed} value={completed} />
      </div>

      {next ? (
        <section className="grid overflow-hidden rounded-3xl glass shadow-card md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="relative min-h-48">
            <Photo src={`/images/${next.serviceSlug}.webp`} alt="" sizes="(min-width: 768px) 360px, 100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-hero/80 via-hero/10 to-transparent" />
            <span className="absolute start-4 top-4 rounded-full bg-highlight px-3 py-1 text-xs font-bold text-hero">{labels.next}</span>
          </div>
          <div className="p-6">
            <StatusBadge status={next.status} label={labels.status[next.status]} />
            <h2 className="mt-3 text-2xl font-bold">{locale === "ar" ? next.nameAr : next.nameEn}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-3">
                <Icon name="calendar" className="h-5 w-5 shrink-0 text-accent" />
                {when(next.startAt, months, locale).date}
              </li>
              <li className="flex items-center gap-3">
                <Icon name="clock" className="h-5 w-5 shrink-0 text-accent" />
                <span dir={locale === "ar" ? "rtl" : "ltr"}>{timeRange(next.startAt, next.endAt, locale, !next.quoteRequired)}</span>
              </li>
              <li className="flex items-center gap-3">
                <Icon name="pin" className="h-5 w-5 shrink-0 text-accent" />
                {next.building}, {next.area}
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted">
                  {labels.bookings.reference}: <span dir="ltr" className="font-mono">{next.reference}</span>
                </p>
                <p className="mt-0.5 text-lg font-bold text-accent">{priceOf(next, labels, locale)}</p>
              </div>
              <Link
                href={`/account/bookings/${next.reference}`}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
              >
                {labels.bookings.view}
                <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-2xl glass border-dashed p-6 text-center text-muted">{labels.bookings.noUpcoming}</p>
      )}

      {later.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">{labels.moreUpcoming}</h2>
          <ul className="mt-3 space-y-3">
            {later.map((item) => (
              <BookingRow key={item.reference} item={item} labels={labels} months={months} locale={locale} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">{labels.bookings.past}</h2>
          <ul className="mt-3 space-y-3">
            {past.map((item) => (
              <BookingRow key={item.reference} item={item} labels={labels} months={months} locale={locale} muted />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
