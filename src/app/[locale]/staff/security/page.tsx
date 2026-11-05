import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { isStaff } from "@/lib/permissions";
import { SetupForm } from "./setup-form";

export default async function StaffSecurityPage({ params }: PageProps<"/[locale]/staff/security">) {
  const { locale } = await params;
  const current = await getSession();
  if (!current) redirect(`/${locale}/staff/login`);
  if (!isStaff(current.user.role)) notFound();

  return <SetupForm />;
}
