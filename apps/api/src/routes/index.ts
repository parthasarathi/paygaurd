import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db, schema } from "../db/client";
import { requireAuth, signToken, verifyPassword, type Session } from "../lib/auth";
import { verifyKey } from "../extract/llm";
import { createApiKey, authenticateApiKey } from "../services/apiKeys";
import { processDocument } from "../services/documents";
import { watchDir } from "../ingest/folder";
import { pollMailbox } from "../ingest/email";
import { evaluatePayability } from "../services/payability";
import { agentRoutes } from "./agent";
import { billingRoutes } from "./billing";
import { hooksRoutes } from "./hooks";
import { validationSession, validationV1 } from "./validation";
import { payInvoice } from "../services/payments";
import { assertPublicUrl } from "../services/webhook";
import { encrypt } from "../lib/crypto";
import { applyAction, HttpError } from "../services/flags";
import { getPublicSettings, resolveLlm, saveSettings } from "../services/settings";

type Env = { Variables: { session: Session } };
export const app = new Hono<Env>();

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
  console.error(e);
  return c.json({ error: "internal error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/login", zValidator("json", z.object({ email: z.string(), password: z.string() })), async (c) => {
  const { email, password } = c.req.valid("json");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  if (!u || !(await verifyPassword(password, u.passwordHash))) return c.json({ error: "invalid credentials" }, 401);
  const token = await signToken({ userId: u.id, orgId: u.orgId, role: u.role });
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

// Public integration endpoint: authenticated with an API key, for ERPs, scripts and email-to-API tools.
app.post("/api/v1/documents", async (c) => {
  const key = c.req.header("x-api-key") ?? c.req.header("authorization")?.replace(/^Bearer /i, "");
  const who = key ? await authenticateApiKey(key) : null;
  if (!who) return c.json({ error: "invalid or missing API key" }, 401);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "multipart field 'file' (PDF) is required");
  const result = await processDocument(who.orgId, Buffer.from(await file.arrayBuffer()), file.name, "api", who.name);
  return c.json(result, 201);
});

const api = new Hono<Env>();
api.use("*", requireAuth);

api.get("/me", async (c) => {
  const s = c.get("session");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId));
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, s.orgId));
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, org: { name: org.name, feeShareBps: org.feeShareBps } });
});
api.get("/users", async (c) => c.json(await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.orgId, c.get("session").orgId))));

// ---- Settings (LLM key) ----
api.get("/settings", async (c) => c.json(await getPublicSettings(c.get("session").orgId)));
api.put("/settings", zValidator("json", z.object({
  llmApiKey: z.string().trim().min(10).optional(), llmModel: z.string().trim().max(100).optional(), clearKey: z.boolean().optional(),
})), async (c) => {
  const s = c.get("session");
  if (s.role !== "admin") return c.json({ error: "admin only" }, 403);
  await saveSettings(s.orgId, c.req.valid("json"));
  return c.json(await getPublicSettings(s.orgId));
});
api.post("/settings/test", async (c) => {
  const creds = await resolveLlm(c.get("session").orgId);
  if (!creds) return c.json({ ok: false, error: "No API key configured" }, 400);
  try { await verifyKey(creds); return c.json({ ok: true }); }
  catch (e: any) { return c.json({ ok: false, error: e?.message ?? "Key check failed" }, 400); }
});

