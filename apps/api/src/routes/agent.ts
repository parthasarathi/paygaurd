import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "./env";
import { briefing, reply } from "../agent/respond";

// Answers from local rules and SQL only: never calls an LLM and never writes data.
export const agentRoutes = new Hono<Env>();

agentRoutes.get("/briefing", async (c) => {
  const s = c.get("session");
  return c.json(await briefing(s.orgId, s.userId));
});

agentRoutes.post("/chat", zValidator("json", z.object({ message: z.string().trim().min(1).max(500) })), async (c) => {
  const s = c.get("session");
  return c.json(await reply(s.orgId, c.req.valid("json").message));
});
