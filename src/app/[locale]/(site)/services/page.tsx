import { ButtonLink, PageHero, Section, SectionHeading, ServiceCard } from "@/components/marketing";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/services">) {
  const { locale } = await params;
  return pageMetadata(locale, "services", "/services");
}

export default async function ServicesPage({ params }: PageProps<"/[locale]/services">) {
  const { locale } = await params;
  const { site } = await getSite(locale);

  return (
    <>
      <PageHero title={site.servicesPage.title} intro={site.servicesPage.intro} image="carpet-rug">
        <ButtonLink href="/book" variant="mint" arrow>
          {site.cta.book}
        </ButtonLink>
      </PageHero>
      {site.servicesPage.categories.map((category, index) => (
        <div key={category.id} id={category.id}>
          <Section tone={index % 2 ? "surface" : undefined}>
            <SectionHeading title={category.title} body={category.body} />
            <div data-stagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {site.services
                .filter((service) => service.category === category.id)
                .map((service) => (
                  <ServiceCard
                    key={service.slug}
                    href={`/services/${service.slug}`}
                    image={service.slug}
                    title={service.title}
                    body={service.summary}
                  />
                ))}
            </div>
          </Section>
        </div>
      ))}
    </>
  );
}
