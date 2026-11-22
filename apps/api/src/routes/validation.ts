import { Hono } from "hono";
import { z } from "zod";
import { authenticateApiKey } from "../services/apiKeys";
import { validateInvoice } from "../validation/validate";
import type { ValidateRequest } from "../validation/types";
import type { Env } from "./env";

// validationV1 is mounted at /api/v1 (API-key auth done inside); validationSession at /api/validate (session auth already applied).
const str = (max: number) => z.string().trim().min(1).max(max);
const num = z.number().finite().nonnegative().max(1e12);
const bodySchema = z.object({
  vendor: str(200),
  invoiceNumber: str(100),
  invoiceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "invoiceDate must be YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d, "invalid date"),
  currency: z.string().trim().min(3).max(3).transform((s) => s.toUpperCase()).optional(),
  poNumber: str(100).optional(),
  contractNumber: str(100).optional(),
  lines: z.array(z.object({
    description: str(500),
    sku: str(100).optional(),
    quantity: num,
    unit: str(50).optional(),
    unitPrice: num,
    amount: num.optional(),
  })).min(1).max(200),
  total: num.optional(),
  persist: z.boolean().optional(),
});

async function parse(c: { req: { json: () => Promise<unknown> } }): Promise<{ ok: true; data: ValidateRequest } | { ok: false; error: string }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { return { ok: false, error: "Invalid JSON body" }; }
  const p = bodySchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
  return { ok: true, data: p.data as ValidateRequest };
}

const hits = new Map<string, number[]>();
function rateLimited(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(key, recent); return true; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

export const validationV1 = new Hono();
export const validationSession = new Hono<Env>();

validationV1.post("/validate", async (c) => {
  const auth = c.req.header("authorization");
  const key = c.req.header("x-api-key")?.trim() || (auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "");
  const who = key ? await authenticateApiKey(key) : null;
  if (!who) return c.json({ error: "Invalid or missing API key" }, 401);
  if (rateLimited(`${who.orgId}:${key}`)) return c.json({ error: "Rate limit exceeded (60 requests/minute)" }, 429, { "Retry-After": "60" });
  const body = await parse(c);
  if (!body.ok) return c.json({ error: body.error }, 400);
  return c.json(await validateInvoice(who.orgId, body.data));
});

validationSession.post("/", async (c) => {
  const body = await parse(c);
  if (!body.ok) return c.json({ error: body.error }, 400);
  return c.json(await validateInvoice(c.get("session").orgId, body.data));
});
