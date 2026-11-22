import { and, eq, ne, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db, schema } from "../db/client";
import { normalizeInvoiceNumber, normalizeKey, runDetectors, type InvoiceRec, type RateRec } from "../detect";
import { extractFromPdf } from "../extract/llm";
import type { Extraction } from "../extract/schema";
import { resolveLlm } from "./settings";
import { emitEvent } from "./hooks";

const minor = (n: number) => Math.round(n * 100);

async function upsertVendor(orgId: string, name: string) {
  const nameKey = normalizeKey(name);
  const [found] = await db.select().from(schema.vendors).where(and(eq(schema.vendors.orgId, orgId), eq(schema.vendors.nameKey, nameKey)));
  if (found) return found;
  const [row] = await db.insert(schema.vendors).values({ orgId, name, nameKey }).returning();
  return row;
}

// "2 (line 1)" or "Schedule A, row 3" resolve to the enclosing clause "2" / "Schedule A".
function findClauseId(ids: Map<string, string>, ref: string): string | null {
  if (ids.has(ref)) return ids.get(ref)!;
  const lead = ref.split(/[\s(,;:]/)[0];
  return ids.get(lead) ?? ids.get(ref.replace(/\s*[(,].*$/, "").trim()) ?? null;
}

export async function ingestExtraction(orgId: string, documentId: string | null, x: Extraction) {
  const vendor = await upsertVendor(orgId, x.vendorName);

  if (x.kind === "contract" && x.contract) {
    const c = x.contract;
    const [contract] = await db.insert(schema.contracts).values({
      orgId, vendorId: vendor.id, documentId, contractNumber: c.contractNumber, title: c.title, currency: x.currency,
      effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo, paymentTermsDays: c.paymentTermsDays,
    }).returning();
    const clauseIds = new Map<string, string>();
    for (const cl of c.clauses) {
      const [row] = await db.insert(schema.contractClauses).values({ contractId: contract.id, ref: cl.ref, page: cl.page, text: cl.text }).returning();
      clauseIds.set(cl.ref, row.id);
    }
    for (const r of c.rates) {
      await db.insert(schema.contractRates).values({
        contractId: contract.id, clauseId: findClauseId(clauseIds, r.clauseRef), clauseRef: r.clauseRef, sku: r.sku, description: r.description,
        descriptionKey: normalizeKey(r.description), unit: r.unit, unitPriceMinor: minor(r.unitPrice), currency: x.currency,
        effectiveFrom: c.effectiveFrom, effectiveTo: c.effectiveTo,
      });
    }
    // Invoices received before their contract get re-checked now that rates exist.
    const pending = await db.select({ id: schema.invoices.id }).from(schema.invoices)
      .where(and(eq(schema.invoices.orgId, orgId), eq(schema.invoices.vendorId, vendor.id)));
    for (const p of pending) await detectForInvoice(orgId, p.id);
    return { kind: "contract" as const, contractId: contract.id };
  }

  if (x.kind === "purchase_order" && x.purchaseOrder) {
    const po = x.purchaseOrder;
    await db.insert(schema.purchaseOrders).values({
      orgId, vendorId: vendor.id, documentId, poNumber: po.poNumber, contractNumber: po.contractNumber, orderDate: po.orderDate,
      currency: x.currency, totalMinor: minor(po.total),
    });
    return { kind: "purchase_order" as const, poNumber: po.poNumber };
  }

  if (x.kind === "invoice" && x.invoice) {
    const i = x.invoice;
    const contractRow = i.contractNumber
      ? (await db.select().from(schema.contracts).where(and(eq(schema.contracts.orgId, orgId), eq(schema.contracts.vendorId, vendor.id), eq(schema.contracts.contractNumber, i.contractNumber))))[0]
      : undefined;
    const [inv] = await db.insert(schema.invoices).values({
      orgId, vendorId: vendor.id, contractId: contractRow?.id ?? null, documentId, invoiceNumber: i.invoiceNumber,
      invoiceNumberKey: normalizeInvoiceNumber(i.invoiceNumber), invoiceDate: i.invoiceDate, dueDate: i.dueDate, poNumber: i.poNumber, contractNumber: i.contractNumber,
      currency: x.currency, subtotalMinor: minor(i.subtotal), taxMinor: minor(i.tax), totalMinor: minor(i.total),
    }).returning();
    let n = 1;
    for (const l of i.lines) {
      await db.insert(schema.invoiceLines).values({
        invoiceId: inv.id, lineNo: n++, sku: l.sku, description: l.description, descriptionKey: normalizeKey(l.description),
        quantity: String(l.quantity), unit: l.unit, unitPriceMinor: minor(l.unitPrice), amountMinor: minor(l.amount),
        serviceDate: l.serviceDate, page: l.page,
      });
    }
    const flagIds = await detectForInvoice(orgId, inv.id);
    return { kind: "invoice" as const, invoiceId: inv.id, flagsCreated: flagIds.length };
  }

  return { kind: "other" as const };
}

async function loadInvoice(orgId: string, id: string): Promise<InvoiceRec | null> {
  const [inv] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.orgId, orgId), eq(schema.invoices.id, id)));
  if (!inv) return null;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id));
  return {
    id: inv.id, vendorId: inv.vendorId, invoiceNumber: inv.invoiceNumber, invoiceNumberKey: inv.invoiceNumberKey,
    invoiceDate: inv.invoiceDate, createdAt: inv.createdAt.toISOString(), currency: inv.currency, totalMinor: inv.totalMinor, status: inv.status,
    lines: lines.sort((a, b) => a.lineNo - b.lineNo).map((l) => ({ ...l, quantity: Number(l.quantity) })),
  };
}

