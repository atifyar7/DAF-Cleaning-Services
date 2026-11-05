import { Icon } from "@/components/icon";
import { ButtonLink, CtaBand, PageHero, Section } from "@/components/marketing";
import { Photo } from "@/components/photo";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  return pageMetadata(locale, "about", "/about");
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  const { site } = await getSite(locale);
  const { about } = site;

  return (
    <>
      <PageHero title={about.title} intro={about.intro} image="interior" />
      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal className="space-y-8">
            <p className="text-lg leading-relaxed text-muted">{about.story}</p>
            <div>
              <h2 className="text-2xl font-bold">{about.approach.title}</h2>
              <p className="mt-3 leading-relaxed text-muted">{about.approach.body}</p>
            </div>
          </div>
          <div data-reveal className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-card">
            <Photo src="/images/housekeeping.webp" alt="" sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
        </div>
      </Section>
      <Section tone="surface">
        <div className="grid gap-12 lg:grid-cols-2">
          <div data-reveal>
            <h2 className="text-2xl font-bold">{about.what.title}</h2>
            <ul className="mt-5 space-y-3">
              {about.what.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal>
            <h2 className="text-2xl font-bold">{about.coverage.title}</h2>
            <p className="mt-5 leading-relaxed text-muted">{about.coverage.body}</p>
          </div>
        </div>
      </Section>
      <div className="pt-16 sm:pt-24">
        <CtaBand title={about.cta.title} body={about.cta.body}>
          <ButtonLink href="/contact" variant="mint" arrow>
            {about.cta.button}
          </ButtonLink>
        </CtaBand>
      </div>
    </>
  );
}
