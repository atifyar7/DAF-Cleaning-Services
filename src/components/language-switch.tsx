"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <Link
      href={pathname}
      locale={locale === "ar" ? "en" : "ar"}
      className="rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft"
    >
      {t("language")}
    </Link>
  );
}
