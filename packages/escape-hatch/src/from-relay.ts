/**
 * Build SiteBundle from Relay on-disk canonical + export index via generateCloneSiteModel.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fromClone } from "./from-clone.js";
import {
  parseCloneSiteModelInput,
  type CreatorExportIndexInput,
  type SiteBundle
} from "./contracts.js";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

export type FromRelayOptions = {
  creatorId: string;
  /** Repo root (default: two levels up from package). */
  repoRoot?: string;
  canonicalPath?: string;
  exportRoot?: string;
  baseUrl?: string;
  displayName?: string;
  handle?: string;
};

type GenerateCloneFn = (
  creatorId: string,
  canonical: unknown,
  exportIndex: unknown,
  baseUrl: string
) => unknown;

/** Load Relay `generateCloneSiteModel` from repo dist (shared with EH-011 importer). */
export function loadGenerateClone(): GenerateCloneFn {
  const distPath = resolve(HERE, "../../../dist/src/clone/clone-generator.js");
  if (existsSync(distPath)) {
    const mod = require(distPath) as { generateCloneSiteModel: GenerateCloneFn };
    return mod.generateCloneSiteModel;
  }
  throw new Error(
    `Relay dist not found at ${distPath}. Run \`npm run build\` at the repo root first.`
  );
}

export function fromRelay(opts: FromRelayOptions): {
  bundle: SiteBundle;
  exportIndex: CreatorExportIndexInput | null;
  exportCreatorRoot: string | null;
} {
  const repoRoot = opts.repoRoot ?? resolve(HERE, "../../..");
  const canonicalPath =
    opts.canonicalPath ?? join(repoRoot, ".relay-data", "canonical.json");
  const exportRoot =
    opts.exportRoot ?? join(repoRoot, ".relay-data", "exports");

  if (!existsSync(canonicalPath)) {
    throw new Error(`Canonical snapshot not found: ${canonicalPath}`);
  }

  const canonical = JSON.parse(readFileSync(canonicalPath, "utf8")) as unknown;

  const generateCloneSiteModel = loadGenerateClone();
  const exportCreatorRoot = join(exportRoot, opts.creatorId);
  const indexPath = join(exportCreatorRoot, "export_index.json");
  let exportIndex: CreatorExportIndexInput | null = null;
  if (existsSync(indexPath)) {
    exportIndex = JSON.parse(
      readFileSync(indexPath, "utf8")
    ) as CreatorExportIndexInput;
  }

  const cloneRaw = generateCloneSiteModel(
    opts.creatorId,
    canonical,
    exportIndex ?? { creator_id: opts.creatorId, media: {} },
    opts.baseUrl ?? "http://localhost:3001"
  );

  // Validate/normalize Relay clone output before adapting (legacy unversioned OK).
  const clone = parseCloneSiteModelInput(cloneRaw);

  const bundle = fromClone({
    clone,
    exportIndex: exportIndex ?? undefined,
    creator: {
      display_name: opts.displayName ?? opts.creatorId,
      handle:
        opts.handle ??
        opts.creatorId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
    }
  });

  return {
    bundle,
    exportIndex,
    exportCreatorRoot: existsSync(exportCreatorRoot) ? exportCreatorRoot : null
  };
}
