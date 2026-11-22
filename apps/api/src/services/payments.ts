import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { HttpError } from "./flags";
import { evaluatePayability, type Payability } from "./payability";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function load(tx: Tx | typeof db, orgId: string, invoiceId: string) {
  const [inv] = await tx.select().from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.orgId, orgId)));
  if (!inv) throw new HttpError(404, "invoice not found");
  const [row] = (await tx.execute(sql`
    select (select count(*)::int from flags where invoice_id = ${invoiceId} and status not in ('resolved','dismissed')) as "openFlags",
           (select coalesce(sum(s.amount_minor),0)::bigint from savings s join flags f on f.id = s.flag_id
              where f.invoice_id = ${invoiceId} and not s.reversed and s.kind = 'avoided') as deduction`)).rows as any[];
  const p = evaluatePayability({ status: inv.status, openFlags: row.openFlags, totalMinor: inv.totalMinor, deductionMinor: Number(row.deduction), hasContract: !!inv.contractId });
  return { inv, payability: p };
}

export async function payInvoice(orgId: string, invoiceId: string, actorId: string, input: { paidOn?: string; reference?: string }) {
  // Re-evaluated inside the transaction so a flag raised moments ago cannot be paid past.
  return db.transaction(async (tx) => {
    const { inv, payability } = await load(tx, orgId, invoiceId);
    if (!payability.canPay) throw new HttpError(409, `Cannot pay: ${payability.reasons.join("; ")}`);
    const paidOn = input.paidOn ?? new Date().toISOString().slice(0, 10);
    const [payment] = await tx.insert(schema.payments).values({
      orgId, vendorId: inv.vendorId, invoiceId, amountMinor: payability.payableMinor, currency: inv.currency, paidOn, reference: input.reference ?? null,
    }).returning();
    await tx.update(schema.invoices).set({ status: "paid", paidAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
    return { payment, payability: { ...payability, canPay: false } as Payability, actorId };
  });
}
