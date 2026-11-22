export interface PayabilityInput {
  status: string;
  openFlags: number;
  totalMinor: number;
  // Savings already verified on this invoice (price corrected, credit applied); these are not owed to the vendor.
  deductionMinor: number;
  hasContract: boolean;
  missingDocs?: string[];
}

export interface Payability {
  canPay: boolean;
  payableMinor: number;
  reasons: string[];
  warnings: string[];
}

/** Single source of truth for whether an invoice may be paid, used by both the list and the pay endpoint. */
export function evaluatePayability(i: PayabilityInput): Payability {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const payableMinor = Math.max(0, i.totalMinor - i.deductionMinor);

  if (i.status === "paid") reasons.push("Already paid");
  else if (i.status === "rejected") reasons.push("Invoice was rejected");
  else {
    if (i.openFlags > 0) reasons.push(`${i.openFlags} open flag${i.openFlags === 1 ? "" : "s"} must be resolved or dismissed`);
    if (i.openFlags === 0 && payableMinor === 0) reasons.push("Nothing left to pay after verified savings");
  }
  if (i.missingDocs?.length) warnings.push(`Missing supporting documents: ${i.missingDocs.join(", ")}`);
  else if (!i.hasContract) warnings.push("No contract matched, so rates were not verified");
  return { canPay: reasons.length === 0, payableMinor, reasons, warnings };
}
