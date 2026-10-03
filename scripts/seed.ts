#!/usr/bin/env node
/**
 * Seed the database from scripts/seed.sql.
 *
 * Usage:
 *   node scripts/seed.ts            # apply seed.sql
 *   node scripts/seed.ts --reset    # truncate + reseed (idempotent)
 *
 * Idempotent: re-running only truncates and re-inserts, so it is safe to run
 * after migrations or after a schema change.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "scripts", "seed.sql");
const sql = readFileSync(sqlPath, "utf8");

const reset = process.argv.includes("--reset");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (reset) {
      await pool.query(`
        truncate table audit_logs, payments, class_registrations, classes, reviews, portfolio_items,
          appointments, blocked_times, barber_schedule, salon_schedule, barber_services, barber_skills,
          skills, services, barbers, users, products restart identity cascade
      `);
    }
    await pool.query(sql);
    console.log("seed applied");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});