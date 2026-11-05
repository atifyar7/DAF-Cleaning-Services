"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Icon, type IconName } from "../icon";

export type SidebarItem = { href: string; label: string; icon: IconName; badge?: number };

type Props = {
  name: string;
  email: string;
  initials: string;
  roleLabel: string;
  items: SidebarItem[];
  footer: SidebarItem[];
  labels: { menu: string; signOut: string };
};

/** The staff dashboards' navigation: a sticky card on wide screens, a scrolling strip on phones. */
export function DashboardSidebar({ name, email, initials, roleLabel, items, footer, labels }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // The first item is the section's home page, which is active only on an exact match.
  const isActive = (href: string) => (href === items[0]?.href ? pathname === href : pathname.startsWith(href));
  const footerLink = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground";

  return (
    <div className="rounded-3xl glass p-4 shadow-card lg:sticky lg:top-24 lg:p-5">
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-highlight to-accent text-base font-bold text-hero">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name || email}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-accent">
            <Icon name="shield" className="h-3.5 w-3.5" />
            {roleLabel}
          </p>
        </div>
      </div>

      <nav aria-label={labels.menu} className="mt-4 flex gap-1 overflow-x-auto border-t border-border pt-4 lg:flex-col">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              {active && <span aria-hidden="true" className="absolute inset-y-2 start-0 hidden w-1 rounded-full bg-accent lg:block" />}
              <Icon name={item.icon} className="h-5 w-5" />
              <span className="lg:flex-1">{item.label}</span>
              {!!item.badge && <span className="min-w-6 rounded-full bg-warning-soft px-1.5 py-0.5 text-center text-xs font-bold text-warning">{item.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 hidden space-y-1 border-t border-border pt-4 lg:block">
        {footer.map((item) => (
          <Link key={item.href} href={item.href} className={footerLink}>
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut();
            router.push("/staff/login");
            router.refresh();
          }}
          className={`${footerLink} w-full`}
        >
          <Icon name="logout" className="h-5 w-5 rtl:-scale-x-100" />
          {labels.signOut}
        </button>
      </div>
    </div>
  );
}
