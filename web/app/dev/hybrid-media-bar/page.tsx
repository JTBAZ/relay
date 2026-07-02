import { notFound } from "next/navigation";
import { HybridMediaBarConceptGrid } from "@/components/dev/hybrid-media-bar/HybridMediaBarConceptGrid";

export default function HybridMediaBarConceptsPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH !== "true"
  ) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <HybridMediaBarConceptGrid />
    </main>
  );
}
