import { SettingsForm } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/admin/ui";
import { getSuperAdminContent } from "@/content/super-admin";
import { requireStaff } from "@/lib/dal";
import { getBusinessSettings } from "@/lib/super-admin/settings";

export default async function SuperAdminSettingsPage({ params }: PageProps<"/[locale]/super-admin/settings">) {
  const { locale } = await params;
  await requireStaff("settings.manage", locale);
  const labels = getSuperAdminContent(locale);
  const initial = await getBusinessSettings();

  return (
    <div className="space-y-6">
      <PageHeader title={labels.settings.title} description={labels.settings.intro} />
      <SettingsForm initial={initial} labels={labels.settings} errors={labels.common.errors} />
    </div>
  );
}
