import { redirect } from "next/navigation";
import { isPilotPatreonOnlyScope } from "@/lib/pilot-patreon-only";

export default function SubscribeStarCreatorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  if (isPilotPatreonOnlyScope()) {
    redirect("/connect/creator");
  }
  return children;
}