// ---- Integrations: API keys, webhook, email, watched folder ----
const adminOnly = (c: any) => { if (c.get("session").role !== "admin") throw new HttpError(403, "admin only"); };
api.get("/integrations", async (c) => {
  const { orgId } = c.get("session");
  const [st] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  const keys = await db.select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, createdAt: schema.apiKeys.createdAt, lastUsedAt: schema.apiKeys.lastUsedAt })
    .from(schema.apiKeys).where(and(eq(schema.apiKeys.orgId, orgId), isNull(schema.apiKeys.revokedAt)));
  return c.json({
    apiKeys: keys,
    webhook: { url: st?.webhookUrl ?? null, hasSecret: !!st?.webhookSecretEnc },
    email: { enabled: st?.imapEnabled ?? false, host: st?.imapHost ?? null, port: st?.imapPort ?? 993, user: st?.imapUser ?? null, folder: st?.imapFolder ?? "INBOX", hasPassword: !!st?.imapPassEnc, lastPollAt: st?.imapLastPollAt ?? null, lastError: st?.imapLastError ?? null },
    folder: { path: watchDir },
  });
});
api.post("/integrations/api-keys", zValidator("json", z.object({ name: z.string().trim().min(1).max(80) })), async (c) => {
  adminOnly(c);
  return c.json(await createApiKey(c.get("session").orgId, c.req.valid("json").name), 201);
});
api.delete("/integrations/api-keys/:id", async (c) => {
  adminOnly(c);
  await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(and(eq(schema.apiKeys.id, c.req.param("id")), eq(schema.apiKeys.orgId, c.get("session").orgId)));
  return c.json({ ok: true });
});
api.put("/integrations/webhook", zValidator("json", z.object({ url: z.string().url().nullable(), regenerateSecret: z.boolean().optional() })), async (c) => {
  adminOnly(c);
  const { orgId } = c.get("session");
  const { url, regenerateSecret } = c.req.valid("json");
  if (url) try { assertPublicUrl(url); } catch (e) { throw new HttpError(422, (e as Error).message); }
  const secret = url && regenerateSecret ? `whsec_${randomBytes(24).toString("base64url")}` : null;
  await saveSettings(orgId, {});
  await db.update(schema.orgSettings).set({ webhookUrl: url, ...(secret ? { webhookSecretEnc: encrypt(secret) } : {}), ...(url ? {} : { webhookSecretEnc: null }) }).where(eq(schema.orgSettings.orgId, orgId));
  return c.json({ ok: true, secret });
});
api.put("/integrations/email", zValidator("json", z.object({
  enabled: z.boolean(), host: z.string().trim().max(200).optional(), port: z.number().int().min(1).max(65535).optional(),
  user: z.string().trim().max(200).optional(), password: z.string().min(1).max(500).optional(), folder: z.string().trim().max(100).optional(),
})), async (c) => {
  adminOnly(c);
  const { orgId } = c.get("session");
  const b = c.req.valid("json");
  await saveSettings(orgId, {});
  await db.update(schema.orgSettings).set({
    imapEnabled: b.enabled, ...(b.host !== undefined && { imapHost: b.host }), ...(b.port !== undefined && { imapPort: b.port }),
    ...(b.user !== undefined && { imapUser: b.user }), ...(b.folder !== undefined && { imapFolder: b.folder || "INBOX" }),
    ...(b.password && { imapPassEnc: encrypt(b.password) }),
  }).where(eq(schema.orgSettings.orgId, orgId));
  return c.json({ ok: true });
});
api.post("/integrations/email/poll", async (c) => {
  adminOnly(c);
  try { return c.json({ ok: true, ...(await pollMailbox(c.get("session").orgId)) }); }
  catch (e: any) { return c.json({ ok: false, error: e?.message ?? "Mailbox check failed" }, 400); }
});

// ---- Documents ----
api.post("/documents", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "file is required");
  return c.json(await processDocument(c.get("session").orgId, Buffer.from(await file.arrayBuffer()), file.name, "upload"));
});
api.get("/documents/:id/file", async (c) => {
  const [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, c.req.param("id")), eq(schema.documents.orgId, c.get("session").orgId)));
  if (!doc) throw new HttpError(404, "document not found");
  const bytes = await readFile(doc.storagePath).catch(() => null);
  if (!bytes) throw new HttpError(404, "file is no longer available");
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${doc.filename.replace(/[^\w.\- ]/g, "_")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    },
  });
});
api.get("/documents", async (c) =>
  c.json(await db.select({ id: schema.documents.id, kind: schema.documents.kind, filename: schema.documents.filename, source: schema.documents.source, sourceRef: schema.documents.sourceRef, status: schema.documents.status, error: schema.documents.error, createdAt: schema.documents.createdAt })
    .from(schema.documents).where(eq(schema.documents.orgId, c.get("session").orgId)).orderBy(desc(schema.documents.createdAt))));

