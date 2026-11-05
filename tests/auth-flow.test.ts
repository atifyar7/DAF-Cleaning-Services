import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Attack-style tests against a running dev server. Start it with its output in .local/dev.log,
// which is where these tests read emailed sign-in codes from.
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const authUrl = `${base}/api/auth`;

class Browser {
  cookies = new Map<string, string>();
  ip = `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 255)).join(".")}`;

  async request(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      redirect: "manual",
      ...init,
      headers: {
        origin: base,
        "cf-connecting-ip": this.ip,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      const value = pair.slice(index + 1);
      if (value) this.cookies.set(pair.slice(0, index), value);
      else this.cookies.delete(pair.slice(0, index));
    }
    return response;
  }

  post(path: string, body: unknown = {}) {
    return this.request(`${authUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async session() {
    const response = await this.request(`${authUrl}/get-session`);
    return response.json();
  }

  page(path: string) {
    return this.request(`${base}${path}`);
  }
}

const email = () => `${randomUUID()}@example.com`;

function createStaff(address: string, role: "admin" | "super_admin") {
  const flag = role === "admin" ? " --role=admin" : "";
  const output = execSync(`npm run --silent admin:create -- ${address}${flag}`, { encoding: "utf8" });
  return /shown once\): (\S+)/.exec(output)![1];
}

function latestCode(address: string) {
  const log = readFileSync(".local/dev.log", "utf8");
  const start = log.lastIndexOf(`to=${address}`);
  return /sign-in code is (\d{6})/.exec(log.slice(start))?.[1] ?? "";
}

function totp(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const secret = new URL(uri).searchParams.get("secret")!;
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

async function customerSignIn(browser: Browser, address: string) {
  await browser.post("/email-otp/send-verification-otp", { email: address, type: "sign-in" });
  return browser.post("/sign-in/email-otp", { email: address, otp: latestCode(address) });
}

/** Creates a staff account and completes 2FA enrolment. */
async function enrolledStaff(role: "admin" | "super_admin") {
  const address = email();
  const password = createStaff(address, role);
  const browser = new Browser();
  await browser.post("/sign-in/email", { email: address, password });
  const enabled = await (await browser.post("/two-factor/enable", { password })).json();
  await browser.post("/two-factor/verify-totp", { code: totp(enabled.totpURI) });
  return { address, password, browser, totpURI: enabled.totpURI as string };
}

describe("customers", () => {
  it("signs in with an emailed code", async () => {
    const browser = new Browser();
    const address = email();
    expect((await customerSignIn(browser, address)).status).toBe(200);
    const { user } = await browser.session();
    expect(user.email).toBe(address);
    expect(user.role).toBe("customer");
    expect((await browser.page("/en/account")).status).toBe(200);
  });

  it("rejects a wrong code and locks it after 3 tries", async () => {
    const browser = new Browser();
    const address = email();
    await browser.post("/email-otp/send-verification-otp", { email: address, type: "sign-in" });
    const real = latestCode(address);
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) {
      expect((await browser.post("/sign-in/email-otp", { email: address, otp: wrong })).ok).toBe(false);
    }
    expect((await browser.post("/sign-in/email-otp", { email: address, otp: real })).ok).toBe(false);
  });

  it("cannot make themselves an admin", async () => {
    const browser = new Browser();
    await customerSignIn(browser, email());
    await browser.post("/update-user", { role: "super_admin", name: "Hacker", disabledAt: null });
    expect((await browser.session()).user.role).toBe("customer");
  });

  it("cannot sign up with a role or a password", async () => {
    const browser = new Browser();
    const response = await browser.post("/sign-up/email", {
      email: email(),
      password: "a-very-long-password-1",
      name: "x",
      role: "super_admin",
    });
    expect(response.ok).toBe(false);
  });

  it("cannot open staff pages, which look like they do not exist", async () => {
    const browser = new Browser();
    await customerSignIn(browser, email());
    expect((await browser.page("/en/admin")).status).toBe(404);
    expect((await browser.page("/en/super-admin")).status).toBe(404);
  });

  it("is limited to 3 code emails per hour, even from different IPs", async () => {
    const address = email();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const response = await new Browser().post("/email-otp/send-verification-otp", {
        email: address,
        type: "sign-in",
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("anonymous visitors", () => {
  it.each(["/en/account", "/en/admin", "/en/super-admin", "/en/staff/security"])("are redirected from %s", async (path) => {
    const response = await new Browser().page(path);
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toMatch(/login/);
  });

  it("are rejected from a cross-site sign-in request", async () => {
    const browser = new Browser();
    const response = await browser.post("/sign-in/email-otp", { email: email(), otp: "123456" });
    const forged = await fetch(`${authUrl}/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: "x=1" },
      body: JSON.stringify({ email: email(), password: "whatever-password" }),
    });
    expect(response.ok).toBe(false);
    expect(forged.status).toBe(403);
  });
});

