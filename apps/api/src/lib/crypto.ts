import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Key derives from APP_ENCRYPTION_KEY, falling back to JWT_SECRET so a single secret is enough locally.
const key = () => createHash("sha256").update(process.env.APP_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "dev-insecure").digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
