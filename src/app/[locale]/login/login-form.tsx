"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AuthCard, Button, ErrorText, Field, TextButton } from "@/components/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function messageFor(status: number, fallback: "errors.generic" | "errors.invalidCode") {
    if (status === 429) return t("errors.tooMany");
    if (status === 403) return t("errors.staffOnlyPage");
    return t(fallback);
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (error) setError(messageFor(error.status, "errors.generic"));
    else setCodeSent(true);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.signIn.emailOtp({ email, otp: code });
    setBusy(false);
    if (error) {
      setError(messageFor(error.status, "errors.invalidCode"));
      return;
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <AuthCard title={t("login.title")} subtitle={t("login.subtitle")}>
      {codeSent ? (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <Field
            label={t("login.code")}
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button disabled={busy}>{t("login.verify")}</Button>
          <TextButton
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setError("");
            }}
          >
            {t("login.useAnother")}
          </TextButton>
        </form>
      ) : (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field
            label={t("login.email")}
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button disabled={busy}>{t("login.sendCode")}</Button>
        </form>
      )}
      {googleEnabled && !codeSent && (
        <>
          <p className="text-center text-sm text-muted">{t("login.or")}</p>
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2.5 font-medium hover:bg-accent-soft"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: `/${locale}/account` })}
          >
            {t("login.google")}
          </button>
        </>
      )}
      <Link href="/staff/login" className="text-center text-sm text-muted hover:underline">
        {t("nav.staff")}
      </Link>
    </AuthCard>
  );
}
