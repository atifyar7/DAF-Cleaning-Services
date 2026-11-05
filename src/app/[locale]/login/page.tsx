import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { env } from "@/lib/env";
import { isStaff } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const current = await getSession();
  if (current) redirect(`/${locale}${isStaff(current.user.role) ? "/staff" : "/account"}`);

  return <LoginForm googleEnabled={!!env.GOOGLE_CLIENT_ID} />;
}
