"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { Icon } from "./icon";

type Group = {
  id: string;
  title: string;
  image: string;
  links: { href: string; label: string }[];
};

const pages = [
  { href: "/pricing", key: "pricing" },
  { href: "/monthly-contracts", key: "contracts" },
  { href: "/about", key: "about" },
  { href: "/faq", key: "faq" },
  { href: "/contact", key: "contact" },
] as const;

export function MainNav({ groups, children }: { groups: Group[]; children: ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [megaOpen, setMegaOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("overflow-hidden", drawerOpen);
    if (!drawerOpen && !megaOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      setMegaOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, megaOpen]);

  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  const linkClass = (href: string) =>
    `relative px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-center after:rounded-full after:bg-accent after:transition-transform after:duration-200 hover:text-accent ${
      active(href) ? "text-accent after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
    }`;
  const close = () => {
    setDrawerOpen(false);
    setMegaOpen(false);
  };

  return (
    <>
      <nav className="hidden items-center xl:flex">
        <Link href="/" className={linkClass("/")}>
          {t("home")}
        </Link>
        <div onMouseEnter={() => setMegaOpen(true)} onMouseLeave={() => setMegaOpen(false)}>
          <button
            type="button"
            aria-expanded={megaOpen}
            onClick={() => setMegaOpen(!megaOpen)}
            className={`${linkClass("/services")} inline-flex items-center gap-1`}
          >
            {t("services")}
            <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${megaOpen ? "rotate-180" : ""}`} />
          </button>
          <div
            className={`absolute inset-x-0 top-full transition duration-200 ${
              megaOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
            }`}
          >
            <div className="mx-auto w-full max-w-7xl px-6 pt-2">
              <div className="grid grid-cols-4 gap-6 rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
                {groups.map((group) => (
                  <div key={group.id}>
                    <p className="text-sm font-semibold text-accent">{group.title}</p>
                    <ul className="mt-3 space-y-1">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={close}
                            className="block rounded-lg px-2 py-1.5 text-sm hover:bg-accent-soft"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <Link href="/services" onClick={close} className="col-span-4 border-t border-border pt-4 text-sm font-semibold text-accent hover:underline">
                  {t("viewAll")}
                </Link>
              </div>
            </div>
          </div>
        </div>
        {pages.map((page) => (
          <Link key={page.href} href={page.href} className={linkClass(page.href)}>
            {t(page.key)}
          </Link>
        ))}
        {children}
      </nav>

      <button
        type="button"
        aria-label={t("menu")}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="order-last rounded-md p-2 text-accent hover:bg-accent-soft xl:hidden"
      >
        <Icon name="menu" className="h-6 w-6" />
      </button>

      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 xl:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        inert={!drawerOpen}
        className={`fixed inset-y-0 end-0 z-50 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-surface-raised p-5 shadow-card transition-transform duration-300 xl:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full rtl:-translate-x-full"
        }`}
      >
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => setDrawerOpen(false)}
          className="self-end rounded-md p-2 text-accent hover:bg-accent-soft"
        >
          <Icon name="close" className="h-6 w-6" />
        </button>
        <nav className="mt-2 flex flex-col gap-1">
          <Link href="/" onClick={close} className="rounded-lg px-3 py-2.5 font-medium hover:bg-accent-soft">
            {t("home")}
          </Link>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 font-medium hover:bg-accent-soft">
              {t("services")}
              <Icon name="chevron" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="ms-3 mt-1 space-y-3 border-s border-border ps-3">
              <Link href="/services" onClick={close} className="block py-1 text-sm font-semibold text-accent">
                {t("viewAll")}
              </Link>
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-semibold text-muted">{group.title}</p>
                  {group.links.map((link) => (
                    <Link key={link.href} href={link.href} onClick={close} className="block py-1.5 text-sm hover:text-accent">
                      {link.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>
          {pages.map((page) => (
            <Link key={page.href} href={page.href} onClick={close} className="rounded-lg px-3 py-2.5 font-medium hover:bg-accent-soft">
              {t(page.key)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          {children}
          <Link href="/book" onClick={close} className="rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">
            {t("book")}
          </Link>
        </div>
      </aside>
    </>
  );
}

//comment