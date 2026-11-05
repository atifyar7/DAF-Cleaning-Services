import { CatalogEditor } from "@/components/admin/catalog-editor";
import { PageHeader } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { getSuperAdminContent } from "@/content/super-admin";
import { requireStaff } from "@/lib/dal";
import { getCatalogForEditing } from "@/lib/super-admin/catalog";

const priceText = (fils: number | null) => (fils === null ? "" : Number.isInteger(fils / 100) ? String(fils / 100) : (fils / 100).toFixed(2));

export default async function SuperAdminServicesPage({ params }: PageProps<"/[locale]/super-admin/services">) {
  const { locale } = await params;
  const { staff: owner } = await requireStaff("catalog.manage", locale);
  const labels = getSuperAdminContent(locale);
  const { categories, services, addOns } = await getCatalogForEditing(owner);
  const named = (c: { id: string; slug: string; nameEn: string; nameAr: string; active: boolean }) => ({ id: c.id, slug: c.slug, nameEn: c.nameEn, nameAr: c.nameAr, active: c.active });

  return (
    <div className="space-y-6">
      <PageHeader title={labels.services.title} description={labels.services.intro} />
      <p className="flex items-start gap-3 rounded-2xl glass p-4 text-sm text-muted shadow-card">
        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        {labels.services.siteNote}
      </p>
      <CatalogEditor
        labels={labels.services}
        errors={labels.common.errors}
        addOns={addOns.map(named)}
        groups={categories.map((category) => ({
          category: named(category),
          services: services
            .filter((s) => s.categoryId === category.id)
            .map((s) => ({
              id: s.id,
              slug: s.slug,
              nameEn: s.nameEn,
              nameAr: s.nameAr,
              // "fixed" is not used by the booking engine, which quotes anything that is not hourly.
              pricingModel: s.pricingModel === "hourly" && s.priceFils !== null ? ("hourly" as const) : ("quote" as const),
              price: priceText(s.priceFils),
              active: s.active,
              sortOrder: s.sortOrder,
            })),
        }))}
      />
    </div>
  );
}
