import type { DetectedFlag, InvoiceRec } from "./types";

const DAY = 86_400_000;
const NEAR_WINDOW_DAYS = 90;

const order = (a: InvoiceRec, b: InvoiceRec) =>
  a.invoiceDate.localeCompare(b.invoiceDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

// Order-independent fingerprint of an invoice's content, ignoring line numbers.
export const lineSignature = (inv: InvoiceRec) =>
  inv.lines
    .map((l) => `${l.sku ?? l.descriptionKey}|${l.quantity}|${l.unitPriceMinor}`)
    .sort()
    .join(";");

const fmt = (minor: number, cur: string) => `${cur} ${(minor / 100).toFixed(2)}`;

/**
 * Checks `target` against earlier invoices from the same vendor. The later
 * invoice of a pair is the one flagged, since that is the one not yet owed.
 */
export function detectDuplicates(target: InvoiceRec, others: InvoiceRec[]): DetectedFlag[] {
  const earlier = others
    .filter((o) => o.id !== target.id && o.vendorId === target.vendorId && o.currency === target.currency)
    .filter((o) => order(o, target) < 0)
    .sort(order);
  const sig = lineSignature(target);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  type Match = { prior: InvoiceRec; rule: string; severity: "low" | "medium" | "high"; reason: string };
  const matches: Match[] = [];

  for (const prior of earlier) {
    let m: Omit<Match, "prior"> | null = null;
    if (prior.invoiceNumberKey === target.invoiceNumberKey) {
      m =
        prior.totalMinor === target.totalMinor
          ? { rule: "same_number_same_total", severity: "high", reason: `same invoice number ${target.invoiceNumber} and same total` }
          : { rule: "same_number_diff_total", severity: "medium", reason: `invoice number ${target.invoiceNumber} was already used with a different total (${fmt(prior.totalMinor, prior.currency)})` };
    } else if (
      target.lines.length > 0 &&
      sig === lineSignature(prior) &&
      prior.totalMinor === target.totalMinor &&
      daysApart(prior.invoiceDate, target.invoiceDate) <= NEAR_WINDOW_DAYS
    ) {
      m = { rule: "same_lines_same_total", severity: "high", reason: "identical line items and total under a different invoice number" };
    } else if (prior.totalMinor === target.totalMinor && prior.invoiceDate === target.invoiceDate) {
      m = { rule: "same_total_same_date", severity: "low", reason: "same total on the same date under a different invoice number" };
    }
    if (m) matches.push({ prior, ...m });
  }
  if (matches.length === 0) return [];

  // One flag per invoice, against the strongest and earliest match, so exposure is never counted twice.
  const best = matches.sort((a, b) => rank[a.severity] - rank[b.severity] || order(a.prior, b.prior))[0];
  const { prior, rule, severity, reason } = best;
  return [{
    type: "duplicate_invoice",
    invoiceId: target.id,
    invoiceLineId: null,
    fingerprint: `dup:${target.id}`,
    severity,
    exposureMinor: rule === "same_number_diff_total" ? Math.min(prior.totalMinor, target.totalMinor) : target.totalMinor,
    currency: target.currency,
    summary: `Invoice ${target.invoiceNumber} looks like a duplicate of ${prior.invoiceNumber}: ${reason}.`,
    evidence: {
      rule,
      otherMatches: matches.length - 1,
      duplicateInvoice: { id: target.id, number: target.invoiceNumber, date: target.invoiceDate, totalMinor: target.totalMinor },
      originalInvoice: { id: prior.id, number: prior.invoiceNumber, date: prior.invoiceDate, totalMinor: prior.totalMinor, status: prior.status },
    },
  }];
}
