import { describe, expect, it } from "vitest";
import { evaluatePayability } from "./payability";

const base = { status: "received", openFlags: 0, totalMinor: 1_000_000, deductionMinor: 0, hasContract: true };

describe("evaluatePayability", () => {
  it("allows a clean invoice at full value", () => {
    expect(evaluatePayability(base)).toMatchObject({ canPay: true, payableMinor: 1_000_000, reasons: [] });
  });
  it("blocks while flags are open", () => {
    const r = evaluatePayability({ ...base, status: "on_hold", openFlags: 2 });
    expect(r.canPay).toBe(false);
    expect(r.reasons[0]).toContain("2 open flags");
  });
  it("pays total minus verified savings once flags are resolved", () => {
    expect(evaluatePayability({ ...base, status: "on_hold", deductionMinor: 200_000 })).toMatchObject({ canPay: true, payableMinor: 800_000 });
  });
  it("blocks paid, rejected and fully-deducted invoices", () => {
    expect(evaluatePayability({ ...base, status: "paid" }).canPay).toBe(false);
    expect(evaluatePayability({ ...base, status: "rejected" }).canPay).toBe(false);
    expect(evaluatePayability({ ...base, deductionMinor: 1_000_000 }).canPay).toBe(false);
  });
  it("warns, but does not block, when no contract matched", () => {
    expect(evaluatePayability({ ...base, hasContract: false })).toMatchObject({ canPay: true, warnings: [expect.stringContaining("No contract")] });
  });
});
