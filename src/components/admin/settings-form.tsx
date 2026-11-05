"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveBusinessSettings } from "@/app/actions/super-admin";
import type { SuperAdminContent } from "@/content/super-admin";
import { useRouter } from "@/i18n/navigation";
import type { BusinessSettings } from "@/lib/super-admin/settings";
import { Icon, type IconName } from "../icon";

type Labels = SuperAdminContent["settings"];
type Errors = SuperAdminContent["common"]["errors"];
type Key = keyof BusinessSettings;

const field = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

const groups: { key: keyof Labels["groups"]; icon: IconName; fields: Key[] }[] = [
  { key: "capacity", icon: "users", fields: ["capacity", "maxCleaners"] },
  { key: "hours", icon: "clock", fields: ["openTime", "closeTime", "slotMinutes"] },
  { key: "jobs", icon: "sparkle", fields: ["minHours", "maxHours"] },
  { key: "booking", icon: "calendar", fields: ["leadMinutes", "maxDaysAhead"] },
  { key: "policy", icon: "shield", fields: ["freeCancellationHours"] },
];

const limits: Partial<Record<Key, [number, number]>> = {
  capacity: [1, 500],
  maxCleaners: [1, 50],
  minHours: [1, 12],
  maxHours: [1, 16],
  leadMinutes: [0, 2880],
  maxDaysAhead: [7, 365],
  freeCancellationHours: [0, 168],
};

export function SettingsForm({ initial, labels, errors }: { initial: BusinessSettings; labels: Labels; errors: Errors }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [problems, setProblems] = useState<Partial<Record<Key, string>>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const changed = (Object.keys(initial) as Key[]).some((k) => initial[k] !== form[k]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setProblems({});
    startTransition(async () => {
      const result = await saveBusinessSettings(form).catch(() => ({ ok: false as const, error: "failed" as const }));
      if (result.ok) {
        setMessage({ tone: "ok", text: labels.saved });
        router.refresh();
        return;
      }
      const fields = "fields" in result ? (result.fields ?? []) : [];
      if (fields.length) {
        const rules = labels.rules as Record<string, string>;
        setProblems(Object.fromEntries(fields.map((f) => [f.field, rules[f.rule] ?? rules.default])));
      }
      setMessage({ tone: "error", text: (errors as Record<string, string>)[result.error] ?? errors.failed });
    });
  }

  function input(key: Key) {
    const error = problems[key];
    const common = { id: `setting-${key}`, name: key, "aria-invalid": !!error, "aria-describedby": error ? `setting-${key}-error` : undefined, className: `${field} ${error ? "border-danger" : "border-border"}` };
    if (key === "openTime" || key === "closeTime") {
      return <input {...common} type="time" step={900} required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} dir="ltr" />;
    }
    if (key === "slotMinutes") {
      return (
        <select {...common} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value) })}>
          {[15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {labels.minutes.replace("{count}", String(m))}
            </option>
          ))}
        </select>
      );
    }
    const [min, max] = limits[key] ?? [0, 9999];
    return <input {...common} type="number" inputMode="numeric" required min={min} max={max} step={key === "leadMinutes" ? 15 : 1} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value === "" ? 0 : Number(e.target.value) })} dir="ltr" />;
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map((group) => (
          <section key={group.key} className="rounded-2xl glass p-5 shadow-card">
            <h3 className="mb-4 flex items-center gap-3 font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={group.icon} className="h-5 w-5" />
              </span>
              {labels.groups[group.key]}
            </h3>
            <div className="space-y-4">
              {group.fields.map((key) => (
                <div key={key}>
                  <label htmlFor={`setting-${key}`} className="mb-1.5 block text-sm font-medium">
                    {labels.fields[key].label}
                  </label>
                  {input(key)}
                  {problems[key] ? (
                    <p id={`setting-${key}-error`} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger">
                      <Icon name="alert" className="h-3.5 w-3.5" />
                      {problems[key]}
                    </p>
                  ) : (
                    labels.fields[key].hint && <p className="mt-1.5 text-xs text-muted">{labels.fields[key].hint}</p>
                  )}
                </div>
              ))}
              {group.key === "hours" && <p className="rounded-lg bg-surface p-3 text-xs text-muted">{labels.hoursText}</p>}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl glass p-4 shadow-card">
        <span>
          {message && (
            <span role={message.tone === "error" ? "alert" : "status"} className={`inline-flex items-center gap-2 text-sm font-medium ${message.tone === "ok" ? "text-accent" : "text-danger"}`}>
              <Icon name={message.tone === "ok" ? "check" : "alert"} className="h-4 w-4" />
              {message.text}
            </span>
          )}
        </span>
        <div className="flex gap-2">
          {changed && (
            <button type="button" onClick={() => { setForm(initial); setProblems({}); setMessage(null); }} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent">
              {labels.reset}
            </button>
          )}
          <button disabled={busy || !changed} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50">
            {labels.save}
          </button>
        </div>
      </div>
    </form>
  );
}
