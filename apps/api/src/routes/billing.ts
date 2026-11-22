import { Hono } from "hono";
import type { Env } from "./env";
import { estimate } from "../services/billing";
import { getBilling } from "../services/billingSummary";

export const billingRoutes = new Hono<Env>();

billingRoutes.get("/", async (c) => c.json(await getBilling(c.get("session").orgId)));

billingRoutes.get("/estimate", (c) => {
  const n = Number(c.req.query("savings") ?? 0);
  return c.json(estimate(Number.isFinite(n) ? n : 0));
});

export default billingRoutes;
