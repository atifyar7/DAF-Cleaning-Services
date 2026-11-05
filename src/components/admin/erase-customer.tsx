"use client";

import { useState, useTransition } from "react";
import { completeCustomerDeletion } from "@/app/actions/admin";
import type { AdminContent } from "@/content/admin";
import { useRouter } from "@/i18n/navigation";

/** The final, irreversible step of a customer's deletion request. It needs an explicit tick first. */
export function EraseCustomer({ id, labels }: { id: string; labels: AdminContent }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const c = labels.customers;

  return (
    <div className="mt-4 space-y-3">
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirmErase" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
        {c.deletionConfirm}
      </label>
      <button
        type="button"
        disabled={!confirmed || busy}
        onClick={() =>
          startTransition(async () => {
            setError("");
            try {
              const result = await completeCustomerDeletion(id);
              if (result.ok) router.refresh();
              else setError(labels.errors[result.error as keyof AdminContent["errors"]] ?? labels.errors.failed);
            } catch {
              setError(labels.errors.failed);
            }
          })
        }
        className="w-full rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 dark:text-hero"
      >
        {c.deletionButton}
      </button>
    </div>
  );
}
