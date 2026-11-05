import { notFound } from "next/navigation";
import { aed, initials, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { EraseCustomer } from "@/components/admin/erase-customer";
import { ContactLinks, Panel } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { getCustomer } from "@/lib/admin/customers";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/dal";

export default async function AdminCustomerPage({ params }: PageProps<"/[locale]/admin/customers/[id]">) {
  const { locale, id } = await params;
  const { user, staff } = await requireStaff("customer.view", locale);
  const customer = await getCustomer(staff, decodeURIComponent(id));
  if (!customer) notFound();

  const labels = getAdminContent(locale);
  const c = labels.customers;
  const months = getContent(locale).booking.months;
  const erased = !!customer.disabledAt;

  return (
    <div className="space-y-6">
      <Link href="/admin/customers" className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm font-medium text-accent hover:underline">
        <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
        {c.back}
      </Link>

      <section className="flex flex-wrap items-center gap-5 rounded-3xl glass p-6 shadow-card">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-highlight to-accent text-xl font-bold text-hero">
          {initials(customer.name, customer.email)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold">{customer.name || customer.email}</h2>
          {!erased && (
            <p className="truncate text-sm text-muted" dir="ltr">
              {customer.email}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            {c.joined.replace("{date}", when(customer.createdAt, months, locale).date)} · {c.language}: {c.languages[customer.locale === "ar" ? "ar" : "en"]}
          </p>
          {!erased && (
            <div className="mt-3">
              <ContactLinks phone={customer.phone} email={customer.email} labels={labels.common} />
            </div>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [c.stats.bookings, customer.bookings],
            [c.stats.completed, customer.completed],
            [c.stats.open, customer.openBookings],
          ].map(([label, value]) => (
            <div key={label} className="min-w-20 rounded-xl bg-surface px-3 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {erased ? (
        <p className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-border">
          <Icon name="shield" className="h-5 w-5 shrink-0" />
          {c.erased}
        </p>
      ) : (
        customer.deletionRequestedAt && (
          <section className="rounded-2xl glass p-5 shadow-card ring-1 ring-danger/40">
            <h3 className="flex items-center gap-2 font-semibold text-danger">
              <Icon name="alert" className="h-5 w-5" />
              {c.deletionTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed">{c.deletionBody.replace("{date}", when(customer.deletionRequestedAt, months, locale).date)}</p>
            {customer.openBookings > 0 ? (
              <p className="mt-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">{c.deletionOpen.replace("{count}", String(customer.openBookings))}</p>
            ) : (
              can(user.role, "customer.erase") && <EraseCustomer id={customer.id} labels={labels} />
            )}
          </section>
        )
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={c.bookings} icon="calendar">
          {customer.history.length === 0 ? (
            <p className="text-sm text-muted">{c.noBookings}</p>
          ) : (
            <ul className="divide-y divide-border">
              {customer.history.map((b) => {
                const start = when(b.startAt, months, locale);
                return (
                  <li key={b.reference}>
                    <Link href={`/admin/bookings/${b.reference}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-surface">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{locale === "ar" ? b.nameAr : b.nameEn}</span>
                        <span className="block text-xs text-muted">
                          <span dir="ltr" className="font-mono">
                            {b.reference}
                          </span>{" "}
                          · {start.date} · <span dir="ltr">{start.time}</span>
                        </span>
                      </span>
                      <span className="text-sm font-semibold">{b.totalFils !== null ? aed(b.totalFils, locale) : labels.bookings.quote}</span>
                      <StatusBadge status={b.status} label={labels.status[b.status]} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title={c.addresses} icon="pin">
          {customer.addresses.length === 0 ? (
            <p className="text-sm text-muted">{c.noAddresses}</p>
          ) : (
            <ul className="space-y-2">
              {customer.addresses.map((a) => (
                <li key={a.id} className="rounded-xl bg-surface p-3 text-sm">
                  {a.label && <p className="text-xs font-semibold text-accent">{a.label}</p>}
                  <p className="font-medium">
                    {a.building}, {a.unit}
                  </p>
                  <p className="text-muted">{a.area}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
