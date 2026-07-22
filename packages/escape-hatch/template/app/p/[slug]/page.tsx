import { PostView } from "@/components/PostView";
import { loadSite } from "@/lib/load-site";

export default async function PostPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = loadSite();
  return <PostView site={site} slug={slug} />;
}
