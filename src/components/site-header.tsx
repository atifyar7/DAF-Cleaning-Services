import { useLocale, useTranslations } from "next-intl";
import { categoryImages, getContent } from "@/content";
import { Link } from "@/i18n/navigation";
import { HeaderSession } from "./header-session";
import { LanguageSwitch } from "./language-switch";
import { MainNav } from "./main-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ theme }: { theme?: "light" | "dark" }) {
  const t = useTranslations();
  const content = getContent(useLocale());

  const groups = content.servicesPage.categories.map((category) => ({
    id: category.id,
    title: category.title,
    image: categoryImages[category.id],
    links: content.services
      .filter((service) => service.category === category.id && service.slug !== "housekeeping")
      .map((service) => ({ href: `/services/${service.slug}`, label: service.title })),
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-border">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          {/* The logo has a white background, so it stays on white in both themes.
              Plain img: next/image adds an inline style that the security policy blocks. */}
          <span className="rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mark.png" alt="" width={44} height={31} />
          </span>
          <span className="font-bold">{t("brand.name")}</span>
        </Link>
        <MainNav groups={groups}>
          <HeaderSession />
        </MainNav>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeToggle initial={theme} />
          <Link
            href="/book"
            className="ms-1 hidden rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover sm:block"
          >
            {t("nav.book")}
          </Link>
        </div>
      </div>
    </header>
  );
}
