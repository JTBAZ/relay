/**
 * Download Files API artifacts attached to a Claude **managed agent** session (`sesn_...`).
 *
 * Why not `client.beta.files.list({ scope_id })`?
 * The public Files list endpoint may reject `scope_id` with `unknown field scope_id` (API/schema drift).
 * Agent sessions expose file mounts via **session resources** instead:
 *   GET /v1/sessions/{session_id}/resources (beta: managed-agents-2026-04-01)
 * Each `type: "file"` entry has a `file_id`; content is fetched with the Files API download route.
 *
 * Env: ANTHROPIC_API_KEY (repo root .env)
 *
 * Usage:
 *   node scripts/claude-session-files-download.mjs <sesn_...> [output-dir]
 *   npm run claude:session-files -- sesn_011CZytPXrSydD51xbJZVtoy
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env") });

const FILES_BETA = "files-api-2025-04-14";
const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

function safeSegment(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId?.trim()) {
    console.error(
      "Usage: node scripts/claude-session-files-download.mjs <sesn_...> [output-directory]"
    );
    process.exit(1);
  }
  const sesId = sessionId.trim();
  const defaultOut = join(
    root,
    "downloads",
    `claude-session-${safeSegment(sesId).slice(0, 64)}`
  );
  const outDir = process.argv[3] ?? defaultOut;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY (set in repo root .env or environment).");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  await mkdir(outDir, { recursive: true });

  let count = 0;
  for await (const r of client.beta.sessions.resources.list(sesId, {
    betas: [MANAGED_AGENTS_BETA],
  })) {
    if (r.type !== "file") {
      continue;
    }

    const meta = await client.beta.files.retrieveMetadata(r.file_id, {
      betas: [FILES_BETA],
    });
    const base =
      safeSegment(meta.filename).length > 0
        ? safeSegment(meta.filename)
        : `file_${r.file_id}`;
    const dest = join(outDir, `${String(count).padStart(3, "0")}_${base}`);

    const resp = await client.beta.files.download(r.file_id, { betas: [FILES_BETA] });
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(dest, buf);
    console.log(
      `Wrote ${dest} (${buf.length} bytes) file_id=${r.file_id} mount=${r.mount_path} mime=${meta.mime_type}`
    );
    count += 1;
  }

  if (count === 0) {
    console.log(
      "No file resources on this session (or session id / permissions issue). " +
        "Only mounted Files API files appear here; ephemeral agent outputs may not be listed."
    );
  } else {
    console.log(`Done: ${count} file(s) -> ${outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
