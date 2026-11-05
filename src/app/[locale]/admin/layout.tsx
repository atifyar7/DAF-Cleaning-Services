import type { ReactNode } from "react";
import { greetingKey, initials } from "@/components/account/format";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { DashboardSidebar, type SidebarItem } from "@/components/admin/dashboard-sidebar";
import { Icon } from "@/components/icon";
import { getAdminContent } from "@/content/admin";
import { getContent } from "@/content";
import { getSuperAdminContent } from "@/content/super-admin";
import { Link } from "@/i18n/navigation";
import { attentionCounts } from "@/lib/admin/bookings";
import { displayDate, dubaiDate } from "@/lib/booking/time";
import { requireStaff } from "@/lib/dal";

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Each page checks again: layouts do not re-run on client-side navigation.
  const { user, staff } = await requireStaff("dashboard.admin", locale);
  const labels = getAdminContent(locale);
  const owner = getSuperAdminContent(locale);
  const counts = await attentionCounts(staff);
  const firstName = (user.name || "").split(" ")[0] || user.email.split("@")[0];
  const today = displayDate(dubaiDate(new Date()), getContent(locale).booking.months);

  const items: SidebarItem[] = [
    { href: "/admin", label: labels.nav.overview, icon: "grid" },
    { href: "/admin/bookings", label: labels.nav.bookings, icon: "calendar", badge: counts.review + counts.quotes + counts.unassigned },
    { href: "/admin/schedule", label: labels.nav.schedule, icon: "clock" },
    { href: "/admin/cleaners", label: labels.nav.cleaners, icon: "sparkle" },
    { href: "/admin/customers", label: labels.nav.customers, icon: "users", badge: counts.deletions },
    { href: "/admin/enquiries", label: labels.nav.enquiries, icon: "inbox", badge: counts.enquiries },
  ];
  const footer: SidebarItem[] = [
    ...(staff.role === "super_admin" ? [{ href: "/super-admin", label: labels.nav.superAdmin, icon: "shield" as const }] : []),
    { href: "/admin/security", label: owner.nav.security, icon: "user" },
    { href: "/", label: labels.nav.website, icon: "home" },
  ];

  return (
    <DashboardShell
      eyebrow={labels.title}
      title={labels.greeting[greetingKey()].replace("{name}", firstName)}
      subtitle={labels.subtitle}
      actions={
        <>
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
        </>
      }
      sidebar={
        <DashboardSidebar
          name={user.name}
          email={user.email}
          initials={initials(user.name, user.email)}
          roleLabel={labels.roles[staff.role]}
          items={items}
          footer={footer}
          labels={{ menu: labels.nav.menu, signOut: labels.nav.signOut }}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
