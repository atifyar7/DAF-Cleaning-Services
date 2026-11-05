"use client";

import { useState, useTransition } from "react";
import { markEnquiry } from "@/app/actions/admin";
import { useRouter } from "@/i18n/navigation";

export function EnquiryToggle({ id, handled, labels }: { id: string; handled: boolean; labels: { markHandled: string; reopen: string; failed: string } }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            setError(false);
            const result = await markEnquiry(id, !handled).catch(() => ({ ok: false }));
            if (result.ok) router.refresh();
            else setError(true);
          })
        }
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
          handled ? "border border-border hover:border-accent hover:text-accent" : "bg-primary text-primary-foreground hover:bg-primary-hover"
        }`}
      >
        {handled ? labels.reopen : labels.markHandled}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {labels.failed}
        </span>
      )}
    </div>
  );
}
