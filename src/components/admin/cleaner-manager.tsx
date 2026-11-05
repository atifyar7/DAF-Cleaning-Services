"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addCleaner, editCleaner } from "@/app/actions/admin";
import type { AdminContent } from "@/content/admin";
import { useRouter } from "@/i18n/navigation";
import { initials } from "../account/format";
import { Icon } from "../icon";
import { Field } from "../ui";

type Cleaner = { id: string; name: string; phone: string | null; active: boolean; upcoming: number; completed: number };
type Labels = AdminContent;
type Message = { tone: "ok" | "error"; text: string } | null;

function useRun(labels: Labels) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return {
    busy,
    run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, done: (message: Message, ok: boolean) => void) {
      startTransition(async () => {
        try {
          const result = await action();
          const key = (result.error ?? "failed") as keyof Labels["errors"];
          done({ tone: result.ok ? "ok" : "error", text: result.ok ? success : (labels.errors[key] ?? labels.errors.failed) }, result.ok);
          if (result.ok) router.refresh();
        } catch {
          done({ tone: "error", text: labels.errors.failed }, false);
        }
      });
    },
  };
}

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>
      {message.text}
    </p>
  );
}

function AddCleaner({ labels }: { labels: Labels }) {
  const c = labels.cleaners;
  const [form, setForm] = useState({ name: "", phone: "" });
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(labels);
  function submit(event: FormEvent) {
    event.preventDefault();
    run(() => addCleaner(form), c.done.created, (m, ok) => {
      setMessage(m);
      if (ok) setForm({ name: "", phone: "" });
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl glass p-5 shadow-card">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon name="plus" className="h-5 w-5 text-accent" />
        {c.add}
      </h3>
      <Note message={message} />
      <Field label={c.name} name="name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div>
        <Field label={c.phone} name="phone" type="tel" dir="ltr" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <p className="mt-1.5 text-xs text-muted">{c.phoneHint}</p>
      </div>
      <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
        {c.create}
      </button>
    </form>
  );
}

function CleanerCard({ cleaner, labels }: { cleaner: Cleaner; labels: Labels }) {
  const c = labels.cleaners;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: cleaner.name, phone: cleaner.phone ?? "" });
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(labels);
  const save = (active: boolean) =>
    run(() => editCleaner(cleaner.id, { ...form, active }), c.done.updated, (m, ok) => {
      setMessage(m);
      if (ok) setEditing(false);
    });

  return (
    <li className={`rounded-2xl glass p-5 shadow-card transition ${cleaner.active ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${cleaner.active ? "bg-gradient-to-br from-highlight to-accent text-hero" : "bg-surface text-muted"}`}>
          {initials(cleaner.name, "")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{cleaner.name}</p>
          {cleaner.phone ? (
            <a href={`tel:${cleaner.phone}`} dir="ltr" className="text-sm text-accent hover:underline">
              {cleaner.phone}
            </a>
          ) : (
            <p className="text-sm text-muted">{labels.common.none}</p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cleaner.active ? "bg-accent-soft text-accent" : "bg-surface text-muted ring-1 ring-border"}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cleaner.active ? "bg-accent" : "bg-muted"}`} />
          {cleaner.active ? c.active : c.inactive}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-surface p-2">
          <dt className="text-xs text-muted">{c.upcoming}</dt>
          <dd className="text-lg font-bold">{cleaner.upcoming}</dd>
        </div>
        <div className="rounded-xl bg-surface p-2">
          <dt className="text-xs text-muted">{c.completed}</dt>
          <dd className="text-lg font-bold">{cleaner.completed}</dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2">
        <Note message={message} />
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save(cleaner.active);
            }}
          >
            <Field label={c.name} name="name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label={c.phone} name="phone" type="tel" dir="ltr" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
                {labels.common.save}
              </button>
              <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold transition hover:border-accent" onClick={() => setEditing(false)}>
                {labels.common.cancel}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent" onClick={() => setEditing(true)}>
              {c.edit}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(!cleaner.active)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${cleaner.active ? "border-danger/40 text-danger hover:bg-danger-soft" : "border-accent text-accent hover:bg-accent-soft"}`}
            >
              {cleaner.active ? c.deactivate : c.activate}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function CleanerManager({ cleaners, labels }: { cleaners: Cleaner[]; labels: Labels }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      {cleaners.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl glass px-6 py-14 text-center shadow-card">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="users" className="h-8 w-8" />
          </span>
          <p className="mt-4 max-w-sm text-muted">{labels.cleaners.empty}</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cleaners.map((cleaner) => (
            <CleanerCard key={cleaner.id} cleaner={cleaner} labels={labels} />
          ))}
        </ul>
      )}
      <div className="xl:sticky xl:top-24">
        <AddCleaner labels={labels} />
      </div>
    </div>
  );
}
