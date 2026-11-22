import type { DetectedFlag, InvoiceRec, LineRec, RateRec } from "./types";

const inWindow = (date: string, from: string | null, to: string | null) =>
  (!from || date >= from) && (!to || date <= to);

const fmt = (minor: number, cur: string) => `${cur} ${(minor / 100).toFixed(2)}`;

export function findRate(line: LineRec, invoiceDate: string, currency: string, rates: RateRec[]): RateRec | null {
  const date = line.serviceDate ?? invoiceDate;
  const usable = rates.filter((r) => r.currency === currency && inWindow(date, r.effectiveFrom, r.effectiveTo));
  const bySku = line.sku ? usable.filter((r) => r.sku && r.sku.toLowerCase() === line.sku!.toLowerCase()) : [];
  const pool = bySku.length ? bySku : usable.filter((r) => r.descriptionKey === line.descriptionKey);
  // Prefer a rate with the same unit; a unit mismatch is not comparable.
  return pool.find((r) => r.unit.toLowerCase() === line.unit.toLowerCase()) ?? null;
}

/** Flags lines billed above the contracted rate (beyond tolerance). Under-billing is ignored. */
export function detectRateDrift(invoice: InvoiceRec, rates: RateRec[]): DetectedFlag[] {
  const flags: DetectedFlag[] = [];
  for (const line of invoice.lines) {
    const rate = findRate(line, invoice.invoiceDate, invoice.currency, rates);
    if (!rate) continue;
    const allowed = Math.floor((rate.unitPriceMinor * (10_000 + rate.toleranceBps)) / 10_000);
    if (line.unitPriceMinor <= allowed) continue;

    const diffPerUnit = line.unitPriceMinor - rate.unitPriceMinor;
    const exposureMinor = Math.round(diffPerUnit * line.quantity);
    const pct = (diffPerUnit / rate.unitPriceMinor) * 100;
    flags.push({
      type: "rate_drift",
      invoiceId: invoice.id,
      invoiceLineId: line.id,
      fingerprint: `rate:${invoice.id}:${line.id}:${rate.id}`,
      severity: pct >= 10 ? "high" : pct >= 3 ? "medium" : "low",
      exposureMinor,
      currency: invoice.currency,
      summary: `Line ${line.lineNo} "${line.description}" billed at ${fmt(line.unitPriceMinor, invoice.currency)}/${line.unit}, contract rate is ${fmt(rate.unitPriceMinor, invoice.currency)} (+${pct.toFixed(1)}%)${rate.clauseRef ? ` per clause ${rate.clauseRef}` : ""}.`,
      evidence: {
        invoiceLine: { id: line.id, lineNo: line.lineNo, page: line.page, quantity: line.quantity, unit: line.unit, unitPriceMinor: line.unitPriceMinor, amountMinor: line.amountMinor },
        contractRate: { id: rate.id, unitPriceMinor: rate.unitPriceMinor, unit: rate.unit, toleranceBps: rate.toleranceBps, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo },
        clause: rate.clauseId ? { id: rate.clauseId, ref: rate.clauseRef, page: rate.clausePage, text: rate.clauseText } : null,
        overchargePerUnitMinor: diffPerUnit,
      },
    });
  }
  return flags;
}
