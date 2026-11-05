import type { SiteContent } from "@/content/en";
import { getSite } from "@/lib/site";
import { Section } from "./marketing";

export async function LegalPage({ locale, page }: { locale: string; page: keyof SiteContent["legal"] }) {
  const { site } = await getSite(locale);
  const { title, intro, sections } = site.legal[page];

  return (
    <Section>
      <article className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{intro}</p>
        {sections.map((section) => (
          <section key={section.title} className="mt-8">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="mt-2 leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </article>
    </Section>
  );
}
