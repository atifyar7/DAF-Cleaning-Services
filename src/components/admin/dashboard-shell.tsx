import type { ReactNode } from "react";
import { Icon } from "../icon";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
};

/** The frame shared by the staff dashboards: a dark brand band with the content overlapping it. */
export function DashboardShell({ eyebrow, title, subtitle, actions, sidebar, children }: Props) {
  return (
    <div className="glass-backdrop flex-1">
      <section className="relative isolate overflow-hidden bg-hero text-white">
        <div aria-hidden="true" className="absolute -top-24 -end-24 -z-10 h-72 w-72 rounded-full bg-highlight/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 start-1/3 -z-10 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-6 px-4 pt-10 pb-24 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-highlight uppercase">
              <Icon name="shield" className="h-4 w-4" />
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-xl text-white/75">{subtitle}</p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </section>

      {/* relative z-10 lifts the content above the band it overlaps. minmax(0, 1fr) stops the scrolling
          menu on phones from widening the column past the screen. */}
      <div className="relative z-10 mx-auto -mt-14 grid w-full max-w-[1400px] grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {sidebar}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
