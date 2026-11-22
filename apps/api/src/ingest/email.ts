import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { decrypt } from "../lib/crypto";
import { processDocument } from "../services/documents";

const running = new Set<string>();

/** Reads unseen mail, processes PDF attachments, then marks the message seen. Contracts go before invoices. */
export async function pollMailbox(orgId: string): Promise<{ messages: number; documents: number }> {
  if (running.has(orgId)) return { messages: 0, documents: 0 };
  running.add(orgId);
  const stats = { messages: 0, documents: 0 };
  let lastError: string | null = null;
  try {
    const [s] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
    if (!s?.imapHost || !s.imapUser || !s.imapPassEnc) throw new Error("Email is not configured");
    const client = new ImapFlow({
      host: s.imapHost, port: s.imapPort ?? 993, secure: (s.imapPort ?? 993) === 993, logger: false,
      auth: { user: s.imapUser, pass: decrypt(s.imapPassEnc) },
    });
    client.on("error", () => {});
    await client.connect();
    try {
      const lock = await client.getMailboxLock(s.imapFolder || "INBOX");
      try {
        const uids = (await client.search({ seen: false }, { uid: true })) || [];
        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const mail = await simpleParser(msg.source);
          const pdfs = mail.attachments.filter((a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"))
            .sort((a, b) => Number(/inv/i.test(a.filename ?? "")) - Number(/inv/i.test(b.filename ?? "")));
          const ref = `${mail.from?.text ?? "unknown"} — ${mail.subject ?? "(no subject)"}`;
          for (const a of pdfs) {
            try { await processDocument(orgId, a.content, a.filename ?? "attachment.pdf", "email", ref); stats.documents++; }
            catch (e) { console.warn(`email attachment failed (${a.filename}):`, (e as Error).message); }
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          stats.messages++;
        }
      } finally { lock.release(); }
    } finally { await client.logout().catch(() => {}); }
  } catch (e: any) {
    lastError = String(e?.message ?? e).slice(0, 300);
    throw e;
  } finally {
    running.delete(orgId);
    await db.update(schema.orgSettings).set({ imapLastPollAt: new Date(), imapLastError: lastError }).where(eq(schema.orgSettings.orgId, orgId));
  }
  return stats;
}

export function startEmailPoller() {
  setInterval(async () => {
    const rows = await db.select({ orgId: schema.orgSettings.orgId }).from(schema.orgSettings).where(eq(schema.orgSettings.imapEnabled, true)).catch(() => []);
    for (const r of rows) await pollMailbox(r.orgId).catch((e) => console.warn("imap poll failed:", e.message));
  }, 60_000);
}
