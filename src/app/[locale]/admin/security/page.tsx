import { ChangePasswordForm, NameForm } from "@/components/admin/security-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { getSuperAdminContent } from "@/content/super-admin";
import { requireStaff } from "@/lib/dal";

export default async function AdminSecurityPage({ params }: PageProps<"/[locale]/admin/security">) {
  const { locale } = await params;
  const { user } = await requireStaff("dashboard.admin", locale);
  const labels = getSuperAdminContent(locale).security;

  return (
    <div className="space-y-6">
      <PageHeader title={labels.title} description={labels.intro} />
      <Panel title={labels.name} icon="user" className="max-w-2xl">
        <NameForm initial={user.name} labels={labels} />
      </Panel>
      <Panel title={labels.password} icon="shield" className="max-w-2xl">
        <p className="-mt-2 mb-4 text-sm text-muted">{labels.passwordIntro}</p>
        <ChangePasswordForm labels={labels} />
      </Panel>
    </div>
  );
}
