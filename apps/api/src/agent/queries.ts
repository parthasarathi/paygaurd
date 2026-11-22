import { sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { evaluatePayability } from "../services/payability";

export interface InvoiceRow {
  id: string; invoiceNumber: string; vendorName: string; totalMinor: number; currency: string; status: string;
  canPay: boolean; payableMinor: number; openFlags: number; missingDocs: string[]; reasons: string[];
}
export interface FlagRow {
  id: string; type: string; severity: string; status: string; summary: string; exposureMinor: number; currency: string;
  invoiceNumber: string; vendorName: string;
}

export async function firstName(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.name?.trim().split(/\s+/)[0] || null;
}

export async function loadInvoices(orgId: string): Promise<InvoiceRow[]> {
  const rows = (await db.execute(sql`
    select i.id, i.invoice_number as "invoiceNumber", i.total_minor as "totalMinor", i.currency, i.status,
           i.po_number as "poNumber", i.contract_number as "contractNumber", v.name as "vendorName",
           ct.id as "contractId", po.id as "poId",
           (select count(*)::int from flags f where f.invoice_id = i.id and f.status not in ('resolved','dismissed')) as "openFlags",
           (select coalesce(sum(s.amount_minor),0)::bigint from savings s join flags f on f.id = s.flag_id
              where f.invoice_id = i.id and not s.reversed and s.kind = 'avoided') as deduction
    from invoices i
    join vendors v on v.id = i.vendor_id
    left join lateral (select c2.id from contracts c2 where c2.org_id = i.org_id and c2.vendor_id = i.vendor_id
                       and (i.contract_number is null or lower(c2.contract_number) = lower(i.contract_number)) order by c2.created_at desc limit 1) ct on true
    left join lateral (select p2.id from purchase_orders p2 where p2.org_id = i.org_id and p2.vendor_id = i.vendor_id
                       and i.po_number is not null and lower(p2.po_number) = lower(i.po_number) order by p2.created_at desc limit 1) po on true
    where i.org_id = ${orgId} order by i.invoice_date desc, i.created_at desc`)).rows as any[];
  return rows.map((r) => {
    const missingDocs: string[] = [];
    if (!r.contractId) missingDocs.push(r.contractNumber ? `Contract ${r.contractNumber}` : "Contract");
    if (!r.poId) missingDocs.push(r.poNumber ? `PO ${r.poNumber}` : "PO");
    const pay = evaluatePayability({ status: r.status, openFlags: r.openFlags, totalMinor: Number(r.totalMinor), deductionMinor: Number(r.deduction), hasContract: !!r.contractId, missingDocs });
    return {
      id: r.id, invoiceNumber: r.invoiceNumber, vendorName: r.vendorName, totalMinor: Number(r.totalMinor), currency: r.currency, status: r.status,
      canPay: pay.canPay, payableMinor: pay.payableMinor, openFlags: r.openFlags, missingDocs, reasons: pay.reasons,
    };
  });
}

export async function loadOpenFlags(orgId: string): Promise<FlagRow[]> {
  const rows = (await db.execute(sql`
    select f.id, f.type, f.severity, f.status, f.summary, f.exposure_minor as "exposureMinor", f.currency,
           i.invoice_number as "invoiceNumber", v.name as "vendorName"
    from flags f join invoices i on i.id = f.invoice_id join vendors v on v.id = i.vendor_id
    where f.org_id = ${orgId} and f.status not in ('resolved','dismissed')
    order by f.exposure_minor desc`)).rows as any[];
  return rows.map((r) => ({ ...r, exposureMinor: Number(r.exposureMinor) }));
}

export async function loadSavings(orgId: string) {
  const [sv] = (await db.execute(sql`select coalesce(sum(amount_minor) filter (where kind='avoided'),0)::bigint as avoided,
    coalesce(sum(amount_minor) filter (where kind='recovered'),0)::bigint as recovered,
    coalesce(sum(fee_minor),0)::bigint as fee, max(currency) as currency
    from savings where org_id = ${orgId} and not reversed`)).rows as any[];
  return { avoidedMinor: Number(sv.avoided), recoveredMinor: Number(sv.recovered), feeMinor: Number(sv.fee), currency: (sv.currency as string) || "INR" };
}
