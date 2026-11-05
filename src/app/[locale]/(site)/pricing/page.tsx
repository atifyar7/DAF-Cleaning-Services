import { ButtonLink, PageHero, Section } from "@/components/marketing";
import { PriceEstimator } from "@/components/price-estimator";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">) {
  const { locale } = await params;
  return pageMetadata(locale, "pricing", "/pricing");
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  const { locale } = await params;
  const { site, rate } = await getSite(locale);
  const { pricing } = site;

  return (
    <>
      <PageHero title={pricing.title} intro={pricing.intro} image="general-cleaning" />
      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div data-reveal className="rounded-2xl bg-hero p-8 text-white sm:p-10">
            <p className="text-white/80">{pricing.rateLabel}</p>
            <p className="mt-3 text-5xl font-bold text-highlight">{pricing.price}</p>
            <p className="mt-2 text-white/80">{pricing.unit}</p>
            <div className="mt-6 space-y-2 border-t border-white/15 pt-6 text-sm">
              <p className="font-medium">{pricing.formula}</p>
              <p className="text-white/80">{pricing.example}</p>
            </div>
          </div>
          <div data-reveal>
            <PriceEstimator rate={rate} labels={pricing.estimator} />
          </div>
        </div>
      </Section>
      <Section tone="surface">
        <div data-stagger className="grid gap-6 sm:grid-cols-2">
          {pricing.sections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-border bg-surface-raised p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 leading-relaxed text-muted">{section.body}</p>
            </div>
          ))}
        </div>
        <p data-reveal className="mt-8 text-sm leading-relaxed text-muted">
          {pricing.disclaimer}
        </p>
        <div data-reveal className="mt-8">
          <ButtonLink href="/contact" arrow>
            {pricing.button}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
