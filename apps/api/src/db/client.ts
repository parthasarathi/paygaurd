import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const dir = process.env.PGLITE_DIR ?? fileURLToPath(new URL("../../.data/pglite", import.meta.url));
if (!process.env.PGLITE_MEMORY) mkdirSync(dirname(dir), { recursive: true });
// Embedded Postgres: no external database needed for local runs and previews.
export const pg = new PGlite(process.env.PGLITE_MEMORY ? undefined : dir);
export const db = drizzle(pg, { schema });
export type DB = typeof db;

export async function migrateDb() {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
}
export { schema };
