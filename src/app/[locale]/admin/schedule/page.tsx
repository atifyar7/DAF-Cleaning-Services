import { when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { LoadChart } from "@/components/admin/load-chart";
import { Chip, EmptyState, PageHeader, Panel } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { Photo } from "@/components/photo";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { daySchedule, todayInDubai, weekCounts } from "@/lib/admin/bookings";
import { addDays, displayDate, isValidDate, weekday } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";

export default async function AdminSchedulePage({ params, searchParams }: PageProps<"/[locale]/admin/schedule">) {
  const { locale } = await params;
  const { staff } = await requireStaff("booking.view_all", locale);
  const query = await searchParams;
  const requested = typeof query.date === "string" ? query.date : "";
  const today = todayInDubai();
  const date = isValidDate(requested) ? requested : today;
  const labels = getAdminContent(locale);
  const s = labels.schedule;
  const site = getContent(locale);
  // The week strip starts on the Monday of the chosen day's week.
  const monday = addDays(date, -weekday(date));
  const [schedule, week] = await Promise.all([daySchedule(staff, date), weekCounts(staff, monday)]);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const navButton = "flex h-10 w-10 items-center justify-center rounded-xl glass text-accent transition hover:-translate-y-0.5";

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.title}
        description={displayDate(date, site.booking.months)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/schedule?date=${addDays(date, -1)}`} aria-label={s.previousDay} className={navButton}>
              <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
            </Link>
            <Link href="/admin/schedule" className="rounded-xl glass px-4 py-2.5 text-sm font-semibold transition hover:text-accent">
              {s.goToday}
            </Link>
            <Link href={`/admin/schedule?date=${addDays(date, 1)}`} aria-label={s.nextDay} className={navButton}>
              <Icon name="arrow" className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
            <form action={`/${locale}/admin/schedule`} method="get" className="flex items-center gap-2">
              <label className="sr-only" htmlFor="schedule-date">
                {s.pickDate}
              </label>
              <input id="schedule-date" type="date" name="date" defaultValue={date} className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              <button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">{s.pickDate}</button>
            </form>
          </div>
        }
      />

      <ul className="grid grid-cols-7 gap-2">
        {week.map((day) => {
          const active = day.date === date;
          return (
            <li key={day.date}>
              <Link
                href={`/admin/schedule?date=${day.date}`}
                aria-current={active ? "date" : undefined}
                className={`flex flex-col items-center rounded-2xl px-1 py-3 text-center shadow-card transition hover:-translate-y-0.5 ${active ? "bg-primary text-primary-foreground" : "glass"}`}
              >
                <span className="text-xs font-medium opacity-80">{site.booking.days[weekday(day.date)]}</span>
                <span className="text-xl leading-tight font-bold">{Number(day.date.slice(8))}</span>
                {day.date === today && !active && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label={labels.common.today} />}
                <span className={`mt-1 text-xs font-semibold ${active ? "" : day.count ? "text-accent" : "text-muted"}`}>
                  {day.count === 1 ? labels.overview.job : labels.overview.jobs.replace("{count}", String(day.count))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {schedule.bookings.length === 0 ? (
            <EmptyState icon="calendar" text={s.empty} />
          ) : (
            schedule.bookings.map((item) => (
              <Link
                key={item.reference}
                href={`/admin/bookings/${item.reference}`}
                className="group flex items-stretch gap-4 rounded-2xl glass p-3 shadow-card transition hover:-translate-y-0.5 sm:p-4"
              >
                <span className="flex w-24 shrink-0 flex-col justify-center rounded-xl bg-accent-soft px-2 text-center">
                  <span dir={dir} className="text-sm font-bold text-accent">
                    {when(item.startAt, site.booking.months, locale).time}
                  </span>
                  {!item.quoteRequired && (
                    <span dir={dir} className="text-xs text-muted">
                      {when(item.endAt, site.booking.months, locale).time}
                    </span>
                  )}
                </span>
                <span className="relative hidden w-24 shrink-0 overflow-hidden rounded-xl sm:block">
                  <Photo src={`/images/${item.serviceSlug}.webp`} alt="" sizes="96px" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold">{locale === "ar" ? item.nameAr : item.nameEn}</span>
                    <StatusBadge status={item.status} label={labels.status[item.status]} />
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {item.contactName} · {item.building}, {item.area}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip icon="users">{item.cleanerCount === 1 ? s.cleanerNeeded : s.cleanersNeeded.replace("{count}", String(item.cleanerCount))}</Chip>
                    {item.team.length > 0 ? (
                      <span className="text-xs text-muted">{item.team.join(", ")}</span>
                    ) : (
                      item.status !== "completed" && (
                        <Chip tone="warning" icon="alert">
                          {labels.overview.noTeam}
                        </Chip>
                      )
                    )}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>

        <Panel title={labels.overview.load} icon="users" className="xl:sticky xl:top-24">
          <p className="-mt-2 mb-4 text-xs text-muted">{labels.overview.loadHint.replace("{capacity}", String(schedule.capacity))}</p>
          <LoadChart load={schedule.load} capacity={schedule.capacity} locale={locale} labels={{ table: labels.overview.loadTable, near: labels.overview.nearCapacity, peak: labels.overview.loadPeak }} />
        </Panel>
      </div>
    </div>
  );
}
