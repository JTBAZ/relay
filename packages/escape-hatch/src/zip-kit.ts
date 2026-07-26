/**
 * Zip an Escape Hatch .out/<slug> folder into an Export Kit archive.
 */

import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import archiver from "archiver";
import { OUT_ROOT } from "./fill-template.js";

const SKIP_ZIP = new Set(["node_modules", ".next"]);

export async function zipExportKit(
  slug: string,
  destZip?: string
): Promise<string> {
  const outDir = join(OUT_ROOT, slug);
  if (!existsSync(outDir)) {
    throw new Error(`Output site not found: ${outDir}. Run build/fixture first.`);
  }
  const zipPath = destZip ?? join(OUT_ROOT, `${slug}-export-kit.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(outDir, slug, (entry) => {
      const parts = entry.name.split(/[/\\]/);
      if (parts.some((p) => SKIP_ZIP.has(p))) return false;
      return entry;
    });
    void archive.finalize();
  });

  return zipPath;
}
