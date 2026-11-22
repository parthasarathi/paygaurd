import { describe, expect, it } from "vitest";
import { runDetectors, normalizeInvoiceNumber, normalizeKey } from "./index";
import type { InvoiceRec, LineRec, RateRec } from "./types";

const line = (o: Partial<LineRec> & { description: string; unitPriceMinor: number; quantity: number }, n: number): LineRec => ({
  id: `l${n}`, lineNo: n, sku: null, descriptionKey: normalizeKey(o.description), unit: "each",
  amountMinor: o.unitPriceMinor * o.quantity, serviceDate: null, page: 1, ...o,
});

const inv = (id: string, number: string, date: string, lines: LineRec[], extra: Partial<InvoiceRec> = {}): InvoiceRec => ({
  id, vendorId: "v1", invoiceNumber: number, invoiceNumberKey: normalizeInvoiceNumber(number), invoiceDate: date,
  createdAt: `${date}T00:00:00Z`, currency: "INR", totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0), status: "received", lines, ...extra,
});

const rate = (description: string, unitPriceMinor: number, extra: Partial<RateRec> = {}): RateRec => ({
  id: `r-${description}`, clauseId: "c2", clauseRef: "2 (line 1)", clausePage: 1, clauseText: "Commercial schedule",
  sku: null, descriptionKey: normalizeKey(description), description, unit: "each", unitPriceMinor, currency: "INR",
  effectiveFrom: "2026-11-01", effectiveTo: "2027-10-31", toleranceBps: 0, ...extra,
});

const rates = [rate("Business laptop", 5_000_000), rate("27-inch IPS monitor", 1_200_000), rate("USB-C docking station", 800_000)];
const sampleLines = () => [
  line({ description: "Business laptop", unitPriceMinor: 5_200_000, quantity: 10 }, 1),
  line({ description: "27-inch IPS monitor", unitPriceMinor: 1_200_000, quantity: 4 }, 2),
  line({ description: "USB-C docking station", unitPriceMinor: 800_000, quantity: 2 }, 3),
];

describe("rate drift (sample INV-2026-119)", () => {
  it("flags only the laptop line, exposure = 2000 INR x 10", () => {
    const flags = runDetectors(inv("i1", "INV-2026-119", "2026-11-27", sampleLines()), [], rates);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "rate_drift", invoiceLineId: "l1", exposureMinor: 2_000_000, severity: "medium" });
    expect((flags[0].evidence as any).clause.ref).toBe("2 (line 1)");
  });
  it("respects tolerance, effective dates, and ignores under-billing", () => {
    const l = [line({ description: "Business laptop", unitPriceMinor: 5_200_000, quantity: 1 }, 1)];
    expect(runDetectors(inv("i", "A1", "2026-11-27", l), [], [rate("Business laptop", 5_000_000, { toleranceBps: 500 })])).toHaveLength(0);
    expect(runDetectors(inv("i", "A1", "2026-12-01", l), [], [rate("Business laptop", 5_000_000, { effectiveTo: "2026-11-30" })])).toHaveLength(0);
    const cheap = [line({ description: "Business laptop", unitPriceMinor: 4_000_000, quantity: 1 }, 1)];
    expect(runDetectors(inv("i", "A1", "2026-11-27", cheap), [], rates)).toHaveLength(0);
  });
  it("does not compare lines with a different unit", () => {
    const l = [line({ description: "Business laptop", unitPriceMinor: 9_000_000, quantity: 1, unit: "box" }, 1)];
    expect(runDetectors(inv("i", "A1", "2026-11-27", l), [], rates)).toHaveLength(0);
  });
});

describe("duplicate invoices", () => {
  const original = inv("i1", "INV-2026-119", "2026-11-27", sampleLines());
  it("flags a resubmission with a reformatted number as high severity", () => {
    const flags = runDetectors(inv("i2", "inv 2026 119", "2026-11-28", sampleLines()), [original], []);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "duplicate_invoice", severity: "high", exposureMinor: original.totalMinor });
    expect((flags[0].evidence as any).rule).toBe("same_number_same_total");
  });
  it("flags identical lines under a new number, within 90 days only", () => {
    expect(runDetectors(inv("i2", "INV-2026-120", "2026-12-05", sampleLines()), [original], [])[0].evidence).toMatchObject({ rule: "same_lines_same_total" });
    expect(runDetectors(inv("i2", "INV-2026-121", "2027-06-05", sampleLines()), [original], [])).toHaveLength(0);
  });
  it("raises a single flag against the earliest original when several copies exist", () => {
    const second = inv("i2", "INV-2026-119", "2026-11-28", sampleLines());
    const flags = runDetectors(inv("i3", "INV-2026-119", "2026-11-29", sampleLines()), [original, second], []);
    expect(flags).toHaveLength(1);
    expect(flags[0].fingerprint).toBe("dup:i3");
    expect((flags[0].evidence as any).originalInvoice.id).toBe("i1");
    expect(flags[0].exposureMinor).toBe(original.totalMinor);
  });
  it("flags only the later invoice, never the original", () => {
    expect(runDetectors(original, [inv("i2", "INV-2026-119", "2026-11-28", sampleLines())], [])).toHaveLength(0);
  });
  it("ignores other vendors and different totals under different numbers", () => {
    expect(runDetectors(inv("i2", "INV-2026-119", "2026-11-28", sampleLines(), { vendorId: "v2" }), [original], [])).toHaveLength(0);
    const other = [line({ description: "Cable", unitPriceMinor: 100, quantity: 1 }, 1)];
    expect(runDetectors(inv("i2", "INV-7", "2026-11-28", other), [original], [])).toHaveLength(0);
  });
});

describe("normalizers", () => {
  it("treats INV-0042 and inv 42 alike", () => expect(normalizeInvoiceNumber("INV-0042")).toBe(normalizeInvoiceNumber("inv 42")));
});
