import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/dal";

export default async function SuperAdminPage({ params }: PageProps<"/[locale]/super-admin">) {
  const { locale } = await params;
  await requirePermission("dashboard.super_admin", locale);
  const t = await getTranslations("superAdmin");

  return (
    <PageShell title={t("title")}>
      <p>{t("body")}</p>
      <Link href="/admin" className="mt-3 inline-block font-medium text-accent hover:underline">
        {t("adminLink")}
      </Link>
    </PageShell>
  );
}
