import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-muted">{t("notFoundBody")}</p>
      <Link href="/" className="mt-6 font-medium text-accent hover:underline">
        {t("home")}
      </Link>
    </div>
  );
}
