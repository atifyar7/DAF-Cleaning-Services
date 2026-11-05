import { EnquiryForm } from "@/components/enquiry-form";
import { Icon } from "@/components/icon";
import { PageHero, Section } from "@/components/marketing";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/monthly-contracts">) {
  const { locale } = await params;
  return pageMetadata(locale, "contracts", "/monthly-contracts");
}

export default async function ContractsPage({ params }: PageProps<"/[locale]/monthly-contracts">) {
  const { locale } = await params;
  const { site } = await getSite(locale);
  const { contracts } = site;

  return (
    <>
      <PageHero title={contracts.title} intro={contracts.intro} image="contracts" />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <div data-reveal className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold">{contracts.who.title}</h2>
              <p className="mt-3 leading-relaxed text-muted">{contracts.who.body}</p>
            </div>
            <div>
              <h2 className="text-2xl font-bold">{contracts.tell.title}</h2>
              <ul className="mt-4 space-y-3">
                {contracts.tell.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span className="text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold">{contracts.next.title}</h2>
              <p className="mt-3 leading-relaxed text-muted">{contracts.next.body}</p>
            </div>
          </div>
          <div data-reveal className="rounded-2xl border border-border bg-surface-raised p-6 shadow-card sm:p-8">
            <h2 className="mb-6 text-2xl font-bold">{contracts.formTitle}</h2>
            <EnquiryForm
              kind="monthly_contract"
              labels={site.form}
              services={site.services.map((service) => service.title)}
              submit={contracts.button}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
