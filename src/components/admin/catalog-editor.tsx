"use client";

import { useLocale } from "next-intl";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveAddOn, saveCategory, saveService } from "@/app/actions/super-admin";
import type { SuperAdminContent } from "@/content/super-admin";
import { useRouter } from "@/i18n/navigation";
import { Icon } from "../icon";

type Labels = SuperAdminContent["services"];
type Errors = SuperAdminContent["common"]["errors"];

const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function useSave(errors: Errors, saved: string) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  return {
    message,
    busy,
    save(action: () => Promise<{ ok: boolean; error?: string }>) {
      setMessage(null);
      startTransition(async () => {
        const result = await action().catch(() => ({ ok: false, error: "failed" }));
        setMessage(result.ok ? { tone: "ok", text: saved } : { tone: "error", text: (errors as Record<string, string>)[result.error ?? "failed"] ?? errors.failed });
        if (result.ok) router.refresh();
      });
    },
  };
}

function Toggle({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" name={name} role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-border transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:start-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5" />
      {label}
    </label>
  );
}

function Feedback({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <span role={message.tone === "error" ? "alert" : "status"} className={`inline-flex items-center gap-1.5 text-sm font-medium ${message.tone === "ok" ? "text-accent" : "text-danger"}`}>
      <Icon name={message.tone === "ok" ? "check" : "alert"} className="h-4 w-4" />
      {message.text}
    </span>
  );
}

function Names({ prefix, value, onChange, labels }: { prefix: string; value: { nameEn: string; nameAr: string }; onChange: (v: { nameEn: string; nameAr: string }) => void; labels: Labels }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        {labels.name}
        <input name={`${prefix}-nameEn`} dir="ltr" required minLength={2} maxLength={80} value={value.nameEn} onChange={(e) => onChange({ ...value, nameEn: e.target.value })} className={`${field} mt-1.5`} />
      </label>
      <label className="text-sm font-medium">
        {labels.nameAr}
        <input name={`${prefix}-nameAr`} dir="rtl" lang="ar" required minLength={2} maxLength={80} value={value.nameAr} onChange={(e) => onChange({ ...value, nameAr: e.target.value })} className={`${field} mt-1.5`} />
      </label>
    </div>
  );
}

type Service = { id: string; slug: string; nameEn: string; nameAr: string; pricingModel: "hourly" | "quote"; price: string; active: boolean; sortOrder: number };

