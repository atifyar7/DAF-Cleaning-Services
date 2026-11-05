import { initials, when } from "@/components/account/format";
import { Chip, EmptyState, FilterTabs, listHref, PageHeader, Pager, SearchForm } from "@/components/admin/ui";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { attentionCounts } from "@/lib/admin/bookings";
import { listCustomers } from "@/lib/admin/customers";
import { requireStaff } from "@/lib/dal";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminCustomersPage({ params, searchParams }: PageProps<"/[locale]/admin/customers">) {
  const { locale } = await params;
  const { staff } = await requireStaff("customer.view", locale);
  const query = await searchParams;
  const labels = getAdminContent(locale);
  const c = labels.customers;
  const months = getContent(locale).booking.months;
  const [result, counts] = await Promise.all([
    listCustomers(staff, { q: one(query.q), view: one(query.view), page: one(query.page) }),
    attentionCounts(staff),
  ]);
  const { filters } = result;
  const current = { view: filters.view === "all" ? undefined : filters.view, q: filters.q, page: filters.page };
  const path = "/admin/customers";

  return (
    <div className="space-y-5">
      <PageHeader title={c.title} description={labels.common.results.replace("{count}", String(result.total))} />
      <FilterTabs
        label={c.title}
        tabs={[
          { href: listHref(path, current, { view: undefined, page: 1 }), label: c.views.all, active: filters.view === "all" },
          { href: listHref(path, current, { view: "deletion", page: 1 }), label: c.views.deletion, count: counts.deletions, active: filters.view === "deletion" },
        ]}
      />
      <div className="rounded-2xl glass p-4 shadow-card">
        <SearchForm action={`/${locale}${path}`} value={filters.q} placeholder={c.searchPlaceholder} labels={labels.common} hidden={{ view: current.view }} />
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon="users" text={c.empty} />
      ) : (
        <div className="overflow-hidden rounded-2xl glass shadow-card">
          <table className="block w-full text-sm md:table">
            <thead className="hidden border-b border-border text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr>
                {Object.values(c.columns).map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-start font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block divide-y divide-border md:table-row-group">
              {result.rows.map((row) => (
                <tr key={row.id} className="relative grid grid-cols-2 gap-x-4 gap-y-2 p-4 transition hover:bg-surface/70 md:table-row md:p-0">
                  <td className="col-span-2 md:px-4 md:py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent">{initials(row.name, row.email)}</span>
                      <span className="min-w-0">
                        <Link href={`/admin/customers/${row.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-accent">
                          {row.name || row.email}
                        </Link>
                        <span className="block truncate text-xs text-muted" dir="ltr">
                          {row.email}
                        </span>
                        {row.disabledAt ? (
                          <Chip>{c.erasedChip}</Chip>
                        ) : (
                          row.deletionRequestedAt && (
                            <Chip tone="warning" icon="alert">
                              {c.deletionChip}
                            </Chip>
                          )
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="md:px-4 md:py-3" dir="ltr">
                    <span className="rtl:text-end">{row.phone ?? labels.common.none}</span>
                  </td>
                  <td className="md:px-4 md:py-3">
                    <span className="font-semibold">{row.bookings}</span>
                    <span className="text-xs text-muted"> · {labels.status.completed}: {row.completed}</span>
                  </td>
                  <td className="md:px-4 md:py-3">{row.lastBooking ? when(new Date(row.lastBooking), months, locale).date : labels.common.none}</td>
                  <td className="text-muted md:px-4 md:py-3">{when(row.createdAt, months, locale).date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={result.page} pages={result.pages} href={(page) => listHref(path, current, { page })} labels={labels.common} />
    </div>
  );
}
