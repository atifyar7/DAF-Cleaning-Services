import { when } from "@/components/account/format";
import { ColumnChart, money } from "@/components/admin/charts";
import { KpiTile } from "@/components/admin/kpi";
import { Panel } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { getContent } from "@/content";
import { getSuperAdminContent } from "@/content/super-admin";
import { Link } from "@/i18n/navigation";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";
import { recentAudit } from "@/lib/super-admin/audit";
import { change, getReport, parseRange, periodTotals, type Range } from "@/lib/super-admin/reports";
import { listOwnPasskeys, listStaff } from "@/lib/super-admin/staff";

/** The month so far, and the same days of last month, for a fair comparison. */
function monthRanges(today: string): [Range, Range] {
  const day = Number(today.slice(8));
  const first = `${today.slice(0, 8)}01`;
  const lastMonthFirst = addDays(first, -1).slice(0, 8) + "01";
  const lastMonthEnd = addDays(first, -1);
  const sameDay = `${lastMonthFirst.slice(0, 8)}${String(Math.min(day, Number(lastMonthEnd.slice(8)))).padStart(2, "0")}`;
  return [parseRange(first, today), parseRange(lastMonthFirst, sameDay)];
}

export default async function SuperAdminPage({ params }: PageProps<"/[locale]/super-admin">) {
  const { locale } = await params;
  const { staff: owner } = await requireStaff("dashboard.super_admin", locale);
  const labels = getSuperAdminContent(locale);
  const o = labels.overview;
  const months = getContent(locale).booking.months;
  const today = dubaiDate(new Date());
  const [thisMonth, lastMonth] = monthRanges(today);
  const [current, previous, report, team, passkeys, recent] = await Promise.all([
    periodTotals(owner, thisMonth),
    periodTotals(owner, lastMonth),
    getReport(owner, parseRange(addDays(today, -29), today)),
    listStaff(owner),
    listOwnPasskeys(owner),
    recentAudit(owner),
  ]);
  const activeStaff = team.filter((s) => !s.disabledAt);
  const missing2fa = activeStaff.filter((s) => !s.twoFactorEnabled).length;
  const vsLast = (text: string) => o.vsLast.replace("{change}", text);
  const short = (date: string) => `${Number(date.slice(8))} ${months[Number(date.slice(5, 7)) - 1].slice(0, locale === "ar" ? undefined : 3)}`;

  return (
    <div className="space-y-6">
      {missing2fa > 0 && (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft p-4 text-sm font-medium text-warning">
          <Icon name="alert" className="h-5 w-5 shrink-0" />
          <span className="flex-1">{o.staffNo2fa.replace("{count}", String(missing2fa))}</span>
          <Link href="/super-admin/staff" className="font-semibold underline">
            {labels.nav.staff}
          </Link>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon="card" label={o.revenue} value={money(current.revenueFils, locale)} change={change(current.revenueFils, previous.revenueFils)} changeText={vsLast} noCompare={o.noCompare} />
        <KpiTile icon="check" label={o.completed} value={String(current.completed)} change={change(current.completed, previous.completed)} changeText={vsLast} noCompare={o.noCompare} />
        <KpiTile icon="calendar" label={o.received} value={String(current.received)} change={change(current.received, previous.received)} changeText={vsLast} noCompare={o.noCompare} />
        <KpiTile icon="users" label={o.staff} value={String(activeStaff.length)} hint={`${activeStaff.filter((s) => s.role === "super_admin").length} ${labels.staff.roles.super_admin} · ${activeStaff.filter((s) => s.role === "admin").length} ${labels.staff.roles.admin}`} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title={o.revenueChart}
          icon="layers"
          action={
            <Link href="/super-admin/reports" className="text-sm font-semibold text-accent hover:underline">
              {labels.nav.reports}
            </Link>
          }
        >
          <p className="-mt-2 mb-4 text-xs text-muted">{o.revenueChartHint}</p>
          <ColumnChart
            caption={o.revenueChart}
            emptyText={labels.reports.empty}
            bars={report.revenue.map((r) => ({ label: r.key, short: short(r.key), value: r.fils, display: money(r.fils, locale) }))}
          />
        </Panel>

        <div className="space-y-6">
          <Panel title={o.security} icon="shield">
            <p className="text-sm text-muted">{passkeys.length ? o.passkeyCount.replace("{count}", String(passkeys.length)) : o.passkeyNone}</p>
            <Link href="/super-admin/security" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">
              <Icon name="shield" className="h-4 w-4" />
              {passkeys.length ? labels.nav.security : o.addPasskey}
            </Link>
          </Panel>

          <Panel title={o.quick} icon="grid">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["/super-admin/staff", labels.nav.staff, "users"],
                  ["/super-admin/services", labels.nav.services, "tag"],
                  ["/super-admin/settings", labels.nav.settings, "clock"],
                  ["/super-admin/audit", labels.nav.audit, "document"],
                ] as const
              ).map(([href, label, icon]) => (
                <Link key={href} href={href} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium transition hover:border-accent hover:text-accent">
                  <Icon name={icon} className="h-4 w-4 text-accent" />
                  {label}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title={o.recent}
        icon="document"
        action={
          <Link href="/super-admin/audit" className="text-sm font-semibold text-accent hover:underline">
            {o.allActivity}
          </Link>
        }
      >
        <ul className="divide-y divide-border">
          {recent.map((entry) => {
            const at = when(entry.createdAt, months, locale);
            const reference = (entry.meta as { reference?: string } | null)?.reference;
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="font-medium">{entry.actorName ?? (entry.actorId ? labels.audit.removed : labels.audit.system)}</span>
                <span className="text-muted">{labels.audit.actions[entry.action] ?? entry.action}</span>
                {reference && (
                  <Link href={`/admin/bookings/${reference}`} dir="ltr" className="font-mono text-xs text-accent hover:underline">
                    {reference}
                  </Link>
                )}
                <span className="ms-auto text-xs text-muted">
                  {at.date} · <span dir="ltr">{at.time}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
