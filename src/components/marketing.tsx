import type { ReactNode } from "react";
import { business } from "@/content";
import { Link } from "@/i18n/navigation";
import { Icon } from "./icon";
import { Photo } from "./photo";

const buttonStyles = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  outline: "border border-border text-foreground hover:border-accent hover:text-accent",
  mint: "bg-highlight text-hero hover:brightness-110",
  ghost: "border border-white/40 text-white hover:bg-white/10",
};

export function buttonClass(variant: keyof typeof buttonStyles = "primary") {
  return `group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold transition duration-200 hover:-translate-y-0.5 ${buttonStyles[variant]}`;
}

export function ArrowIcon() {
  return (
    <Icon name="arrow" className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
  );
}

export function ButtonLink({
  href,
  children,
  variant,
  arrow,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
      {arrow && <ArrowIcon />}
    </Link>
  );
}

export function SectionHeading({ title, body, center }: { title: string; body?: string; center?: boolean }) {
  return (
    <div data-reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-muted">{body}</p>}
    </div>
  );
}

export function Section({ children, tone }: { children: ReactNode; tone?: "surface" }) {
  return (
    <section className={tone === "surface" ? "bg-surface" : ""}>
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24">{children}</div>
    </section>
  );
}

export function PageHero({
  title,
  intro,
  image,
  children,
}: {
  title: string;
  intro?: string;
  image: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-hero text-white">
      <Photo src={`/images/${image}.webp`} alt="" sizes="100vw" priority className="hero-photo -z-20" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-hero/95 via-hero/80 to-hero/40 rtl:bg-gradient-to-l" />
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="fade-up max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {intro && <p className="fade-up fade-up-2 mt-5 max-w-2xl text-lg leading-relaxed text-white/85">{intro}</p>}
        {children && <div className="fade-up fade-up-3 mt-8 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}

export function ContactButtons({ labels }: { labels: { whatsapp: string; call: string } }) {
  const [primary] = business.phones;
  return (
    <>
      <a href={`https://wa.me/${primary.whatsapp}`} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
        <Icon name="whatsapp" />
        {labels.whatsapp}
      </a>
      <a href={`tel:${primary.tel}`} className={buttonClass("outline")}>
        <Icon name="phone" />
        {labels.call}
      </a>
    </>
  );
}

export function CtaBand({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24">
      <div data-reveal className="relative isolate mx-auto w-full max-w-7xl overflow-hidden rounded-3xl bg-hero px-6 py-14 text-center text-white sm:px-12 sm:py-20">
        <Photo src="/images/interior.webp" alt="" sizes="(min-width: 1280px) 1280px, 100vw" className="-z-20 opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-hero via-hero/70 to-hero/40" />
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">{body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </section>
  );
}

export function ServiceCard({
  href,
  image,
  title,
  body,
  tall,
}: {
  href: string;
  image: string;
  title: string;
  body: string;
  tall?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-card transition duration-300 hover:-translate-y-1 hover:border-accent"
    >
      <div className={`relative overflow-hidden ${tall ? "aspect-[4/5]" : "aspect-[3/2]"}`}>
        <Photo
          src={`/images/${image}.webp`}
          alt=""
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{body}</p>
        <span className="mt-4 text-accent">
          <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}
