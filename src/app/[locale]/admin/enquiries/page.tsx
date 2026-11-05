import { when } from "@/components/account/format";
import { EnquiryToggle } from "@/components/admin/enquiry-toggle";
import { Chip, ContactLinks, EmptyState, FilterTabs, listHref, PageHeader, Pager, SearchForm } from "@/components/admin/ui";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { listEnquiries } from "@/lib/admin/enquiries";
import { requireStaff } from "@/lib/dal";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminEnquiriesPage({ params, searchParams }: PageProps<"/[locale]/admin/enquiries">) {
  const { locale } = await params;
  const { staff } = await requireStaff("enquiry.manage", locale);
  const query = await searchParams;
  const labels = getAdminContent(locale);
  const e = labels.enquiries;
  const months = getContent(locale).booking.months;
  const result = await listEnquiries(staff, { view: one(query.view), kind: one(query.kind), q: one(query.q), page: one(query.page) });
  const { filters } = result;
  const current = { view: filters.view === "open" ? undefined : filters.view, kind: filters.kind, q: filters.q, page: filters.page };
  const path = "/admin/enquiries";

  return (
    <div className="space-y-5">
      <PageHeader title={e.title} description={labels.common.results.replace("{count}", String(result.total))} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label={e.title}
          tabs={(["open", "handled", "all"] as const).map((view) => ({
            href: listHref(path, current, { view: view === "open" ? undefined : view, page: 1 }),
            label: e.views[view],
            count: view === "open" ? result.open : undefined,
            active: filters.view === view,
          }))}
        />
        <FilterTabs
          label={e.kinds.all}
          tabs={([undefined, "contact", "monthly_contract"] as const).map((kind) => ({
            href: listHref(path, current, { kind, page: 1 }),
            label: e.kinds[kind ?? "all"],
            active: filters.kind === kind,
          }))}
        />
      </div>
      <div className="rounded-2xl glass p-4 shadow-card">
        <SearchForm action={`/${locale}${path}`} value={filters.q} placeholder={e.searchPlaceholder} labels={labels.common} hidden={{ view: current.view, kind: filters.kind }} />
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon="inbox" text={e.empty} />
      ) : (
        <ul className="space-y-4">
          {result.rows.map((item) => {
            const received = when(item.createdAt, months, locale);
            const details = (item.details ?? {}) as { propertyType?: string; frequency?: string };
            const facts = [
              [e.service, item.service],
              [e.area, item.area],
              [e.propertyType, details.propertyType],
              [e.frequency, details.frequency],
            ].filter(([, value]) => value);
            return (
              <li key={item.id} className={`rounded-2xl glass p-5 shadow-card ${item.handledAt ? "opacity-80" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.name}</h3>
                      <Chip tone={item.kind === "monthly_contract" ? "accent" : "neutral"}>{e.kinds[item.kind]}</Chip>
                      {item.handledAt && (
                        <Chip icon="check">{e.handledOn.replace("{date}", when(item.handledAt, months, locale).date)}</Chip>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      <span dir="ltr">{item.phone}</span> · <span dir="ltr">{item.email}</span>
                    </p>
                    <p className="text-xs text-muted">{e.received.replace("{date}", received.date).replace("{time}", received.time)}</p>
                  </div>
                  <EnquiryToggle id={item.id} handled={!!item.handledAt} labels={{ markHandled: e.markHandled, reopen: e.reopen, failed: labels.errors.failed }} />
                </div>
                {facts.length > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-2">
                    {facts.map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-surface px-3 py-1.5 text-xs">
                        <dt className="inline text-muted">{label}: </dt>
                        <dd className="inline font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-3 rounded-xl bg-surface p-3 text-sm whitespace-pre-line">{item.message}</p>
                <div className="mt-3">
                  <ContactLinks phone={item.phone} email={item.email} labels={{ ...labels.common, email: e.reply }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result.page} pages={result.pages} href={(page) => listHref(path, current, { page })} labels={labels.common} />
    </div>
  );
}
