"use client";

import { useState, useTransition, type ReactNode } from "react";
import { checkAvailability, createBooking } from "@/app/actions/booking";
import type { SiteContent } from "@/content/en";
import { Link } from "@/i18n/navigation";
import { detailsStep, normalizeUaeMobile } from "@/lib/booking/input";
import { allowsAddOns, isQuote, type BookingSettings, type CatalogService, type Slot } from "@/lib/booking/rules";
import { displayDate, displayTime, parseTime } from "@/lib/booking/time";
import { aed } from "../account/format";
import { Icon } from "../icon";
import { Calendar } from "./calendar";
import { LocationPicker } from "./location-picker";

export type WizardService = CatalogService & { name: string; categoryName: string };
type Labels = SiteContent["booking"];
type Frequency = "one_time" | "daily" | "weekly" | "monthly";

type Props = {
  locale: "en" | "ar";
  labels: Labels;
  services: WizardService[];
  addOns: { slug: string; name: string }[];
  settings: Pick<BookingSettings, "minHours" | "maxHours" | "maxCleaners">;
  today: string;
  lastDate: string;
  initialService: string;
  prefill: { name: string; email: string; phone: string };
  signedIn: boolean;
  /** A past booking to repeat: everything but the date and time. */
  repeat?: Repeat;
  addresses?: SavedAddress[];
};

