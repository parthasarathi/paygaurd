import type { AgentBriefing, AgentReply, Block } from "./types";
import { parseIntent } from "./intents";
import { firstName, loadInvoices, loadOpenFlags, loadSavings, type FlagRow, type InvoiceRow } from "./queries";

const CAPS = "payable invoices, blocked invoices, open flags, savings and fees, missing documents, duplicates, rate drift, or a specific vendor or invoice number";

export function money(minor: number, currency = "INR"): string {
  const v = minor / 100;
  const whole = Number.isInteger(v) ? 0 : 2;
  if (currency === "INR") return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: whole, maximumFractionDigits: 2 })}`;
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: whole, maximumFractionDigits: 2 })}`;
}
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cur = (xs: { currency: string }[]) => xs[0]?.currency ?? "INR";
const text = (t: string): Block => ({ type: "text", text: t });

const invBlock = (items: InvoiceRow[]): Block => ({
  type: "invoices",
  items: items.slice(0, 20).map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, vendorName: i.vendorName, totalMinor: i.totalMinor, currency: i.currency, status: i.status, canPay: i.canPay, openFlags: i.openFlags, missingDocs: i.missingDocs })),
});
const flagBlock = (items: FlagRow[], n = 20): Block => ({
  type: "flags",
  items: items.slice(0, n).map((f) => ({ id: f.id, type: f.type, severity: f.severity, status: f.status, summary: f.summary, exposureMinor: f.exposureMinor, currency: f.currency, invoiceNumber: f.invoiceNumber, vendorName: f.vendorName })),
});

const isOpenInvoice = (i: InvoiceRow) => i.status !== "paid" && i.status !== "rejected";

export async function briefing(orgId: string, userId: string): Promise<AgentBriefing> {
  const [name, invoices, flags, sv] = await Promise.all([firstName(userId), loadInvoices(orgId), loadOpenFlags(orgId), loadSavings(orgId)]);
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const currency = flags[0]?.currency ?? invoices[0]?.currency ?? sv.currency;
  const atRisk = sumBy(flags, (f) => f.exposureMinor);
  const ready = invoices.filter((i) => i.canPay);
  const blocked = invoices.filter((i) => isOpenInvoice(i) && i.openFlags > 0);
  const missing = invoices.filter((i) => isOpenInvoice(i) && i.missingDocs.length);

  const parts: string[] = [];
  if (blocked.length) parts.push(`${plural(blocked.length, "invoice")} ${blocked.length === 1 ? "is" : "are"} blocked by open flags worth ${money(sumBy(blocked, (i) => flags.filter((f) => f.invoiceNumber === i.invoiceNumber && f.vendorName === i.vendorName).reduce((a, f) => a + f.exposureMinor, 0)), currency)}`);
  const noPo = missing.find((i) => i.missingDocs.some((d) => d.startsWith("PO")));
  if (noPo) parts.push(`${noPo.invoiceNumber} is missing its PO`);
  else if (missing.length) parts.push(`${noPoText(missing[0])}`);
  if (ready.length) parts.push(`${plural(ready.length, "invoice")} ${ready.length === 1 ? "is" : "are"} ready to pay`);
  const summary = parts.length ? parts.join("; ") + "." : "Nothing needs your attention right now.";

  return {
    greeting: `Good ${part}${name ? `, ${name}` : ""}`,
    blocks: [
      { type: "stats", items: [
        { label: "At risk now", value: money(atRisk, currency), hint: plural(flags.length, "open flag"), tone: atRisk > 0 ? "bad" : "good" },
        { label: "Verified savings", value: money(sv.avoidedMinor + sv.recoveredMinor, sv.currency), tone: "good" },
        { label: "Fee owed", value: money(sv.feeMinor, sv.currency), tone: "neutral" },
        { label: "Ready to pay", value: String(ready.length), hint: ready.length ? money(sumBy(ready, (i) => i.payableMinor), cur(ready)) : undefined, tone: ready.length ? "good" : "neutral" },
      ] },
      text(summary),
      ...(flags.length ? [flagBlock(flags, 3)] : []),
    ],
    suggestions: ["What should I pay today?", "Show open flags", "Which files are missing?"],
    steps: [`Checked ${plural(invoices.length, "invoice")}`, `Checked ${plural(flags.length, "open flag")}`],
    localOnly: true,
  };
}
const noPoText = (i: InvoiceRow) => `${i.invoiceNumber} is missing ${i.missingDocs.join(" and ")}`;

