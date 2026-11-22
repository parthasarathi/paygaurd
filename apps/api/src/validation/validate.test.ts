import { describe, expect, it } from "vitest";
import { normalizeInvoiceNumber, normalizeKey, type InvoiceRec, type RateRec } from "../detect";
import { validateCore, type CoreInput } from "./validate";
import type { ValidateRequest } from "./types";

const req = (o: Partial<ValidateRequest> = {}): ValidateRequest => ({
  vendor: "Acme", invoiceNumber: "INV-1", invoiceDate: "2026-11-10", currency: "INR",
  lines: [{ description: "Widget", quantity: 10, unitPrice: 100 }], ...o,
});
const rate = (price: number): RateRec => ({
  id: "r1", clauseId: "c1", clauseRef: "2", clausePage: 3, clauseText: "Widgets at contract price", sku: null,
  descriptionKey: normalizeKey("Widget"), description: "Widget", unit: "each", unitPriceMinor: price, currency: "INR",
  effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", toleranceBps: 0,
});
const past = (number: string, totalMinor: number): InvoiceRec => ({
  id: "h1", vendorId: "v1", invoiceNumber: number, invoiceNumberKey: normalizeInvoiceNumber(number), invoiceDate: "2026-11-01",
  createdAt: "2026-11-01T00:00:00Z", currency: "INR", totalMinor, status: "received",
  lines: [{ id: "hl", lineNo: 1, sku: null, description: "Widget", descriptionKey: normalizeKey("Widget"), quantity: 10, unit: "each", unitPriceMinor: 10000, amountMinor: 100000, serviceDate: null, page: 1 }],
});
const base = (o: Partial<CoreInput> = {}): CoreInput => ({ req: req(), vendorKnown: true, vendorId: "v1", history: [], rates: [], ...o });

describe("validateCore", () => {
  it("approves a clean invoice and converts to totals", () => {
    const r = validateCore(base()).response;
    expect(r.verdict).toBe("approve");
    expect(r.canPay).toBe(true);
    expect(r.total).toBe(1000);
  });
  it("unknown vendor => review", () => {
    const r = validateCore(base({ vendorKnown: false })).response;
    expect(r.verdict).toBe("review");
    expect(r.findings[0].type).toBe("unknown_vendor");
  });
  it("blocks a duplicate invoice", () => {
    const r = validateCore(base({ history: [past("INV-1", 100000)] })).response;
    expect(r.verdict).toBe("block");
    expect(r.findings.some((f) => f.type === "duplicate_invoice")).toBe(true);
  });
  it("blocks rate drift with exposure in major units and clause", () => {
    const r = validateCore(base({ rates: [rate(9000)] })).response;
    const f = r.findings.find((x) => x.type === "rate_drift")!;
    expect(r.verdict).toBe("block");
    expect(f.exposure).toBe(100);
    expect(f.clause?.ref).toBe("2");
  });
  it("approves when billed at contract rate", () => {
    expect(validateCore(base({ rates: [rate(10000)] })).response.verdict).toBe("approve");
  });
  it("missing contract and PO => review with missingDocs", () => {
    const r = validateCore(base({ req: req({ contractNumber: "C-9", poNumber: "PO-7" }), contractFound: false, poFound: false })).response;
    expect(r.verdict).toBe("review");
    expect(r.missingDocs).toHaveLength(2);
  });
  it("rates exist but none match => no_contract_rates, review", () => {
    const r = validateCore(base({ rates: [{ ...rate(10000), descriptionKey: "other", description: "Other" }] })).response;
    expect(r.verdict).toBe("review");
    expect(r.findings[0].type).toBe("no_contract_rates");
  });
  it("explicit total overrides line sum", () => {
    expect(validateCore(base({ req: req({ total: 1180 }) })).response.total).toBe(1180);
  });
});
