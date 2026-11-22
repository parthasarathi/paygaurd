export type Intent = "pay" | "blocked" | "flags" | "savings" | "missing" | "duplicates" | "rate_drift" | "invoice" | "vendor" | "help" | "unknown";

export interface ParsedIntent {
  intent: Intent;
  vendor?: string;
  invoiceNumber?: string;
}

const INVOICE_RE = /\b(inv[-_/ ]?[a-z0-9][a-z0-9\-_/]*\d[a-z0-9\-_/]*)\b/i;
const VENDOR_RE = /\bvendor\s+(?:named\s+|called\s+)?["']?([a-z0-9][\w&.,' -]*?)["']?\s*(?:\?|\.|!|$)/i;
const VENDOR_FOR_RE = /\b(?:from|by)\s+["']?([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)["']?\s*(?:\?|\.|!|$)/;

/** Rule-based intent detection: pure, no network, no LLM. */
export function parseIntent(message: string): ParsedIntent {
  const m = message.trim();
  const t = m.toLowerCase();
  const inv = m.match(INVOICE_RE);
  const invoiceNumber = inv ? inv[1].replace(/[.,;:!?]+$/, "").toUpperCase() : undefined;
  const vendorMatch = m.match(VENDOR_RE) ?? m.match(VENDOR_FOR_RE);
  const vendor = vendorMatch ? vendorMatch[1].trim() : undefined;
  const scope = { ...(vendor ? { vendor } : {}), ...(invoiceNumber ? { invoiceNumber } : {}) };

  if (/\b(help|what can you do|what do you do|capabilities|how do (i|you) use)\b/.test(t)) return { intent: "help" };
  if (/\bduplicates?\b|\bduplicated\b|\bdouble[- ]?billed?\b/.test(t)) return { intent: "duplicates", ...scope };
  if (/\brate drift\b|\bdrift\b|\bprice\b|\bprices\b|\bpricing\b|\bwrong rate\b/.test(t)) return { intent: "rate_drift", ...scope };
  if (/\b(blocked|block|can'?t pay|cannot pay|can not pay|not payable|why (can'?t|cant|isn'?t))\b/.test(t)) return { intent: "blocked", ...scope };
  if (/\b(missing|files?|documents?|docs?|po|pos|purchase orders?|contracts?)\b/.test(t)) return { intent: "missing", ...scope };
  if (/\b(pay|payable|paying|ready to pay|payment|due)\b/.test(t)) return { intent: "pay", ...scope };
  if (/\b(savings?|saved|saving|fees?|recovered|recovery|avoided)\b/.test(t)) return { intent: "savings" };
  if (/\b(flags?|problems?|overbill\w*|issues?|overcharg\w*|exposure|at risk|risk)\b/.test(t)) return { intent: "flags", ...scope };
  if (invoiceNumber) return { intent: "invoice", invoiceNumber, ...(vendor ? { vendor } : {}) };
  if (vendor) return { intent: "vendor", vendor };
  return { intent: "unknown" };
}
