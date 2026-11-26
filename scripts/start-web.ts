import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Image entry for the web process: apply migrations, then start the Next.js standalone server.
// Only web migrates; the worker waits for web to be healthy (deploy/compose.yaml).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("web: migrations applied");

// Emitted by `next build` into the standalone folder; sits next to this file in the image.
// A variable keeps the bundler from resolving it at build time.
const server = "./server.js";
await import(server);
