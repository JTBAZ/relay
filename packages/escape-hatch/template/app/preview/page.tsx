import { GalleryApp } from "@/components/GalleryApp";
import { buildTierCatalog } from "@/lib/access";
import { evaluatePostAccess } from "@/lib/entitlements";
import {
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import type { IdentityProviderUx, ServerAccessSummary } from "@/lib/paywall/types";

export const dynamic = "force-dynamic";

export default async function PreviewPage() {
  const site = loadSite();
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const identityMode: IdentityProviderUx =
    mode === "invalid" ? "invalid" : mode;

  let accessByPostId: Record<string, ServerAccessSummary> | undefined;

  if (identityMode === "supabase" || identityMode === "portable") {
    const catalog =
      site.tiers.length > 0 ? buildTierCatalog(site.tiers) : undefined;
    accessByPostId = {};
    for (const post of site.posts) {
      const evaluation = await evaluatePostAccess({
        siteId: site.site_id,
        post: {
          id: post.post_id,
          access: post.access,
          published_at: post.published_at
        },
        tierCatalog: catalog
      });
      accessByPostId[post.post_id] = {
        allowed: evaluation.allowed,
        reason: evaluation.reason,
        detail: evaluation.detail,
        provider: evaluation.provider,
        stale: evaluation.stale
      };
    }
  }

  return (
    <GalleryApp
      site={site}
      identityMode={identityMode}
      accessByPostId={accessByPostId}
    />
  );
}
