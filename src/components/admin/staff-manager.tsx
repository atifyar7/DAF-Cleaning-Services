"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  addStaffMember,
  resetStaffMemberPassword,
  resetStaffMemberTwoFactor,
  setStaffMemberDisabled,
  setStaffMemberRole,
} from "@/app/actions/super-admin";
import type { SuperAdminContent } from "@/content/super-admin";
import { useRouter } from "@/i18n/navigation";
import { initials } from "../account/format";
import { Icon } from "../icon";
import { Field } from "../ui";

type Labels = SuperAdminContent["staff"];
type Errors = SuperAdminContent["common"]["errors"];
type Person = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_admin";
  twoFactorEnabled: boolean;
  disabled: boolean;
  passkeys: number;
  lastSignIn: string | null;
};
type Result = { ok: boolean; error?: string; password?: string };
type Action = "role" | "resetPassword" | "resetTwoFactor" | "disable" | "enable";

function errorText(result: Result, labels: Labels, errors: Errors) {
  const key = result.error ?? "failed";
  return (labels.errors as Record<string, string>)[key] ?? (errors as Record<string, string>)[key] ?? errors.failed;
}

/** Shows a new temporary password once, with a copy button. */
function PasswordReveal({ name, password, loginUrl, labels, onDone }: { name: string; password: string; loginUrl: string; labels: Labels; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-3 rounded-2xl border border-accent bg-accent-soft p-4">
      <p className="flex items-center gap-2 font-semibold text-accent">
        <Icon name="shield" className="h-5 w-5" />
        {labels.passwordTitle}
      </p>
      <p className="text-sm">{labels.passwordBody.replace("{name}", name)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code dir="ltr" data-temporary-password className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2 font-mono text-sm break-all select-all">
          {password}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <p className="text-xs text-muted" dir="auto">
        {labels.signInAt.replace("{url}", loginUrl)}
      </p>
      <button type="button" onClick={onDone} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold">
        {labels.done}
      </button>
    </div>
  );
}

function PersonRow({ person, isYou, labels, errors, loginUrl }: { person: Person; isYou: boolean; labels: Labels; errors: Errors; loginUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const newRole = person.role === "admin" ? "super_admin" : "admin";

  function run(action: Action) {
    setMessage(null);
    startTransition(async () => {
      let result: Result;
      try {
        result =
          action === "role"
            ? await setStaffMemberRole(person.id, newRole)
            : action === "resetPassword"
              ? await resetStaffMemberPassword(person.id)
              : action === "resetTwoFactor"
                ? await resetStaffMemberTwoFactor(person.id)
                : await setStaffMemberDisabled(person.id, action === "disable");
      } catch {
        result = { ok: false, error: "failed" };
      }
      setPending(null);
      if (!result.ok) return setMessage({ tone: "error", text: errorText(result, labels, errors) });
      if (result.password) setPassword(result.password);
      else setOpen(false);
      router.refresh();
    });
  }

  const actionLabels: Record<Action, string> = {
    role: newRole === "admin" ? labels.makeAdmin : labels.makeOwner,
    resetPassword: labels.resetPassword,
    resetTwoFactor: labels.resetTwoFactor,
    disable: labels.disable,
    enable: labels.enable,
  };
  const actions: Action[] = person.disabled ? ["enable"] : ["role", "resetPassword", "resetTwoFactor", "disable"];

  return (
    <li className={`rounded-2xl glass p-4 shadow-card sm:p-5 ${person.disabled ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${person.disabled ? "bg-surface text-muted" : "bg-gradient-to-br from-highlight to-accent text-hero"}`}>
          {initials(person.name, person.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{person.name}</span>
            {isYou && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{labels.you}</span>}
          </p>
          <p className="truncate text-sm text-muted" dir="ltr">
            {person.email}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${person.role === "super_admin" ? "bg-primary text-primary-foreground" : "bg-accent-soft text-accent"}`}>
              <Icon name="shield" className="h-3.5 w-3.5" />
              {labels.roles[person.role]}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${person.disabled ? "bg-danger-soft text-danger" : "bg-surface text-muted ring-1 ring-border"}`}>
              {person.disabled ? labels.status.disabled : labels.status.active}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${person.twoFactorEnabled ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning"}`}>
              <Icon name={person.twoFactorEnabled ? "check" : "alert"} className="h-3.5 w-3.5" />
              {person.twoFactorEnabled ? labels.twoFactorOn : labels.twoFactorOff}
            </span>
            {person.passkeys > 0 && (
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-border">{labels.passkeys.replace("{count}", String(person.passkeys))}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-end">
          <span className="text-xs text-muted">{person.lastSignIn ? labels.lastSignIn.replace("{date}", person.lastSignIn) : labels.neverSignedIn}</span>
          {isYou ? (
            <span className="max-w-48 text-xs text-muted">{labels.selfNote}</span>
          ) : (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setOpen(!open);
                setPending(null);
                setMessage(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent"
            >
              {labels.actions}
              <Icon name="chevron" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {(open || password || message) && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {message && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              {message.text}
            </p>
          )}
          {password ? (
            <PasswordReveal name={person.name} password={password} loginUrl={loginUrl} labels={labels} onDone={() => { setPassword(null); setOpen(false); }} />
          ) : pending ? (
            <div className={`space-y-3 rounded-xl border p-4 ${pending === "enable" || pending === "role" ? "border-border" : "border-danger/40"}`}>
              <p className="text-sm">{labels.confirm[pending]}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(pending)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${pending === "enable" || pending === "role" ? "bg-primary text-primary-foreground" : "bg-danger text-white dark:text-hero"}`}
                >
                  {labels.yes}
                </button>
                <button type="button" onClick={() => setPending(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                  {labels.no}
                </button>
              </div>
            </div>
          ) : (
            open && (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => setPending(action)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      action === "disable" ? "border-danger/40 text-danger hover:bg-danger-soft" : "border-border hover:border-accent hover:text-accent"
                    }`}
                  >
                    {actionLabels[action]}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </li>
  );
}

function AddStaff({ labels, errors, loginUrl }: { labels: Labels; errors: Errors; loginUrl: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", role: "admin" as "admin" | "super_admin" });
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result: Result = await addStaffMember(form).catch(() => ({ ok: false, error: "failed" }));
      if (!result.ok || !result.password) return setError(errorText(result, labels, errors));
      setCreated({ name: form.name, password: result.password });
      setForm({ name: "", email: "", role: "admin" });
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl glass p-5 shadow-card">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon name="plus" className="h-5 w-5 text-accent" />
        {labels.add}
      </h3>
      {created ? (
        <PasswordReveal name={created.name} password={created.password} loginUrl={loginUrl} labels={labels} onDone={() => setCreated(null)} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Field label={labels.name} name="staffName" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label={labels.email} name="staffEmail" type="email" dir="ltr" required maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <fieldset>
            <legend className="text-sm font-medium">{labels.role}</legend>
            <div className="mt-1.5 space-y-2">
              {(["admin", "super_admin"] as const).map((role) => (
                <label key={role} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${form.role === role ? "border-accent bg-accent-soft" : "border-border hover:border-accent"}`}>
                  <input type="radio" name="staffRole" value={role} checked={form.role === role} onChange={() => setForm({ ...form, role })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-semibold">{labels.roles[role]}</span>
                    <span className="block text-xs text-muted">{labels.roleHelp[role]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
            {labels.create}
          </button>
        </form>
      )}
    </section>
  );
}

export function StaffManager({ people, currentUserId, loginUrl, labels, errors }: { people: Person[]; currentUserId: string; loginUrl: string; labels: Labels; errors: Errors }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <ul className="space-y-3">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} isYou={person.id === currentUserId} labels={labels} errors={errors} loginUrl={loginUrl} />
        ))}
      </ul>
      <div className="xl:sticky xl:top-24">
        <AddStaff labels={labels} errors={errors} loginUrl={loginUrl} />
      </div>
    </div>
  );
}
