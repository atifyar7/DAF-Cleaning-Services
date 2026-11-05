import type { ReactNode } from "react";
import { AccountSidebar } from "@/components/account/account-sidebar";
import { greetingKey, initials } from "@/components/account/format";
import { Icon } from "@/components/icon";
import { business, getContent } from "@/content";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/dal";

export default async function AccountLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Each page checks again: layouts do not re-run on client-side navigation.
  const { user } = await requirePermission("account.view", locale);
  const labels = getContent(locale).account;
  const firstName = (user.name || "").split(" ")[0] || user.email.split("@")[0];

  return (
    <div className="glass-backdrop flex-1">
      <section className="relative isolate overflow-hidden bg-hero text-white">
        <div aria-hidden="true" className="absolute -top-24 -end-24 -z-10 h-72 w-72 rounded-full bg-highlight/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 start-1/3 -z-10 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-6 px-4 pt-10 pb-24 sm:px-6 sm:pt-12">
          <div>
            <p className="text-sm font-semibold tracking-wide text-highlight uppercase">{labels.title}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {labels.greeting[greetingKey()].replace("{name}", firstName)}
            </h1>
            <p className="mt-2 max-w-xl text-white/75">{labels.subtitle}</p>
          </div>
          <Link
            href="/book"
            className="group inline-flex items-center gap-2 rounded-xl bg-highlight px-5 py-3 font-semibold text-hero transition hover:-translate-y-0.5 hover:brightness-110"
          >
            <Icon name="plus" className="h-5 w-5" />
            {labels.bookings.bookNow}
          </Link>
        </div>
      </section>

      {/* relative z-10 lifts the content above the header band it overlaps. */}
      <div className="relative z-10 mx-auto -mt-14 grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <AccountSidebar
          name={user.name}
          email={user.email}
          initials={initials(user.name, user.email)}
          whatsapp={business.phones[0].whatsapp}
          labels={labels}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
