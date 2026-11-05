import { BarList, ColumnChart, money } from "@/components/admin/charts";
import { KpiTile } from "@/components/admin/kpi";
import { EmptyState, PageHeader, Panel } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { getSuperAdminContent } from "@/content/super-admin";
import { Link } from "@/i18n/navigation";
import { addDays, displayDate, dubaiDate } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";
import { change, getReport, parseRange } from "@/lib/super-admin/reports";

const statuses = ["pending", "confirmed", "assigned", "in_progress", "completed", "cancelled"] as const;

export default async function SuperAdminReportsPage({ params, searchParams }: PageProps<"/[locale]/super-admin/reports">) {
  const { locale } = await params;
  const { staff: owner } = await requireStaff("report.view", locale);
  const query = await searchParams;
  const range = parseRange(query.from, query.to);
  const labels = getSuperAdminContent(locale);
  const r = labels.reports;
  const admin = getAdminContent(locale);
  const months = getContent(locale).booking.months;
  const report = await getReport(owner, range);
  const { current, previous } = report;

  const today = dubaiDate(new Date());
  const presets = [
    { label: r.presets.last7, from: addDays(today, -6), to: today },
    { label: r.presets.last30, from: addDays(today, -29), to: today },
    { label: r.presets.last90, from: addDays(today, -89), to: today },
    { label: r.presets.thisMonth, from: `${today.slice(0, 8)}01`, to: today },
    { label: r.presets.thisYear, from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const vs = (text: string) => r.vsPrevious.replace("{change}", text);
  const average = current.completed ? Math.round(current.revenueFils / current.completed) : 0;
  const previousAverage = previous.completed ? Math.round(previous.revenueFils / previous.completed) : 0;
  const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
  const answered = current.quotes.accepted + current.quotes.declined;
  const monthShort = (m: number) => (locale === "ar" ? months[m - 1] : months[m - 1].slice(0, 3));
  const short = (key: string) => (report.bucket === "month" ? `${monthShort(Number(key.slice(5, 7)))} ${key.slice(2, 4)}` : `${Number(key.slice(8))} ${monthShort(Number(key.slice(5, 7)))}`);
  const statusCount = (s: string) => report.byStatus.find((b) => b.status === s)?.count ?? 0;
  const field = "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.title}
        description={r.period.replace("{from}", displayDate(range.from, months)).replace("{to}", displayDate(range.to, months))}
        action={
          <a
            href={`/api/super-admin/export?from=${range.from}&to=${range.to}`}
            download
            title={r.exportHint}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            <Icon name="document" className="h-4 w-4" />
            {r.export}
          </a>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl glass p-4 shadow-card">
        <nav aria-label={r.title} className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = p.from === range.from && p.to === range.to;
            return (
              <Link
                key={p.label}
                href={`/super-admin/reports?from=${p.from}&to=${p.to}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-surface text-muted hover:text-foreground"}`}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
        <form action={`/${locale}/super-admin/reports`} method="get" className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            {r.from}
            <input type="date" name="from" defaultValue={range.from} max={today} className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            {r.to}
            <input type="date" name="to" defaultValue={range.to} max={addDays(today, 365)} className={field} />
          </label>
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">{r.apply}</button>
        </form>
      </div>
      <p className="-mt-3 text-xs text-muted">{r.exportHint}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile icon="card" label={r.kpis.revenue} value={money(current.revenueFils, locale)} change={change(current.revenueFils, previous.revenueFils)} changeText={vs} noCompare={r.noPrevious} />
        <KpiTile icon="check" label={r.kpis.completed} value={String(current.completed)} change={change(current.completed, previous.completed)} changeText={vs} noCompare={r.noPrevious} />
        <KpiTile icon="tag" label={r.kpis.average} value={money(average, locale)} change={change(average, previousAverage)} changeText={vs} noCompare={r.noPrevious} />
        <KpiTile icon="calendar" label={r.kpis.received} value={String(current.received)} change={change(current.received, previous.received)} changeText={vs} noCompare={r.noPrevious} />
        <KpiTile
          icon="close"
          label={r.kpis.cancellation}
          value={`${rate(current.cancelled, current.scheduled)}%`}
          change={change(rate(current.cancelled, current.scheduled), rate(previous.cancelled, previous.scheduled))}
          changeText={vs}
          noCompare={r.noPrevious}
          lowerIsBetter
        />
        <KpiTile icon="sparkle" label={r.kpis.quotes} value={`${rate(current.quotes.accepted, answered)}%`} hint={r.quotesOf.replace("{accepted}", String(current.quotes.accepted)).replace("{answered}", String(answered))} />
      </div>

      <Panel title={`${r.revenueChart} · ${r.revenueBy[report.bucket]}`} icon="layers">
        <p className="-mt-2 mb-4 text-xs text-muted">{r.revenueHint}</p>
        <ColumnChart
          caption={r.revenueChart}
          emptyText={r.empty}
          bars={report.revenue.map((b) => ({ label: displayDate(b.key, months), short: short(b.key), value: b.fils, display: money(b.fils, locale) }))}
        />
      </Panel>

      {current.scheduled === 0 ? (
        <EmptyState icon="layers" text={r.empty} />
      ) : (
        <>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Panel title={r.byService} icon="tag">
              <BarList
                rows={report.byService.map((s) => ({
                  key: s.nameEn,
                  label: locale === "ar" ? s.nameAr : s.nameEn,
                  value: s.fils,
                  display: money(s.fils, locale),
                  detail: `${r.bookings}: ${s.bookings} · ${r.kpis.completed}: ${s.completed}`,
                }))}
              />
            </Panel>
            <Panel title={r.byStatus} icon="check">
              <BarList
                rows={statuses.map((s) => ({ key: s, label: admin.status[s], value: statusCount(s), display: String(statusCount(s)) }))}
              />
            </Panel>
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Panel title={r.byArea} icon="pin">
              <BarList rows={report.byArea.map((a) => ({ key: a.area, label: a.area, value: a.bookings, display: String(a.bookings) }))} />
            </Panel>
            <Panel title={r.cleaners} icon="users">
              <p className="-mt-2 mb-4 text-xs text-muted">{r.cleanersHint}</p>
              {report.cleaners.length === 0 ? (
                <p className="text-sm text-muted">{r.empty}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="pb-2 text-start font-semibold">{admin.nav.cleaners}</th>
                      <th scope="col" className="pb-2 text-end font-semibold">{r.jobs}</th>
                      <th scope="col" className="pb-2 text-end font-semibold">{r.hours}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.cleaners.map((c) => (
                      <tr key={c.name}>
                        <td className="py-2.5 font-medium">{c.name}</td>
                        <td className="py-2.5 text-end">{c.jobs}</td>
                        <td className="py-2.5 text-end">{Math.round((c.minutes / 60) * 10) / 10}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
