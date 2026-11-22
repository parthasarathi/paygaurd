import { describe, expect, it } from "vitest";
import { parseIntent } from "./intents";

describe("parseIntent", () => {
  it("detects pay intent", () => {
    expect(parseIntent("What should I pay today?").intent).toBe("pay");
    expect(parseIntent("which invoices are ready to pay").intent).toBe("pay");
  });
  it("detects blocked before pay", () => {
    expect(parseIntent("Which invoices are blocked?").intent).toBe("blocked");
    expect(parseIntent("why can't I pay this").intent).toBe("blocked");
  });
  it("detects open flags", () => {
    expect(parseIntent("Show open flags").intent).toBe("flags");
    expect(parseIntent("any overbilling?").intent).toBe("flags");
  });
  it("detects savings", () => {
    expect(parseIntent("how much have we saved and what is the fee").intent).toBe("savings");
  });
  it("detects missing documents", () => {
    expect(parseIntent("Which files are missing?").intent).toBe("missing");
    expect(parseIntent("which invoices have no PO").intent).toBe("missing");
  });
  it("detects duplicates and rate drift", () => {
    expect(parseIntent("show duplicate invoices").intent).toBe("duplicates");
    expect(parseIntent("any rate drift?").intent).toBe("rate_drift");
  });
  it("extracts invoice number and vendor", () => {
    expect(parseIntent("tell me about inv-2041")).toEqual({ intent: "invoice", invoiceNumber: "INV-2041" });
    expect(parseIntent("flags for vendor Acme Supplies")).toMatchObject({ intent: "flags", vendor: "Acme Supplies" });
    expect(parseIntent("vendor Acme Supplies")).toEqual({ intent: "vendor", vendor: "Acme Supplies" });
  });
  it("handles help and unknown", () => {
    expect(parseIntent("help").intent).toBe("help");
    expect(parseIntent("what can you do?").intent).toBe("help");
    expect(parseIntent("tell me a joke").intent).toBe("unknown");
  });
});
