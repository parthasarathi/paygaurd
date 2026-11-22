// Contract for the validation layer. Keep identical to api/src/validation/types.ts.
// All amounts here are in MAJOR currency units (rupees, not paise), as a caller's ERP would send them.

export interface ValidateLine {
  description: string;
  sku?: string;
  quantity: number;
  unit?: string; // default "each"
  unitPrice: number;
  amount?: number; // default quantity * unitPrice
}

export interface ValidateRequest {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  currency?: string; // default "INR"
  poNumber?: string;
  contractNumber?: string;
  lines: ValidateLine[];
  total?: number; // default sum of line amounts
  persist?: boolean; // default false: a dry run that stores nothing and raises no flags
}

// approve: safe to pay. review: a human should look (warnings only). block: do not pay (duplicate or overbilling found).
export type Verdict = "approve" | "review" | "block";

export interface Finding {
  type: "duplicate_invoice" | "rate_drift" | "missing_document" | "unknown_vendor" | "no_contract_rates";
  severity: "low" | "medium" | "high";
  message: string;
  exposure: number; // money at risk, major units (0 for warnings)
  clause?: { ref: string | null; page: number | null; text: string | null } | null;
  evidence?: Record<string, unknown>;
}

export interface ValidateResponse {
  verdict: Verdict;
  canPay: boolean; // true only when verdict is "approve"
  total: number;
  currency: string;
  findings: Finding[];
  missingDocs: string[];
  dryRun: boolean;
  invoiceId?: string; // present when persist was true
  checkedAt: string; // ISO timestamp
  localOnly: true; // deterministic rules only; no LLM is called
}

export const WEBHOOK_EVENTS = ["document.processed", "document.failed", "flag.created", "flag.resolved", "invoice.payable", "webhook.test"] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

// Every webhook POST body: { event, data, sentAt, id }. Signed: x-payguard-signature: sha256=HMAC(secret, rawBody).
export interface WebhookPayload<T = Record<string, unknown>> { id: string; event: WebhookEventName; sentAt: string; data: T }
