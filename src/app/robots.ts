import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const privatePages = ["login", "account", "admin", "super-admin", "staff"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...["en", "ar"].flatMap((locale) => privatePages.map((page) => `/${locale}/${page}`))],
    },
    sitemap: `${env.BETTER_AUTH_URL}/sitemap.xml`,
  };
}
