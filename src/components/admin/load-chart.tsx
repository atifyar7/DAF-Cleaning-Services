import { displayTime } from "@/lib/booking/time";

type Props = {
  load: { minutes: number; used: number }[];
  capacity: number;
  locale: string;
  labels: { table: string; near: string; peak: string };
};

const BAR = 14;
const GAP = 2;
const HEIGHT = 120;

/** A bar for each half hour of the working day, measured against cleaner capacity. Drawn in SVG because the page's security policy blocks inline styles. */
export function LoadChart({ load, capacity, locale, labels }: Props) {
  const width = load.length * (BAR + GAP) - GAP;
  const peak = Math.max(0, ...load.map((l) => l.used));
  const near = (used: number) => used >= capacity * 0.9;
  const time = (minutes: number) => displayTime(minutes, locale);

  return (
    <figure>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{labels.peak.replace("{peak}", String(peak)).replace("{capacity}", String(capacity))}</span>
        {load.some((l) => near(l.used)) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
            {labels.near}
          </span>
        )}
      </div>
      <div dir="ltr" className="mt-3">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className="h-32 w-full" aria-hidden="true">
          {/* Capacity line: the top of the scale. */}
          <line x1="0" x2={width} y1="0.5" y2="0.5" className="stroke-border" strokeDasharray="3 3" />
          <line x1="0" x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className="stroke-border" />
          {load.map((slot, i) => {
            const h = capacity > 0 ? Math.min(HEIGHT, (slot.used / capacity) * HEIGHT) : 0;
            const x = i * (BAR + GAP);
            const r = Math.min(4, h);
            const top = HEIGHT - h;
            return (
              <g key={slot.minutes} className="group">
                <rect x={x} y="0" width={BAR} height={HEIGHT} className="fill-transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${HEIGHT} V${top + r} Q${x},${top} ${x + r},${top} H${x + BAR - r} Q${x + BAR},${top} ${x + BAR},${top + r} V${HEIGHT} Z`}
                    className={`${near(slot.used) ? "fill-warning" : "fill-accent"} transition-opacity group-hover:opacity-75`}
                  />
                )}
                <title>{`${time(slot.minutes)}: ${slot.used} / ${capacity}`}</title>
              </g>
            );
          })}
        </svg>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          {load
            .filter((_, i) => i % 4 === 0)
            .map((slot) => (
              <span key={slot.minutes}>{time(slot.minutes)}</span>
            ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{labels.table}</caption>
        <tbody>
          {load.map((slot) => (
            <tr key={slot.minutes}>
              <th scope="row">{time(slot.minutes)}</th>
              <td>
                {slot.used} / {capacity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
