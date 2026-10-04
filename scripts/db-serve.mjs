/* Keeps an embedded PostgreSQL alive on 127.0.0.1:5434 (sandbox/dev convenience).
 * Not part of the app; local dev normally uses `npm run db:up` (docker compose). */
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.resolve(".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  port: 5434,
  user: "postgres",
  password: "postgres",
  persistent: true,
});
if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("app_db");
} catch {
  /* exists */
}
console.log("READY 5434");
await new Promise(() => {});
