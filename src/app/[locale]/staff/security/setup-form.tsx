"use client";

import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { AuthCard, Button, ErrorText, Field } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function SetupForm() {
  const t = useTranslations();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || data?.method !== "totp") {
      setError(error?.status === 429 ? t("errors.tooMany") : t("errors.invalidLogin"));
      return;
    }
    setPassword("");
    setBackupCodes(data.backupCodes);
    setSecret(new URL(data.totpURI).searchParams.get("secret") ?? "");
    setQr(await QRCode.toDataURL(data.totpURI, { width: 220, margin: 1 }));
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) setError(error.status === 429 ? t("errors.tooMany") : t("errors.invalidCode"));
    else setConfirmed(true);
  }

  if (confirmed) {
    return (
      <AuthCard title={t("security.backupTitle")} subtitle={t("security.backupHelp")}>
        <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-lg bg-accent-soft p-4 font-mono text-sm">
          {backupCodes.map((backupCode) => (
            <li key={backupCode}>{backupCode}</li>
          ))}
        </ul>
        <Button
          onClick={() => {
            router.push("/staff");
            router.refresh();
          }}
        >
          {t("security.done")}
        </Button>
      </AuthCard>
    );
  }

  if (qr) {
    return (
      <AuthCard title={t("security.title")} subtitle={t("security.scan")}>
        {/* Data URL generated in the browser; next/image does not apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="" width={220} height={220} className="mx-auto rounded-lg bg-white p-2" />
        <p className="text-sm text-muted">{t("security.manual")}</p>
        <code dir="ltr" className="break-all rounded-lg bg-accent-soft p-3 text-sm">
          {secret}
        </code>
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <Field
            label={t("security.code")}
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <ErrorText>{error}</ErrorText>
          <Button disabled={busy}>{t("security.confirm")}</Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("security.title")} subtitle={t("security.subtitle")}>
      <form onSubmit={start} className="flex flex-col gap-4">
        <Field
          label={t("security.password")}
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy}>{t("security.start")}</Button>
      </form>
    </AuthCard>
  );
}
