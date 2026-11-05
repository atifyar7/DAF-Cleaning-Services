import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BookingActions } from "@/components/account/booking-actions";
import { aed, timeRange, when } from "@/components/account/format";
import { StatusBadge } from "@/components/account/status-badge";
import { Icon, type IconName } from "@/components/icon";
import { Photo } from "@/components/photo";
import { business, getContent } from "@/content";
import type { SiteContent } from "@/content/en";
import { Link } from "@/i18n/navigation";
import { canChange, getCustomerBooking } from "@/lib/booking/customer";
import { getBookingSettings, getFreeChangeHours } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { requirePermission } from "@/lib/dal";

const STEPS = ["pending", "confirmed", "assigned", "in_progress", "completed"] as const;

function InfoCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl glass p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Progress({ status, labels }: { status: string; labels: SiteContent["account"]["detail"]["events"] }) {
  const current = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol className="grid grid-cols-5 gap-1">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="relative flex flex-col items-center text-center">
            {index > 0 && (
              <span aria-hidden="true" className={`absolute top-4 end-1/2 h-0.5 w-full ${index <= current ? "bg-accent" : "bg-border"}`} />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                done ? "bg-accent text-primary-foreground" : active ? "bg-primary text-primary-foreground ring-4 ring-accent-soft" : "border-2 border-border bg-surface-raised text-muted"
              }`}
            >
              {done ? <Icon name="check" className="h-4 w-4" /> : index + 1}
            </span>
            <span className={`mt-2 text-[11px] leading-tight font-medium sm:text-xs ${active ? "text-foreground" : "text-muted"}`}>{labels[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function BookingDetailPage({ params }: PageProps<"/[locale]/account/bookings/[reference]">) {
  const { locale, reference } = await params;
  const { user } = await requirePermission("booking.view_own", locale);
  const found = /^DAF-[A-Z0-9]{8}$/.test(reference) ? await getCustomerBooking(user.id, reference) : null;
  if (!found) notFound();

  const content = getContent(locale);
  const account = content.account;
  const labels = account.detail;
  const { booking: item } = found;
  const [freeHours, settings] = await Promise.all([getFreeChangeHours(), getBookingSettings()]);
  const start = when(item.startAt, content.booking.months, locale);
  const hours = item.durationMinutes / 60;
  const today = dubaiDate(new Date());
  const name = locale === "ar" ? found.nameAr : found.nameEn;
  const mapLink =
    item.latitude !== null && item.longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`
      : null;

  const price =
    item.quoteStatus === "accepted" && item.quoteFils !== null
      ? { label: labels.quoted, value: aed(item.quoteFils, locale) }
      : item.quoteRequired
        ? { label: labels.price, value: labels.quotePending }
        : { label: labels.estimated, value: aed(item.totalFils ?? 0, locale) };

  return (
    <div className="space-y-6">
      <Link href="/account" className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm font-medium text-accent hover:underline">
        <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
        {labels.back}
      </Link>

      <section className="overflow-hidden rounded-3xl glass shadow-card">
        <div className="relative h-44 sm:h-56">
          <Photo src={`/images/${found.serviceSlug}.webp`} alt="" sizes="(min-width: 1024px) 900px, 100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-hero via-hero/50 to-hero/10" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 text-white sm:p-6">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">{name}</h2>
              <p className="mt-1 text-sm text-white/80">
                {account.bookings.reference}: <span dir="ltr" className="font-mono">{item.reference}</span>
              </p>
            </div>
            <StatusBadge status={item.status} label={account.status[item.status]} />
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <h3 className="mb-5 text-sm font-semibold text-muted">{account.progressTitle}</h3>
          {item.status === "cancelled" ? (
            <p className="flex items-center gap-3 rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger">
              <Icon name="close" className="h-5 w-5 shrink-0" />
              {account.cancelledBanner}
            </p>
          ) : (
            <Progress status={item.status} labels={labels.events} />
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard icon="calendar" title={labels.schedule}>
              <p className="text-lg font-semibold">{start.date}</p>
              <p dir={locale === "ar" ? "rtl" : "ltr"} className="mt-1 text-muted">
                {timeRange(item.startAt, item.endAt, locale, !item.quoteRequired)}
              </p>
              {!item.quoteRequired && <p className="mt-1 text-sm text-muted">{account.duration.replace("{hours}", String(hours))}</p>}
            </InfoCard>
            <InfoCard icon="pin" title={labels.location}>
              <p className="font-semibold">
                {item.building}, {item.unit}
              </p>
              <p className="mt-1 text-muted">{item.area}</p>
              {item.notes && <p className="mt-2 text-sm text-muted">{labels.notes}: {item.notes}</p>}
              {mapLink && (
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                  {account.openMap}
                  <Icon name="external" className="h-4 w-4" />
                </a>
              )}
            </InfoCard>
            <InfoCard icon="sparkle" title={labels.service}>
              <p className="font-semibold">{name}</p>
              {!item.quoteRequired && (
                <p className="mt-1 text-muted">
                  {(item.cleanerCount === 1 ? labels.cleaner : labels.cleaners).replace("{count}", String(item.cleanerCount)).replace("{hours}", String(hours))}
                </p>
              )}
              <p className="mt-1 text-sm text-muted">
                {labels.frequency}: {content.booking.service.frequencies[item.frequency]}
              </p>
              {found.addOns.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-muted">{labels.addOns}:</span> {found.addOns.map((a) => (locale === "ar" ? a.nameAr : a.nameEn)).join(", ")}
                  <span className="mt-1 block text-xs text-muted">{labels.addOnsNote}</span>
                </p>
              )}
            </InfoCard>
            <InfoCard icon="user" title={labels.contact}>
              <p className="font-semibold">{item.contactName}</p>
              <p dir="ltr" className="mt-1 text-sm text-muted rtl:text-end">
                {item.contactPhone}
              </p>
              <p dir="ltr" className="truncate text-sm text-muted rtl:text-end">
                {item.contactEmail}
              </p>
            </InfoCard>
          </div>

          {item.jobDetails && (
            <InfoCard icon="document" title={labels.jobDetails}>
              <p className="whitespace-pre-line">{item.jobDetails}</p>
            </InfoCard>
          )}

          <section className="rounded-2xl glass p-5 shadow-card">
            <h3 className="text-sm font-semibold text-muted">{labels.history}</h3>
            <ol className="mt-5 space-y-5">
              {found.events.map((event, index) => {
                const at = when(event.createdAt, content.booking.months, locale);
                const note = event.note?.startsWith("Rescheduled by team")
                  ? labels.rescheduledByTeamNote
                  : event.note?.startsWith("Rescheduled")
                    ? labels.rescheduledNote
                    : event.note === "Quote accepted"
                      ? labels.quoteAcceptedNote
                      : event.note === "Quote sent"
                        ? labels.quoteSentNote
                        : labels.events[event.toStatus];
                const last = index === found.events.length - 1;
                return (
                  <li key={index} className="relative flex gap-4">
                    {!last && <span aria-hidden="true" className="absolute top-6 bottom-[-1.25rem] start-[9px] w-0.5 bg-border" />}
                    <span className={`relative mt-1 h-5 w-5 shrink-0 rounded-full border-4 ${last ? "border-accent bg-surface-raised" : "border-accent-soft bg-accent"}`} />
                    <div>
                      <p className="font-medium">{note}</p>
                      <p className="text-sm text-muted">
                        {at.date} · <span dir="ltr">{at.time}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-2xl bg-hero p-5 text-white shadow-card">
            <p className="text-sm text-white/75">{price.label}</p>
            <p className="mt-1 text-3xl font-bold text-highlight">{price.value}</p>
          </section>
          <BookingActions
            reference={item.reference}
            locale={locale === "ar" ? "ar" : "en"}
            canChange={canChange(item.status, item.startAt, freeHours)}
            isOpen={["pending", "confirmed", "assigned"].includes(item.status)}
            freeHours={freeHours}
            quote={item.quoteStatus === "sent" && item.quoteFils !== null ? aed(item.quoteFils, locale) : null}
            quoteAccepted={item.quoteStatus === "accepted"}
            bookAgainHref={`/book?again=${item.reference}`}
            today={today}
            lastDate={addDays(today, settings.maxDaysAhead)}
            phone={business.phones[0]}
            labels={labels}
            calendar={{ months: content.booking.months, days: content.booking.days, previous: content.booking.schedule.previous, next: content.booking.schedule.next }}
          />
        </aside>
      </div>
    </div>
  );
}
