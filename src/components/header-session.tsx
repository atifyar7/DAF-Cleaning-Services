"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { isStaff } from "@/lib/permissions";

const linkClass = "rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft";

export function HeaderSession() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { data } = authClient.useSession();

  if (!data) {
    return (
      <Link href="/login" className={linkClass}>
        {t("signIn")}
      </Link>
    );
  }

  const role = (data.user as { role?: string }).role;
  return (
    <>
      <Link href={isStaff(role) ? "/staff" : "/account"} className={linkClass}>
        {t("account")}
      </Link>
      <button
        type="button"
        className={linkClass}
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        {t("signOut")}
      </button>
    </>
  );
}
