import { useLocale, useTranslations } from "next-intl";
import { business, getContent } from "@/content";
import { Link } from "@/i18n/navigation";
import { Icon } from "./icon";

export function SiteFooter() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const content = getContent(locale);
  const { footer, legal } = content;

  const quickLinks = [
    { href: "/", label: t("home") },
    { href: "/about", label: t("about") },
    { href: "/services", label: t("services") },
    { href: "/pricing", label: t("pricing") },
    { href: "/book", label: content.cta.book },
    { href: "/monthly-contracts", label: t("contracts") },
    { href: "/faq", label: t("faq") },
    { href: "/contact", label: t("contact") },
  ];
  const legalLinks = [
    { href: "/privacy", label: legal.privacy.title },
    { href: "/terms", label: legal.terms.title },
    { href: "/cancellation", label: legal.cancellation.title },
  ];

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-lg font-bold">{content.company}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{footer.about}</p>
          <p className="mt-4 text-sm text-muted">
            {footer.license}: <span dir="ltr">{business.license}</span>
          </p>
        </div>
        <FooterList title={footer.quickLinks} links={quickLinks} />
        <FooterList
          title={footer.servicesTitle}
          links={content.servicesPage.categories.map((category) => ({
            href: `/services#${category.id}`,
            label: category.title,
          }))}
        />
        <div>
          <p className="font-semibold">{footer.contactTitle}</p>
          <ul className="mt-3 space-y-2.5 text-sm text-muted">
            {business.phones.map((phone) => (
              <li key={phone.tel}>
                <a href={`tel:${phone.tel}`} dir="ltr" className="inline-flex items-center gap-2 hover:text-accent">
                  <Icon name="phone" className="h-4 w-4" />
                  {phone.display}
                </a>
              </li>
            ))}
            <li>
              <a href={`mailto:${business.email}`} className="inline-flex items-center gap-2 break-all hover:text-accent">
                <Icon name="mail" className="h-4 w-4 shrink-0" />
                {business.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="clock" className="h-4 w-4 shrink-0" />
              {footer.hours}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted sm:px-6">
          <p>
            © {content.company}. {footer.rights}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
