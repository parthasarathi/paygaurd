import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { WEBHOOK_EVENTS } from "../validation/types";
import { emitEvent } from "../services/hooks";
import { parseSubscribed } from "../services/hooksCore";
import type { Env } from "./env";

export const hooksRoutes = new Hono<Env>();

const forbidden = (c: any) => (c.get("session").role !== "admin" ? c.json({ error: "admin only" }, 403) : null);

hooksRoutes.get("/", async (c) => {
  const { orgId } = c.get("session");
  const [s] = await db.select({ webhookEvents: schema.orgSettings.webhookEvents }).from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  const d = schema.webhookDeliveries;
  const deliveries = await db.select({ id: d.id, event: d.event, status: d.status, statusCode: d.statusCode, error: d.error, attempt: d.attempt, durationMs: d.durationMs, createdAt: d.createdAt })
    .from(d).where(eq(d.orgId, orgId)).orderBy(desc(d.createdAt)).limit(25);
  return c.json({ events: WEBHOOK_EVENTS, subscribed: parseSubscribed(s?.webhookEvents), deliveries });
});

hooksRoutes.put("/events", async (c) => {
  const denied = forbidden(c); if (denied) return denied;
  const { orgId } = c.get("session");
  const body = await c.req.json().catch(() => null);
  const events = body?.events;
  if (!Array.isArray(events) || events.some((e) => typeof e !== "string" || !(WEBHOOK_EVENTS as readonly string[]).includes(e)))
    return c.json({ error: `events must be an array of: ${WEBHOOK_EVENTS.join(", ")}` }, 400);
  const uniq = [...new Set(events as string[])];
  const value = uniq.join(",");
  await db.insert(schema.orgSettings).values({ orgId, webhookEvents: value }).onConflictDoUpdate({ target: schema.orgSettings.orgId, set: { webhookEvents: value, updatedAt: new Date() } });
  return c.json({ subscribed: uniq });
});

hooksRoutes.post("/test", async (c) => {
  const denied = forbidden(c); if (denied) return denied;
  const { orgId } = c.get("session");
  const r = await emitEvent(orgId, "webhook.test", { message: "Hello from PayGuard" }, { force: true });
  if (!r) return c.json({ error: "No webhook URL configured" }, 400);
  return c.json(r);
});
