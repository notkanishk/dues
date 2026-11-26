// Vitest global setup: migrate the test database once, before any test file runs.
// Per-file migrations race on a fresh database (two files both CREATE SCHEMA "drizzle").
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  if (!process.env.DATABASE_URL) return; // pure tests still run; DB tests fail on their own guard
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
