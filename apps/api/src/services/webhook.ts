import { isIP } from "node:net";
import type { WebhookEventName } from "../validation/types";
import { emitEvent } from "./hooks";

// Blocks webhook targets on loopback/private networks so a tenant can't probe internal services.
export function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Webhook URL must be http(s)");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const privateV4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;
  const bad = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || (isIP(host) === 4 && privateV4.test(host));
  if (bad && process.env.ALLOW_PRIVATE_WEBHOOKS !== "1") throw new Error("Webhook URL must be a public address");
}

export async function notifyWebhook(orgId: string, payload: Record<string, unknown>) {
  const { event, ...data } = payload;
  await emitEvent(orgId, String(event) as WebhookEventName, data);
}
