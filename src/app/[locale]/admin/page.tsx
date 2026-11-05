import { badgeDate, timeRange, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { LoadChart } from "@/components/admin/load-chart";
import { Chip, Panel } from "@/components/admin/ui";
import { Icon, type IconName } from "@/components/icon";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { attentionCounts, attentionList, daySchedule, todayInDubai, weekCounts } from "@/lib/admin/bookings";
import { weekday } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";

function Kpi({ href, icon, label, hint, value, tone }: { href: string; icon: IconName; label: string; hint: string; value: number; tone: "warning" | "accent" }) {
  const urgent = value > 0;
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl glass p-5 shadow-card transition hover:-translate-y-0.5">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${urgent && tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"}`}
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">{label}</span>
        <span className="mt-0.5 block text-2xl leading-tight font-bold">{value}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <Icon name="arrow" className="h-5 w-5 shrink-0 text-accent opacity-0 transition group-hover:opacity-100 rtl:-scale-x-100" />
    </Link>
  );
}

export default async function AdminOverviewPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  const { staff } = await requireStaff("dashboard.admin", locale);
  const labels = getAdminContent(locale);
  const site = getContent(locale);
  const months = site.booking.months;
  const today = todayInDubai();
  const [counts, schedule, week, waiting] = await Promise.all([
    attentionCounts(staff),
    daySchedule(staff, today),
    weekCounts(staff, today),
    attentionList(staff),
  ]);
  const name = (item: { nameEn: string; nameAr: string }) => (locale === "ar" ? item.nameAr : item.nameEn);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const k = labels.overview.kpis;

  return (
    <div className="space-y-6">
      {counts.deletions > 0 && (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft p-4 text-sm font-medium text-warning">
          <Icon name="alert" className="h-5 w-5 shrink-0" />
          <span className="flex-1">{labels.overview.deletions.replace("{count}", String(counts.deletions))}</span>
          <Link href="/admin/customers?view=deletion" className="font-semibold underline">
            {labels.overview.deletionsLink}
          </Link>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi href="/admin/bookings?status=pending" icon="check" label={k.review} hint={k.reviewHint} value={counts.review} tone="warning" />
        <Kpi href="/admin/bookings?status=pending" icon="tag" label={k.quotes} hint={k.quotesHint} value={counts.quotes} tone="warning" />
        <Kpi href="/admin/bookings?status=confirmed" icon="users" label={k.unassigned} hint={k.unassignedHint} value={counts.unassigned} tone="warning" />
        <Kpi href="/admin/enquiries" icon="inbox" label={k.enquiries} hint={k.enquiriesHint} value={counts.enquiries} tone="accent" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title={labels.overview.today}
          icon="calendar"
          action={
            <Link href="/admin/schedule" className="text-sm font-semibold text-accent hover:underline">
              {labels.overview.fullSchedule}
            </Link>
          }
        >
          {schedule.bookings.length === 0 ? (
            <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted">{labels.overview.todayEmpty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {schedule.bookings.map((item) => (
                <li key={item.reference}>
                  <Link href={`/admin/bookings/${item.reference}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-surface">
                    <span dir={dir} className="w-36 shrink-0 text-sm font-semibold whitespace-nowrap">
                      {timeRange(item.startAt, item.endAt, locale, !item.quoteRequired)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name(item)}</span>
                      <span className="block truncate text-sm text-muted">
                        {item.contactName} · {item.area}
                      </span>
                      <span className="mt-1 block">
                        {item.team.length > 0 ? (
                          <span className="text-xs text-muted">{item.team.join(", ")}</span>
                        ) : (
                          <Chip tone="warning" icon="alert">
                            {labels.overview.noTeam}
                          </Chip>
                        )}
                      </span>
                    </span>
                    <StatusBadge status={item.status} label={labels.status[item.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={labels.overview.load} icon="users">
            <p className="-mt-2 mb-4 text-xs text-muted">{labels.overview.loadHint.replace("{capacity}", String(schedule.capacity))}</p>
            <LoadChart
              load={schedule.load}
              capacity={schedule.capacity}
              locale={locale}
              labels={{ table: labels.overview.loadTable, near: labels.overview.nearCapacity, peak: labels.overview.loadPeak }}
            />
          </Panel>

          <Panel title={labels.overview.week} icon="clock">
            <ul className="grid grid-cols-7 gap-1.5">
              {week.map((day) => {
                const badge = badgeDate(new Date(`${day.date}T08:00:00Z`), months, locale);
                return (
                  <li key={day.date}>
                    <Link
                      href={`/admin/schedule?date=${day.date}`}
                      className={`flex flex-col items-center rounded-xl px-1 py-2 text-center transition hover:bg-accent-soft ${day.date === today ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-surface"}`}
                    >
                      <span className="text-[11px] font-medium opacity-80">{site.booking.days[weekday(day.date)]}</span>
                      <span className="text-lg leading-tight font-bold">{badge.day}</span>
                      <span className={`mt-1 rounded-full px-1.5 text-[11px] font-semibold ${day.count > 0 ? (day.date === today ? "bg-white/20" : "bg-accent-soft text-accent") : "opacity-60"}`}>
                        {day.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel
        title={labels.overview.attention}
        icon="alert"
        action={
          <Link href="/admin/bookings?status=pending" className="text-sm font-semibold text-accent hover:underline">
            {labels.nav.bookings}
          </Link>
        }
      >
        {waiting.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted">{labels.overview.attentionEmpty}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {waiting.map((item) => {
              const start = when(item.startAt, months, locale);
              const requested = when(item.createdAt, months, locale);
              const needsQuote = item.status === "pending" && item.quoteRequired && item.quoteStatus !== "accepted";
              return (
                <li key={item.reference}>
                  <Link href={`/admin/bookings/${item.reference}`} className="flex h-full flex-col gap-2 rounded-xl border border-border p-4 transition hover:border-accent">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{name(item)}</span>
                        <span className="block text-xs text-muted" dir="ltr">
                          {item.reference}
                        </span>
                      </span>
                      {needsQuote ? (
                        <Chip tone="warning" icon="tag">
                          {labels.quote[item.quoteStatus]}
                        </Chip>
                      ) : (
                        <StatusBadge status={item.status} label={labels.status[item.status]} />
                      )}
                    </span>
                    <span className="text-sm">
                      {start.date} · <span dir="ltr">{start.time}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {item.contactName} · {labels.overview.requested.replace("{date}", requested.date)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
