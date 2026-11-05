import { when } from "@/components/account/format";
import { EmptyState, FilterTabs, listHref, PageHeader, Pager } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { getSuperAdminContent } from "@/content/super-admin";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/dal";
import { auditActors, auditAreas, listAudit } from "@/lib/super-admin/audit";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SuperAdminAuditPage({ params, searchParams }: PageProps<"/[locale]/super-admin/audit">) {
  const { locale } = await params;
  const { staff: owner } = await requireStaff("audit.view", locale);
  const query = await searchParams;
  const labels = getSuperAdminContent(locale);
  const a = labels.audit;
  const admin = getAdminContent(locale);
  const months = getContent(locale).booking.months;
  const [result, actors] = await Promise.all([
    listAudit(owner, { area: one(query.area), actor: one(query.actor), q: one(query.q), from: one(query.from), to: one(query.to), page: one(query.page) }),
    auditActors(owner),
  ]);
  const { filters } = result;
  const current = { area: filters.area, actor: filters.actor, q: filters.q, from: filters.from, to: filters.to, page: filters.page };
  const path = "/super-admin/audit";
  const field = "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
  const subjectName = (id: string | null) => result.subjects.find((s) => s.id === id)?.name;

  return (
    <div className="space-y-5">
      <PageHeader title={a.title} description={`${a.intro} ${admin.common.results.replace("{count}", String(result.total))}`} />

      <FilterTabs
        label={a.title}
        tabs={[undefined, ...auditAreas].map((area) => ({
          href: listHref(path, current, { area, page: 1 }),
          label: a.areas[area ?? "all"],
          active: filters.area === area,
        }))}
      />

      <form action={`/${locale}${path}`} method="get" className="flex flex-wrap items-end gap-3 rounded-2xl glass p-4 shadow-card">
        {filters.area && <input type="hidden" name="area" value={filters.area} />}
        <label className="min-w-0 flex-1 basis-56 text-sm text-muted">
          <span className="sr-only">{admin.common.search}</span>
          <input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder={a.searchPlaceholder} className={`${field} w-full`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {a.who}
          <select name="actor" defaultValue={filters.actor ?? ""} className={field}>
            <option value="">{a.everyone}</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} ({admin.roles[actor.role === "super_admin" ? "super_admin" : "admin"]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {a.from}
          <input type="date" name="from" defaultValue={filters.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {a.to}
          <input type="date" name="to" defaultValue={filters.to} className={field} />
        </label>
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">{a.apply}</button>
        {(filters.q || filters.actor || filters.from || filters.to) && (
          <a href={`/${locale}${listHref(path, {}, { area: filters.area })}`} className="px-2 py-2 text-sm font-medium text-muted hover:text-foreground">
            {admin.common.clear}
          </a>
        )}
      </form>

      {result.rows.length === 0 ? (
        <EmptyState icon="document" text={a.empty} />
      ) : (
        <ol className="overflow-hidden rounded-2xl glass shadow-card">
          {result.rows.map((row, index) => {
            const at = when(row.createdAt, months, locale);
            const meta = row.meta as Record<string, unknown> | null;
            const reference = typeof meta?.reference === "string" ? meta.reference : null;
            const subject = row.entity === "user" && row.entityId !== row.actorId ? subjectName(row.entityId) : null;
            return (
              <li key={row.id} className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4 ${index > 0 ? "border-t border-border" : ""}`}>
                <span className="w-36 shrink-0 text-xs text-muted">
                  {at.date}
                  <span className="block" dir="ltr">
                    {at.time}
                  </span>
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{row.actorName ?? (row.actorId ? a.removed : a.system)}</span>
                    {row.actorRole && row.actorRole !== "system" && (
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-border">
                        {row.actorRole === "super_admin" || row.actorRole === "admin" ? admin.roles[row.actorRole] : admin.common.customer}
                      </span>
                    )}
                    <span>{a.actions[row.action] ?? row.action}</span>
                    {reference && (
                      <Link href={`/admin/bookings/${reference}`} dir="ltr" className="font-mono text-xs text-accent hover:underline">
                        {reference}
                      </Link>
                    )}
                  </span>
                  {(subject || row.ipAddress) && (
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                      {subject && <span>{a.about.replace("{name}", subject)}</span>}
                      {row.ipAddress && <span dir="ltr">{a.ip.replace("{ip}", row.ipAddress)}</span>}
                    </span>
                  )}
                  {meta && Object.keys(meta).length > 0 && (
                    <details className="group text-xs">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-accent">
                        <Icon name="chevron" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        {a.details}
                      </summary>
                      <pre dir="ltr" className="mt-2 max-h-60 overflow-auto rounded-lg bg-surface p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                        {JSON.stringify(meta, null, 2)}
                      </pre>
                    </details>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <Pager page={result.page} pages={result.pages} href={(page) => listHref(path, current, { page })} labels={admin.common} />
    </div>
  );
}
