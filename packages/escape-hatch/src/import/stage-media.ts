/**
 * Stage export blobs into a media staging dir using validated relative paths only.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SiteBundle } from "../contracts.js";
import { resolveBlobPathUnderRoot } from "./path-safety.js";
import { parseExportIndexForImport } from "./validate.js";

/**
 * Copy export blobs referenced by the bundle into `stagingDir`.
 * Uses fail-closed path containment; unsafe relative_blob_path values throw
 * during index parse or are skipped when resolve fails.
 */
export function stageExportMediaSafe(
  exportCreatorRoot: string,
  stagingDir: string,
  bundle: SiteBundle
): void {
  mkdirSync(stagingDir, { recursive: true });
  const indexPath = join(exportCreatorRoot, "export_index.json");
  if (!existsSync(indexPath)) return;

  const raw = JSON.parse(readFileSync(indexPath, "utf8")) as unknown;
  const index = parseExportIndexForImport(raw, bundle.creator_id);

  for (const post of bundle.posts) {
    for (const m of post.media) {
      const rec = index.media[m.media_id];
      if (!rec) continue;
      let src: string;
      try {
        src = resolveBlobPathUnderRoot(
          exportCreatorRoot,
          rec.relative_blob_path
        );
      } catch {
        // Fail closed: never copy a path that escapes the creator root.
        continue;
      }
      if (!existsSync(src) || !statSync(src).isFile()) continue;
      const destName = m.content_path.replace(/^\/media\//, "");
      if (
        !destName ||
        destName.includes("..") ||
        destName.includes("/") ||
        destName.includes("\\")
      ) {
        continue;
      }
      cpSync(src, join(stagingDir, destName));
    }
  }
}
