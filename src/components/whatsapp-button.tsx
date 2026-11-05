"use client";

import { useTranslations } from "next-intl";
import { business } from "@/content";
import { usePathname } from "@/i18n/navigation";
import { Icon } from "./icon";

/** Floating WhatsApp shortcut. Hidden on the booking page, where it would cover the form. */
export function WhatsAppButton() {
  const t = useTranslations("nav");
  if (usePathname() === "/book") return null;

  return (
    <a
      href={`https://wa.me/${business.phones[0].whatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("contact")}
      className="fixed end-5 bottom-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-hero shadow-card transition hover:-translate-y-0.5 hover:brightness-110"
    >
      <Icon name="whatsapp" className="h-7 w-7" />
    </a>
  );
}
