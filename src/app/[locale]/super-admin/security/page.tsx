import { when } from "@/components/account/format";
import { ChangePasswordForm, NameForm, PasskeyManager } from "@/components/admin/security-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { getContent } from "@/content";
import { getSuperAdminContent } from "@/content/super-admin";
import { requireStaff } from "@/lib/dal";
import { listOwnPasskeys } from "@/lib/super-admin/staff";

export default async function SuperAdminSecurityPage({ params }: PageProps<"/[locale]/super-admin/security">) {
  const { locale } = await params;
  const { user, staff: owner } = await requireStaff("dashboard.super_admin", locale);
  const labels = getSuperAdminContent(locale).security;
  const months = getContent(locale).booking.months;
  const passkeys = await listOwnPasskeys(owner);

  return (
    <div className="space-y-6">
      <PageHeader title={labels.title} description={labels.intro} />
      <Panel title={labels.name} icon="user" className="max-w-2xl">
        <NameForm initial={user.name} labels={labels} />
      </Panel>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel title={labels.passkeys} icon="shield">
          <p className="-mt-2 mb-4 text-sm text-muted">{labels.passkeysIntro}</p>
          <PasskeyManager
            labels={labels}
            passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, backedUp: p.backedUp, created: p.createdAt ? when(p.createdAt, months, locale).date : "" }))}
          />
        </Panel>
        <Panel title={labels.password} icon="user">
          <p className="-mt-2 mb-4 text-sm text-muted">{labels.passwordIntro}</p>
          <ChangePasswordForm labels={labels} />
        </Panel>
      </div>
    </div>
  );
}
