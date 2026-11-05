"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitEnquiry } from "@/app/actions/enquiry";
import type { SiteContent } from "@/content/en";
import { Icon } from "./icon";
import { Field } from "./ui";

type Props = {
  kind: "contact" | "monthly_contract";
  labels: SiteContent["form"];
  frequencies?: string[];
  services: string[];
  submit: string;
};

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function EnquiryForm({ kind, labels, services, submit }: Props) {
  const [result, action] = useActionState(submitEnquiry, "idle");

  if (result === "success") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl bg-accent-soft p-5">
        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p>{labels.success}</p>
      </div>
    );
  }

  const error = { invalid: labels.invalid, limited: labels.tooMany, failed: labels.failed, idle: "" }[result];

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="kind" value={kind} />
      {/* Hidden from people. Bots that fill it in are ignored. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field label={labels.name} name="name" autoComplete="name" minLength={2} maxLength={100} required />
      <Field label={labels.phone} name="phone" type="tel" dir="ltr" autoComplete="tel" maxLength={20} required />
      <div className="sm:col-span-2">
        <Field label={labels.email} name="email" type="email" dir="ltr" autoComplete="email" maxLength={200} required />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {labels.service}
        <select name="service" defaultValue="" className={inputClass}>
          <option value="">{labels.servicePlaceholder}</option>
          {services.map((service) => (
            <option key={service}>{service}</option>
          ))}
        </select>
      </label>
      <Field label={labels.area} name="area" maxLength={100} />
      {kind === "monthly_contract" && (
        <>
          <Field label={labels.propertyType} name="propertyType" maxLength={100} />
          <Field label={labels.frequency} name="frequency" maxLength={100} />
        </>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        {labels.message}
        <textarea name="message" rows={5} minLength={10} maxLength={2000} required className={inputClass} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <SubmitButton label={submit} sending={labels.sending} />
      </div>
    </form>
  );
}

function SubmitButton({ label, sending }: { label: string; sending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
    >
      {pending ? sending : label}
    </button>
  );
}
