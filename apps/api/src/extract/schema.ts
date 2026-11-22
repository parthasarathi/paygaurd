import { z } from "zod";

const money = z.number().describe("Amount in major currency units, e.g. 52000.00");
const date = z.string().nullable().describe("ISO date YYYY-MM-DD or null");

export const extractionSchema = z.object({
  kind: z.enum(["contract", "invoice", "purchase_order", "other"]),
  vendorName: z.string().describe("The supplier / seller name"),
  currency: z.string().describe("ISO 4217 code, e.g. INR"),
  contract: z.object({
    contractNumber: z.string(),
    title: z.string(),
    effectiveFrom: date,
    effectiveTo: date,
    paymentTermsDays: z.number().nullable(),
    clauses: z.array(z.object({ ref: z.string(), page: z.number().nullable(), text: z.string() })),
    rates: z.array(z.object({
      description: z.string(), sku: z.string().nullable(), unit: z.string(), unitPrice: money,
      clauseRef: z.string().describe("ref of the clause/schedule line this rate comes from"),
    })),
  }).nullable(),
  purchaseOrder: z.object({
    poNumber: z.string(),
    contractNumber: z.string().nullable().describe("Contract the PO is issued against, if cited"),
    orderDate: date,
    total: money,
  }).nullable(),
  invoice: z.object({
    invoiceNumber: z.string(),
    invoiceDate: z.string(),
    dueDate: date,
    poNumber: z.string().nullable(),
    contractNumber: z.string().nullable(),
    subtotal: money, tax: money, total: money,
    lines: z.array(z.object({
      description: z.string(), sku: z.string().nullable(), quantity: z.number(), unit: z.string(),
      unitPrice: money, amount: money, serviceDate: date, page: z.number().nullable(),
    })),
  }).nullable(),
});
export type Extraction = z.infer<typeof extractionSchema>;
