import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client";

const hash = (k: string) => createHash("sha256").update(k).digest("hex");

export async function createApiKey(orgId: string, name: string) {
  const key = `pg_${randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(schema.apiKeys).values({ orgId, name, keyHash: hash(key), prefix: key.slice(0, 8) }).returning();
  return { id: row.id, name, key };
}

export async function authenticateApiKey(key: string): Promise<{ orgId: string; name: string } | null> {
  const [row] = await db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.keyHash, hash(key)), isNull(schema.apiKeys.revokedAt)));
  if (!row) return null;
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return { orgId: row.orgId, name: row.name };
}
