import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { decrypt } from "../lib/crypto";
import type { WebhookEventName } from "../validation/types";
import { buildEnvelope, isSubscribed, signBody } from "./hooksCore";
import { assertPublicUrl } from "./webhook";

export type DeliveryResult = { ok: boolean; statusCode: number | null; error: string | null; durationMs: number };

const BACKOFF_MS = [1000, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function emitEvent(orgId: string, event: WebhookEventName, data: Record<string, unknown>, opts: { force?: boolean } = {}): Promise<DeliveryResult | null> {
  try {
    const [s] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
    if (!s?.webhookUrl) return null;
    if (!opts.force && !isSubscribed(s.webhookEvents, event)) return null;
    const env = buildEnvelope(event, data);
    const body = JSON.stringify(env);
    const headers: Record<string, string> = { "content-type": "application/json", "x-payguard-event": event, "x-payguard-delivery": env.id };
    if (s.webhookSecretEnc) headers["x-payguard-signature"] = signBody(decrypt(s.webhookSecretEnc), body);

    let result: DeliveryResult = { ok: false, statusCode: null, error: "not attempted", durationMs: 0 };
    let attempt = 0;
    for (; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
      const t0 = Date.now();
      try {
        assertPublicUrl(s.webhookUrl);
        const res = await fetch(s.webhookUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000), redirect: "manual" });
        const ok = res.status >= 200 && res.status < 300;
        result = { ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}`, durationMs: Date.now() - t0 };
      } catch (e) {
        result = { ok: false, statusCode: null, error: (e as Error).message, durationMs: Date.now() - t0 };
      }
      if (result.ok) break;
    }
    const used = Math.min(attempt + 1, 3);
    try {
      await db.insert(schema.webhookDeliveries).values({
        id: env.id, orgId, event, payload: env as unknown as Record<string, unknown>, status: result.ok ? "success" : "failed",
        statusCode: result.statusCode, error: result.error, attempt: used, durationMs: result.durationMs,
      });
    } catch (e) { console.warn("webhook delivery log failed:", (e as Error).message); }
    if (!result.ok) console.warn("webhook delivery failed:", result.error);
    return result;
  } catch (e) {
    console.warn("webhook emit failed:", (e as Error).message);
    return null;
  }
}
