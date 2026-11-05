import { GlassReveal } from "@/components/glass/glass-reveal";
import { Icon, type IconName } from "@/components/icon";
import { ButtonLink, CtaBand, Section, SectionHeading, ServiceCard } from "@/components/marketing";
import { Photo } from "@/components/photo";
import { PriceEstimator } from "@/components/price-estimator";
import { business, categoryImages } from "@/content";
import { getSite, pageMetadata } from "@/lib/site";

const trustIcons: IconName[] = ["pin", "clock", "sparkle", "layers"];
const whyIcons: IconName[] = ["tag", "calendar", "layers", "pin", "check", "document"];

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  return pageMetadata(locale, "home");
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const { site, rate } = await getSite(locale);
  const { home, cta, servicesPage, pricing } = site;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "HouseCleaningService",
    name: business.name,
    telephone: business.phones.map((phone) => phone.tel),
    email: business.email,
    address: { "@type": "PostalAddress", streetAddress: business.address, addressLocality: "Dubai", addressCountry: "AE" },
    areaServed: "Dubai",
    openingHours: "Mo-Su 09:00-19:00",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }}
      />

      <GlassReveal hint={home.hero.scrollHint} className="bg-hero text-white">
        <Photo src="/images/hero.webp" alt="" sizes="100vw" priority className="hero-photo -z-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-hero via-hero/85 to-hero/25 rtl:bg-gradient-to-l" />
        <div className="mx-auto grid min-h-[calc(100svh-4.25rem)] w-full max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_auto] lg:py-24">
          <div className="max-w-2xl">
            <p className="fade-up text-sm font-semibold tracking-wide text-highlight uppercase">{home.hero.eyebrow}</p>
            <h1 className="fade-up fade-up-2 mt-4 text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              {home.hero.title}
            </h1>
            <p className="fade-up fade-up-3 mt-6 text-lg leading-relaxed text-white/85">{home.hero.body}</p>
            <div className="fade-up fade-up-4 mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/book" variant="mint" arrow>
                {cta.book}
              </ButtonLink>
              <ButtonLink href="/services" variant="ghost">
                {home.hero.secondary}
              </ButtonLink>
            </div>
          </div>
          <div className="fade-up fade-up-4 w-full max-w-xs rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md">
            <p className="text-sm text-white/80">{home.hero.priceLabel}</p>
            <p className="mt-2 text-4xl font-bold text-highlight">{home.hero.price}</p>
            <p className="mt-1 text-sm text-white/80">{home.hero.priceUnit}</p>
            <p className="mt-4 flex items-center gap-2 border-t border-white/15 pt-4 text-sm">
              <Icon name="check" className="h-4 w-4 text-highlight" />
              {home.hero.priceNote}
            </p>
          </div>
        </div>
      </GlassReveal>

      <section className="border-b border-border bg-surface">
        <ul data-stagger className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {home.trust.map((item, index) => (
            <li key={item.title} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={trustIcons[index]} />
              </span>
              <span>
                <span className="block font-semibold">{item.title}</span>
                <span className="block text-sm text-muted">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{home.welcome.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">{home.welcome.body}</p>
            <div className="mt-8">
              <ButtonLink href="/services" variant="outline" arrow>
                {home.welcome.button}
              </ButtonLink>
            </div>
          </div>
          <div data-reveal className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-card">
            <Photo src="/images/interior.webp" alt="" sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading title={home.services.title} body={home.services.body} />
        <div data-stagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {servicesPage.categories.map((category) => (
            <ServiceCard
              key={category.id}
              href={`/services#${category.id}`}
              image={categoryImages[category.id]}
              title={category.title}
              body={category.summary}
            />
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading title={home.why.title} center />
        <ul data-stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {home.why.items.map((item, index) => (
            <li key={item.title} className="rounded-2xl border border-border p-6 transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={whyIcons[index]} />
              </span>
              <h3 className="mt-4 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface">
        <SectionHeading title={home.how.title} center />
        <ol data-stagger className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {home.how.steps.map((step, index) => (
            <li key={step.title} className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {index + 1}
              </span>
              {index < home.how.steps.length - 1 && (
                <span aria-hidden="true" className="absolute start-14 end-0 top-6 hidden h-px bg-border lg:block" />
              )}
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div data-reveal className="mt-10 text-center">
          <ButtonLink href="/book" arrow>
            {home.how.button}
          </ButtonLink>
        </div>
      </Section>

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{home.pricing.title}</h2>
            <p className="mt-5 text-4xl font-bold text-accent">
              {pricing.price} <span className="text-lg font-medium text-muted">{pricing.unit}</span>
            </p>
            <p className="mt-5 text-lg leading-relaxed text-muted">{home.pricing.body}</p>
            <div className="mt-8">
              <ButtonLink href="/pricing" variant="outline" arrow>
                {home.pricing.button}
              </ButtonLink>
            </div>
          </div>
          <div data-reveal>
            <PriceEstimator rate={rate} labels={pricing.estimator} />
          </div>
        </div>
      </Section>

      <section className="relative isolate overflow-hidden bg-hero text-white">
        <Photo src="/images/contracts.webp" alt="" sizes="100vw" className="-z-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-hero via-hero/90 to-hero/40 rtl:bg-gradient-to-l" />
        <div data-reveal className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">{home.contracts.title}</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/85">{home.contracts.body}</p>
          <div className="mt-8">
            <ButtonLink href="/monthly-contracts" variant="mint" arrow>
              {home.contracts.button}
            </ButtonLink>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal className="relative order-last aspect-[4/3] overflow-hidden rounded-3xl shadow-card lg:order-first">
            <Photo src="/images/dubai.webp" alt="" sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
          <div data-reveal>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{home.areas.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">{home.areas.body}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {home.areas.list.map((area) => (
                <li key={area} className="rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium">
                  {area}
                </li>
              ))}
              <li className="px-1 py-1.5 text-sm text-muted">{home.areas.more}</li>
            </ul>
            <div className="mt-8">
              <ButtonLink href="/contact" variant="outline" arrow>
                {home.areas.button}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Section>

      <CtaBand title={home.closing.title} body={home.closing.body}>
        <ButtonLink href="/book" variant="mint" arrow>
          {cta.book}
        </ButtonLink>
        <ButtonLink href="/contact" variant="ghost">
          {cta.contact}
        </ButtonLink>
      </CtaBand>
    </>
  );
}
