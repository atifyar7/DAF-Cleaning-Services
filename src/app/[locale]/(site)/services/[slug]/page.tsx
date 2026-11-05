import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ButtonLink, ContactButtons, PageHero, Section, SectionHeading, ServiceCard } from "@/components/marketing";
import { Link } from "@/i18n/navigation";
import { getSite, pageMetadata } from "@/lib/site";

// Housekeeping and the add-on pages book a cleaning visit; the add-on is chosen in the form.
function bookableSlug(slug: string) {
  return ["housekeeping", "ironing", "laundry"].includes(slug) ? "general-cleaning" : slug;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/services/[slug]">) {
  const { locale, slug } = await params;
  const { site } = await getSite(locale);
  const service = site.services.find((item) => item.slug === slug);
  if (!service) return {};
  const metadata = await pageMetadata(locale, "services", `/services/${slug}`);
  return { ...metadata, title: service.title, description: service.summary };
}

export default async function ServicePage({ params }: PageProps<"/[locale]/services/[slug]">) {
  const { locale, slug } = await params;
  const { site } = await getSite(locale);
  const service = site.services.find((item) => item.slug === slug);
  if (!service) notFound();

  const related = site.services.filter((item) => item.category === service.category && item.slug !== slug).slice(0, 3);

  return (
    <>
      <PageHero title={service.title} intro={service.summary} image={service.slug}>
        <ButtonLink href={`/book?service=${bookableSlug(service.slug)}`} variant="mint" arrow>
          {service.button}
        </ButtonLink>
      </PageHero>
      <Section>
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap gap-2 text-sm text-muted">
          <Link href="/" className="hover:text-accent">
            {site.labels.home}
          </Link>
          <span>/</span>
          <Link href="/services" className="hover:text-accent">
            {site.labels.services}
          </Link>
          <span>/</span>
          <span aria-current="page" className="text-foreground">
            {service.title}
          </span>
        </nav>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <div data-reveal>
            <p className="text-lg leading-relaxed text-muted">{service.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ContactButtons labels={site.cta} />
            </div>
          </div>
          <aside data-reveal className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-semibold">{site.labels.usefulDetails}</h2>
            <ul className="mt-4 space-y-3">
              {service.details.map((detail) => (
                <li key={detail} className="flex gap-3 text-sm">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-muted">{detail}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Section>
      {related.length > 0 && (
        <Section tone="surface">
          <SectionHeading title={site.labels.relatedServices} />
          <div data-stagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ServiceCard
                key={item.slug}
                href={`/services/${item.slug}`}
                image={item.slug}
                title={item.title}
                body={item.summary}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
