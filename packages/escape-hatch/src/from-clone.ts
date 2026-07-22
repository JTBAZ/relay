/**
 * Adapt Relay CloneSiteModel (+ optional export index) into an Escape Hatch SiteBundle.
 */

import { basename, extname } from "node:path";
import { rewriteExportApiPath, rewriteMediaContentPath, mimeToExt } from "./access.js";
import {
  parseCloneSiteModelInput,
  parseSiteBundle,
  SITE_BUNDLE_CONTRACT_VERSION,
  type CloneSiteModelInput,
  type CreatorExportIndexInput,
  type DemoPersona,
  type EscapeHatchTheme,
  type SiteBundle
} from "./contracts.js";

export type FromCloneOptions = {
  /** Raw or versioned CloneSiteModel input (validated/normalized before use). */
  clone: unknown;
  exportIndex?: CreatorExportIndexInput;
  creator?: Partial<{ display_name: string; handle: string }>;
  theme?: Partial<EscapeHatchTheme>;
};

function defaultTheme(displayName: string): EscapeHatchTheme {
  return {
    color_scheme: "dark",
    accent_color: "#c4784a",
    paywall_style: "blur",
    type_pairing: "editorial",
    gallery_density: "comfortable",
    cover_crop: "center",
    paywall_message: "Members only — unlock to view",
    hero: {
      title: displayName,
      subtitle: "Independent membership gallery",
      bio: "Built with Escape Hatch from your Patreon-shaped library."
    }
  };
}

function buildPersonas(clone: CloneSiteModelInput): DemoPersona[] {
  const personas: DemoPersona[] = [
    { id: "public", label: "Public", tier_ids: [] },
    {
      id: "patron_all",
      label: "Patron (any paid)",
      tier_ids: clone.tiers.map((t) => t.tier_id).slice(0, 1)
    }
  ];
  for (const t of clone.tiers) {
    personas.push({
      id: `tier:${t.tier_id}`,
      label: t.title,
      tier_ids: [t.tier_id]
    });
  }
  // Ensure patron_all has at least a synthetic marker if no tiers
  if (clone.tiers.length === 0) {
    personas[1] = {
      id: "patron_all",
      label: "Patron (any paid)",
      tier_ids: ["demo_paid"]
    };
  }
  return personas;
}

/**
 * Rewrite media paths to /media/{id}{ext} and prefer export index blob basenames when present.
 * Validates/normalizes clone input; output is always current SiteBundle contract.
 */
export function fromClone(opts: FromCloneOptions): SiteBundle {
  const clone = parseCloneSiteModelInput(opts.clone);
  const display = opts.creator?.display_name ?? clone.creator_id;
  const handle =
    opts.creator?.handle ??
    clone.creator_id.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();

  const exportMedia = opts.exportIndex?.media ?? {};

  const posts = clone.posts.map((post) => ({
    ...post,
    access: {
      ...post.access,
      match_mode: post.access.match_mode ?? ("tier_or_higher" as const)
    },
    media: post.media.map((m) => {
      const rec = exportMedia[m.media_id];
      let content_path: string;
      if (rec?.relative_blob_path) {
        const base = basename(rec.relative_blob_path);
        const fromName = extname(base);
        const ext =
          fromName ||
          mimeToExt(rec.mime_type ?? m.mime_type ?? "application/octet-stream");
        content_path = `/media/${m.media_id}${ext.startsWith(".") ? ext : `.${ext}`}`;
      } else {
        content_path = rewriteExportApiPath(
          m.content_path,
          m.media_id,
          m.mime_type
        );
      }
      return {
        ...m,
        has_export: Boolean(rec) || m.has_export,
        content_path
      };
    })
  }));

  const theme: EscapeHatchTheme = {
    ...defaultTheme(display),
    ...opts.theme,
    hero: {
      ...defaultTheme(display).hero,
      ...(opts.theme?.hero ?? {})
    }
  };

  // Route through parseSiteBundle so personas get tier_catalog and version is current.
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: clone.site_id,
    creator_id: clone.creator_id,
    generated_at: clone.generated_at,
    base_url: clone.base_url || "/",
    creator: { display_name: display, handle },
    theme,
    demo_personas: buildPersonas(clone),
    tiers: clone.tiers,
    posts,
    total_media: posts.reduce((n, p) => n + p.media.length, 0)
  });
}

export { rewriteMediaContentPath };
