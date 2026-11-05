"use client";

import { useState, useTransition, type FormEvent } from "react";
import { removePasskey } from "@/app/actions/super-admin";
import type { SuperAdminContent } from "@/content/super-admin";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Icon } from "../icon";
import { Field } from "../ui";

type Labels = SuperAdminContent["security"];
type Message = { tone: "ok" | "error"; text: string } | null;

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>
      <Icon name={message.tone === "ok" ? "check" : "alert"} className="mt-0.5 h-4 w-4 shrink-0" />
      {message.text}
    </p>
  );
}

/** The signed-in staff member's display name. */
export function NameForm({ initial, labels }: { initial: string; labels: Labels }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (error) {
      setMessage({ tone: "error", text: error.status === 429 ? labels.tooMany : labels.nameFailed });
    } else {
      setMessage({ tone: "ok", text: labels.nameSaved });
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Note message={message} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <Field label={labels.name} name="displayName" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button disabled={busy || name.trim() === initial || name.trim().length < 2} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50">
          {labels.nameSave}
        </button>
      </div>
      <p className="text-xs text-muted">{labels.nameHint}</p>
    </form>
  );
}

/** Changes the signed-in staff member's password and signs out their other devices. */
export function ChangePasswordForm({ labels }: { labels: Labels }) {
  const [form, setForm] = useState({ current: "", next: "", repeat: "" });
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (form.next.length < 12) return setMessage({ tone: "error", text: labels.tooShort });
    if (form.next !== form.repeat) return setMessage({ tone: "error", text: labels.mismatch });
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: form.current, newPassword: form.next, revokeOtherSessions: true });
    setBusy(false);
    if (error) {
      setMessage({ tone: "error", text: error.status === 429 ? labels.tooMany : labels.wrongPassword });
    } else {
      setForm({ current: "", next: "", repeat: "" });
      setMessage({ tone: "ok", text: labels.passwordChanged });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Note message={message} />
      <Field label={labels.currentPassword} name="currentPassword" type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.newPassword} name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        <Field label={labels.confirmPassword} name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
      </div>
      <button disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
        {labels.passwordSave}
      </button>
    </form>
  );
}

type Passkey = { id: string; name: string | null; backedUp: boolean; created: string };

/** Lists the Super Admin's passkeys and adds new ones through the browser's own passkey prompt. */
export function PasskeyManager({ passkeys, labels }: { passkeys: Passkey[]; labels: Labels }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (typeof window.PublicKeyCredential === "undefined") return setMessage({ tone: "error", text: labels.unsupported });
    setAdding(true);
    try {
      const { error } = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (error) {
        setMessage({ tone: "error", text: labels.addFailed });
      } else {
        setName("");
        setMessage({ tone: "ok", text: labels.added });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: labels.addFailed });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <Note message={message} />
      {passkeys.length === 0 ? (
        <p className="rounded-xl bg-surface p-4 text-sm text-muted">{labels.noPasskeys}</p>
      ) : (
        <ul className="space-y-2">
          {passkeys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{key.name || "Passkey"}</span>
                <span className="block text-xs text-muted">
                  {labels.created.replace("{date}", key.created)} · {key.backedUp ? labels.synced : labels.deviceOnly}
                </span>
              </span>
              {confirming === key.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{labels.removeConfirm}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removePasskey(key.id).catch(() => ({ ok: false }));
                        setConfirming(null);
                        setMessage(result.ok ? { tone: "ok", text: labels.removed } : { tone: "error", text: labels.addFailed });
                        if (result.ok) router.refresh();
                      })
                    }
                    className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white dark:text-hero"
                  >
                    {labels.remove}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                    ✕
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(key.id)} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-soft">
                  {labels.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <Field label={labels.passkeyName} name="passkeyName" maxLength={60} placeholder={labels.passkeyNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button disabled={adding} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
          <Icon name="plus" className="h-4 w-4" />
          {adding ? labels.adding : labels.addPasskey}
        </button>
      </form>
    </div>
  );
}
