"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import type { SiteContent } from "@/content/en";
import { Icon } from "./icon";

type Labels = SiteContent["pricing"]["estimator"];

export function PriceEstimator({ rate, labels }: { rate: number; labels: Labels }) {
  const locale = useLocale();
  const [cleaners, setCleaners] = useState(2);
  const [hours, setHours] = useState(3);
  const total = rate * cleaners * hours;

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-card sm:p-8">
      <h3 className="text-xl font-semibold">{labels.title}</h3>
      <div className="mt-6 space-y-4">
        <Stepper label={labels.cleaners} value={cleaners} min={1} max={6} onChange={setCleaners} labels={labels} />
        <Stepper label={labels.hours} value={hours} min={1} max={10} onChange={setHours} labels={labels} />
      </div>
      <div className="mt-6 flex items-baseline justify-between gap-3 border-t border-border pt-5">
        <span className="text-muted">{labels.total}</span>
        <output className="text-3xl font-bold text-accent">
          {locale === "ar" ? `${total} درهمًا` : `AED ${total}`}
        </output>
      </div>
      <p className="mt-2 text-sm text-muted">{labels.note}</p>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  labels,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  labels: Labels;
}) {
  const button =
    "flex h-10 w-10 items-center justify-center rounded-lg border border-border text-accent transition hover:border-accent disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`${labels.decrease}: ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className={button}
        >
          <Icon name="minus" />
        </button>
        <span aria-live="polite" className="w-6 text-center text-lg font-semibold">
          {value}
        </span>
        <button
          type="button"
          aria-label={`${labels.increase}: ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className={button}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
