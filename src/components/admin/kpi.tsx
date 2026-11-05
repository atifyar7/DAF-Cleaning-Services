import { Icon, type IconName } from "../icon";

type Props = {
  icon: IconName;
  label: string;
  value: string;
  /** Percentage change against the comparison period, or null when there is nothing to compare. */
  change?: number | null;
  changeText?: (change: string) => string;
  noCompare?: string;
  hint?: string;
  /** For figures where a rise is bad, such as cancellations. */
  lowerIsBetter?: boolean;
};

/** A headline figure. The trend is shown with an arrow and words as well as colour. */
export function KpiTile({ icon, label, value, change, changeText, noCompare, hint, lowerIsBetter }: Props) {
  const good = change === undefined || change === null || change === 0 ? null : (change > 0) !== !!lowerIsBetter;
  return (
    <div className="flex flex-col gap-3 rounded-2xl glass p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <span className="text-2xl leading-tight font-bold tracking-tight">{value}</span>
      {change !== undefined && changeText && (
        <span className="text-xs">
          {change === null ? (
            <span className="text-muted">{noCompare}</span>
          ) : (
            <span className={`inline-flex items-center gap-1 font-semibold ${good === null ? "text-muted" : good ? "text-accent" : "text-danger"}`}>
              {change !== 0 && <Icon name="arrow" className={`h-3.5 w-3.5 ${change > 0 ? "-rotate-90" : "rotate-90"}`} />}
              {changeText(`${change > 0 ? "+" : ""}${change}%`)}
            </span>
          )}
        </span>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
