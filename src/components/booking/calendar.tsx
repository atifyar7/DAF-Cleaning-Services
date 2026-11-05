"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { weekday } from "@/lib/booking/time";

type Props = {
  value: string;
  min: string;
  max: string;
  today: string;
  onChange: (date: string) => void;
  months: string[];
  days: string[];
  labels: { previous: string; next: string };
};

const pad = (n: number) => String(n).padStart(2, "0");

export function Calendar({ value, min, max, today, onChange, months, days, labels }: Props) {
  const [view, setView] = useState((value || min).slice(0, 7));
  const [year, month] = view.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = weekday(`${view}-01`);

  const shift = (step: number) => {
    const next = new Date(Date.UTC(year, month - 1 + step, 1));
    setView(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`);
  };
  const canGoBack = view > min.slice(0, 7);
  const canGoForward = view < max.slice(0, 7);
  const navButton =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-accent transition hover:border-accent disabled:opacity-30";

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <button type="button" aria-label={labels.previous} disabled={!canGoBack} onClick={() => shift(-1)} className={navButton}>
          <Icon name="arrow" className="h-4 w-4 rotate-180 rtl:rotate-0" />
        </button>
        <p className="font-semibold" aria-live="polite">
          {months[month - 1]} {year}
        </p>
        <button type="button" aria-label={labels.next} disabled={!canGoForward} onClick={() => shift(1)} className={navButton}>
          <Icon name="arrow" className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {days.map((day) => (
          <span key={day} className="truncate pb-1 text-xs font-medium text-muted">
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${view}-${pad(i + 1)}`;
          const disabled = date < min || date > max;
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${i + 1} ${months[month - 1]} ${year}`}
              onClick={() => onChange(date)}
              className={`relative aspect-square rounded-lg text-sm font-medium transition ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : disabled
                    ? "cursor-not-allowed text-muted opacity-35"
                    : "hover:bg-accent-soft"
              }`}
            >
              {i + 1}
              {date === today && !selected && (
                <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
