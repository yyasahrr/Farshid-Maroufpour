#!/usr/bin/env node
/**
 * Database migration runner.
 *
 * Usage:
 *   node scripts/migrate.ts            # apply all pending migrations
 *   node scripts/migrate.ts --reset   # drop + recreate from snapshot, then reseed
 *
 * Runs against DATABASE_URL. Delegates to `drizzle-kit migrate` so the same
 * migration files are used by the CLI and by this script.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    // Drop every user table (drizzle_migrations included) so the snapshot rebuilds cleanly.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query<{ tablename: string }>(`
        select tablename from pg_tables where schemaname = 'public' and tablename not like 'pg_%'
      `);
      for (const r of rows) await pool.query(`drop table if exists "${r.tablename}" cascade`);
    } finally {
      await pool.end();
    }
  }

  const result = spawnSync(
    process.execPath,
    ["node_modules/drizzle-kit/bin.cjs", "migrate", "--config=drizzle.config.json"],
    { cwd: projectRoot, stdio: "inherit", env: process.env },
  );

  if (result.status !== 0) {
    console.error("drizzle-kit migrate failed");
    process.exit(result.status ?? 1);
  }
  console.log("migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});