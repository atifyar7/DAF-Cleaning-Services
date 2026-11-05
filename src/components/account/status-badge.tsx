import { statusTone } from "./format";

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = statusTone[status] ?? statusTone.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tone.chip}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