/** Runs all detectors for one invoice and inserts any new flags. Safe to call repeatedly. */
export async function detectForInvoice(orgId: string, invoiceId: string): Promise<string[]> {
  const invoice = await loadInvoice(orgId, invoiceId);
  if (!invoice) return [];
  const [row] = await db.select({ vendorId: schema.invoices.vendorId }).from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  const otherIds = await db.select({ id: schema.invoices.id }).from(schema.invoices)
    .where(and(eq(schema.invoices.orgId, orgId), eq(schema.invoices.vendorId, row.vendorId), ne(schema.invoices.id, invoiceId)));
  const history = (await Promise.all(otherIds.map((o) => loadInvoice(orgId, o.id)))).filter((x): x is InvoiceRec => !!x);

  const rateRows = await db
    .select({ rate: schema.contractRates, clause: schema.contractClauses })
    .from(schema.contractRates)
    .innerJoin(schema.contracts, eq(schema.contracts.id, schema.contractRates.contractId))
    .leftJoin(schema.contractClauses, eq(schema.contractClauses.id, schema.contractRates.clauseId))
    .where(and(eq(schema.contracts.orgId, orgId), eq(schema.contracts.vendorId, row.vendorId)));
  const rates: RateRec[] = rateRows.map(({ rate, clause }) => ({
    id: rate.id, clauseId: clause?.id ?? null, clauseRef: rate.clauseRef ?? clause?.ref ?? null, clausePage: clause?.page ?? null, clauseText: clause?.text ?? null,
    sku: rate.sku, descriptionKey: rate.descriptionKey, description: rate.description, unit: rate.unit, unitPriceMinor: rate.unitPriceMinor,
    currency: rate.currency, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo, toleranceBps: rate.toleranceBps,
  }));

  const created: string[] = [];
  for (const f of runDetectors(invoice, history, rates)) {
    const [flag] = await db.insert(schema.flags).values({
      orgId, invoiceId: f.invoiceId, invoiceLineId: f.invoiceLineId, type: f.type, fingerprint: f.fingerprint, severity: f.severity,
      exposureMinor: f.exposureMinor, currency: f.currency, summary: f.summary, evidence: f.evidence,
    }).onConflictDoNothing().returning();
    if (flag) {
      created.push(flag.id);
      void emitEvent(orgId, "flag.created", { flagId: flag.id, invoiceId, type: flag.type, severity: flag.severity, exposureMinor: flag.exposureMinor, currency: flag.currency, summary: flag.summary });
      await db.insert(schema.flagEvents).values({ flagId: flag.id, type: "detected", data: { rule: (f.evidence as any).rule ?? f.type } });
      // Hold the invoice so it is not paid while a flag is open.
      await db.update(schema.invoices).set({ status: "on_hold" }).where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, "received")));
    }
  }
  return created;
}

/** Fills new columns for rows ingested before they existed; re-reads purchase orders that were never stored. */
export async function backfillLinks() {
  await db.execute(sql`update invoices set contract_number = d.extraction->'invoice'->>'contractNumber'
    from documents d where d.id = invoices.document_id and invoices.contract_number is null`);
  const missing = (await db.execute(sql`select d.id, d.org_id as "orgId", d.storage_path as "path" from documents d
    where d.kind = 'purchase_order' and d.status = 'extracted' and not exists (select 1 from purchase_orders p where p.document_id = d.id)`)).rows as any[];
  for (const m of missing) {
    try {
      const creds = await resolveLlm(m.orgId);
      if (!creds) continue;
      const x = await extractFromPdf(await readFile(m.path), creds);
      await ingestExtraction(m.orgId, m.id, x);
      await db.update(schema.documents).set({ extraction: x }).where(eq(schema.documents.id, m.id));
    } catch (e) {
      console.warn("PO backfill failed:", (e as Error).message);
    }
  }
}
