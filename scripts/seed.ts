import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

// Prices in fils (AED 1 = 100 fils). null means the team sends a quote.
const categories = [
  { slug: "housekeeping", en: "Regular Housekeeping & Maid Services", ar: "التدبير المنزلي وخدمات العاملات" },
  { slug: "deep-cleaning", en: "Specialized Deep Cleaning", ar: "التنظيف العميق المتخصص" },
  { slug: "technical", en: "Technical & Maintenance Services", ar: "الخدمات الفنية والصيانة" },
];

const services = [
  { category: "housekeeping", slug: "general-cleaning", en: "General Cleaning", ar: "التنظيف العام", model: "hourly", price: 3500 },
  { category: "housekeeping", slug: "maid-services", en: "Regular Maid Services", ar: "خدمات العاملات المنتظمة", model: "hourly", price: 3500 },
  { category: "deep-cleaning", slug: "sofa-upholstery", en: "Sofa & Upholstery Cleaning", ar: "تنظيف الكنب والمفروشات", model: "quote", price: null },
  { category: "deep-cleaning", slug: "mattress", en: "Mattress Deep Cleaning", ar: "التنظيف العميق للمراتب", model: "quote", price: null },
  { category: "deep-cleaning", slug: "carpet-rug", en: "Carpet & Rug Cleaning", ar: "تنظيف السجاد", model: "quote", price: null },
  { category: "technical", slug: "ac-maintenance", en: "AC Maintenance & Servicing", ar: "صيانة وخدمة المكيفات", model: "quote", price: null },
  { category: "technical", slug: "plumbing", en: "Plumbing Services", ar: "خدمات السباكة", model: "quote", price: null },
  { category: "technical", slug: "handyman", en: "General Handyman & Technical Services", ar: "الخدمات الفنية العامة", model: "quote", price: null },
];

const addOns = [
  { slug: "ironing", en: "Ironing Services", ar: "خدمات الكي", price: null },
  { slug: "laundry", en: "Laundry (Wash & Dry)", ar: "الغسيل والتجفيف", price: null },
];

const settings = {
  // Cleaners available at the same time. Editable by the Super Admin.
  "booking.slot_capacity": 50,
  "booking.min_hours": 2,
  "booking.max_hours": 10,
  "booking.max_cleaners": 10,
  "booking.slot_minutes": 30,
  "booking.lead_minutes": 120,
  "booking.max_days_ahead": 60,
  "booking.open_time": "09:00",
  "booking.close_time": "19:00",
  "booking.free_cancellation_hours": 24,
  "tax.vat_enabled": false,
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await client.connect();
  await client.query("begin");
  await client.query("select set_config('app.role', 'system', true)");

  for (const [index, c] of categories.entries()) {
    await client.query(
      `insert into service_category (slug, name_en, name_ar, sort_order) values ($1, $2, $3, $4)
       on conflict (slug) do nothing`,
      [c.slug, c.en, c.ar, index],
    );
  }
  for (const [index, s] of services.entries()) {
    await client.query(
      `insert into service (category_id, slug, name_en, name_ar, pricing_model, price_fils, sort_order)
       select id, $2, $3, $4, $5, $6, $7 from service_category where slug = $1
       on conflict (slug) do nothing`,
      [s.category, s.slug, s.en, s.ar, s.model, s.price, index],
    );
  }
  for (const a of addOns) {
    await client.query(
      `insert into add_on (slug, name_en, name_ar, price_fils) values ($1, $2, $3, $4)
       on conflict (slug) do nothing`,
      [a.slug, a.en, a.ar, a.price],
    );
  }
  for (const [key, value] of Object.entries(settings)) {
    await client.query(`insert into setting (key, value) values ($1, $2) on conflict (key) do nothing`, [
      key,
      JSON.stringify(value),
    ]);
  }

  await client.query("commit");
  await client.end();
  console.log("Seeded catalogue and settings.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
