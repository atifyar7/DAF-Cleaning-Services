import type { ReactNode } from "react";
import { EnquiryForm } from "@/components/enquiry-form";
import { Icon, type IconName } from "@/components/icon";
import { ButtonLink, PageHero, Section } from "@/components/marketing";
import { business } from "@/content";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  return pageMetadata(locale, "contact", "/contact");
}

function Detail({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block text-sm text-muted">{label}</span>
        <span className="mt-0.5 block font-medium">{children}</span>
      </span>
    </li>
  );
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  const { site } = await getSite(locale);
  const { contact } = site;
  const labels = contact.details;

  return (
    <>
      <PageHero title={contact.title} intro={contact.intro} image="dubai" />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <ul data-stagger className="space-y-6">
            <Detail icon="phone" label={labels.phone}>
              {business.phones.map((phone) => (
                <a key={phone.tel} href={`tel:${phone.tel}`} dir="ltr" className="block hover:text-accent">
                  {phone.display}
                </a>
              ))}
            </Detail>
            <Detail icon="mail" label={labels.email}>
              <a href={`mailto:${business.email}`} className="break-all hover:text-accent">
                {business.email}
              </a>
            </Detail>
            <Detail icon="pin" label={labels.office}>
              {business.address}
            </Detail>
            <Detail icon="layers" label={labels.coverage}>
              {labels.coverageValue}
            </Detail>
            <Detail icon="clock" label={labels.hours}>
              {labels.hoursValue}
            </Detail>
            <Detail icon="document" label={labels.license}>
              <span dir="ltr">{business.license}</span>
            </Detail>
          </ul>
          <div data-reveal className="rounded-2xl border border-border bg-surface-raised p-6 shadow-card sm:p-8">
            <h2 className="text-2xl font-bold">{contact.formTitle}</h2>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-muted">{contact.formIntro}</p>
            <EnquiryForm
              kind="contact"
              labels={site.form}
              services={site.services.map((service) => service.title)}
              submit={contact.button}
            />
          </div>
        </div>
        <div data-reveal className="mt-14 text-center">
          <p className="text-muted">{contact.closing}</p>
          <div className="mt-5">
            <ButtonLink href="/book" arrow>
              {site.cta.book}
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
