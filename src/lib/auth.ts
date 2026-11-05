import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha, emailOTP, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { writeAudit } from "./audit";
import { sendEmail } from "./email";
import { env, isProduction } from "./env";
import { hashPassword, verifyPassword } from "./password";
import { canCreateStaffSession, isStaff } from "./permissions";
import { consume, isBlocked, limits, reset } from "./rate-limit";

const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

const tooManyAttempts = () =>
  new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Please try again later." });

export const auth = betterAuth({
  appName: "Dar Al Falak Cleaning Services",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Customers have no passwords, and staff passwords are reset by the Super Admin.
  disabledPaths: [
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/reset-password/:token",
    "/forget-password/email-otp",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/change-email",
    "/update-session",
    "/delete-user",
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  socialProviders: google ? { google } : undefined,
  user: {
    additionalFields: {
      // input: false stops anyone setting these through the API.
      role: { type: "string", input: false, required: false, defaultValue: "customer" },
      phone: { type: "string", input: false, required: false },
      locale: { type: "string", input: false, required: false, defaultValue: "en" },
      disabledAt: { type: "date", input: false, required: false },
    },
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    freshAge: 60 * 60,
    // Off so that a cancelled session stops working immediately.
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 900, max: 20 },
      "/sign-in/email-otp": { window: 900, max: 10 },
      "/email-otp/send-verification-otp": { window: 3600, max: 10 },
      "/two-factor/*": { window: 300, max: 10 },
      "/change-password": { window: 3600, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          const [owner] = await db
            .select({ role: schema.user.role, disabledAt: schema.user.disabledAt })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId));
          if (!owner || owner.disabledAt) {
            throw new APIError("FORBIDDEN", { message: "This account is disabled." });
          }
          if (isStaff(owner.role) && !canCreateStaffSession(context?.path)) {
            throw new APIError("FORBIDDEN", { message: "Staff must use the staff sign-in page." });
          }
        },
        after: async (session, context) => {
          const [owner] = await db
            .select({ role: schema.user.role })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId));
          if (isStaff(owner?.role)) {
            await writeAudit({
              actorId: session.userId,
              actorRole: owner.role,
              action: "auth.session_created",
              ipAddress: session.ipAddress,
              meta: { path: context?.path },
            });
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = String(ctx.body?.email ?? "");
        const blocked =
          (await isBlocked(limits.loginFailuresShort, email)) ||
          (await isBlocked(limits.loginFailuresLong, email));
        if (blocked) throw tooManyAttempts();
      }
      if (ctx.path === "/email-otp/send-verification-otp") {
        if (!(await consume(limits.otpSendPerEmail, String(ctx.body?.email ?? "")))) {
          throw tooManyAttempts();
        }
      }
      // "Trust this device" would let a later password sign-in skip 2FA.
      if (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code") {
        if (ctx.body?.trustDevice) {
          throw new APIError("BAD_REQUEST", { message: "Device trust is not available." });
        }
      }
      if (ctx.path === "/two-factor/disable") {
        const current = await getSessionFromCtx(ctx);
        if (isStaff((current?.user as { role?: string } | undefined)?.role)) {
          throw new APIError("FORBIDDEN", { message: "2FA is mandatory for staff." });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = String(ctx.body?.email ?? "");
      const failed =
        ctx.context.returned instanceof APIError && ctx.context.returned.statusCode === 401;
      if (failed) {
        await consume(limits.loginFailuresShort, email);
        await consume(limits.loginFailuresLong, email);
      } else if (!(ctx.context.returned instanceof APIError)) {
        await reset(limits.loginFailuresShort, email);
      }
    }),
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp }) => {
        await sendEmail({
          to: email,
          subject: "Your Dar Al Falak sign-in code",
          text: `Your sign-in code is ${otp}. It expires in 10 minutes.`,
        });
      },
    }),
    twoFactor({
      issuer: "Dar Al Falak",
      backupCodeOptions: { amount: 10, storeBackupCodes: "encrypted" },
      trustDeviceMaxAge: 1,
    }),
    haveIBeenPwned(),
    ...(env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: env.TURNSTILE_SECRET_KEY,
            endpoints: ["/sign-in/email", "/email-otp/send-verification-otp"],
          }),
        ]
      : []),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
