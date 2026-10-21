import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exportBlobPath, FileExportIndex } from "../../src/export/export-index.js";
try {
  const { root, prefix } = JSON.parse(process.env.RELAY_MEDIA_FILE_TEST_INPUT ?? "") as { root: string; prefix: string };
  const index = new FileExportIndex(root);
  for (let at = 0; at < 10; at++) {
    const id = prefix + at, relative = "media/" + id + "/bytes";
    const path = exportBlobPath(root, "file", relative);
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, "x");
    await index.mutate("file", (current) => { current.media[id] = { media_id: id, creator_id: "file", sha256: "a".repeat(64), byte_length: 1, relative_blob_path: relative, upstream_revision: "r1", exported_at: new Date().toISOString() }; });
  }
} catch { process.exitCode = 1; }
