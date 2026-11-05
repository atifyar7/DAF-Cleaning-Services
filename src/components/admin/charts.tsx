// Charts for the dashboards. Drawn as SVG because the security policy blocks inline styles. One series in
// the brand teal, values in text colours, a hover title on every bar and a data table for screen readers.

const HEIGHT = 140;

/** Money with thousands separators, for example "AED 12,500" or "12,500 درهمًا". */
export function money(fils: number, locale: string) {
  const amount = (fils / 100).toLocaleString("en-US", { maximumFractionDigits: fils % 100 === 0 ? 0 : 2, minimumFractionDigits: fils % 100 === 0 ? 0 : 2 });
  return locale === "ar" ? `${amount} درهمًا` : `AED ${amount}`;
}

type Bar = { label: string; short: string; value: number; display: string };

/** Vertical bars over time, scaled to the largest value, with a top grid line labelled with that value. */
export function ColumnChart({ bars, caption, emptyText }: { bars: Bar[]; caption: string; emptyText: string }) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  const gap = bars.length > 40 ? 1 : 2;
  const barWidth = 12;
  const width = bars.length * (barWidth + gap) - gap;
  const every = Math.max(1, Math.ceil(bars.length / 6));
  const peak = bars.find((b) => b.value === max);

  return (
    <figure>
      {max === 0 ? (
        <p className="flex h-36 items-center justify-center rounded-xl bg-surface text-sm text-muted">{emptyText}</p>
      ) : (
        <div dir="ltr">
          <div className="mb-1 text-end text-[11px] text-muted">{peak?.display}</div>
          <svg viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className="h-36 w-full" aria-hidden="true">
            <line x1="0" x2={width} y1="0.5" y2="0.5" className="stroke-border" strokeDasharray="3 3" />
            <line x1="0" x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className="stroke-border" />
            {bars.map((bar, i) => {
              const h = (bar.value / max) * HEIGHT;
              const x = i * (barWidth + gap);
              const r = Math.min(4, h);
              const top = HEIGHT - h;
              return (
                <g key={bar.label} className="group">
                  <rect x={x} y="0" width={barWidth} height={HEIGHT} className="fill-transparent" />
                  {h > 0 && (
                    <path
                      d={`M${x},${HEIGHT} V${top + r} Q${x},${top} ${x + r},${top} H${x + barWidth - r} Q${x + barWidth},${top} ${x + barWidth},${top + r} V${HEIGHT} Z`}
                      className="fill-accent transition-opacity group-hover:opacity-70"
                    />
                  )}
                  <title>{`${bar.label}: ${bar.display}`}</title>
                </g>
              );
            })}
          </svg>
          <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted">
            {bars
              .filter((_, i) => i % every === 0)
              .map((bar) => (
                <span key={bar.label}>{bar.short}</span>
              ))}
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.label}>
              <th scope="row">{bar.label}</th>
              <td>{bar.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A ranked list with a bar under each row, for comparing categories such as services or areas. */
export function BarList({ rows, tone = "fill-accent" }: { rows: { key: string; label: string; value: number; display: string; detail?: string }[]; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{row.label}</span>
            <span className="shrink-0 font-semibold">{row.display}</span>
          </div>
          {row.detail && <p className="text-xs text-muted">{row.detail}</p>}
          <svg className="mt-1.5 h-2 w-full overflow-visible rounded-full rtl:-scale-x-100" aria-hidden="true">
            <rect width="100%" height="100%" rx="4" className="fill-surface" />
            {row.value > 0 && <rect width={`${Math.max(2, (row.value / max) * 100)}%`} height="100%" rx="4" className={tone} />}
          </svg>
        </li>
      ))}
    </ul>
  );
}
