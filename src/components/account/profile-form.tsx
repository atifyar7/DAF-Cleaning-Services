"use client";

import { useState, useTransition, type FormEvent } from "react";
import { requestAccountDeletion, saveProfile } from "@/app/actions/account";
import type { SiteContent } from "@/content/en";
import { useRouter } from "@/i18n/navigation";
import { Icon } from "../icon";
import { Field } from "../ui";

type Props = {
  profile: { name: string; email: string; phone: string; locale: "en" | "ar" };
  initials: string;
  deletionRequested: string | null;
  labels: SiteContent["account"]["profile"];
  sections: { personal: string; signIn: string; dangerZone: string };
  errors: SiteContent["account"]["detail"]["errors"];
};

export function ProfileForm({ profile, initials, deletionRequested, labels, sections, errors }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ name: profile.name, phone: profile.phone, locale: profile.locale });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProfile(form);
      if (result.ok) {
        setMessage({ tone: "ok", text: labels.saved });
        router.refresh();
      } else {
        const key = (result.error ?? "failed") as keyof typeof errors;
        setMessage({ tone: "error", text: errors[key] ?? errors.failed });
      }
    });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className="rounded-3xl glass shadow-card">
        <div className="flex items-center gap-4 border-b border-border p-5 sm:p-6">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-highlight to-accent text-xl font-bold text-hero">
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{sections.personal}</h2>
            <p className="truncate text-sm text-muted" dir="ltr">
              {profile.email}
            </p>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl p-3 text-sm sm:col-span-2 ${message.tone === "ok" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>
              <Icon name={message.tone === "ok" ? "check" : "close"} className="h-4 w-4 shrink-0" />
              {message.text}
            </p>
          )}
          <div className="sm:col-span-2">
            <Field label={labels.name} name="name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Field label={labels.phone} name="phone" type="tel" dir="ltr" autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">{labels.phoneHint}</p>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{labels.language}</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["en", "ar"] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  aria-pressed={form.locale === locale}
                  onClick={() => setForm({ ...form, locale })}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                    form.locale === locale ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-accent"
                  }`}
                >
                  {locale === "en" ? labels.english : labels.arabic}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex justify-end border-t border-border p-5 sm:px-6">
          <button disabled={busy} className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
            {labels.save}
          </button>
        </div>
      </form>

      <div className="space-y-6">
        <section className="rounded-3xl glass p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon name="mail" className="h-5 w-5" />
            </span>
            <h2 className="font-semibold">{sections.signIn}</h2>
          </div>
          <div className="mt-4">
            <Field label={labels.email} name="email" type="email" dir="ltr" value={profile.email} readOnly disabled />
            <p className="mt-1.5 text-xs text-muted">{labels.emailNote}</p>
          </div>
        </section>

        <section className="rounded-3xl glass ring-1 ring-danger/30 p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <Icon name="close" className="h-5 w-5" />
            </span>
            <h2 className="font-semibold">{sections.dangerZone}</h2>
          </div>
          <h3 className="mt-4 text-sm font-semibold">{labels.deleteTitle}</h3>
          {deletionRequested ? (
            <p role="status" className="mt-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
              {labels.deleteRequested.replace("{date}", deletionRequested)}
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted">{labels.deleteBody}</p>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input type="checkbox" name="confirmDelete" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
                {labels.deleteConfirm}
              </label>
              <button
                type="button"
                disabled={!confirmDelete || busy}
                onClick={() =>
                  startTransition(async () => {
                    const result = await requestAccountDeletion();
                    if (result.ok) router.refresh();
                    else setMessage({ tone: "error", text: errors.failed });
                  })
                }
                className="mt-4 w-full rounded-xl border border-danger/50 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
              >
                {labels.deleteButton}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
