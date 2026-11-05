import "server-only";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cache } from "react";
import { fillPrices, getContent } from "@/content";
import type { SiteContent } from "@/content/en";
import { db } from "@/db";
import { service } from "@/db/schema";

/** The published hourly rate in AED. Change it in the database, not in the copy. */
export const getHourlyRate = cache(async () => {
  const [row] = await db
    .select({ priceFils: service.priceFils })
    .from(service)
    .where(eq(service.slug, "general-cleaning"));
  return (row?.priceFils ?? 0) / 100;
});

export async function getSite(locale: string) {
  const rate = await getHourlyRate();
  return { site: fillPrices(getContent(locale), rate), rate };
}

export async function pageMetadata(
  locale: string,
  key: keyof SiteContent["meta"],
  path = "",
): Promise<Metadata> {
  const { site } = await getSite(locale);
  const { title, description } = site.meta[key];
  return {
    title: key === "home" ? { absolute: title } : title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { en: `/en${path}`, ar: `/ar${path}` },
    },
    openGraph: { title, description, images: ["/images/hero.webp"], type: "website" },
  };
}
