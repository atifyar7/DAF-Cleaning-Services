"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  addBookingNote,
  bookingSlots,
  rescheduleBookingAsStaff,
  sendBookingQuote,
  setBookingPayment,
  setBookingTeam,
  updateBookingStatus,
} from "@/app/actions/admin";
import type { AdminContent } from "@/content/admin";
import { useRouter } from "@/i18n/navigation";
import type { Slot } from "@/lib/booking/rules";
import { displayTime, parseTime } from "@/lib/booking/time";
import type { PaymentMethod, PaymentStatus, StatusAction } from "@/lib/admin/workflow";
import { Icon, type IconName } from "../icon";

type Labels = AdminContent;
type Result = { ok: boolean; error?: string };

const primary = "w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60";
const secondary = "w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-60";
const danger = "w-full rounded-xl border border-danger/50 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60";
const field = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** Runs a server action, shows its outcome in the panel and refreshes the page data on success. */
function useAction(labels: Labels) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  function run(action: () => Promise<Result>, success: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setMessage({ tone: "ok", text: success });
          after?.();
          router.refresh();
        } else {
          const key = (result.error ?? "failed") as keyof Labels["errors"];
          setMessage({ tone: "error", text: labels.errors[key] ?? labels.errors.failed });
        }
      } catch {
        setMessage({ tone: "error", text: labels.errors.failed });
      }
    });
  }
  return { message, busy, run };
}

function Message({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}
    >
      <Icon name={message.tone === "ok" ? "check" : "alert"} className="mt-0.5 h-4 w-4 shrink-0" />
      {message.text}
    </p>
  );
}

