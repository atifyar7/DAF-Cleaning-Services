"use client";

import { useLocale } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { deleteAddress, saveAddress } from "@/app/actions/account";
import type { SiteContent } from "@/content/en";
import { useRouter } from "@/i18n/navigation";
import { LocationPicker } from "../booking/location-picker";
import { Icon } from "../icon";
import { Field } from "../ui";

type Address = {
  id: string;
  label: string;
  building: string;
  unit: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  addresses: Address[];
  max: number;
  labels: SiteContent["account"]["addresses"];
  tile: string;
  count: string;
  fields: SiteContent["booking"]["details"];
  errors: SiteContent["account"]["detail"]["errors"];
};

const empty = { label: "", building: "", unit: "", area: "", latitude: null as number | null, longitude: null as number | null };
const quickLabels = { en: ["Home", "Office"], ar: ["المنزل", "المكتب"] };

export function AddressManager({ addresses, max, labels, tile, count, fields, errors }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const full = addresses.length >= max;
  const suggestions = quickLabels[useLocale() === "ar" ? "ar" : "en"];

  function finish(result: { ok: boolean; error?: string }, success: string) {
    if (result.ok) {
      setMessage({ tone: "ok", text: success });
      router.refresh();
      return true;
    }
    const key = (result.error ?? "failed") as keyof typeof errors;
    setMessage({ tone: "error", text: result.error === "not_allowed" ? labels.limit.replace("{max}", String(max)) : errors[key] ?? errors.failed });
    return false;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      if (finish(await saveAddress(draft), labels.saved)) {
        setDraft(empty);
        setAdding(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl glass p-5 shadow-card sm:p-6">
        <div>
          <h2 className="text-xl font-bold">{labels.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {labels.intro} <span className="font-medium text-foreground">{count}</span>
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            disabled={full}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
          >
            <Icon name="plus" className="h-4 w-4" />
            {labels.add}
          </button>
        )}
      </div>

      {full && <p className="text-sm text-muted">{labels.limit.replace("{max}", String(max))}</p>}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl p-3 text-sm ${message.tone === "ok" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}>
          <Icon name={message.tone === "ok" ? "check" : "close"} className="h-4 w-4 shrink-0" />
          {message.text}
        </p>
      )}

      {adding && (
        <form onSubmit={submit} className="fade-up grid gap-4 rounded-3xl glass ring-1 ring-accent/40 p-5 shadow-card sm:grid-cols-2 sm:p-6">
          <div className="sm:col-span-2">
            <Field label={labels.label} name="label" maxLength={40} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <div className="mt-2 flex gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setDraft({ ...draft, label: suggestion })}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${draft.label === suggestion ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-accent"}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <Field label={fields.building} name="building" required maxLength={120} value={draft.building} onChange={(e) => setDraft({ ...draft, building: e.target.value })} />
          <Field label={fields.unit} name="unit" required maxLength={60} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          <div className="sm:col-span-2">
            <Field label={fields.area} name="area" required maxLength={120} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
          </div>
          <LocationPicker
            latitude={draft.latitude}
            longitude={draft.longitude}
            labels={fields}
            onChange={(latitude, longitude) => setDraft((current) => ({ ...current, latitude, longitude }))}
          />
          <div className="flex gap-3 border-t border-border pt-4 sm:col-span-2">
            <button disabled={busy} className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60">
              {labels.save}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl px-5 py-3 font-semibold text-accent hover:bg-accent-soft">
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !adding ? (
        <div className="flex flex-col items-center rounded-3xl glass border-dashed px-6 py-14 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="pin" className="h-8 w-8" />
          </span>
          <p className="mt-4 text-muted">{labels.empty}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="group flex flex-col rounded-2xl glass p-5 shadow-card transition hover:border-accent">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={/home|المنزل/i.test(address.label) ? "home" : "pin"} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{address.label || labels.untitled}</p>
                  <p className="mt-1 text-sm">
                    {address.building}, {address.unit}
                  </p>
                  <p className="text-sm text-muted">{address.area}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                {address.latitude !== null ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                    <Icon name="check" className="h-4 w-4" />
                    {labels.pinned}
                  </span>
                ) : (
                  <span />
                )}
                {removing === address.id ? (
                  <span className="flex items-center gap-3">
                    <span className="text-muted">{labels.removeConfirm}</span>
                    <button
                      type="button"
                      disabled={busy}
                      className="font-semibold text-danger"
                      onClick={() =>
                        startTransition(async () => {
                          finish(await deleteAddress(address.id), labels.removed);
                          setRemoving(null);
                        })
                      }
                    >
                      {labels.remove}
                    </button>
                    <button type="button" className="text-muted" onClick={() => setRemoving(null)}>
                      {labels.cancel}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="text-danger hover:underline" onClick={() => setRemoving(address.id)}>
                    {labels.remove}
                  </button>
                )}
              </div>
            </li>
          ))}
          {!full && !adding && (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted transition hover:border-accent hover:text-accent"
              >
                <Icon name="plus" className="h-6 w-6" />
                <span className="text-sm font-medium">{tile}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