// ---- Invoices / contracts ----
api.get("/invoices", async (c) => {
  const { orgId } = c.get("session");
  const rows = (await db.execute(sql`
    select i.id, i.document_id as "documentId", i.invoice_number as "invoiceNumber", i.invoice_date as "invoiceDate", i.due_date as "dueDate",
           i.total_minor as "totalMinor", i.currency, i.status, i.paid_at as "paidAt", i.po_number as "poNumber", i.contract_number as "contractNumber",
           v.name as "vendorName",
           ct.id as "contractId", ct.document_id as "contractDocumentId",
           po.id as "poId", po.document_id as "poDocumentId",
           (select count(*)::int from flags f where f.invoice_id = i.id and f.status not in ('resolved','dismissed')) as "openFlags",
           (select coalesce(sum(s.amount_minor),0)::bigint from savings s join flags f on f.id = s.flag_id
              where f.invoice_id = i.id and not s.reversed and s.kind = 'avoided') as deduction,
           (select coalesce(json_agg(json_build_object('id', f.id, 'type', f.type, 'severity', f.severity, 'summary', f.summary, 'exposureMinor', f.exposure_minor) order by f.exposure_minor desc), '[]'::json)
              from flags f where f.invoice_id = i.id and f.status not in ('resolved','dismissed')) as problems
    from invoices i
    join vendors v on v.id = i.vendor_id
    left join lateral (select c2.id, c2.document_id from contracts c2 where c2.org_id = i.org_id and c2.vendor_id = i.vendor_id
                       and (i.contract_number is null or lower(c2.contract_number) = lower(i.contract_number)) order by c2.created_at desc limit 1) ct on true
    left join lateral (select p2.id, p2.document_id from purchase_orders p2 where p2.org_id = i.org_id and p2.vendor_id = i.vendor_id
                       and i.po_number is not null and lower(p2.po_number) = lower(i.po_number) order by p2.created_at desc limit 1) po on true
    where i.org_id = ${orgId} order by i.invoice_date desc, i.created_at desc`)).rows as any[];

  return c.json(rows.map(({ deduction, contractId, poId, ...r }) => {
    const missingDocs: string[] = [];
    if (!contractId) missingDocs.push(r.contractNumber ? `Contract ${r.contractNumber}` : "Contract");
    if (!poId) missingDocs.push(r.poNumber ? `PO ${r.poNumber}` : "PO");
    const pay = evaluatePayability({ status: r.status, openFlags: r.openFlags, totalMinor: r.totalMinor, deductionMinor: Number(deduction), hasContract: !!contractId, missingDocs });
    return { ...r, hasContract: !!contractId, hasPo: !!poId, missingDocs, deductionMinor: Number(deduction), ...pay };
  }));
});
api.post("/invoices/:id/pay", zValidator("json", z.object({ paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reference: z.string().trim().max(120).optional() })), async (c) => {
  const s = c.get("session");
  if (s.role !== "admin") throw new HttpError(403, "Only admins can record payments");
  const r = await payInvoice(s.orgId, c.req.param("id"), s.userId, c.req.valid("json"));
  return c.json({ ok: true, payment: r.payment });
});
api.get("/contracts", async (c) => {
  const { orgId } = c.get("session");
  const rows = await db.execute(sql`
    select c.id, c.document_id as "documentId", c.contract_number as "contractNumber", c.title, c.currency, c.effective_from as "effectiveFrom", c.effective_to as "effectiveTo",
           v.name as "vendorName", (select count(*)::int from contract_rates r where r.contract_id = c.id) as "rateCount"
    from contracts c join vendors v on v.id = c.vendor_id where c.org_id = ${orgId} order by c.created_at desc`);
  return c.json(rows.rows);
});

