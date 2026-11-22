import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../db/client";
import { normalizeInvoiceNumber, normalizeKey, runDetectors, type DetectedFlag, type InvoiceRec, type LineRec, type RateRec } from "../detect";
import { findRate } from "../detect/rateDrift";
import type { Finding, ValidateRequest, ValidateResponse, Verdict } from "./types";

const minor = (n: number) => Math.round(n * 100);

export interface CoreInput {
  req: ValidateRequest;
  vendorKnown: boolean;
  vendorId: string;
  history: InvoiceRec[];
  rates: RateRec[];
  /** undefined = not checked; otherwise whether a matching record exists */
  contractFound?: boolean;
  poFound?: boolean;
  candidateId?: string;
  lineIds?: string[];
  now?: Date;
}

export interface CoreResult {
  response: Omit<ValidateResponse, "dryRun" | "invoiceId">;
  flags: DetectedFlag[];
  candidate: InvoiceRec;
}

export function buildCandidate(req: ValidateRequest, vendorId: string, id = "candidate", lineIds: string[] = [], now = new Date()): InvoiceRec {
  const lines: LineRec[] = req.lines.map((l, i) => {
    const amount = l.amount ?? l.quantity * l.unitPrice;
    return {
      id: lineIds[i] ?? `candidate-line-${i + 1}`, lineNo: i + 1, sku: l.sku ?? null, description: l.description,
      descriptionKey: normalizeKey(l.description), quantity: l.quantity, unit: l.unit ?? "each",
      unitPriceMinor: minor(l.unitPrice), amountMinor: minor(amount), serviceDate: null, page: null,
    };
  });
  const total = req.total ?? lines.reduce((s, l) => s + l.amountMinor / 100, 0);
  return {
    id, vendorId, invoiceNumber: req.invoiceNumber, invoiceNumberKey: normalizeInvoiceNumber(req.invoiceNumber),
    invoiceDate: req.invoiceDate, createdAt: now.toISOString(), currency: req.currency ?? "INR", totalMinor: minor(total),
    status: "received", lines,
  };
}

export function validateCore(input: CoreInput): CoreResult {
  const { req } = input;
  const now = input.now ?? new Date();
  const candidate = buildCandidate(req, input.vendorId, input.candidateId, input.lineIds, now);
  const findings: Finding[] = [];
  const missingDocs: string[] = [];

  if (!input.vendorKnown) findings.push({ type: "unknown_vendor", severity: "low", message: "No contract on file for this vendor", exposure: 0 });

  const flags = runDetectors(candidate, input.history, input.rates);
  for (const f of flags) {
    const clause = (f.evidence.clause ?? null) as { ref: string | null; page: number | null; text: string | null } | null;
    findings.push({
      type: f.type, severity: f.severity, message: f.summary, exposure: f.exposureMinor / 100,
      clause: clause ? { ref: clause.ref ?? null, page: clause.page ?? null, text: clause.text ?? null } : null,
      evidence: f.evidence,
    });
  }

  if (req.contractNumber && input.contractFound === false) {
    const m = `Contract ${req.contractNumber} not on file`;
    missingDocs.push(m);
    findings.push({ type: "missing_document", severity: "medium", message: m, exposure: 0 });
  }
  if (req.poNumber && input.poFound === false) {
    const m = `Purchase order ${req.poNumber} not on file`;
    missingDocs.push(m);
    findings.push({ type: "missing_document", severity: "medium", message: m, exposure: 0 });
  }
  if (input.rates.length > 0 && !candidate.lines.some((l) => findRate(l, candidate.invoiceDate, candidate.currency, input.rates))) {
    findings.push({ type: "no_contract_rates", severity: "low", message: "Vendor has contract rates but none matched any invoice line", exposure: 0 });
  }

  const verdict: Verdict = findings.some((f) => f.type === "duplicate_invoice" || f.type === "rate_drift")
    ? "block" : findings.length ? "review" : "approve";

  return {
    flags, candidate,
    response: {
      verdict, canPay: verdict === "approve", total: candidate.totalMinor / 100, currency: candidate.currency,
      findings, missingDocs, checkedAt: now.toISOString(), localOnly: true,
    },
  };
}

