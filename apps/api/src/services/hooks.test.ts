import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { buildEnvelope, isSubscribed, signBody, parseSubscribed } from "./hooksCore";

describe("hooks core", () => {
  it("builds envelope and signs raw body", () => {
    const env = buildEnvelope("webhook.test", { a: 1 });
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.stringify(env);
    expect(signBody("s", body)).toBe(`sha256=${createHmac("sha256", "s").update(body).digest("hex")}`);
  });
  it("filters events", () => {
    expect(isSubscribed(null, "flag.created")).toBe(true);
    expect(isSubscribed("flag.created,flag.resolved", "flag.resolved")).toBe(true);
    expect(isSubscribed("flag.created", "document.failed")).toBe(false);
    expect(parseSubscribed(null)).toContain("invoice.payable");
  });
});
