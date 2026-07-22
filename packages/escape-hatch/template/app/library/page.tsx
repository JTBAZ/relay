import { ConsoleNav } from "@/components/ConsoleNav";
import {
  LibraryTruthEmpty,
  LibraryTruthView
} from "@/components/LibraryTruthView";
import { loadLibraryTruth } from "@/lib/library-truth";

export default function LibraryPage() {
  const loaded = loadLibraryTruth();

  return (
    <>
      <ConsoleNav />
      {loaded.status === "ready" ? (
        <LibraryTruthView
          report={loaded.report}
          state={loaded.state}
          gate={loaded.gate}
        />
      ) : (
        <LibraryTruthEmpty message={loaded.message} />
      )}
    </>
  );
}
