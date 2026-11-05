import { BookingWizard } from "@/components/booking/booking-wizard";
import { PageHero, Section } from "@/components/marketing";
import { business } from "@/content";
import { getCustomerBooking, listAddresses } from "@/lib/booking/customer";
import { getBookingSettings, getCatalog } from "@/lib/booking/server";
import { addDays, dubaiDate } from "@/lib/booking/time";
import { getSession } from "@/lib/dal";
import { getSite, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/book">) {
  const { locale } = await params;
  return pageMetadata(locale, "book", "/book");
}

export default async function BookPage({ params, searchParams }: PageProps<"/[locale]/book">) {
  const { locale } = await params;
  const requested = (await searchParams).service;
  const [{ site }, catalog, settings, current] = await Promise.all([
    getSite(locale),
    getCatalog(),
    getBookingSettings(),
    getSession(),
  ]);
  const { book } = site;
  const arabic = locale === "ar";
  const categoryNames = Object.fromEntries(site.servicesPage.categories.map((category) => [category.id, category.title]));

  const services = catalog.services.map((item) => ({
    slug: item.slug,
    category: item.category,
    pricingModel: item.pricingModel,
    priceFils: item.priceFils,
    name: arabic ? item.nameAr : item.nameEn,
    categoryName: categoryNames[item.category] ?? item.category,
  }));
  const initialService = services.some((item) => item.slug === requested) ? String(requested) : "";
  const today = dubaiDate(new Date());
  const customer = current?.user.role === "customer" ? current.user : null;
  const maxCleaners = Math.min(settings.maxCleaners, settings.capacity);

  // "Book again" from the account page copies one of the customer's own bookings, minus the date.
  const again = (await searchParams).again;
  const previous = customer && typeof again === "string" && /^DAF-[A-Z0-9]{8}$/.test(again) ? await getCustomerBooking(customer.id, again) : null;
  const repeat =
    previous && services.some((item) => item.slug === previous.serviceSlug)
      ? {
          service: previous.serviceSlug,
          frequency: previous.booking.frequency,
          cleaners: Math.min(Math.max(previous.booking.cleanerCount, 1), maxCleaners),
          hours: Math.min(Math.max(Math.round(previous.booking.durationMinutes / 60), settings.minHours), settings.maxHours),
          addOns: previous.addOns.map((item) => item.slug),
          jobDetails: previous.booking.jobDetails ?? "",
          building: previous.booking.building,
          unit: previous.booking.unit,
          area: previous.booking.area,
          notes: previous.booking.notes ?? "",
          latitude: previous.booking.latitude,
          longitude: previous.booking.longitude,
        }
      : undefined;
  const addresses = customer ? await listAddresses(customer.id) : [];

  return (
    <>
      <PageHero title={book.title} intro={book.intro} image="maid-services" />
      <Section>
        <BookingWizard
          locale={arabic ? "ar" : "en"}
          labels={site.booking}
          services={services}
          addOns={catalog.addOns.map((item) => ({ slug: item.slug, name: arabic ? item.nameAr : item.nameEn }))}
          settings={{ minHours: settings.minHours, maxHours: settings.maxHours, maxCleaners }}
          today={today}
          lastDate={addDays(today, settings.maxDaysAhead)}
          initialService={initialService}
          prefill={{ name: customer?.name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "" }}
          signedIn={!!customer}
          repeat={repeat}
          addresses={addresses}
        />
        <p className="mt-12 text-center text-muted">
          {book.prompt}{" "}
          {business.phones.map((phone, index) => (
            <span key={phone.tel}>
              {index > 0 && " · "}
              <a href={`tel:${phone.tel}`} dir="ltr" className="font-semibold text-accent hover:underline">
                {phone.display}
              </a>
            </span>
          ))}
        </p>
      </Section>
    </>
  );
}
