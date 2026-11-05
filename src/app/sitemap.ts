import type { MetadataRoute } from "next";
import { en } from "@/content/en";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";

const pages = ["", "/about", "/services", "/pricing", "/book", "/monthly-contracts", "/contact", "/faq", "/privacy", "/terms", "/cancellation"];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...pages, ...en.services.map((service) => `/services/${service.slug}`)];
  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${env.BETTER_AUTH_URL}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((other) => [other, `${env.BETTER_AUTH_URL}/${other}${path}`])),
      },
    })),
  );
}
