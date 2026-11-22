export interface LineRec {
  id: string;
  lineNo: number;
  sku: string | null;
  description: string;
  descriptionKey: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  amountMinor: number;
  serviceDate: string | null;
  page: number | null;
}

export interface InvoiceRec {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceNumberKey: string;
  invoiceDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp, tie-breaker for ordering
  currency: string;
  totalMinor: number;
  status: string;
  lines: LineRec[];
}

export interface RateRec {
  id: string;
  clauseId: string | null;
  clauseRef: string | null;
  clausePage: number | null;
  clauseText: string | null;
  sku: string | null;
  descriptionKey: string;
  description: string;
  unit: string;
  unitPriceMinor: number;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  toleranceBps: number;
}

export interface DetectedFlag {
  type: "duplicate_invoice" | "rate_drift";
  invoiceId: string;
  invoiceLineId: string | null;
  fingerprint: string;
  severity: "low" | "medium" | "high";
  exposureMinor: number;
  currency: string;
  summary: string;
  evidence: Record<string, unknown>;
}
