import { aed, timeRange, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { Chip, EmptyState, FilterTabs, listHref, PageHeader, Pager, SearchForm } from "@/components/admin/ui";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { bookingStatuses, listBookings, statusCounts } from "@/lib/admin/bookings";
import { requireStaff } from "@/lib/dal";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminBookingsPage({ params, searchParams }: PageProps<"/[locale]/admin/bookings">) {
  const { locale } = await params;
  const { staff } = await requireStaff("booking.view_all", locale);
  const query = await searchParams;
  const labels = getAdminContent(locale);
  const months = getContent(locale).booking.months;
  const [result, counts] = await Promise.all([
    listBookings(staff, { status: one(query.status), q: one(query.q), date: one(query.date), page: Number(one(query.page) ?? 1) }),
    statusCounts(staff),
  ]);
  const { filters } = result;
  const current = { status: filters.status, q: filters.q, date: filters.date, page: filters.page };
  const path = "/admin/bookings";
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const price = (row: (typeof result.rows)[number]) => {
    if (row.totalFils !== null && (!row.quoteRequired || row.quoteStatus === "accepted")) return aed(row.totalFils, locale);
    return labels.quote[row.quoteStatus];
  };

  return (
    <div className="space-y-5">
      <PageHeader title={labels.bookings.title} description={labels.common.results.replace("{count}", String(result.total))} />

      <FilterTabs
        label={labels.bookings.title}
        tabs={[
          { href: listHref(path, current, { status: undefined, page: 1 }), label: labels.common.all, count: total, active: !filters.status },
          ...bookingStatuses.map((status) => ({
            href: listHref(path, current, { status, page: 1 }),
            label: labels.status[status],
            count: counts[status],
            active: filters.status === status,
          })),
        ]}
      />

      <div className="rounded-2xl glass p-4 shadow-card">
        <SearchForm
          action={`/${locale}${path}`}
          value={filters.q}
          placeholder={labels.bookings.searchPlaceholder}
          labels={labels.common}
          hidden={{ status: filters.status }}
        >
          <label className="flex items-center gap-2 text-sm text-muted">
            {labels.bookings.date}
            <input
              type="date"
              name="date"
              defaultValue={filters.date}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
        </SearchForm>
        {filters.date && !filters.q && (
          <Link href={listHref(path, current, { date: undefined, page: 1 })} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
            {labels.common.clear}: {filters.date}
          </Link>
        )}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon="calendar" text={labels.bookings.empty} />
      ) : (
        <div className="overflow-hidden rounded-2xl glass shadow-card">
          {/* A table on wide screens; each row becomes a card on phones. */}
          <table className="block w-full text-sm lg:table">
            <thead className="hidden border-b border-border text-start text-xs tracking-wide text-muted uppercase lg:table-header-group">
              <tr>
                {Object.values(labels.bookings.columns).map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-start font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block divide-y divide-border lg:table-row-group">
              {result.rows.map((row) => {
                const start = when(row.startAt, months, locale);
                const short = row.assigned < row.cleanerCount && ["confirmed", "assigned"].includes(row.status);
                return (
                  <tr key={row.reference} className="relative grid grid-cols-2 gap-x-4 gap-y-2 p-4 transition hover:bg-surface/70 lg:table-row lg:p-0">
                    <td className="col-span-2 lg:px-4 lg:py-3">
                      <Link href={`/admin/bookings/${row.reference}`} className="font-semibold after:absolute after:inset-0 hover:text-accent">
                        {locale === "ar" ? row.nameAr : row.nameEn}
                      </Link>
                      <span className="block font-mono text-xs text-muted" dir="ltr">
                        {row.reference}
                      </span>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="block font-medium">{start.date}</span>
                      <span className="block text-xs text-muted" dir={dir}>
                        {timeRange(row.startAt, row.endAt, locale, !row.quoteRequired)}
                      </span>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="block truncate font-medium">{row.contactName}</span>
                      <span className="block truncate text-xs text-muted">{row.area}</span>
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      {row.quoteRequired && row.status === "pending" ? (
                        <span className="text-muted">{labels.common.none}</span>
                      ) : (
                        <Chip tone={short ? "warning" : row.assigned > 0 ? "accent" : "neutral"} icon="users">
                          {labels.bookings.teamOf.replace("{assigned}", String(row.assigned)).replace("{needed}", String(row.cleanerCount))}
                        </Chip>
                      )}
                    </td>
                    <td className="lg:px-4 lg:py-3">
                      <span className="block font-semibold">{price(row)}</span>
                      <span className="block text-xs text-muted">{labels.payment.status[row.paymentStatus]}</span>
                    </td>
                    <td className="col-span-2 lg:px-4 lg:py-3">
                      <StatusBadge status={row.status} label={labels.status[row.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={result.page} pages={result.pages} href={(page) => listHref(path, current, { page })} labels={labels.common} />
    </div>
  );
}