function ServiceCard({ item, isRate, labels, errors }: { item: Service; isRate: boolean; labels: Labels; errors: Errors }) {
  const locale = useLocale();
  const [form, setForm] = useState(item);
  const { message, busy, save } = useSave(errors, labels.saved);
  const changed = JSON.stringify(form) !== JSON.stringify(item);

  function submit(event: FormEvent) {
    event.preventDefault();
    save(() => saveService(item.id, { nameEn: form.nameEn, nameAr: form.nameAr, pricingModel: form.pricingModel, price: form.price, active: form.active, sortOrder: form.sortOrder }));
  }

  return (
    <form onSubmit={submit} data-service={item.slug} className={`space-y-4 rounded-2xl glass p-5 shadow-card ${form.active ? "" : "opacity-80"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">{locale === "ar" ? item.nameAr : item.nameEn}</h4>
        <div className="flex items-center gap-2">
          {!item.active && <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-border">{labels.hidden}</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.pricingModel === "hourly" ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning"}`}>
            {item.pricingModel === "hourly" ? `AED ${item.price} / h` : labels.models.quote}
          </span>
        </div>
      </div>
      <Names prefix={item.slug} value={form} onChange={(v) => setForm({ ...form, ...v })} labels={labels} />
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_160px_90px]">
        <fieldset>
          <legend className="text-sm font-medium">{labels.pricing}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
            {(["hourly", "quote"] as const).map((model) => (
              <button
                key={model}
                type="button"
                aria-pressed={form.pricingModel === model}
                onClick={() => setForm({ ...form, pricingModel: model })}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm ${form.pricingModel === model ? "bg-primary text-primary-foreground shadow" : "text-muted hover:text-foreground"}`}
              >
                {labels.models[model]}
              </button>
            ))}
          </div>
        </fieldset>
        {form.pricingModel === "hourly" ? (
          <label className="text-sm font-medium">
            {labels.price}
            <input name={`${item.slug}-price`} dir="ltr" inputMode="decimal" required pattern="\d{1,6}(\.\d{1,2})?" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`${field} mt-1.5`} />
          </label>
        ) : (
          <p className="text-xs text-muted sm:pb-2">{labels.quoteHint}</p>
        )}
        <label className="text-sm font-medium">
          {labels.order}
          <input name={`${item.slug}-order`} type="number" min={0} max={999} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} className={`${field} mt-1.5`} />
        </label>
      </div>
      {isRate && form.pricingModel === "hourly" && (
        <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
          <Icon name="sparkle" className="h-4 w-4 shrink-0" />
          {labels.rateNote}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Toggle name={`${item.slug}-active`} checked={form.active} onChange={(active) => setForm({ ...form, active })} label={labels.active} />
        <div className="flex items-center gap-3">
          <Feedback message={message} />
          <button disabled={busy || !changed} className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50">
            {labels.save}
          </button>
        </div>
      </div>
    </form>
  );
}

type Named = { id: string; slug: string; nameEn: string; nameAr: string; active: boolean };

/** A category or add-on: names plus an on/off switch. */
function SimpleCard({ item, kind, labels, errors }: { item: Named; kind: "category" | "addOn"; labels: Labels; errors: Errors }) {
  const [form, setForm] = useState(item);
  const { message, busy, save } = useSave(errors, labels.saved);
  const changed = JSON.stringify(form) !== JSON.stringify(item);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const input = { nameEn: form.nameEn, nameAr: form.nameAr, active: form.active };
        save(() => (kind === "category" ? saveCategory(item.id, input) : saveAddOn(item.id, input)));
      }}
      data-item={item.slug}
      className="space-y-4 rounded-2xl glass p-5 shadow-card"
    >
      <Names prefix={item.slug} value={form} onChange={(v) => setForm({ ...form, ...v })} labels={labels} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle name={`${item.slug}-active`} checked={form.active} onChange={(active) => setForm({ ...form, active })} label={labels.active} />
        <div className="flex items-center gap-3">
          <Feedback message={message} />
          <button disabled={busy || !changed} className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50">
            {labels.save}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

type Props = {
  groups: { category: Named; services: Service[] }[];
  addOns: Named[];
  labels: Labels;
  errors: Errors;
};

export function CatalogEditor({ groups, addOns, labels, errors }: Props) {
  const locale = useLocale();
  return (
    <div className="space-y-10">
      {groups.map(({ category, services }) => (
        <section key={category.id} className="space-y-3">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Icon name="layers" className="h-5 w-5 text-accent" />
            {locale === "ar" ? category.nameAr : category.nameEn}
            {!category.active && <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-border">{labels.hidden}</span>}
          </h3>
          <div className="grid gap-4 2xl:grid-cols-2">
            {services.map((item) => (
              <ServiceCard key={item.id} item={item} isRate={item.slug === "general-cleaning"} labels={labels} errors={errors} />
            ))}
          </div>
        </section>
      ))}

      <Section title={labels.addOns} intro={labels.addOnsIntro}>
        <div className="grid gap-4 lg:grid-cols-2">
          {addOns.map((item) => (
            <SimpleCard key={item.id} item={item} kind="addOn" labels={labels} errors={errors} />
          ))}
        </div>
      </Section>

      <Section title={labels.categories} intro={labels.categoriesIntro}>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(({ category }) => (
            <SimpleCard key={category.id} item={category} kind="category" labels={labels} errors={errors} />
          ))}
        </div>
      </Section>
    </div>
  );
}