function Card({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl glass p-5 shadow-card">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon name={icon} className="h-5 w-5 text-accent" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StatusControls({ reference, actions, quoteBlocked, labels }: { reference: string; actions: StatusAction[]; quoteBlocked: boolean; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const d = labels.detail;
  const go = (action: StatusAction) => run(() => updateBookingStatus(reference, action), d.done[action]);

  return (
    <Card title={d.actions} icon="check">
      <Message message={message} />
      {actions.length === 0 && !quoteBlocked && <p className="text-sm text-muted">{d.noActions}</p>}
      {quoteBlocked && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{d.quoteFirst}</p>}
      {actions.includes("confirm") && (
        <div className="space-y-1.5">
          <button type="button" disabled={busy} className={primary} onClick={() => go("confirm")}>
            {d.confirm}
          </button>
          <p className="text-xs text-muted">{d.confirmHint}</p>
        </div>
      )}
      {actions.includes("start") && (
        <button type="button" disabled={busy} className={primary} onClick={() => go("start")}>
          {d.start}
        </button>
      )}
      {actions.includes("complete") && (
        <button type="button" disabled={busy} className={primary} onClick={() => go("complete")}>
          {d.complete}
        </button>
      )}
      {actions.includes("cancel") &&
        (cancelling ? (
          <form
            className="space-y-2 rounded-xl border border-danger/40 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateBookingStatus(reference, "cancel", reason), d.done.cancel, () => setCancelling(false));
            }}
          >
            <label className="block text-sm font-medium">
              {d.cancelReason}
              <textarea name="reason" required minLength={3} maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1.5`} />
            </label>
            <button disabled={busy || reason.trim().length < 3} className={danger}>
              {d.cancelConfirm}
            </button>
            <button type="button" className={secondary} onClick={() => setCancelling(false)}>
              {d.keep}
            </button>
          </form>
        ) : (
          <button type="button" className={danger} onClick={() => setCancelling(true)}>
            {d.cancel}
          </button>
        ))}
    </Card>
  );
}

export function QuoteControls({ reference, current, labels }: { reference: string; current: string | null; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [amount, setAmount] = useState("");
  const d = labels.detail;
  return (
    <Card title={current ? d.quoteRevise : d.quoteTitle} icon="tag">
      <Message message={message} />
      {current && <p className="text-sm text-muted">{d.quoteSentNote.replace("{price}", current)}</p>}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => sendBookingQuote(reference, amount), d.done.quote, () => setAmount(""));
        }}
      >
        <label className="block text-sm font-medium">
          {d.quoteAmount}
          <input name="amount" inputMode="decimal" dir="ltr" required pattern="\d{1,6}(\.\d{1,2})?" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} mt-1.5`} placeholder="250" />
        </label>
        <button disabled={busy || !amount} className={primary}>
          {d.quoteSend}
        </button>
      </form>
    </Card>
  );
}

type Option = { id: string; name: string; phone: string | null; busyWith: string | null };

export function TeamControls({ reference, options, selected, needed, enabled, labels }: { reference: string; options: Option[]; selected: string[]; needed: number; enabled: boolean; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [chosen, setChosen] = useState(selected);
  const d = labels.detail;
  const changed = chosen.length !== selected.length || chosen.some((id) => !selected.includes(id));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const needs = needed === 1 ? labels.schedule.cleanerNeeded : labels.schedule.cleanersNeeded.replace("{count}", String(needed));

  return (
    <Card title={d.team} icon="users">
      <Message message={message} />
      {!enabled ? (
        <p className="text-sm text-muted">{d.teamClosed}</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">{d.teamNone}</p>
      ) : (
        <>
          <p className="flex items-center justify-between text-sm text-muted">
            <span>{d.teamHint.replace("{count}", needs)}</span>
            <span className={`font-semibold ${chosen.length >= needed ? "text-accent" : "text-warning"}`}>{d.teamCount.replace("{count}", String(chosen.length))}</span>
          </p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {options.map((option) => {
              const blocked = !!option.busyWith && !selected.includes(option.id);
              return (
                <li key={option.id}>
                  <label className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${chosen.includes(option.id) ? "border-accent bg-accent-soft" : "border-border"} ${blocked ? "opacity-55" : "cursor-pointer hover:border-accent"}`}>
                    <input type="checkbox" name="cleaner" value={option.id} checked={chosen.includes(option.id)} disabled={blocked} onChange={() => toggle(option.id)} className="h-4 w-4 accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.name}</span>
                      {option.busyWith && (
                        <span className="block text-xs text-warning" dir="ltr">
                          {d.teamBusy.replace("{reference}", option.busyWith)}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button type="button" disabled={busy || !changed} className={primary} onClick={() => run(() => setBookingTeam(reference, chosen), d.done.team)}>
            {d.teamSave}
          </button>
        </>
      )}
    </Card>
  );
}

export function PaymentControls({ reference, method, status, labels }: { reference: string; method: PaymentMethod; status: PaymentStatus; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [form, setForm] = useState({ method, status });
  const d = labels.detail;
  const changed = form.method !== method || form.status !== status;
  return (
    <Card title={d.payment} icon="card">
      <Message message={message} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-medium">
          {d.method}
          <select name="method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })} className={`${field} mt-1.5`}>
            {(["cash", "card_link"] as const).map((m) => (
              <option key={m} value={m}>
                {labels.payment.method[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {d.paymentStatus}
          <select name="paymentStatus" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PaymentStatus })} className={`${field} mt-1.5`}>
            {(["unpaid", "link_sent", "paid", "refunded"] as const).map((s) => (
              <option key={s} value={s} disabled={s === "link_sent" && form.method !== "card_link"}>
                {labels.payment.status[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" disabled={busy || !changed} className={secondary} onClick={() => run(() => setBookingPayment(reference, form), d.done.payment)}>
        {d.paymentSave}
      </button>
    </Card>
  );
}

export function RescheduleControls({ reference, today, lastDate, locale, labels }: { reference: string; today: string; lastDate: string; locale: string; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ date: string; status: "loading" | "ready" | "error"; list: Slot[] } | null>(null);
  const d = labels.detail;

  async function load(day: string) {
    setDate(day);
    setTime("");
    if (!day) return setSlots(null);
    setSlots({ date: day, status: "loading", list: [] });
    try {
      const result = await bookingSlots(reference, day);
      if (!result.ok) throw new Error(result.error);
      setSlots((s) => (s?.date === day ? { date: day, status: "ready", list: result.slots } : s));
    } catch {
      setSlots((s) => (s?.date === day ? { date: day, status: "error", list: [] } : s));
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Message message={message} />
        <button type="button" className={`${secondary} glass`} onClick={() => setOpen(true)}>
          {d.reschedule}
        </button>
      </div>
    );
  }
  return (
    <Card title={d.reschedule} icon="calendar">
      <Message message={message} />
      <p className="text-xs text-muted">{d.rescheduleHint}</p>
      <label className="block text-sm font-medium">
        {d.rescheduleDate}
        <input type="date" name="rescheduleDate" min={today} max={lastDate} value={date} onChange={(e) => load(e.target.value)} className={`${field} mt-1.5`} />
      </label>
      {slots?.status === "loading" && <p className="text-sm text-muted">{d.loadingSlots}</p>}
      {slots?.status === "error" && <p className="text-sm text-danger">{labels.errors.failed}</p>}
      {slots?.status === "ready" && slots.list.filter((s) => s.available).length === 0 && <p className="text-sm text-muted">{d.noSlots}</p>}
      {slots?.status === "ready" && slots.list.some((s) => s.available) && (
        <div className="grid grid-cols-3 gap-1.5">
          {slots.list.map((slot) => (
            <button
              key={slot.time}
              type="button"
              disabled={!slot.available}
              aria-pressed={time === slot.time}
              onClick={() => setTime(slot.time)}
              className={`rounded-lg border px-1 py-2 text-xs font-medium transition ${
                time === slot.time ? "border-primary bg-primary text-primary-foreground" : slot.available ? "border-border hover:border-accent" : "cursor-not-allowed border-border text-muted line-through opacity-50"
              }`}
            >
              <span dir="ltr">{displayTime(parseTime(slot.time)!, locale)}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={busy || !date || !time}
        className={primary}
        onClick={() => run(() => rescheduleBookingAsStaff(reference, { date, time }), d.done.reschedule, () => setOpen(false))}
      >
        {d.rescheduleSave}
      </button>
      <button type="button" className={secondary} onClick={() => setOpen(false)}>
        {labels.common.cancel}
      </button>
    </Card>
  );
}

export function NoteForm({ reference, labels }: { reference: string; labels: Labels }) {
  const { message, busy, run } = useAction(labels);
  const [body, setBody] = useState("");
  const d = labels.detail;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => addBookingNote(reference, body), d.done.note, () => setBody(""));
      }}
    >
      <Message message={message} />
      <label className="block">
        <span className="sr-only">{d.notes}</span>
        <textarea name="note" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={d.notePlaceholder} className={field} />
      </label>
      <div className="flex justify-end">
        <button disabled={busy || !body.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
          {d.noteAdd}
        </button>
      </div>
    </form>
  );
}
