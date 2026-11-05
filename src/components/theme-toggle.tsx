"use client";

import { useTranslations } from "next-intl";

export function ThemeToggle({ initial }: { initial?: "light" | "dark" }) {
  const t = useTranslations("nav");

  function toggle() {
    const root = document.documentElement;
    const stored = root.getAttribute("data-theme") ?? initial;
    const current =
      stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("theme")}
      title={t("theme")}
      className="rounded-md p-2 text-accent hover:bg-accent-soft"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </svg>
    </button>
  );
}