// ---- Flags ----
api.get("/flags", async (c) => {
  const { orgId } = c.get("session");
  const status = c.req.query("status");
  const rows = await db.execute(sql`
    select f.id, f.type, f.severity, f.status, f.summary, f.exposure_minor as "exposureMinor", f.currency, f.created_at as "createdAt",
           f.assignee_id as "assigneeId", i.invoice_number as "invoiceNumber", v.name as "vendorName"
    from flags f join invoices i on i.id = f.invoice_id join vendors v on v.id = i.vendor_id
    where f.org_id = ${orgId} ${status === "open" ? sql`and f.status not in ('resolved','dismissed')` : status ? sql`and f.status = ${status}` : sql``}
    order by f.created_at desc`);
  return c.json(rows.rows);
});
api.get("/flags/:id", async (c) => {
  const { orgId } = c.get("session");
  const [flag] = await db.select().from(schema.flags).where(and(eq(schema.flags.id, c.req.param("id")), eq(schema.flags.orgId, orgId)));
  if (!flag) throw new HttpError(404, "flag not found");
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, flag.invoiceId));
  const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, invoice.vendorId));
  const events = await db.select({ e: schema.flagEvents, actor: schema.users.name }).from(schema.flagEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.flagEvents.actorId)).where(eq(schema.flagEvents.flagId, flag.id)).orderBy(schema.flagEvents.createdAt);
  const savings = await db.select().from(schema.savings).where(eq(schema.savings.flagId, flag.id));
  const ev = flag.evidence as any;
  const sources: { id: string; label: string; filename: string; page: number | null }[] = [];
  const addDoc = async (docId: string | null | undefined, label: string, page: number | null) => {
    if (!docId) return;
    const [d] = await db.select({ filename: schema.documents.filename }).from(schema.documents).where(and(eq(schema.documents.id, docId), eq(schema.documents.orgId, orgId)));
    if (d) sources.push({ id: docId, label, filename: d.filename, page });
  };
  await addDoc(invoice.documentId, `Invoice ${invoice.invoiceNumber}`, ev?.invoiceLine?.page ?? null);
  if (ev?.contractRate?.id) {
    const [r] = await db.select({ contractId: schema.contractRates.contractId }).from(schema.contractRates).where(eq(schema.contractRates.id, ev.contractRate.id));
    const [ct] = r ? await db.select().from(schema.contracts).where(and(eq(schema.contracts.id, r.contractId), eq(schema.contracts.orgId, orgId))) : [];
    await addDoc(ct?.documentId, `Contract ${ct?.contractNumber ?? ""}${ev.clause?.ref ? ` · clause ${ev.clause.ref}` : ""}`.trim(), ev.clause?.page ?? null);
  }
  if (ev?.originalInvoice?.id) {
    const [orig] = await db.select({ documentId: schema.invoices.documentId }).from(schema.invoices).where(and(eq(schema.invoices.id, ev.originalInvoice.id), eq(schema.invoices.orgId, orgId)));
    if (orig?.documentId !== invoice.documentId) await addDoc(orig?.documentId, `Original invoice ${ev.originalInvoice.number}`, null);
  }
  return c.json({ flag, invoice, vendor, sources, events: events.map(({ e, actor }) => ({ ...e, actor })), savings });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), assigneeId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("comment"), note: z.string().min(1) }),
  z.object({ action: z.literal("dispute"), note: z.string().optional() }),
  z.object({ action: z.literal("credit_note_received"), creditNoteRef: z.string().min(1), amountMinor: z.number().int().positive(), note: z.string().optional() }),
  z.object({ action: z.literal("resolve"), resolution: z.enum(["price_corrected", "invoice_rejected", "refund", "credit_note"]), amountMinor: z.number().int().nonnegative().optional(), evidenceRef: z.string().optional(), note: z.string().optional() }),
  z.object({ action: z.literal("dismiss"), note: z.string().optional() }),
  z.object({ action: z.literal("reopen") }),
]);
api.post("/flags/:id/actions", zValidator("json", actionSchema), async (c) => {
  const s = c.get("session");
  await applyAction(s.orgId, c.req.param("id"), s.userId, c.req.valid("json"));
  return c.json({ ok: true });
});

// ---- Dashboard ----
type Alert = { id: string; level: "critical" | "warning"; title: string; detail: string; exposureMinor: number; currency: string; flagId?: string; invoiceId?: string };

// Risky combinations: several problem types on one invoice, flagged bills near/after payment, repeat-offender vendors.
async function buildAlerts(orgId: string): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const openRows = (await db.execute(sql`
    select i.id as "invoiceId", i.invoice_number as "invoiceNumber", i.status, i.due_date as "dueDate", i.currency, v.id as "vendorId", v.name as "vendorName",
           (i.due_date::date - current_date) as "daysToDue",
           array_agg(distinct f.type) as types, count(*)::int as n, sum(f.exposure_minor)::bigint as exposure, min(f.id::text) as "flagId"
    from flags f join invoices i on i.id = f.invoice_id join vendors v on v.id = i.vendor_id
    where f.org_id = ${orgId} and f.status not in ('resolved','dismissed')
    group by i.id, v.id`)).rows as any[];

  for (const r of openRows) {
    const exposureMinor = Number(r.exposure);
    const base = { exposureMinor, currency: r.currency, flagId: r.flagId, invoiceId: r.invoiceId };
    if (r.types.length > 1)
      alerts.push({ ...base, id: `combo:${r.invoiceId}`, level: "critical", title: `${r.invoiceNumber}: ${r.types.map((t: string) => t.replace(/_/g, " ")).join(" + ")} on the same bill`,
        detail: `${r.vendorName} has ${r.n} open flags on this invoice. Do not pay until resolved.` });
    if (r.status === "paid")
      alerts.push({ ...base, id: `paid:${r.invoiceId}`, level: "critical", title: `${r.invoiceNumber} was already paid with open flags`,
        detail: `Seek a credit note or refund from ${r.vendorName}.` });
    else if (r.daysToDue !== null && Number(r.daysToDue) <= 7)
      alerts.push({ ...base, id: `due:${r.invoiceId}`, level: Number(r.daysToDue) < 0 ? "critical" : "warning",
        title: `${r.invoiceNumber} ${Number(r.daysToDue) < 0 ? `is ${-Number(r.daysToDue)} day(s) overdue` : `is due in ${r.daysToDue} day(s)`} with open flags`,
        detail: `Resolve or dispute with ${r.vendorName} before payment.` });
  }

  const byVendor = new Map<string, { name: string; n: number; exposure: number; currency: string; invoices: number }>();
  for (const r of openRows) {
    const v = byVendor.get(r.vendorId) ?? { name: r.vendorName, n: 0, exposure: 0, currency: r.currency, invoices: 0 };
    v.n += r.n; v.exposure += Number(r.exposure); v.invoices += 1;
    byVendor.set(r.vendorId, v);
  }
  for (const [vendorId, v] of byVendor)
    if (v.invoices >= 2)
      alerts.push({ id: `vendor:${vendorId}`, level: "warning", title: `${v.name}: ${v.invoices} invoices with open flags`,
        detail: `${v.n} open flags in total. Consider reviewing this vendor's billing.`, exposureMinor: v.exposure, currency: v.currency });

  const rank = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level] || b.exposureMinor - a.exposureMinor);
}

