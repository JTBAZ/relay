import { ConsoleNav } from "@/components/ConsoleNav";
import { StyleStudio } from "@/components/StyleStudio";
import { loadSite } from "@/lib/load-site";

export default function StylePage() {
  const site = loadSite();
  return (
    <>
      <ConsoleNav />
      <StyleStudio site={site} />
    </>
  );
}
