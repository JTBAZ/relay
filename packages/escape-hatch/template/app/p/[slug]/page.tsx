import { PostView } from "@/components/PostView";
import { loadSite } from "@/lib/load-site";

export default function PostPage({
  params
}: {
  params: { slug: string };
}) {
  const site = loadSite();
  return <PostView site={site} slug={params.slug} />;
}
