import { desc, eq, and, gte, isNull, count } from "drizzle-orm";
import { db, schema } from "../db/client";
import { TIERS, limitsForPlan, planNameForBps } from "./billing";

interface Totals { verifiedMinor: number; avoidedMinor: number; recoveredMinor: number; feeMinor: number; count: number }
const empty = (): Totals => ({ verifiedMinor: 0, avoidedMinor: 0, recoveredMinor: 0, feeMinor: 0, count: 0 });
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function getBilling(orgId: string) {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  const rows = await db
    .select({
      savingId: schema.savings.id, flagId: schema.savings.flagId, kind: schema.savings.kind,
      amountMinor: schema.savings.amountMinor, feeMinor: schema.savings.feeMinor,
      evidenceRef: schema.savings.evidenceRef, verifiedAt: schema.savings.verifiedAt,
      invoiceNumber: schema.invoices.invoiceNumber, vendorName: schema.vendors.name,
    })
    .from(schema.savings)
    .innerJoin(schema.flags, eq(schema.flags.id, schema.savings.flagId))
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.flags.invoiceId))
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.invoices.vendorId))
    .where(and(eq(schema.savings.orgId, orgId), eq(schema.savings.reversed, false)))
    .orderBy(desc(schema.savings.verifiedAt));

  const current = monthKey(new Date());
  const allTime = empty();
  const thisMonth = empty();
  const byMonth = new Map<string, Totals>();
  for (const r of rows) {
    const m = monthKey(r.verifiedAt);
    const buckets = [allTime, byMonth.get(m) ?? byMonth.set(m, empty()).get(m)!];
    if (m === current) buckets.push(thisMonth);
    for (const t of buckets) {
      t.verifiedMinor += r.amountMinor;
      t.feeMinor += r.feeMinor;
      t.count += 1;
      if (r.kind === "avoided") t.avoidedMinor += r.amountMinor;
      else t.recoveredMinor += r.amountMinor;
    }
  }
  const invoices = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, t]) => ({ month, verifiedMinor: t.verifiedMinor, feeMinor: t.feeMinor, status: month === current ? "due" : "issued" }));

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [[inv], [usr], [settings], [keys]] = await Promise.all([
    db.select({ n: count() }).from(schema.invoices).where(and(eq(schema.invoices.orgId, orgId), gte(schema.invoices.createdAt, monthStart))),
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.orgId, orgId)),
    db.select({ webhookUrl: schema.orgSettings.webhookUrl }).from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId)),
    db.select({ n: count() }).from(schema.apiKeys).where(and(eq(schema.apiKeys.orgId, orgId), isNull(schema.apiKeys.revokedAt))),
  ]);
  const usage = {
    invoicesThisMonth: Number(inv?.n ?? 0),
    users: Number(usr?.n ?? 0),
    outgoingEndpoints: settings?.webhookUrl ? 1 : 0,
    apiKeys: Number(keys?.n ?? 0),
  };

  const bps = org?.feeShareBps ?? 2000;
  const planName = planNameForBps(bps);
  return {
    plan: { name: planName, feeShareBps: bps, minimumMonthlyMinor: 0, currency: "INR", limits: limitsForPlan(planName) },
    usage,
    thisMonth, allTime, invoices,
    ledger: rows.slice(0, 50).map((r) => ({ ...r, verifiedAt: r.verifiedAt.toISOString() })),
    tiers: TIERS,
  };
}
