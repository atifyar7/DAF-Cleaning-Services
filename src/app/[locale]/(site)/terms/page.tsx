import { LegalPage } from "@/components/legal-page";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return pageMetadata(locale, "terms", "/terms");
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return <LegalPage locale={locale} page="terms" />;
}
