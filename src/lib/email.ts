import { isProduction } from "./env";

type Email = { to: string; subject: string; text: string };

/** Placeholder until the email provider is connected in the notifications phase. */
export async function sendEmail({ to, subject, text }: Email) {
  if (isProduction) {
    throw new Error("Email provider is not configured");
  }
  console.log(`[dev email] to=${to} subject="${subject}"\n${text}`);
}
