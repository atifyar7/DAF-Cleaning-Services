import { Icon } from "@/components/icon";
import { ContactButtons, PageHero, Section } from "@/components/marketing";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await params;
  return pageMetadata(locale, "faq", "/faq");
}

export default async function FaqPage({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await params;
  const { site } = await getSite(locale);
  const { faq } = site;

  return (
    <>
      <PageHero title={faq.title} intro={faq.intro} image="interior" />
      <Section>
        <div data-stagger className="mx-auto max-w-3xl divide-y divide-border">
          {faq.items.map((item) => (
            <details key={item.q} name="faq" className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                {item.q}
                <Icon name="plus" className="h-5 w-5 shrink-0 text-accent transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="faq-answer pb-5 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <div data-reveal className="mt-12 text-center">
          <p className="text-lg font-semibold">{faq.more}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <ContactButtons labels={site.cta} />
          </div>
        </div>
      </Section>
    </>
  );
}
