import { createHmac, randomUUID } from "node:crypto";
import { WEBHOOK_EVENTS, type WebhookEventName, type WebhookPayload } from "../validation/types";

export function buildEnvelope(event: WebhookEventName, data: Record<string, unknown>): WebhookPayload {
  return { id: randomUUID(), event, sentAt: new Date().toISOString(), data };
}

export const signBody = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// null/empty subscription means all events.
export function isSubscribed(subscribed: string | null | undefined, event: string): boolean {
  if (!subscribed) return true;
  return subscribed.split(",").map((e) => e.trim()).filter(Boolean).includes(event);
}

export const parseSubscribed = (v: string | null | undefined): string[] =>
  v ? v.split(",").map((e) => e.trim()).filter(Boolean) : [...WEBHOOK_EVENTS];
