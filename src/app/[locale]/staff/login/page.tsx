"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AuthCard, Button, ErrorText, Field, TextButton } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export default function StaffLoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "totp" | "backup">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function finish() {
    router.push("/staff");
    router.refresh();
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? t("errors.tooMany") : t("errors.invalidLogin"));
    } else if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setPassword("");
      setStep("totp");
    } else {
      finish();
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error } =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setBusy(false);
    if (error) setError(error.status === 429 ? t("errors.tooMany") : t("errors.invalidCode"));
    else finish();
  }

  if (step === "password") {
    return (
      <AuthCard title={t("staff.title")} subtitle={t("staff.subtitle")}>
        <form onSubmit={submitPassword} className="flex flex-col gap-4">
          <Field
            label={t("staff.email")}
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
          <Field
            label={t("staff.password")}
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button disabled={busy}>{t("staff.continue")}</Button>
        </form>
      </AuthCard>
    );
  }

  const usingTotp = step === "totp";
  return (
    <AuthCard title={t("staff.totpTitle")} subtitle={usingTotp ? t("staff.totpHelp") : t("staff.backupHelp")}>
      <form onSubmit={submitCode} className="flex flex-col gap-4">
        <Field
          label={usingTotp ? t("staff.totp") : t("staff.backup")}
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy}>{t("staff.verify")}</Button>
        <TextButton
          onClick={() => {
            setStep(usingTotp ? "backup" : "totp");
            setCode("");
            setError("");
          }}
        >
          {usingTotp ? t("staff.useBackup") : t("staff.useTotp")}
        </TextButton>
      </form>
    </AuthCard>
  );
}
