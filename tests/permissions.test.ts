import { describe, expect, it } from "vitest";
import {
  allPermissions,
  can,
  canCreateStaffSession,
  canRegisterPasskey,
  isStaffSessionExpired,
  passkeySignInPath,
  staffSessionMaxAgeMs,
} from "@/lib/permissions";

const expected = {
  customer: ["account.view", "booking.view_own", "booking.manage_own", "address.manage_own"],
  admin: [
    "booking.view_all",
    "booking.assign",
    "booking.update_status",
    "customer.view",
    "customer.erase",
    "enquiry.manage",
    "cleaner.manage",
    "dashboard.admin",
  ],
};

describe("permission matrix", () => {
  it.each(allPermissions)("%s is granted to exactly the right roles", (permission) => {
    expect(can("customer", permission)).toBe(expected.customer.includes(permission));
    expect(can("admin", permission)).toBe(expected.admin.includes(permission));
    expect(can("super_admin", permission)).toBe(!expected.customer.includes(permission));
  });

  it("denies unknown roles and missing values", () => {
    for (const role of ["", "root", "ADMIN", null, undefined]) {
      for (const permission of allPermissions) expect(can(role, permission)).toBe(false);
    }
  });
});

describe("staff session rules", () => {
  it("allows only password and 2FA routes", () => {
    expect(canCreateStaffSession("/sign-in/email")).toBe(true);
    expect(canCreateStaffSession("/two-factor/verify-totp")).toBe(true);
    expect(canCreateStaffSession("/sign-in/email-otp")).toBe(false);
    expect(canCreateStaffSession("/callback/:id")).toBe(false);
    expect(canCreateStaffSession(undefined)).toBe(false);
  });

  it("lets only the Super Admin sign in or register with a passkey", () => {
    expect(canCreateStaffSession(passkeySignInPath, "super_admin")).toBe(true);
    expect(canCreateStaffSession(passkeySignInPath, "admin")).toBe(false);
    expect(canCreateStaffSession(passkeySignInPath)).toBe(false);
    expect(canRegisterPasskey({ role: "super_admin", twoFactorEnabled: true })).toBe(true);
    expect(canRegisterPasskey({ role: "super_admin", twoFactorEnabled: false })).toBe(false);
    expect(canRegisterPasskey({ role: "admin", twoFactorEnabled: true })).toBe(false);
    expect(canRegisterPasskey({ role: "customer", twoFactorEnabled: true })).toBe(false);
    expect(canRegisterPasskey(null)).toBe(false);
  });

  it("expires sessions after the hard limit", () => {
    const now = Date.now();
    expect(isStaffSessionExpired(new Date(now - staffSessionMaxAgeMs + 1000), now)).toBe(false);
    expect(isStaffSessionExpired(new Date(now - staffSessionMaxAgeMs - 1000), now)).toBe(true);
  });
});
