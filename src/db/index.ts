import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// One pool per process. connectionTimeoutMillis keeps /api/health from hanging when Postgres is gone.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool);