export type Repeat = {
  service: string;
  frequency: Frequency;
  cleaners: number;
  hours: number;
  addOns: string[];
  jobDetails: string;
  building: string;
  unit: string;
  area: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

export type SavedAddress = {
  id: string;
  label: string;
  building: string;
  unit: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
};

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

export function BookingWizard(props: Props) {
  const { locale, labels, services, settings } = props;
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, startSubmit] = useTransition();

  const repeat = props.repeat;
  const [service, setService] = useState(repeat?.service ?? props.initialService);
  const [frequency, setFrequency] = useState<Frequency>(repeat?.frequency ?? "one_time");
  const [cleaners, setCleaners] = useState(repeat?.cleaners ?? 2);
  const [hours, setHours] = useState(repeat?.hours ?? Math.max(3, settings.minHours));
  const [addOns, setAddOns] = useState<string[]>(repeat?.addOns ?? []);
  const [jobDetails, setJobDetails] = useState(repeat?.jobDetails ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ key: string; status: "loading" | "ready" | "error"; list: Slot[] } | null>(null);
  const [details, setDetails] = useState({
    name: props.prefill.name,
    phone: props.prefill.phone,
    email: props.prefill.email,
    whatsapp: true,
    building: repeat?.building ?? "",
    unit: repeat?.unit ?? "",
    area: repeat?.area ?? "",
    notes: repeat?.notes ?? "",
    latitude: repeat?.latitude ?? (null as number | null),
    longitude: repeat?.longitude ?? (null as number | null),
  });
  const [terms, setTerms] = useState(false);
  const [website, setWebsite] = useState("");

  const selected = services.find((item) => item.slug === service);
  const quote = selected ? isQuote(selected) : false;
  const slotKey = `${service}|${date}|${quote ? 1 : cleaners}|${quote ? 1 : hours}`;
  const currentSlots = slots?.key === slotKey ? slots : null;
  const timeIsValid = !!time && !!currentSlots?.list.some((slot) => slot.time === time && slot.available);

  async function loadSlots(forDate: string, keepTime: string) {
    const key = `${service}|${forDate}|${quote ? 1 : cleaners}|${quote ? 1 : hours}`;
    setSlots({ key, status: "loading", list: [] });
    try {
      const result = await checkAvailability({ service, date: forDate, cleaners: quote ? 1 : cleaners, hours: quote ? 1 : hours });
      if (!result.ok) throw new Error(result.error);
      setSlots((current) => (current?.key === key ? { key, status: "ready", list: result.slots } : current));
      if (!result.slots.some((slot) => slot.time === keepTime && slot.available)) setTime("");
    } catch {
      setSlots((current) => (current?.key === key ? { key, status: "error", list: [] } : current));
    }
  }

  function chooseService(slug: string) {
    setService(slug);
    const next = services.find((item) => item.slug === slug);
    if (next && !allowsAddOns(next)) setAddOns([]);
  }

  // Field problems for the current step. Shown only after the customer tries to continue.
  const detailsCheck = detailsStep.safeParse(details);
  const detailErrors = new Set(detailsCheck.success ? [] : detailsCheck.error.issues.map((issue) => String(issue.path[0])));
  const stepValid = [
    !!selected && (!quote || jobDetails.trim().length >= 10),
    timeIsValid,
    detailsCheck.success,
    terms,
  ];

  function goTo(next: number) {
    setNotice("");
    setShowErrors(false);
    setStep(next);
    if (next === 1 && date && !currentSlots) loadSlots(date, time);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (!stepValid[step]) {
      setShowErrors(true);
      return;
    }
    goTo(step + 1);
  }

  function submit() {
    if (!stepValid.every(Boolean)) {
      setShowErrors(true);
      return;
    }
    startSubmit(async () => {
      setNotice("");
      const result = await createBooking({
        service,
        frequency,
        cleaners: quote ? 1 : cleaners,
        hours: quote ? 1 : hours,
        addOns,
        jobDetails: jobDetails.trim(),
        date,
        time,
        details,
        terms,
        locale,
        website,
      });
      if (result.ok) {
        setReference(result.reference);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (result.error === "slot") {
        setTime("");
        setStep(1);
        loadSlots(date, "");
        setNotice(labels.errors.slot);
        return;
      }
      setNotice(
        result.error === "limited" ? labels.errors.tooMany : result.error === "invalid" ? labels.errors.invalid : labels.errors.failed,
      );
    });
  }

  if (reference) {
    return (
      <div className="fade-up mx-auto max-w-xl rounded-2xl border border-border bg-surface-raised p-8 text-center shadow-card">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="check" className="h-8 w-8" />
        </span>
        <h2 className="mt-5 text-2xl font-bold">{labels.success.title}</h2>
        <p className="mt-4 text-sm text-muted">{labels.success.reference}</p>
        <p dir="ltr" className="mt-1 font-mono text-3xl font-bold tracking-wider text-accent">
          {reference}
        </p>
        <p className="mt-5 leading-relaxed text-muted">{labels.success.body}</p>
        {!props.signedIn && <p className="mt-2 text-sm text-muted">{labels.success.track}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={props.signedIn ? "/account" : "/login"} className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary-hover">
            {labels.success.account}
          </Link>
          <Link href="/" className="rounded-xl border border-border px-6 py-3 font-semibold hover:border-accent hover:text-accent">
            {labels.success.home}
          </Link>
        </div>
      </div>
    );
  }

  const estimate = selected && !quote ? selected.priceFils! * cleaners * hours : null;
  const startMinutes = parseTime(time);
  const duration = quote ? 60 : hours * 60;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <Progress step={step} labels={labels} onSelect={(index) => index < step && goTo(index)} />
        {notice && (
          <p role="alert" className="mt-6 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {notice}
          </p>
        )}

        <div key={step} className="fade-up mt-6 rounded-2xl border border-border bg-surface-raised p-5 shadow-card sm:p-8">
          {step === 0 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold">{labels.service.title}</h2>
              <ServicePicker services={services} value={service} onChange={chooseService} labels={labels} locale={locale} />
              {showErrors && !selected && <FieldError>{labels.errors.required}</FieldError>}

              {selected && !quote && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <Counter
                    label={labels.service.cleaners}
                    value={cleaners}
                    min={1}
                    max={settings.maxCleaners}
                    onChange={setCleaners}
                  />
                  <Counter label={labels.service.hours} value={hours} min={settings.minHours} max={settings.maxHours} onChange={setHours} />
                  <p className="text-sm text-muted sm:col-span-2">{fill(labels.service.hoursNote, { min: settings.minHours })}</p>
                </div>
              )}

              {selected && quote && (
                <div className="space-y-4">
                  <p className="flex gap-3 rounded-xl bg-accent-soft p-4 text-sm">
                    <Icon name="tag" className="h-5 w-5 shrink-0 text-accent" />
                    {labels.service.quoteNote}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {labels.service.jobDetails}
                    <textarea
                      name="jobDetails"
                      rows={4}
                      maxLength={2000}
                      value={jobDetails}
                      onChange={(event) => setJobDetails(event.target.value)}
                      aria-invalid={showErrors && jobDetails.trim().length < 10}
                      className={inputClass(showErrors && jobDetails.trim().length < 10)}
                    />
                    <span className="font-normal text-muted">{labels.service.jobDetailsHint}</span>
                  </label>
                  {showErrors && jobDetails.trim().length < 10 && <FieldError>{labels.errors.jobDetails}</FieldError>}
                </div>
              )}

              {selected && (
                <fieldset>
                  <legend className="text-sm font-medium">{labels.service.frequency}</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(labels.service.frequencies) as Frequency[]).map((key) => (
                      <Choice key={key} selected={frequency === key} onClick={() => setFrequency(key)}>
                        {labels.service.frequencies[key]}
                      </Choice>
                    ))}
                  </div>
                  {frequency !== "one_time" && <p className="mt-3 text-sm text-muted">{labels.service.recurringNote}</p>}
                </fieldset>
              )}

              {selected && allowsAddOns(selected) && (
                <fieldset>
                  <legend className="text-sm font-medium">{labels.service.addOns}</legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {props.addOns.map((item) => {
                      const checked = addOns.includes(item.slug);
                      return (
                        <label
                          key={item.slug}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                            checked ? "border-accent bg-accent-soft" : "border-border hover:border-accent"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setAddOns(checked ? addOns.filter((slug) => slug !== item.slug) : [...addOns, item.slug])}
                            className="mt-1 h-4 w-4 accent-[var(--accent)]"
                          />
                          <span>
                            <span className="block font-medium">{item.name}</span>
                            <span className="block text-sm text-muted">{labels.service.addOnNote}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">{labels.schedule.title}</h2>
              <div className="grid gap-6 xl:grid-cols-2">
                <Calendar
                  value={date}
                  min={props.today}
                  max={props.lastDate}
                  today={props.today}
                  months={labels.months}
                  days={labels.days}
                  labels={labels.schedule}
                  onChange={(value) => {
                    setDate(value);
                    loadSlots(value, time);
                  }}
                />
                <div>
                  <p className="text-sm font-medium">{quote ? labels.schedule.arrival : labels.schedule.time}</p>
                  {!date && <p className="mt-3 text-sm text-muted">{labels.schedule.pickDate}</p>}
                  {date && currentSlots?.status === "loading" && (
                    <p className="mt-3 text-sm text-muted" aria-live="polite">
                      {labels.schedule.loading}
                    </p>
                  )}
                  {date && currentSlots?.status === "error" && (
                    <div className="mt-3 text-sm">
                      <p className="text-danger">{labels.schedule.error}</p>
                      <button type="button" onClick={() => loadSlots(date, time)} className="mt-2 font-medium text-accent underline">
                        {labels.schedule.retry}
                      </button>
                    </div>
                  )}
                  {date && currentSlots?.status === "ready" && currentSlots.list.length === 0 && (
                    <p className="mt-3 text-sm text-muted">{labels.schedule.none}</p>
                  )}
                  {date && currentSlots?.status === "ready" && currentSlots.list.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {currentSlots.list.map((slot) => {
                        const minutes = parseTime(slot.time)!;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            disabled={!slot.available}
                            aria-pressed={time === slot.time}
                            onClick={() => setTime(slot.time)}
                            className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                              time === slot.time
                                ? "border-primary bg-primary text-primary-foreground"
                                : slot.available
                                  ? "border-border hover:border-accent"
                                  : "cursor-not-allowed border-border text-muted line-through opacity-50"
                            }`}
                          >
                            <span dir="ltr">{displayTime(minutes, locale)}</span>
                            {!slot.available && <span className="sr-only"> {labels.schedule.full}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {timeIsValid && !quote && startMinutes !== null && (
                    <p className="mt-4 text-sm text-muted">
                      {fill(labels.schedule.finishes, { time: displayTime(startMinutes + duration, locale) })}
                    </p>
                  )}
                  {showErrors && !timeIsValid && <FieldError>{labels.errors.time}</FieldError>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">{labels.details.title}</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label={labels.details.name}
                  name="name"
                  autoComplete="name"
                  value={details.name}
                  onChange={(name) => setDetails({ ...details, name })}
                  error={showErrors && detailErrors.has("name") ? labels.errors.name : ""}
                />
                <TextField
                  label={labels.details.phone}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  hint={labels.details.phoneHint}
                  value={details.phone}
                  onChange={(phone) => setDetails({ ...details, phone })}
                  error={showErrors && detailErrors.has("phone") ? labels.errors.phone : ""}
                />
                <div className="sm:col-span-2">
                  <TextField
                    label={labels.details.email}
                    name="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    hint={labels.details.emailHint}
                    value={details.email}
                    onChange={(email) => setDetails({ ...details, email })}
                    error={showErrors && detailErrors.has("email") ? labels.errors.email : ""}
                  />
                </div>
                <label className="flex items-center gap-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={details.whatsapp}
                    onChange={(event) => setDetails({ ...details, whatsapp: event.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <Icon name="whatsapp" className="h-5 w-5 text-accent" />
                  {labels.details.whatsapp}
                </label>
                {props.addresses && props.addresses.length > 0 && (
                  <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                    {labels.details.savedAddress}
                    <select
                      name="savedAddress"
                      defaultValue=""
                      onChange={(event) => {
                        const chosen = props.addresses!.find((address) => address.id === event.target.value);
                        if (!chosen) return;
                        const { building, unit, area, latitude, longitude } = chosen;
                        setDetails((current) => ({ ...current, building, unit, area, latitude, longitude }));
                      }}
                      className={inputClass(false)}
                    >
                      <option value="">{labels.details.chooseAddress}</option>
                      {props.addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label ? `${address.label}: ` : ""}
                          {address.building}, {address.unit}, {address.area}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <TextField
                  label={labels.details.building}
                  name="building"
                  value={details.building}
                  onChange={(building) => setDetails({ ...details, building })}
                  error={showErrors && detailErrors.has("building") ? labels.errors.required : ""}
                />
                <TextField
                  label={labels.details.unit}
                  name="unit"
                  value={details.unit}
                  onChange={(unit) => setDetails({ ...details, unit })}
                  error={showErrors && detailErrors.has("unit") ? labels.errors.required : ""}
                />
                <div className="sm:col-span-2">
                  <TextField
                    label={labels.details.area}
                    name="area"
                    autoComplete="address-level2"
                    value={details.area}
                    onChange={(area) => setDetails({ ...details, area })}
                    error={showErrors && detailErrors.has("area") ? labels.errors.required : ""}
                  />
                </div>
                <LocationPicker
                  latitude={details.latitude}
                  longitude={details.longitude}
                  labels={labels.details}
                  onChange={(latitude, longitude) => setDetails((current) => ({ ...current, latitude, longitude }))}
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  {labels.details.notes}
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    value={details.notes}
                    onChange={(event) => setDetails({ ...details, notes: event.target.value })}
                    className={inputClass(false)}
                  />
                </label>
                {/* Hidden from people. Bots that fill it in are ignored. */}
                <div aria-hidden="true" className="hidden">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && selected && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">{labels.review.title}</h2>
              <dl className="divide-y divide-border rounded-xl border border-border">
                <ReviewRow label={labels.review.service} onEdit={() => goTo(0)} editLabel={labels.review.edit}>
                  <p className="font-medium">{selected.name}</p>
                  <p className="text-sm text-muted">
                    {labels.service.frequencies[frequency]}
                    {!quote && ` · ${cleaners === 1 ? fill(labels.summary.cleaner, { hours }) : fill(labels.summary.cleaners, { count: cleaners, hours })}`}
                  </p>
                  {addOns.length > 0 && (
                    <p className="text-sm text-muted">
                      {labels.review.addOns}: {props.addOns.filter((item) => addOns.includes(item.slug)).map((item) => item.name).join(", ")}
                    </p>
                  )}
                  {quote && <p className="mt-1 text-sm whitespace-pre-line text-muted">{jobDetails.trim()}</p>}
                </ReviewRow>
                <ReviewRow label={labels.review.schedule} onEdit={() => goTo(1)} editLabel={labels.review.edit}>
                  <p className="font-medium">{displayDate(date, labels.months)}</p>
                  <p dir={locale === "ar" ? "rtl" : "ltr"} className="text-sm text-muted">
                    {startMinutes !== null && `${displayTime(startMinutes, locale)}${quote ? "" : ` – ${displayTime(startMinutes + duration, locale)}`}`}
                  </p>
                </ReviewRow>
                <ReviewRow label={labels.review.contact} onEdit={() => goTo(2)} editLabel={labels.review.edit}>
                  <p className="font-medium">{details.name}</p>
                  <p dir="ltr" className="text-sm text-muted rtl:text-end">
                    {normalizeUaeMobile(details.phone)} · {details.email}
                  </p>
                </ReviewRow>
                <ReviewRow label={labels.review.location} onEdit={() => goTo(2)} editLabel={labels.review.edit}>
                  <p className="font-medium">
                    {details.building}, {details.unit}
                  </p>
                  <p className="text-sm text-muted">
                    {details.area}
                    {details.latitude !== null && ` · ${labels.review.pinnedOnMap}`}
                  </p>
                </ReviewRow>
              </dl>
              <p className="text-sm text-muted">{labels.review.payment}</p>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="terms"
                  checked={terms}
                  onChange={(event) => setTerms(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  {labels.review.termsBefore}{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-accent underline">
                    {labels.review.termsLink}
                  </Link>{" "}
                  {labels.review.and}{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-accent underline">
                    {labels.review.privacyLink}
                  </Link>
                  .
                </span>
              </label>
              {showErrors && !terms && <FieldError>{labels.errors.terms}</FieldError>}
              <p className="flex gap-2 text-sm text-muted">
                <Icon name="clock" className="h-4 w-4 shrink-0" />
                {labels.review.confirmNote}
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} className="rounded-xl px-4 py-3 font-semibold text-accent hover:bg-accent-soft">
                {labels.nav.back}
              </button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover"
              >
                {labels.nav.next}
                <Icon name="arrow" className="h-5 w-5 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
              >
                {submitting ? labels.review.submitting : labels.review.submit}
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-semibold">{labels.summary.title}</h2>
          {!selected ? (
            <p className="mt-3 text-sm text-muted">{labels.summary.empty}</p>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-medium">{selected.name}</p>
              {!quote && (
                <p className="text-muted">{cleaners === 1 ? fill(labels.summary.cleaner, { hours }) : fill(labels.summary.cleaners, { count: cleaners, hours })}</p>
              )}
              {date && <p className="text-muted">{displayDate(date, labels.months)}</p>}
              {timeIsValid && startMinutes !== null && (
                <p dir={locale === "ar" ? "rtl" : "ltr"} className="text-muted">
                  {displayTime(startMinutes, locale)}
                  {!quote && ` – ${displayTime(startMinutes + duration, locale)}`}
                </p>
              )}
              <div className="border-t border-border pt-4">
                {estimate !== null ? (
                  <>
                    <p className="text-muted">{labels.review.estimated}</p>
                    <p className="mt-1 text-3xl font-bold text-accent" aria-live="polite">
                      {aed(estimate, locale)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{fill(labels.service.perHour, { rate: selected.priceFils! / 100 })}</p>
                  </>
                ) : (
                  <p className="font-medium text-accent">{labels.review.quotePending}</p>
                )}
                {addOns.length > 0 && <p className="mt-2 text-xs text-muted">{labels.review.addOnsPending}</p>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Progress({ step, labels, onSelect }: { step: number; labels: Labels; onSelect: (index: number) => void }) {
  return (
    <nav aria-label={fill(labels.stepOf, { current: step + 1, total: labels.steps.length })}>
      <p className="text-sm text-muted sm:hidden">{fill(labels.stepOf, { current: step + 1, total: labels.steps.length })}</p>
      <ol className="mt-2 flex items-center gap-2 sm:mt-0">
        {labels.steps.map((name, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={name} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!done}
                onClick={() => onSelect(index)}
                aria-current={current ? "step" : undefined}
                className="flex items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                    current ? "bg-primary text-primary-foreground" : done ? "bg-accent-soft text-accent" : "border border-border text-muted"
                  }`}
                >
                  {done ? <Icon name="check" className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`hidden text-sm font-medium sm:inline ${current ? "" : "text-muted"}`}>{name}</span>
              </button>
              {index < labels.steps.length - 1 && (
                <span aria-hidden="true" className={`h-px flex-1 ${done ? "bg-accent" : "bg-border"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ServicePicker({
  services,
  value,
  onChange,
  labels,
  locale,
}: {
  services: WizardService[];
  value: string;
  onChange: (slug: string) => void;
  labels: Labels;
  locale: string;
}) {
  const groups = [...new Set(services.map((item) => item.categoryName))];
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <fieldset key={group}>
          <legend className="text-sm font-semibold text-accent">{group}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {services
              .filter((item) => item.categoryName === group)
              .map((item) => (
                <Choice key={item.slug} selected={value === item.slug} onClick={() => onChange(item.slug)}>
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs font-normal opacity-80">
                    {isQuote(item) ? labels.service.quote : fill(labels.service.perHour, { rate: item.priceFils! / 100 })}
                  </span>
                </Choice>
              ))}
          </div>
        </fieldset>
      ))}
      <span className="sr-only">{locale}</span>
    </div>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl border p-3 text-start text-sm font-medium transition ${
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const button =
    "flex h-11 w-11 items-center justify-center rounded-lg border border-border text-accent transition hover:border-accent disabled:opacity-30";
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" aria-label={`− ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>
          <Icon name="minus" />
        </button>
        <span aria-live="polite" className="w-10 text-center text-xl font-bold">
          {value}
        </span>
        <button type="button" aria-label={`+ ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

function inputClass(invalid: boolean) {
  return `rounded-lg border bg-background px-3 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-accent/30 ${
    invalid ? "border-danger" : "border-border focus:border-accent"
  }`;
}

function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  name: string;
  type?: string;
  autoComplete?: string;
  dir?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input {...input} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} className={inputClass(!!error)} />
      {hint && !error && <span className="font-normal text-muted">{hint}</span>}
      {error && <FieldError>{error}</FieldError>}
    </label>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <span role="alert" className="text-sm font-normal text-danger">
      {children}
    </span>
  );
}

function ReviewRow({ label, onEdit, editLabel, children }: { label: string; onEdit: () => void; editLabel: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="mt-1">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="text-sm font-medium text-accent hover:underline">
        {editLabel}
      </button>
    </div>
  );
}
