import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });

export type Actor =
  | { role: "anonymous" }
  | { role: "system" }
  | { role: "customer" | "admin" | "super_admin"; userId: string };

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs queries on protected tables as the given actor, so row-level security applies.
 * The actor must come from the verified server session, never from request input.
 */
export function withActor<T>(actor: Actor, run: (tx: Transaction) => Promise<T>): Promise<T> {
  const userId = "userId" in actor ? actor.userId : "";
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.role', ${actor.role}, true), set_config('app.user_id', ${userId}, true)`,
    );
    return run(tx);
  });
}
