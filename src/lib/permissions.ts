export const roles = ["customer", "admin", "super_admin"] as const;
export type Role = (typeof roles)[number];

export const staffRoles: readonly Role[] = ["admin", "super_admin"];

export function isStaff(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

/** Deny by default: a role can do only what is listed here. */
const permissions = {
  "account.view": ["customer"],
  "booking.view_own": ["customer"],
  "booking.manage_own": ["customer"],
  "address.manage_own": ["customer"],
  "booking.view_all": ["admin", "super_admin"],
  "booking.assign": ["admin", "super_admin"],
  "booking.update_status": ["admin", "super_admin"],
  "customer.view": ["admin", "super_admin"],
  "customer.erase": ["admin", "super_admin"],
  "enquiry.manage": ["admin", "super_admin"],
  "cleaner.manage": ["admin", "super_admin"],
  "dashboard.admin": ["admin", "super_admin"],
  "dashboard.super_admin": ["super_admin"],
  "staff.manage": ["super_admin"],
  "catalog.manage": ["super_admin"],
  "settings.manage": ["super_admin"],
  "report.view": ["super_admin"],
  "audit.view": ["super_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export const allPermissions = Object.keys(permissions) as Permission[];

export function can(role: string | null | undefined, permission: Permission) {
  const allowed: readonly string[] | undefined = permissions[permission];
  return !!role && !!allowed && allowed.includes(role);
}

// Better Auth endpoints that may create a staff session. All others (email code, Google) must not,
// because Better Auth enforces 2FA only on password sign-in.
const staffSessionPaths = new Set([
  "/sign-in/email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/change-password",
]);

/** Passkey sign-in and registration. A passkey replaces password + 2FA, so only the Super Admin may use one. */
export const passkeySignInPath = "/passkey/verify-authentication";
export const passkeyRegistrationPaths = new Set(["/passkey/generate-register-options", "/passkey/verify-registration"]);

export function canCreateStaffSession(path: string | undefined, role?: string | null) {
  if (path === passkeySignInPath) return role === "super_admin";
  return !!path && staffSessionPaths.has(path);
}

/** Only a Super Admin who has already set up an authenticator can add a passkey. */
export function canRegisterPasskey(user: { role?: string | null; twoFactorEnabled?: boolean | null } | null | undefined) {
  return user?.role === "super_admin" && !!user.twoFactorEnabled;
}

export const staffSessionMaxAgeMs = 12 * 60 * 60 * 1000;

/** Staff sessions have a hard limit, however active they are. */
export function isStaffSessionExpired(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() > staffSessionMaxAgeMs;
}
