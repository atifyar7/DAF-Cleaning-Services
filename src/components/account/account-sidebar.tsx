"use client";

import type { SiteContent } from "@/content/en";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Icon, type IconName } from "../icon";

type Labels = SiteContent["account"];

type Props = {
  name: string;
  email: string;
  initials: string;
  whatsapp: string;
  labels: Pick<Labels, "nav" | "help" | "signOut">;
};

export function AccountSidebar({ name, email, initials, whatsapp, labels }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const items: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: "/account", label: labels.nav.bookings, icon: "calendar", active: pathname === "/account" || pathname.startsWith("/account/bookings") },
    { href: "/account/addresses", label: labels.nav.addresses, icon: "pin", active: pathname === "/account/addresses" },
    { href: "/account/profile", label: labels.nav.profile, icon: "user", active: pathname === "/account/profile" },
  ];

  return (
    <div className="rounded-3xl glass p-4 shadow-card lg:sticky lg:top-24 lg:p-5">
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-highlight to-accent text-base font-bold text-hero">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name || email}</p>
          <p className="truncate text-sm text-muted" dir="ltr">
            {email}
          </p>
        </div>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-t border-border pt-4 lg:flex-col">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              item.active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {item.active && <span aria-hidden="true" className="absolute inset-y-2 start-0 hidden w-1 rounded-full bg-accent lg:block" />}
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 hidden rounded-2xl bg-hero p-4 text-white lg:block">
        <p className="font-semibold">{labels.help.title}</p>
        <p className="mt-1 text-sm text-white/75">{labels.help.body}</p>
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-highlight px-3 py-2 text-sm font-semibold text-hero transition hover:brightness-110"
        >
          <Icon name="whatsapp" className="h-4 w-4" />
          {labels.help.whatsapp}
        </a>
      </div>

      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
        className="mt-3 hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground lg:flex"
      >
        <Icon name="logout" className="h-5 w-5 rtl:-scale-x-100" />
        {labels.signOut}
      </button>
    </div>
  );
}