api.get("/dashboard", async (c) => {
  const { orgId } = c.get("session");
  const [open] = (await db.execute(sql`select count(*)::int as n, coalesce(sum(exposure_minor),0)::bigint as exposure from flags where org_id = ${orgId} and status not in ('resolved','dismissed')`)).rows as any[];
  const [sv] = (await db.execute(sql`select coalesce(sum(amount_minor) filter (where kind='avoided'),0)::bigint as avoided, coalesce(sum(amount_minor) filter (where kind='recovered'),0)::bigint as recovered, coalesce(sum(fee_minor),0)::bigint as fee from savings where org_id = ${orgId} and not reversed`)).rows as any[];
  const byType = (await db.execute(sql`select type, count(*)::int as n, coalesce(sum(exposure_minor),0)::bigint as exposure from flags where org_id = ${orgId} and status not in ('resolved','dismissed') group by type`)).rows;
  const [inv] = (await db.execute(sql`select count(*)::int as n from invoices where org_id = ${orgId}`)).rows as any[];
  const alerts = await buildAlerts(orgId);
  const byVendor = (await db.execute(sql`
    select v.name as vendor, count(*)::int as n, sum(f.exposure_minor)::bigint as exposure, f.currency
    from flags f join invoices i on i.id = f.invoice_id join vendors v on v.id = i.vendor_id
    where f.org_id = ${orgId} and f.status not in ('resolved','dismissed') group by v.name, f.currency order by exposure desc limit 5`)).rows;
  const pipeline = (await db.execute(sql`
    select status, count(*)::int as n, coalesce(sum(exposure_minor),0)::bigint as exposure from flags where org_id = ${orgId} group by status`)).rows;
  const topFlags = (await db.execute(sql`
    select f.id, f.type, f.severity, f.status, f.summary, f.exposure_minor as "exposureMinor", f.currency, i.invoice_number as "invoiceNumber", v.name as "vendorName"
    from flags f join invoices i on i.id = f.invoice_id join vendors v on v.id = i.vendor_id
    where f.org_id = ${orgId} and f.status not in ('resolved','dismissed') order by f.exposure_minor desc limit 5`)).rows;
  const recent = (await db.execute(sql`
    select e.id, e.type, e.created_at as "createdAt", u.name as actor, f.id as "flagId", f.type as "flagType", i.invoice_number as "invoiceNumber"
    from flag_events e join flags f on f.id = e.flag_id join invoices i on i.id = f.invoice_id left join users u on u.id = e.actor_id
    where f.org_id = ${orgId} order by e.created_at desc limit 8`)).rows;
  return c.json({
    alerts, byVendor, pipeline, topFlags, recent,
    openFlags: open.n, openExposureMinor: Number(open.exposure), invoices: inv.n, byType,
    avoidedMinor: Number(sv.avoided), recoveredMinor: Number(sv.recovered), feeMinor: Number(sv.fee),
  });
});

api.route("/agent", agentRoutes);
api.route("/validate", validationSession);
api.route("/hooks", hooksRoutes);
api.route("/billing", billingRoutes);
app.route("/api/v1", validationV1);
app.route("/api", api);