async function loadVendorData(orgId: string, vendorId: string) {
  const invs = await db.select().from(schema.invoices).where(and(eq(schema.invoices.orgId, orgId), eq(schema.invoices.vendorId, vendorId)));
  const history: InvoiceRec[] = [];
  for (const inv of invs) {
    const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id));
    history.push({
      id: inv.id, vendorId: inv.vendorId, invoiceNumber: inv.invoiceNumber, invoiceNumberKey: inv.invoiceNumberKey,
      invoiceDate: inv.invoiceDate, createdAt: inv.createdAt.toISOString(), currency: inv.currency, totalMinor: inv.totalMinor, status: inv.status,
      lines: lines.sort((a, b) => a.lineNo - b.lineNo).map((l) => ({ ...l, quantity: Number(l.quantity) })),
    });
  }
  const rateRows = await db
    .select({ rate: schema.contractRates, clause: schema.contractClauses })
    .from(schema.contractRates)
    .innerJoin(schema.contracts, eq(schema.contracts.id, schema.contractRates.contractId))
    .leftJoin(schema.contractClauses, eq(schema.contractClauses.id, schema.contractRates.clauseId))
    .where(and(eq(schema.contracts.orgId, orgId), eq(schema.contracts.vendorId, vendorId)));
  const rates: RateRec[] = rateRows.map(({ rate, clause }) => ({
    id: rate.id, clauseId: clause?.id ?? null, clauseRef: rate.clauseRef ?? clause?.ref ?? null, clausePage: clause?.page ?? null, clauseText: clause?.text ?? null,
    sku: rate.sku, descriptionKey: rate.descriptionKey, description: rate.description, unit: rate.unit, unitPriceMinor: rate.unitPriceMinor,
    currency: rate.currency, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo, toleranceBps: rate.toleranceBps,
  }));
  return { history, rates };
}

export async function validateInvoice(orgId: string, req: ValidateRequest): Promise<ValidateResponse> {
  const nameKey = normalizeKey(req.vendor);
  const [vendor] = await db.select().from(schema.vendors).where(and(eq(schema.vendors.orgId, orgId), eq(schema.vendors.nameKey, nameKey)));

  let history: InvoiceRec[] = [];
  let rates: RateRec[] = [];
  let contract: { id: string } | undefined;
  let poFound: boolean | undefined;
  if (vendor) {
    ({ history, rates } = await loadVendorData(orgId, vendor.id));
    if (req.contractNumber) {
      [contract] = await db.select({ id: schema.contracts.id }).from(schema.contracts)
        .where(and(eq(schema.contracts.orgId, orgId), eq(schema.contracts.vendorId, vendor.id), eq(schema.contracts.contractNumber, req.contractNumber)));
    }
  }
  if (req.poNumber) {
    const [po] = await db.select({ id: schema.purchaseOrders.id }).from(schema.purchaseOrders)
      .where(and(eq(schema.purchaseOrders.orgId, orgId), eq(schema.purchaseOrders.poNumber, req.poNumber),
        ...(vendor ? [eq(schema.purchaseOrders.vendorId, vendor.id)] : [])));
    poFound = !!po;
  }

  const base = { req, vendorKnown: !!vendor, vendorId: vendor?.id ?? "unknown", history, rates, poFound,
    contractFound: req.contractNumber ? !!contract : undefined };
  const result = validateCore(base);
  if (!req.persist) return { ...result.response, dryRun: true };

  // Persist: create vendor/invoice/lines, then re-run detectors so fingerprints use real ids.
  const v = vendor ?? (await db.insert(schema.vendors).values({ orgId, name: req.vendor, nameKey }).returning())[0];
  const draft = result.candidate;
  const [inv] = await db.insert(schema.invoices).values({
    orgId, vendorId: v.id, contractId: contract?.id ?? null, invoiceNumber: req.invoiceNumber, invoiceNumberKey: draft.invoiceNumberKey,
    invoiceDate: req.invoiceDate, poNumber: req.poNumber ?? null, contractNumber: req.contractNumber ?? null, currency: draft.currency,
    subtotalMinor: draft.totalMinor, taxMinor: 0, totalMinor: draft.totalMinor,
    status: result.response.verdict === "block" ? "on_hold" : "received",
  }).returning();
  const lineIds: string[] = [];
  for (const l of draft.lines) {
    const [row] = await db.insert(schema.invoiceLines).values({
      invoiceId: inv.id, lineNo: l.lineNo, sku: l.sku, description: l.description, descriptionKey: l.descriptionKey,
      quantity: String(l.quantity), unit: l.unit, unitPriceMinor: l.unitPriceMinor, amountMinor: l.amountMinor,
    }).returning({ id: schema.invoiceLines.id });
    lineIds.push(row.id);
  }
  const final = validateCore({ ...base, vendorId: v.id, candidateId: inv.id, lineIds, now: new Date(result.response.checkedAt) });
  for (const f of final.flags) {
    const [flag] = await db.insert(schema.flags).values({
      orgId, invoiceId: inv.id, invoiceLineId: f.invoiceLineId, type: f.type, fingerprint: f.fingerprint, severity: f.severity,
      exposureMinor: f.exposureMinor, currency: f.currency, summary: f.summary, evidence: f.evidence,
    }).onConflictDoNothing().returning();
    if (flag) await db.insert(schema.flagEvents).values({ flagId: flag.id, type: "detected", data: { rule: (f.evidence as any).rule ?? f.type, source: "validation_api" } });
  }
  return { ...final.response, dryRun: false, invoiceId: inv.id };
}
