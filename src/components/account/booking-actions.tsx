"use client";

import { useState, useTransition } from "react";
import { answerQuote, cancelMyBooking, rescheduleMyBooking, rescheduleSlots } from "@/app/actions/account";
import type { SiteContent } from "@/content/en";
import { Link, useRouter } from "@/i18n/navigation";
import type { Slot } from "@/lib/booking/rules";
import { displayTime, parseTime } from "@/lib/booking/time";
import { Calendar } from "../booking/calendar";
import { Icon } from "../icon";

type Labels = SiteContent["account"]["detail"];
type Mode = "idle" | "cancel" | "reschedule" | "decline";

type Props = {
  reference: string;
  locale: "en" | "ar";
  canChange: boolean;
  isOpen: boolean;
  freeHours: number;
  quote: string | null;
  quoteAccepted: boolean;
  bookAgainHref: string;
  today: string;
  lastDate: string;
  phone: { display: string; tel: string; whatsapp: string };
  labels: Labels;
  calendar: { months: string[]; days: string[]; previous: string; next: string };
};

const primary = "w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60";
const secondary = "w-full rounded-xl border border-border px-4 py-3 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-60";
const danger = "w-full rounded-xl border border-danger/50 px-4 py-3 font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-60";

export function BookingActions(props: Props) {
  const { labels, reference } = props;
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ date: string; status: "loading" | "ready" | "error"; list: Slot[] } | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMode("idle");
        setMessage({ tone: "ok", text: success });
        router.refresh();
      } else {
        const key = (result.error ?? "failed") as keyof Labels["errors"];
        setMessage({ tone: "error", text: labels.errors[key] ?? labels.errors.failed });
        if (result.error === "slot" && date) loadSlots(date);
      }
    });
  }

  async function loadSlots(day: string) {
    setSlots({ date: day, status: "loading", list: [] });
    setTime("");
    try {
      const result = await rescheduleSlots(reference, day);
      if (!result.ok) throw new Error(result.error);
      setSlots((current) => (current?.date === day ? { date: day, status: "ready", list: result.slots } : current));
    } catch {
      setSlots((current) => (current?.date === day ? { date: day, status: "error", list: [] } : current));
    }
  }

  return (
    <section className="space-y-3 rounded-2xl glass p-5 shadow-card">
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${message.tone === "ok" ? "bg-accent-soft" : "bg-danger/10 text-danger"}`}>
          {message.text}
        </p>
      )}

      {props.quote && props.isOpen && (
        <div className="rounded-xl bg-accent-soft p-4">
          <h3 className="font-semibold">{labels.quoteTitle}</h3>
          <p className="mt-1 text-sm">{labels.quoteBody.replace("{price}", props.quote)}</p>
          {mode === "decline" ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm">{labels.quoteDeclineConfirm}</p>
              <button type="button" disabled={busy} className={danger} onClick={() => run(() => answerQuote(reference, false), labels.done.declined)}>
                {labels.quoteDecline}
              </button>
              <button type="button" className={secondary} onClick={() => setMode("idle")}>
                {labels.keep}
              </button>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              <button type="button" disabled={busy} className={primary} onClick={() => run(() => answerQuote(reference, true), labels.done.accepted)}>
                {labels.quoteAccept}
              </button>
              <button type="button" className={secondary} onClick={() => setMode("decline")}>
                {labels.quoteDecline}
              </button>
            </div>
          )}
        </div>
      )}
      {props.quoteAccepted && props.isOpen && <p className="rounded-lg bg-accent-soft p-3 text-sm">{labels.quoteAccepted}</p>}

      {props.isOpen && props.canChange && mode !== "reschedule" && mode !== "cancel" && (
        <button type="button" className={secondary} onClick={() => setMode("reschedule")}>
          {labels.reschedule}
        </button>
      )}

      {mode === "reschedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{labels.rescheduleTitle}</h3>
            <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => setMode("idle")}>
              {labels.closeReschedule}
            </button>
          </div>
          <p className="text-sm text-muted">{labels.rescheduleNote}</p>
          <Calendar
            value={date}
            min={props.today}
            max={props.lastDate}
            today={props.today}
            months={props.calendar.months}
            days={props.calendar.days}
            labels={props.calendar}
            onChange={(day) => {
              setDate(day);
              loadSlots(day);
            }}
          />
          {slots?.status === "loading" && <p className="text-sm text-muted">…</p>}
          {slots?.status === "error" && <p className="text-sm text-danger">{labels.errors.failed}</p>}
          {slots?.status === "ready" && slots.list.length === 0 && <p className="text-sm text-muted">{labels.errors.slot}</p>}
          {slots?.status === "ready" && slots.list.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slots.list.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  aria-pressed={time === slot.time}
                  onClick={() => setTime(slot.time)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                    time === slot.time
                      ? "border-primary bg-primary text-primary-foreground"
                      : slot.available
                        ? "border-border hover:border-accent"
                        : "cursor-not-allowed border-border text-muted line-through opacity-50"
                  }`}
                >
                  <span dir="ltr">{displayTime(parseTime(slot.time)!, props.locale)}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={busy || !date || !time}
            className={primary}
            onClick={() => run(() => rescheduleMyBooking(reference, { date, time }), labels.done.rescheduled)}
          >
            {labels.rescheduleConfirm}
          </button>
        </div>
      )}

      {props.isOpen && props.canChange && mode !== "reschedule" && (
        mode === "cancel" ? (
          <div className="space-y-2 rounded-xl border border-danger/40 p-4">
            <p className="text-sm">{labels.cancelConfirm}</p>
            <button type="button" disabled={busy} className={danger} onClick={() => run(() => cancelMyBooking(reference), labels.done.cancelled)}>
              {labels.cancelYes}
            </button>
            <button type="button" className={secondary} onClick={() => setMode("idle")}>
              {labels.keep}
            </button>
          </div>
        ) : (
          <button type="button" className={danger} onClick={() => setMode("cancel")}>
            {labels.cancel}
          </button>
        )
      )}

      {props.isOpen && !props.canChange && (
        <div className="space-y-3 rounded-xl bg-surface p-4 text-sm">
          <p>{labels.tooLate.replace("{hours}", String(props.freeHours))}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/${props.phone.whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground">
              <Icon name="whatsapp" className="h-4 w-4" />
              WhatsApp
            </a>
            <a href={`tel:${props.phone.tel}`} dir="ltr" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-semibold">
              <Icon name="phone" className="h-4 w-4" />
              {props.phone.display}
            </a>
          </div>
        </div>
      )}

      <Link href={props.bookAgainHref} className={`${secondary} block text-center`}>
        {labels.bookAgain}
      </Link>
    </section>
  );
}
