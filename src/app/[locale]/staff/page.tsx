import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/dal";

/** Sends staff to the right dashboard after sign-in. */
export default async function StaffHomePage({ params }: PageProps<"/[locale]/staff">) {
  const { locale } = await params;
  const { user } = await requirePermission("dashboard.admin", locale);
  redirect(`/${locale}${user.role === "super_admin" ? "/super-admin" : "/admin"}`);
}
