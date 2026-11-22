import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { emitEvent } from "./hooks";

export type Action =
  | { action: "assign"; assigneeId: string | null }
  | { action: "comment"; note: string }
  | { action: "dispute"; note?: string }
  | { action: "credit_note_received"; creditNoteRef: string; amountMinor: number; note?: string }
  | { action: "resolve"; resolution: "price_corrected" | "invoice_rejected" | "refund" | "credit_note"; amountMinor?: number; evidenceRef?: string; note?: string }
  | { action: "dismiss"; note?: string }
  | { action: "reopen" };

const CLOSED = new Set(["resolved", "dismissed"]);

export async function applyAction(orgId: string, flagId: string, actorId: string, a: Action) {
  const [flag] = await db.select().from(schema.flags).where(and(eq(schema.flags.id, flagId), eq(schema.flags.orgId, orgId)));
  if (!flag) throw new HttpError(404, "flag not found");
  if (CLOSED.has(flag.status) && a.action !== "reopen" && a.action !== "comment") throw new HttpError(409, `flag is ${flag.status}`);

  const patch: Partial<typeof schema.flags.$inferInsert> = { updatedAt: new Date() };
  let type: string = a.action;
  let data: Record<string, unknown> = {};

  switch (a.action) {
    case "assign": patch.assigneeId = a.assigneeId; patch.status = a.assigneeId ? "assigned" : "open"; data = { assigneeId: a.assigneeId }; break;
    case "comment": data = { note: a.note }; break;
    case "dispute": patch.status = "disputed"; type = "disputed"; data = { note: a.note }; break;
    case "credit_note_received": patch.status = "credit_pending"; data = { creditNoteRef: a.creditNoteRef, amountMinor: a.amountMinor, note: a.note }; break;
    case "dismiss": patch.status = "dismissed"; patch.resolution = "no_issue"; data = { note: a.note }; break;
    case "reopen":
      patch.status = "open"; patch.resolution = null;
      await db.update(schema.savings).set({ reversed: true }).where(eq(schema.savings.flagId, flagId));
      break;
    case "resolve": {
      const amount = Math.min(a.amountMinor ?? flag.exposureMinor, flag.exposureMinor);
      const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, flag.invoiceId));
      const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
      // Caught before payment = avoided; credit/refund after payment = recovered.
      const kind = inv?.status === "paid" || a.resolution === "refund" ? "recovered" : "avoided";
      await db.insert(schema.savings).values({
        orgId, flagId, kind, amountMinor: amount, currency: flag.currency, feeShareBps: org.feeShareBps,
        feeMinor: Math.round((amount * org.feeShareBps) / 10_000), evidenceRef: a.evidenceRef ?? null, verifiedBy: actorId,
      });
      patch.status = "resolved"; patch.resolution = a.resolution; type = "resolved";
      data = { resolution: a.resolution, amountMinor: amount, kind, note: a.note, evidenceRef: a.evidenceRef };
      if (a.resolution === "invoice_rejected" && inv && inv.status !== "paid") await db.update(schema.invoices).set({ status: "rejected" }).where(eq(schema.invoices.id, inv.id));
      break;
    }
  }

  await db.update(schema.flags).set(patch).where(eq(schema.flags.id, flagId));
  await db.insert(schema.flagEvents).values({ flagId, actorId, type, data });
  if (a.action === "resolve") void emitEvent(orgId, "flag.resolved", { flagId, invoiceId: flag.invoiceId, ...data });
}

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 500, message: string) { super(message); }
}
