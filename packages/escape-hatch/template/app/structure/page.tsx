import { ConsoleNav } from "@/components/ConsoleNav";
import { StructureView } from "@/components/StructureView";
import { loadSite } from "@/lib/load-site";

export default function StructurePage() {
  const site = loadSite();
  return (
    <>
      <ConsoleNav />
      <StructureView site={site} />
    </>
  );
}
