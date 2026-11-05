import type { ReactNode } from "react";
import { greetingKey, initials } from "@/components/account/format";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { DashboardSidebar, type SidebarItem } from "@/components/admin/dashboard-sidebar";
import { Icon } from "@/components/icon";
import { getAdminContent } from "@/content/admin";
import { getSuperAdminContent } from "@/content/super-admin";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/dal";

export default async function SuperAdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Each page checks again: layouts do not re-run on client-side navigation.
  const { user } = await requireStaff("dashboard.super_admin", locale);
  const labels = getSuperAdminContent(locale);
  const admin = getAdminContent(locale);
  const firstName = (user.name || "").split(" ")[0] || user.email.split("@")[0];

  const items: SidebarItem[] = [
    { href: "/super-admin", label: labels.nav.overview, icon: "grid" },
    { href: "/super-admin/staff", label: labels.nav.staff, icon: "users" },
    { href: "/super-admin/services", label: labels.nav.services, icon: "tag" },
    { href: "/super-admin/settings", label: labels.nav.settings, icon: "clock" },
    { href: "/super-admin/reports", label: labels.nav.reports, icon: "layers" },
    { href: "/super-admin/audit", label: labels.nav.audit, icon: "document" },
    { href: "/super-admin/security", label: labels.nav.security, icon: "shield" },
  ];
  const footer: SidebarItem[] = [
    { href: "/admin", label: labels.nav.adminDashboard, icon: "calendar" },
    { href: "/", label: admin.nav.website, icon: "home" },
  ];

  return (
    <DashboardShell
      eyebrow={labels.title}
      title={admin.greeting[greetingKey()].replace("{name}", firstName)}
      subtitle={labels.subtitle}
      actions={
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-xl bg-highlight px-5 py-3 font-semibold text-hero transition hover:-translate-y-0.5 hover:brightness-110"
        >
          <Icon name="calendar" className="h-5 w-5" />
          {labels.nav.adminDashboard}
        </Link>
      }
      sidebar={
        <DashboardSidebar
          name={user.name}
          email={user.email}
          initials={initials(user.name, user.email)}
          roleLabel={admin.roles.super_admin}
          items={items}
          footer={footer}
          labels={{ menu: labels.nav.menu, signOut: admin.nav.signOut }}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
