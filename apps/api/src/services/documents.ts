import { and, eq, isNotNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db, schema } from "../db/client";
import { extractFromPdf } from "../extract/llm";
import { HttpError } from "./flags";
import { ingestExtraction } from "./ingest";
import { resolveLlm } from "./settings";
import { notifyWebhook } from "./webhook";

export type Source = "upload" | "api" | "email" | "folder";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export interface ProcessResult {
  documentId: string;
  kind: string;
  invoiceId?: string;
  contractId?: string;
  flagsCreated?: number;
  flags?: { id: string; type: string; severity: string; summary: string; exposureMinor: number; currency: string }[];
}

const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

/** Single entry point for every source: store, extract with the LLM, ingest, run detectors, notify. */
export async function processDocument(orgId: string, buf: Buffer, filename: string, source: Source, sourceRef?: string): Promise<ProcessResult> {
  if (!isPdf(buf)) throw new HttpError(422, "Only PDF files are supported");
  if (buf.length > MAX_PDF_BYTES) throw new HttpError(422, "File too large (max 20 MB)");
  const sha256 = createHash("sha256").update(buf).digest("hex");
  // Identical file already extracted for this org: reuse it and skip the LLM.
  const [cached] = await db.select({ extraction: schema.documents.extraction }).from(schema.documents).where(and(
    eq(schema.documents.orgId, orgId), eq(schema.documents.sha256, sha256), eq(schema.documents.status, "extracted"), isNotNull(schema.documents.extraction),
  )).limit(1);
  const creds = cached ? null : await resolveLlm(orgId);
  if (!cached && !creds) throw new HttpError(422, "No LLM API key configured. Add one in Settings.");

  const dir = fileURLToPath(new URL("../../.data/uploads", import.meta.url));
  await mkdir(dir, { recursive: true });
  const storagePath = `${dir}/${sha256}.pdf`;
  await writeFile(storagePath, buf);

  const [doc] = await db.insert(schema.documents).values({
    orgId, kind: "unknown", filename, mimeType: "application/pdf", storagePath, sha256, source, sourceRef: sourceRef ?? null, status: "extracting", extractionCached: !!cached,
  }).returning();
  try {
    const x = cached ? (cached.extraction as Awaited<ReturnType<typeof extractFromPdf>>) : await extractFromPdf(buf, creds!);
    const r = await ingestExtraction(orgId, doc.id, x);
    await db.update(schema.documents).set({ status: "extracted", kind: x.kind, extraction: x }).where(eq(schema.documents.id, doc.id));

    const result: ProcessResult = { documentId: doc.id, ...r };
    if (r.kind === "invoice") {
      const flags = await db.select().from(schema.flags).where(eq(schema.flags.invoiceId, r.invoiceId));
      result.flags = flags.map((f) => ({ id: f.id, type: f.type, severity: f.severity, summary: f.summary, exposureMinor: f.exposureMinor, currency: f.currency }));
    }
    void notifyWebhook(orgId, { event: "document.processed", filename, source, result });
    return result;
  } catch (e: any) {
    const message = String(e?.message ?? e).slice(0, 500);
    await db.update(schema.documents).set({ status: "failed", error: message }).where(eq(schema.documents.id, doc.id));
    void notifyWebhook(orgId, { event: "document.failed", filename, source, documentId: doc.id, error: message });
    throw new HttpError(422, `Extraction failed: ${message}`);
  }
}
