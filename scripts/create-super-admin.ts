import { randomBytes, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { hashPassword } from "../src/lib/password";

loadEnvConfig(process.cwd());

// Usage: npm run admin:create -- <email> [--role=admin]
// There is no public sign-up for staff, so accounts start here. The password prints once.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = process.argv.includes("--role=admin") ? "admin" : "super_admin";
  if (!email?.includes("@")) throw new Error("Usage: npm run admin:create -- <email> [--role=admin]");

  const password = randomBytes(18).toString("base64url");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("begin");

  const userId = randomUUID();
  await client.query(
    `insert into "user" (id, name, email, email_verified, role) values ($1, $2, $3, true, $4)`,
    [userId, role === "admin" ? "Admin" : "Super Admin", email, role],
  );
  await client.query(
    `insert into account (id, account_id, provider_id, user_id, password) values ($1, $2, 'credential', $2, $3)`,
    [randomUUID(), userId, await hashPassword(password)],
  );
  await client.query(`insert into audit_log (actor_role, action, entity, entity_id) values ('system', 'staff.created', 'user', $1)`, [
    userId,
  ]);

  await client.query("commit");
  await client.end();
  console.log(`Created ${role} ${email}\nTemporary password (shown once): ${password}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
