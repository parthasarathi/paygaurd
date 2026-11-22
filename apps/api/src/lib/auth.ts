import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db, schema } from "../db/client";

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-insecure");

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(pw, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const got = await scrypt(pw, Buffer.from(salt, "hex"), 64);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export type Session = { userId: string; orgId: string; role: string };
export const signToken = (s: Session) =>
  new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(secret());

export const requireAuth: MiddlewareHandler<{ Variables: { session: Session } }> = async (c, next) => {
  const token = c.req.header("authorization")?.replace(/^Bearer /i, "");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(token, secret());
    const [user] = await db.select({ orgId: schema.users.orgId, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, payload.userId as string));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("session", { userId: payload.userId as string, orgId: user.orgId, role: user.role });
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
