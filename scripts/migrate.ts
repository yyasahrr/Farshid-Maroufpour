#!/usr/bin/env node
/**
 * Database migration runner.
 *
 * Usage:
 *   node scripts/migrate.ts            # apply all pending migrations
 *   node scripts/migrate.ts --reset   # drop + recreate every public table
 *
 * Applies `drizzle/*.sql` (in journal order) directly over the DATABASE_URL
 * connection and records each file's hash in "drizzle"."drizzle_migrations" —
 * the same journal `drizzle-kit` reads, so `drizzle-kit generate` can keep
 * layering new migrations on top afterwards.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const outFolder = join(projectRoot, "drizzle");
const journalPath = join(outFolder, "meta", "_journal.json");

type JournalEntry = { idx: number; tag: string; when?: number };

function loadEntries(): JournalEntry[] {
  if (!existsSync(journalPath)) return [];
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

async function main() {
  const { default: Pg } = await import("pg");
  const pool = new Pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (process.argv.includes("--reset")) {
      const { rows } = await pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public' and tablename not like 'pg_%'`,
      );
      for (const r of rows) await pool.query(`drop table if exists "${r.tablename}" cascade`);
      await pool.query(`drop table if exists "drizzle"."drizzle_migrations" cascade`);
    }

    await pool.query(`create schema if not exists "drizzle"`);
    await pool.query(`
      create table if not exists "drizzle"."drizzle_migrations" (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    const applied = new Set(
      (await pool.query<{ hash: string }>(`select hash from "drizzle"."drizzle_migrations"`)).rows.map((r) => r.hash),
    );

    const files = new Set(existsSync(outFolder) ? readdirSync(outFolder).filter((f) => f.endsWith(".sql")) : []);
    let count = 0;
    for (const entry of loadEntries()) {
      const file = join(outFolder, `${entry.tag}.sql`);
      if (!files.has(`${entry.tag}.sql`) || !existsSync(file)) continue;
      const sql = readFileSync(file, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      if (applied.has(hash)) continue;
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const statement of sql.split("--> statement-breakpoint")) {
          const trimmed = statement.trim();
          if (trimmed) await client.query(trimmed);
        }
        await client.query(`insert into "drizzle"."drizzle_migrations"(hash, created_at) values ($1, $2)`, [
          hash,
          entry.when ?? entry.idx,
        ]);
        await client.query("commit");
        count += 1;
        console.log(`applied ${entry.tag}.sql`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
    console.log(count > 0 ? `migrations applied (${count})` : "migrations applied (nothing pending)");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
