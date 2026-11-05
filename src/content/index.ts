import { ar } from "./ar";
import { en, type SiteContent } from "./en";

export const business = {
  name: "Dar Al Falak Cleaning Services LLC",
  phones: [
    { display: "+971 52 929 1256", tel: "+971529291256", whatsapp: "971529291256" },
    { display: "+971 50 764 3834", tel: "+971507643834", whatsapp: "971507643834" },
  ],
  email: "daralfalak.cleaningservicesllc@gmail.com",
  address: "Khaled Muhammad Abdullah Zahed F-2, Dubai, UAE",
  license: "1658038",
};

export const categoryImages: Record<string, string> = {
  housekeeping: "housekeeping",
  "deep-cleaning": "sofa-upholstery",
  technical: "handyman",
  "add-ons": "laundry",
};

export function getContent(locale: string): SiteContent {
  return locale === "ar" ? ar : en;
}

/** Replaces price placeholders, so the rate only lives in the database. */
export function fillPrices(content: SiteContent, rate: number): SiteContent {
  const filled = JSON.stringify(content)
    .replaceAll("{rate}", String(rate))
    .replaceAll("{example}", String(rate * 2 * 3));
  return JSON.parse(filled);
}