export async function reply(orgId: string, message: string): Promise<AgentReply> {
  const p = parseIntent(message);
  const [invoicesAll, flagsAll] = await Promise.all([loadInvoices(orgId), loadOpenFlags(orgId)]);
  const steps = [`Checked ${plural(invoicesAll.length, "invoice")}`];
  const done = (blocks: Block[], suggestions: string[], extra: string[] = []): AgentReply => ({ blocks, suggestions: suggestions.slice(0, 3), steps: [...steps, ...extra], localOnly: true });

  if (p.intent === "help") {
    return done([text(`I answer from your invoice data, with no AI calls. Ask me about ${CAPS}. I only read data, so I never pay or resolve anything.`)],
      ["What should I pay today?", "Show open flags", "How much have we saved?"]);
  }
  if (p.intent === "unknown") {
    return done([text(`I didn't catch that. I can answer questions about ${CAPS}.`)], ["What should I pay today?", "Show open flags", "Which files are missing?"]);
  }

  const vq = p.vendor?.toLowerCase();
  const iq = p.invoiceNumber?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const invMatch = (i: { invoiceNumber: string; vendorName: string }) =>
    (!vq || i.vendorName.toLowerCase().includes(vq)) && (!iq || i.invoiceNumber.toLowerCase().replace(/[^a-z0-9]/g, "").includes(iq));
  const invoices = invoicesAll.filter(invMatch);
  const scopeLabel = p.invoiceNumber ? ` for ${p.invoiceNumber}` : p.vendor ? ` for ${p.vendor}` : "";
  if ((p.vendor || p.invoiceNumber) && !invoices.length && p.intent !== "savings") {
    return done([text(`I couldn't find ${p.invoiceNumber ? `invoice ${p.invoiceNumber}` : `a vendor matching "${p.vendor}"`}.`)], ["Show open flags", "What should I pay today?", "Which files are missing?"]);
  }
  const scopedFlags = (types?: string[]) => flagsAll.filter((f) => invMatch(f) && (!types || types.includes(f.type)));
  const flagsLink = (fs: FlagRow[]): Block => fs.length === 1 ? { type: "link", label: "Open this flag", to: `/flags/${fs[0].id}` } : { type: "link", label: "Review all flags", to: "/flags" };
  const invLink: Block = { type: "link", label: "Open invoices", to: "/invoices" };

  switch (p.intent) {
    case "pay": {
      const ready = invoices.filter((i) => i.canPay);
      if (!ready.length) return done([text(`Nothing is ready to pay${scopeLabel} right now. Check what's blocking invoices.`), invLink], ["Which invoices are blocked?", "Show open flags", "Which files are missing?"]);
      const total = sumBy(ready, (i) => i.payableMinor);
      return done([text(`${plural(ready.length, "invoice")} ${ready.length === 1 ? "is" : "are"} ready to pay${scopeLabel}, ${money(total, cur(ready))} in total.`), invBlock(ready), invLink],
        ["Which invoices are blocked?", "Show open flags", "How much have we saved?"], [`Found ${ready.length} payable`]);
    }
    case "blocked": {
      const blocked = invoices.filter((i) => isOpenInvoice(i) && !i.canPay);
      if (!blocked.length) return done([text(`No invoices${scopeLabel} are blocked.`)], ["What should I pay today?", "Show open flags", "Which files are missing?"]);
      const why = blocked.slice(0, 5).map((i) => `${i.invoiceNumber} (${i.vendorName}): ${i.reasons.join("; ")}`).join("\n");
      return done([text(`${plural(blocked.length, "invoice")} can't be paid yet${scopeLabel}:\n${why}`), invBlock(blocked), invLink],
        ["Show open flags", "Which files are missing?", "What should I pay today?"], [`Found ${blocked.length} blocked`]);
    }
    case "flags": case "duplicates": case "rate_drift": {
      const types = p.intent === "duplicates" ? ["duplicate_invoice"] : p.intent === "rate_drift" ? ["rate_drift"] : undefined;
      const label = p.intent === "duplicates" ? "duplicate invoice" : p.intent === "rate_drift" ? "rate drift" : "open";
      const fs = scopedFlags(types);
      if (!fs.length) return done([text(`No ${label} flags${scopeLabel}. Nothing to chase.`)], ["What should I pay today?", "How much have we saved?", "Which files are missing?"], [`Checked ${plural(flagsAll.length, "open flag")}`]);
      return done([text(`${plural(fs.length, label === "open" ? "open flag" : `${label} flag`)}${scopeLabel}, ${money(sumBy(fs, (f) => f.exposureMinor), cur(fs))} at risk.`), flagBlock(fs), flagsLink(fs)],
        ["Which invoices are blocked?", "What should I pay today?", p.intent === "duplicates" ? "Any rate drift?" : "Show duplicate invoices"], [`Checked ${plural(flagsAll.length, "open flag")}`]);
    }
    case "savings": {
      const sv = await loadSavings(orgId);
      return done([{ type: "stats", items: [
        { label: "Avoided", value: money(sv.avoidedMinor, sv.currency), hint: "Caught before payment", tone: "good" },
        { label: "Recovered", value: money(sv.recoveredMinor, sv.currency), hint: "Credits and refunds", tone: "good" },
        { label: "Fee owed", value: money(sv.feeMinor, sv.currency), tone: "neutral" },
      ] }], ["Show open flags", "What should I pay today?", "Which invoices are blocked?"], ["Checked savings ledger"]);
    }
    case "missing": {
      const m = invoices.filter((i) => isOpenInvoice(i) && i.missingDocs.length);
      if (!m.length) return done([text(`No invoices${scopeLabel} are missing documents.`)], ["What should I pay today?", "Show open flags", "How much have we saved?"]);
      const list = m.slice(0, 5).map((i) => `${i.invoiceNumber} (${i.vendorName}): ${i.missingDocs.join(", ")}`).join("\n");
      return done([text(`${plural(m.length, "invoice")} ${m.length === 1 ? "has" : "have"} missing documents${scopeLabel}:\n${list}`), invBlock(m), invLink],
        ["Which invoices are blocked?", "What should I pay today?", "Show open flags"], [`Found ${m.length} with missing documents`]);
    }
    default: { // invoice or vendor lookup
      const fs = scopedFlags();
      const blocks: Block[] = [text(`${plural(invoices.length, "invoice")}${scopeLabel}, ${plural(fs.length, "open flag")}.`), invBlock(invoices)];
      if (fs.length) blocks.push(flagBlock(fs), flagsLink(fs));
      else blocks.push(invLink);
      return done(blocks, ["What should I pay today?", "Which files are missing?", "Show open flags"], [`Checked ${plural(fs.length, "open flag")}`]);
    }
  }
}
