import { LegalPage } from "@/components/legal-page";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/cancellation">) {
  const { locale } = await params;
  return pageMetadata(locale, "cancellation", "/cancellation");
}

export default async function CancellationPage({ params }: PageProps<"/[locale]/cancellation">) {
  const { locale } = await params;
  return <LegalPage locale={locale} page="cancellation" />;
}
