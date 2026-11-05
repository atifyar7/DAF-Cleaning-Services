import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { aed, timeRange, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import {
  NoteForm,
  PaymentControls,
  QuoteControls,
  RescheduleControls,
  StatusControls,
  TeamControls,
} from "@/components/admin/booking-controls";
import { Chip, ContactLinks, Panel } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { Photo } from "@/components/photo";
import { getContent } from "@/content";
import { getAdminContent } from "@/content/admin";
import { Link } from "@/i18n/navigation";
import { cleanersForBooking, getAdminBooking } from "@/lib/admin/bookings";
import { availableActions, canAssign, canQuote, OPEN_STATUSES } from "@/lib/admin/workflow";
import { getBookingSettings } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-medium">{children}</dd>
    </div>
  );
}

export default async function AdminBookingPage({ params }: PageProps<"/[locale]/admin/bookings/[reference]">) {
  const { locale, reference } = await params;
  const { staff } = await requireStaff("booking.view_all", locale);
  const found = /^DAF-[A-Z0-9]{8}$/.test(reference) ? await getAdminBooking(staff, reference) : null;
  if (!found) notFound();

  const labels = getAdminContent(locale);
  const d = labels.detail;
  const site = getContent(locale);
  const months = site.booking.months;
  const item = found.booking;
  const [options, settings] = await Promise.all([cleanersForBooking(staff, reference), getBookingSettings()]);
  const start = when(item.startAt, months, locale);
  const created = when(item.createdAt, months, locale);
  const hours = item.durationMinutes / 60;
  const name = locale === "ar" ? found.nameAr : found.nameEn;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const current = { status: item.status, quoteRequired: item.quoteRequired, quoteStatus: item.quoteStatus, assigned: found.team.length };
  const actions = availableActions(current);
  const quoteBlocked = item.status === "pending" && item.quoteRequired && item.quoteStatus !== "accepted";
  const today = dubaiDate(new Date());
  const mapLink =
    item.latitude !== null && item.longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`
      : null;
  const price =
    item.quoteStatus === "accepted" && item.quoteFils !== null
      ? { label: d.quoted, value: aed(item.quoteFils, locale) }
      : item.quoteRequired
        ? { label: d.price, value: item.quoteFils !== null ? aed(item.quoteFils, locale) : d.awaitingQuote }
        : { label: d.estimated, value: aed(item.totalFils ?? 0, locale) };

  const eventLabel = (event: (typeof found.events)[number]) => {
    if (event.note === "Quote sent") return d.eventNotes.quoteSent;
    if (event.note === "Quote accepted") return d.eventNotes.quoteAccepted;
    if (event.note?.startsWith("Rescheduled by team")) return d.eventNotes.rescheduledByTeam;
    if (event.note?.startsWith("Rescheduled")) return d.eventNotes.rescheduled;
    return d.events[event.toStatus];
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/bookings" className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm font-medium text-accent hover:underline">
        <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
        {d.back}
      </Link>

      <section className="overflow-hidden rounded-3xl glass shadow-card">
        <div className="relative h-36 sm:h-44">
          <Photo src={`/images/${found.serviceSlug}.webp`} alt="" sizes="(min-width: 1024px) 1100px, 100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-hero via-hero/60 to-hero/20" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 text-white sm:p-6">
            <div>
              <p className="font-mono text-sm text-white/80" dir="ltr">
                {item.reference}
              </p>
              <h2 className="text-2xl font-bold sm:text-3xl">{name}</h2>
              <p className="mt-1 text-sm text-white/75">{d.created.replace("{date}", created.date).replace("{time}", created.time)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.quoteRequired && (
                <Chip tone={item.quoteStatus === "accepted" ? "accent" : "warning"} icon="tag">
                  {labels.quote[item.quoteStatus]}
                </Chip>
              )}
              <StatusBadge status={item.status} label={labels.status[item.status]} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title={d.schedule} icon="calendar">
              <p className="text-lg font-semibold">{start.date}</p>
              <p dir={dir} className="mt-1 text-muted">
                {timeRange(item.startAt, item.endAt, locale, !item.quoteRequired)}
              </p>
              <p className="mt-2 text-sm text-muted">
                {item.quoteRequired
                  ? d.quoteVisit
                  : (item.cleanerCount === 1 ? d.cleaner : d.cleaners).replace("{count}", String(item.cleanerCount)).replace("{hours}", String(hours))}
              </p>
            </Panel>

            <Panel title={d.location} icon="pin">
              <p className="font-semibold">
                {item.building}, {item.unit}
              </p>
              <p className="mt-1 text-muted">{item.area}</p>
              {item.notes && (
                <p className="mt-2 rounded-lg bg-surface p-2 text-sm">
                  <span className="text-muted">{d.accessNotes}:</span> {item.notes}
                </p>
              )}
              {mapLink && (
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                  {labels.common.openMap}
                  <Icon name="external" className="h-4 w-4" />
                </a>
              )}
            </Panel>

            <Panel title={d.customer} icon="user">
              <p className="font-semibold">{item.contactName}</p>
              <p dir="ltr" className="mt-1 text-sm text-muted rtl:text-end">
                {item.contactPhone}
              </p>
              <p dir="ltr" className="truncate text-sm text-muted rtl:text-end">
                {item.contactEmail}
              </p>
              {item.whatsappOptIn && (
                <p className="mt-2">
                  <Chip tone="accent" icon="whatsapp">
                    {d.whatsappOptIn}
                  </Chip>
                </p>
              )}
              <div className="mt-3">
                <ContactLinks phone={item.contactPhone} email={item.contactEmail} labels={labels.common} />
              </div>
              <p className="mt-3 border-t border-border pt-3 text-sm">
                {found.customer ? (
                  <Link href={`/admin/customers/${found.customer.id}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
                    {d.viewCustomer} · {d.customerBookings.replace("{count}", String(found.customer.bookings))}
                  </Link>
                ) : (
                  <span className="text-muted">{d.guest}</span>
                )}
              </p>
            </Panel>

            <Panel title={d.service} icon="sparkle">
              <dl className="divide-y divide-border">
                <Row label={d.service}>{name}</Row>
                <Row label={d.frequency}>{d.frequencies[item.frequency]}</Row>
                {found.addOns.length > 0 && <Row label={d.addOns}>{found.addOns.map((a) => (locale === "ar" ? a.nameAr : a.nameEn)).join(", ")}</Row>}
                <Row label={d.payment}>
                  {labels.payment.method[item.paymentMethod]} · {labels.payment.status[item.paymentStatus]}
                </Row>
              </dl>
            </Panel>
          </div>

          {item.jobDetails && (
            <Panel title={d.jobDetails} icon="document">
              <p className="whitespace-pre-line">{item.jobDetails}</p>
            </Panel>
          )}

          <Panel title={d.notes} icon="note">
            <p className="-mt-2 mb-3 text-xs text-muted">{d.notesHint}</p>
            <NoteForm reference={item.reference} labels={labels} />
            {found.notes.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{d.notesEmpty}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {found.notes.map((note) => {
                  const at = when(note.createdAt, months, locale);
                  return (
                    <li key={note.id} className="rounded-xl bg-surface p-3">
                      <p className="text-sm whitespace-pre-line">{note.body}</p>
                      <p className="mt-1.5 text-xs text-muted">
                        {note.authorName ?? labels.common.system} · {at.date} · <span dir="ltr">{at.time}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title={d.history} icon="clock">
            <ol className="space-y-5">
              {found.events.map((event, index) => {
                const at = when(event.createdAt, months, locale);
                const last = index === found.events.length - 1;
                const who = event.actorName ? (event.actorRole === "customer" ? `${labels.common.customer}: ${event.actorName}` : event.actorName) : labels.common.system;
                return (
                  <li key={index} className="relative flex gap-4">
                    {!last && <span aria-hidden="true" className="absolute top-6 bottom-[-1.25rem] start-[9px] w-0.5 bg-border" />}
                    <span className={`relative mt-1 h-5 w-5 shrink-0 rounded-full border-4 ${last ? "border-accent bg-surface-raised" : "border-accent-soft bg-accent"}`} />
                    <div className="min-w-0">
                      <p className="font-medium">{eventLabel(event)}</p>
                      {event.toStatus === "cancelled" && item.cancelReason && last && <p className="text-sm">{item.cancelReason}</p>}
                      <p className="text-sm text-muted">
                        {at.date} · <span dir="ltr">{at.time}</span> · {labels.common.by.replace("{name}", who)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-2xl bg-hero p-5 text-white shadow-card">
            <p className="text-sm text-white/75">{price.label}</p>
            <p className="mt-1 text-3xl font-bold text-highlight">{price.value}</p>
            <p className="mt-2 text-sm text-white/75">
              {labels.payment.method[item.paymentMethod]} · {labels.payment.status[item.paymentStatus]}
            </p>
          </section>

          <StatusControls reference={item.reference} actions={actions} quoteBlocked={quoteBlocked} labels={labels} />
          {canQuote(item) && <QuoteControls reference={item.reference} current={item.quoteFils !== null ? aed(item.quoteFils, locale) : null} labels={labels} />}
          {item.quoteStatus === "accepted" && item.quoteFils !== null && item.status === "pending" && (
            <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent">{d.quoteAcceptedNote.replace("{price}", aed(item.quoteFils, locale))}</p>
          )}
          {OPEN_STATUSES.includes(item.status) ? (
            <TeamControls
              reference={item.reference}
              options={options}
              selected={found.team.map((t) => t.id)}
              needed={item.cleanerCount}
              enabled={canAssign(item.status)}
              labels={labels}
            />
          ) : (
            found.team.length > 0 && (
              <Panel title={d.team} icon="users">
                <ul className="space-y-1.5 text-sm">
                  {found.team.map((member) => (
                    <li key={member.id} className="flex justify-between gap-3">
                      <span className="font-medium">{member.name}</span>
                      {member.phone && (
                        <a href={`tel:${member.phone}`} dir="ltr" className="text-accent hover:underline">
                          {member.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )
          )}
          {(item.status !== "cancelled" || item.paymentStatus === "paid" || item.paymentStatus === "refunded") && (
            <PaymentControls reference={item.reference} method={item.paymentMethod} status={item.paymentStatus} labels={labels} />
          )}
          {OPEN_STATUSES.includes(item.status) && (
            <RescheduleControls reference={item.reference} today={today} lastDate={addDays(today, settings.maxDaysAhead)} locale={locale} labels={labels} />
          )}
        </aside>
      </div>
    </div>
  );
}
