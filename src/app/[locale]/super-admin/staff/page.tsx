import { when } from "@/components/account/format";
import { StaffManager } from "@/components/admin/staff-manager";
import { PageHeader } from "@/components/admin/ui";
import { getContent } from "@/content";
import { getSuperAdminContent } from "@/content/super-admin";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/dal";
import { listStaff } from "@/lib/super-admin/staff";

export default async function SuperAdminStaffPage({ params }: PageProps<"/[locale]/super-admin/staff">) {
  const { locale } = await params;
  const { staff: owner } = await requireStaff("staff.manage", locale);
  const labels = getSuperAdminContent(locale);
  const months = getContent(locale).booking.months;
  const people = await listStaff(owner);

  return (
    <div className="space-y-6">
      <PageHeader title={labels.staff.title} description={labels.staff.intro} />
      <StaffManager
        currentUserId={owner.userId}
        loginUrl={`${env.BETTER_AUTH_URL}/${locale}/staff/login`}
        labels={labels.staff}
        errors={labels.common.errors}
        people={people.map((p) => {
          const signedIn = p.lastSignIn ? when(p.lastSignIn, months, locale) : null;
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role === "super_admin" ? "super_admin" : "admin",
            twoFactorEnabled: p.twoFactorEnabled,
            disabled: !!p.disabledAt,
            passkeys: p.passkeys,
            lastSignIn: signedIn ? `${signedIn.date}, ${signedIn.time}` : null,
          };
        })}
      />
    </div>
  );
}
