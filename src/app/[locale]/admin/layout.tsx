import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { greetingKey, initials } from "@/components/account/format";
import { Icon } from "@/components/icon";
import { getAdminContent } from "@/content/admin";
import { getContent } from "@/content";
import { Link } from "@/i18n/navigation";
import { attentionCounts } from "@/lib/admin/bookings";
import { displayDate, dubaiDate } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Each page checks again: layouts do not re-run on client-side navigation.
  const { user, staff } = await requireStaff("dashboard.admin", locale);
  const labels = getAdminContent(locale);
  const counts = await attentionCounts(staff);
  const firstName = (user.name || "").split(" ")[0] || user.email.split("@")[0];
  const today = displayDate(dubaiDate(new Date()), getContent(locale).booking.months);

  return (
    <div className="glass-backdrop flex-1">
      <section className="relative isolate overflow-hidden bg-hero text-white">
        <div aria-hidden="true" className="absolute -top-24 -end-24 -z-10 h-72 w-72 rounded-full bg-highlight/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 start-1/3 -z-10 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-6 px-4 pt-10 pb-24 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-highlight uppercase">
              <Icon name="shield" className="h-4 w-4" />
              {labels.title}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{labels.greeting[greetingKey()].replace("{name}", firstName)}</h1>
            <p className="mt-2 max-w-xl text-white/75">{labels.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium ring-1 ring-white/15">
              <Icon name="calendar" className="h-4 w-4 text-highlight" />
              {today}
            </span>
            <Link
              href="/admin/schedule"
              className="inline-flex items-center gap-2 rounded-xl bg-highlight px-5 py-3 font-semibold text-hero transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <Icon name="clock" className="h-5 w-5" />
              {labels.nav.schedule}
            </Link>
          </div>
        </div>
      </section>

      {/* relative z-10 lifts the content above the header band it overlaps. minmax(0, 1fr) stops the
          scrolling menu on phones from widening the column past the screen. */}
      <div className="relative z-10 mx-auto -mt-14 grid w-full max-w-[1400px] grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <AdminSidebar
          name={user.name}
          email={user.email}
          initials={initials(user.name, user.email)}
          role={staff.role}
          counts={{ bookings: counts.review + counts.quotes + counts.unassigned, enquiries: counts.enquiries, customers: counts.deletions }}
          labels={labels}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
