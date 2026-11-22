import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db, schema } from "../db/client";
import { processDocument } from "../services/documents";

export const watchDir = process.env.WATCH_DIR ?? fileURLToPath(new URL("../../.data/inbox", import.meta.url));
let running = false;

// Drop PDFs here, or point WATCH_DIR at a synced Google Drive / Dropbox / OneDrive folder.
async function scan() {
  if (running) return;
  running = true;
  try {
    const [org] = await db.select().from(schema.organizations).limit(1);
    if (!org) return;
    for (const sub of ["processed", "failed"]) await mkdir(join(watchDir, sub), { recursive: true });
    const names = (await readdir(watchDir)).filter((n) => n.toLowerCase().endsWith(".pdf")).sort((a, b) => Number(/inv/i.test(a)) - Number(/inv/i.test(b)) || a.localeCompare(b));
    for (const name of names) {
      const path = join(watchDir, name);
      const stamp = Date.now();
      try {
        await processDocument(org.id, await readFile(path), name, "folder", path);
        await rename(path, join(watchDir, "processed", `${stamp}-${basename(name)}`));
      } catch (e) {
        console.warn(`folder ingest failed for ${name}:`, (e as Error).message);
        await rename(path, join(watchDir, "failed", `${stamp}-${basename(name)}`)).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("folder scan error:", (e as Error).message);
  } finally {
    running = false;
  }
}

export function startFolderWatcher() {
  mkdir(watchDir, { recursive: true }).then(() => setInterval(scan, 10_000)).catch((e) => console.warn("watch dir unavailable:", e.message));
}
