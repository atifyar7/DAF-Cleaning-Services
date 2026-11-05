import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { normalizeUaeMobile } from "@/lib/booking/input";
import { Icon, type IconName } from "../icon";

// Building blocks shared by the admin pages, in the same frosted-glass style as the customer dashboard.

/** Builds a link to a list page, keeping the other filters and dropping empty ones. */
export function listHref(path: string, current: Record<string, string | number | undefined>, change: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) {
    if (value !== undefined && value !== "" && !(key === "page" && Number(value) === 1)) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, icon, action, children, className = "" }: { title?: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl glass p-5 shadow-card ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={icon} className="h-5 w-5" />
              </span>
            )}
            <h3 className="font-semibold">{title}</h3>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Pill tabs for list views. Each tab is a link, so filters work without JavaScript and can be shared. */
export function FilterTabs({ tabs, label }: { tabs: { href: string; label: string; count?: number; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
            tab.active ? "bg-primary text-primary-foreground shadow-card" : "glass text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tab.active ? "bg-white/20" : "bg-surface"}`}>{tab.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A plain GET search form: it works without JavaScript and keeps the result in the address bar. */
export function SearchForm({
  action,
  value,
  placeholder,
  labels,
  hidden = {},
  children,
}: {
  action: string;
  value?: string;
  placeholder: string;
  labels: { search: string; clear: string };
  hidden?: Record<string, string | undefined>;
  children?: ReactNode;
}) {
  return (
    <form action={action} method="get" role="search" className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
      <label className="relative min-w-0 flex-1 basis-64">
        <span className="sr-only">{labels.search}</span>
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          name="q"
          defaultValue={value}
          maxLength={100}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </label>
      {children}
      <button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">{labels.search}</button>
      {value && (
        <a href={action} className="rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground">
          {labels.clear}
        </a>
      )}
    </form>
  );
}

export function Pager({ page, pages, href, labels }: { page: number; pages: number; href: (page: number) => string; labels: { previous: string; next: string; pageOf: string } }) {
  if (pages <= 1) return null;
  const button = "inline-flex items-center gap-1.5 rounded-xl glass px-4 py-2 text-sm font-medium transition hover:text-accent";
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={labels.pageOf.replace("{page}", String(page)).replace("{pages}", String(pages))}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={button}>
          <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">{labels.pageOf.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={button}>
          {labels.next}
          <Icon name="arrow" className="h-4 w-4 rtl:-scale-x-100" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function EmptyState({ icon = "sparkle", text, children }: { icon?: IconName; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl glass px-6 py-14 text-center shadow-card">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <p className="mt-4 max-w-sm text-muted">{text}</p>
      {children}
    </div>
  );
}

const chipTones = {
  neutral: "bg-surface text-muted ring-1 ring-border",
  accent: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Chip({ tone = "neutral", icon, children }: { tone?: keyof typeof chipTones; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${chipTones[tone]}`}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/** Contact shortcuts. Phone numbers stay left-to-right in Arabic. */
export function ContactLinks({ phone, email, labels }: { phone?: string | null; email?: string | null; labels: { call: string; whatsapp: string; email: string } }) {
  const usable = phone && phone !== "-" ? phone : null;
  const link = "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition hover:border-accent hover:text-accent";
  return (
    <div className="flex flex-wrap gap-2">
      {usable && (
        <>
          <a href={`tel:${usable}`} className={link}>
            <Icon name="phone" className="h-3.5 w-3.5" />
            {labels.call}
          </a>
          <a href={`https://wa.me/${(normalizeUaeMobile(usable) ?? usable).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={link}>
            <Icon name="whatsapp" className="h-3.5 w-3.5" />
            {labels.whatsapp}
          </a>
        </>
      )}
      {email && !email.endsWith("@deleted.invalid") && (
        <a href={`mailto:${email}`} className={link}>
          <Icon name="mail" className="h-3.5 w-3.5" />
          {labels.email}
        </a>
      )}
    </div>
  );
}
