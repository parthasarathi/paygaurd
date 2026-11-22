import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { decrypt, encrypt } from "../lib/crypto";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function getPublicSettings(orgId: string) {
  const [row] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return {
    llmProvider: "anthropic",
    llmModel: row?.llmModel ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    hasKey: !!row?.llmApiKeyEnc,
    keyLast4: row?.llmKeyLast4 ?? null,
    keyMasked: row?.llmKeyLast4 ? `sk-ant-${"•".repeat(24)}${row.llmKeyLast4}` : null,
    keySource: row?.llmApiKeyEnc ? "settings" : process.env.ANTHROPIC_API_KEY ? "environment" : "none",
  };
}

export async function saveSettings(orgId: string, input: { llmApiKey?: string; llmModel?: string; clearKey?: boolean }) {
  const [existing] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  const patch: Partial<typeof schema.orgSettings.$inferInsert> = { updatedAt: new Date() };
  if (input.llmModel !== undefined) patch.llmModel = input.llmModel || null;
  if (input.clearKey) Object.assign(patch, { llmApiKeyEnc: null, llmKeyLast4: null });
  if (input.llmApiKey) Object.assign(patch, { llmApiKeyEnc: encrypt(input.llmApiKey), llmKeyLast4: input.llmApiKey.slice(-4) });
  if (existing) await db.update(schema.orgSettings).set(patch).where(eq(schema.orgSettings.orgId, orgId));
  else await db.insert(schema.orgSettings).values({ orgId, ...patch });
}

export async function resolveLlm(orgId: string): Promise<{ apiKey: string; model: string } | null> {
  const [row] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  const apiKey = row?.llmApiKeyEnc ? decrypt(row.llmApiKeyEnc) : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: row?.llmModel ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL };
}