describe("staff", () => {
  it("cannot use the customer email code route, so 2FA cannot be skipped", async () => {
    const { address } = await enrolledStaff("admin");
    const browser = new Browser();
    await browser.post("/email-otp/send-verification-otp", { email: address, type: "sign-in" });
    const response = await browser.post("/sign-in/email-otp", { email: address, otp: latestCode(address) });
    expect(response.status).toBe(403);
    expect(await browser.session()).toBeNull();
  });

  it("must enrol in 2FA before reaching a dashboard", async () => {
    const address = email();
    const password = createStaff(address, "admin");
    const browser = new Browser();
    await browser.post("/sign-in/email", { email: address, password });
    const response = await browser.page("/en/admin");
    expect(response.headers.get("location")).toMatch(/staff\/security/);
  });

  it("gets no session from a correct password alone once 2FA is on", async () => {
    const { address, password } = await enrolledStaff("admin");
    const browser = new Browser();
    const body = await (await browser.post("/sign-in/email", { email: address, password })).json();
    expect(body.twoFactorRedirect).toBe(true);
    expect(await browser.session()).toBeNull();
    expect((await browser.page("/en/admin")).status).toBeLessThan(400);
    expect((await browser.page("/en/admin")).headers.get("location")).toMatch(/staff\/login/);
  });

  it("signs in with password plus authenticator code", async () => {
    const { address, password, totpURI } = await enrolledStaff("admin");
    const browser = new Browser();
    await browser.post("/sign-in/email", { email: address, password });
    await new Promise((resolve) => setTimeout(resolve, 31000 - (Date.now() % 30000)));
    expect((await browser.post("/two-factor/verify-totp", { code: totp(totpURI) })).status).toBe(200);
    expect((await browser.session()).user.role).toBe("admin");
    expect((await browser.page("/en/admin")).status).toBe(200);
  }, 60000);

  it("rejects a wrong authenticator code", async () => {
    const { address, password } = await enrolledStaff("admin");
    const browser = new Browser();
    await browser.post("/sign-in/email", { email: address, password });
    expect((await browser.post("/two-factor/verify-totp", { code: "000000" })).ok).toBe(false);
    expect(await browser.session()).toBeNull();
  });

  it("cannot turn on 'trust this device'", async () => {
    const { address, password, totpURI } = await enrolledStaff("admin");
    const browser = new Browser();
    await browser.post("/sign-in/email", { email: address, password });
    const response = await browser.post("/two-factor/verify-totp", { code: totp(totpURI), trustDevice: true });
    expect(response.status).toBe(400);
  });

  it("cannot turn 2FA off", async () => {
    const { password, browser } = await enrolledStaff("admin");
    expect((await browser.post("/two-factor/disable", { password })).status).toBe(403);
  });

  it("separates Admin from Super Admin", async () => {
    const admin = await enrolledStaff("admin");
    expect((await admin.browser.page("/en/admin")).status).toBe(200);
    expect((await admin.browser.page("/en/super-admin")).status).toBe(404);
    const owner = await enrolledStaff("super_admin");
    expect((await owner.browser.page("/en/super-admin")).status).toBe(200);
  });

  it("locks an account after 5 wrong passwords, even from different IPs", async () => {
    const address = email();
    const password = createStaff(address, "admin");
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const response = await new Browser().post("/sign-in/email", { email: address, password: "wrong-password-1" });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await new Browser().post("/sign-in/email", { email: address, password })).status).toBe(429);
  });

  it("stops a signed-out session working immediately", async () => {
    const { browser } = await enrolledStaff("admin");
    const stolen = new Browser();
    stolen.cookies = new Map(browser.cookies);
    await browser.post("/sign-out");
    expect(await stolen.session()).toBeNull();
  });
});

describe("rate limits", () => {
  it("blocks repeated sign-in attempts from one IP", async () => {
    const browser = new Browser();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      const response = await browser.post("/sign-in/email", { email: email(), password: "wrong-password-1" });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("response headers", () => {
  it("sends the security policy with a fresh nonce on every page", async () => {
    const browser = new Browser();
    const first = await browser.page("/en");
    const second = await browser.page("/en");
    const nonce = (value: string | null) => /nonce-([^']+)/.exec(value ?? "")?.[1];
    expect(nonce(first.headers.get("content-security-policy"))).toBeTruthy();
    expect(nonce(first.headers.get("content-security-policy"))).not.toBe(nonce(second.headers.get("content-security-policy")));
    expect(first.headers.get("x-frame-options")).toBe("DENY");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("x-powered-by")).toBeNull();
  });

  it.each(["/en", "/ar/services", "/en/services/mattress", "/en/monthly-contracts", "/en/contact", "/ar/faq"])(
    "applies the security policy to %s",
    async (path) => {
      const response = await new Browser().page(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toMatch(/nonce-/);
    },
  );

  it("marks Arabic pages right-to-left", async () => {
    const html = await (await new Browser().page("/ar")).text();
    expect(html).toMatch(/<html[^>]*dir="rtl"/);
    expect(html).toMatch(/<html[^>]*lang="ar"/);
  });
});
