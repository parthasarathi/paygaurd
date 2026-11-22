import { eq } from "drizzle-orm";
import { db, migrateDb, schema } from "./db/client";
import { hashPassword } from "./lib/auth";
import { saveSettings } from "./services/settings";

export async function ensureSeedUser() {
  const [existing] = await db.select().from(schema.users).limit(1);
  if (existing) return;
  const [org] = await db.insert(schema.organizations).values({ name: "Apex Technologies Private Limited" }).returning();
  await db.insert(schema.users).values({ orgId: org.id, email: "admin@apex.test", name: "Admin", role: "admin", passwordHash: await hashPassword("admin123") });
  await db.insert(schema.users).values({ orgId: org.id, email: "analyst@apex.test", name: "Priya (AP Analyst)", role: "member", passwordHash: await hashPassword("analyst123") });
  console.log("Seeded demo users: admin@apex.test / admin123, analyst@apex.test / analyst123");
}

// Imports the key from the environment into the encrypted org settings so it shows as configured.
export async function ensureSeedSettings() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;
  for (const org of await db.select().from(schema.organizations)) {
    const [row] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, org.id));
    if (!row?.llmApiKeyEnc) await saveSettings(org.id, { llmApiKey: apiKey, llmModel: process.env.ANTHROPIC_MODEL });
  }
}

export { eq, migrateDb };
