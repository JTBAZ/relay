import { PostView } from "@/components/PostView";
import { evaluatePostAccess } from "@/lib/entitlements";
import { buildTierCatalog } from "@/lib/access";
import { loadSite } from "@/lib/load-site";

export default async function PostPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = loadSite();
  const post = site.posts.find((p) => p.slug === slug);

  let serverAccess: {
    allowed: boolean;
    reason: string;
    detail: string;
    provider: string;
    stale: boolean;
  } | null = null;

  if (post) {
    const catalog =
      site.tiers.length > 0 ? buildTierCatalog(site.tiers) : undefined;
    const evaluation = await evaluatePostAccess({
      siteId: site.site_id,
      post: {
        id: post.post_id,
        access: post.access,
        published_at: post.published_at
      },
      tierCatalog: catalog
    });
    serverAccess = {
      allowed: evaluation.allowed,
      reason: evaluation.reason,
      detail: evaluation.detail,
      provider: evaluation.provider,
      stale: evaluation.stale
    };
  }

  return <PostView site={site} slug={slug} serverAccess={serverAccess} />;
}
