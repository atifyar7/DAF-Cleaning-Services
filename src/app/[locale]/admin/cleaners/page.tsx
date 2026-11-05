import { CleanerManager } from "@/components/admin/cleaner-manager";
import { PageHeader } from "@/components/admin/ui";
import { getAdminContent } from "@/content/admin";
import { listCleaners } from "@/lib/admin/cleaners";
import { requireStaff } from "@/lib/dal";

export default async function AdminCleanersPage({ params }: PageProps<"/[locale]/admin/cleaners">) {
  const { locale } = await params;
  const { staff } = await requireStaff("cleaner.manage", locale);
  const labels = getAdminContent(locale);
  const cleaners = await listCleaners(staff);
  const active = cleaners.filter((c) => c.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={labels.cleaners.title}
        description={`${labels.cleaners.intro} ${labels.cleaners.count.replace("{active}", String(active)).replace("{total}", String(cleaners.length))}`}
      />
      <CleanerManager
        cleaners={cleaners.map(({ id, name, phone, active, upcoming, completed }) => ({ id, name, phone, active, upcoming, completed }))}
        labels={labels}
      />
    </div>
  );
}
