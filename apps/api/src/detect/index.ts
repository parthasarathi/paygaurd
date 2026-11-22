import { detectDuplicates } from "./duplicates";
import { detectRateDrift } from "./rateDrift";
import type { DetectedFlag, InvoiceRec, RateRec } from "./types";

export function runDetectors(invoice: InvoiceRec, history: InvoiceRec[], rates: RateRec[]): DetectedFlag[] {
  return [...detectDuplicates(invoice, history), ...detectRateDrift(invoice, rates)];
}
export * from "./types";
export * from "./normalize";
