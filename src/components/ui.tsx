import type { ComponentProps, ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </section>
    </div>
  );
}

export function Field({ label, ...input }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        {...input}
        className="rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}

export function Button(props: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
    />
  );
}

export function TextButton(props: ComponentProps<"button">) {
  return <button type="button" {...props} className="text-sm font-medium text-accent hover:underline" />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-4 rounded-2xl border border-border bg-surface p-6 text-muted">{children}</div>
    </div>
  );
}
