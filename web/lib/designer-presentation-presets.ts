import type { LibrarySection, PageLayout, SectionLayout } from "@/lib/designer-mock";

export type PresentationPresetId =
  | "grid"
  | "masonry"
  | "showcase";

function updateLibrarySection(
  section: LibrarySection,
  patch: Partial<Pick<LibrarySection, "layout" | "itemLimit" | "gridColumns">>
): LibrarySection {
  return {
    ...section,
    ...patch
  };
}

function layoutForPreset(
  preset: PresentationPresetId,
  section: LibrarySection,
  index: number
): { layout: SectionLayout; itemLimit: number; gridColumns: 2 | 3 | 4 } {
  switch (preset) {
    case "grid":
      return { layout: "grid", itemLimit: Math.max(section.itemLimit, 24), gridColumns: 3 };
    case "masonry":
      return { layout: "masonry", itemLimit: Math.min(section.itemLimit, 24), gridColumns: 2 };
    case "showcase":
      return index === 0
        ? { layout: "featured", itemLimit: Math.max(section.itemLimit, 12), gridColumns: 2 }
        : { layout: "grid", itemLimit: section.itemLimit, gridColumns: 3 };
  }
}

/** Presentation presets change layout/density only; they never swap the creator's content blocks. */
export function applyPresentationPreset(
  layout: PageLayout,
  preset: PresentationPresetId,
  _collections: unknown[]
): PageLayout {
  void _collections;
  let libraryIndex = 0;

  return {
    ...layout,
    sections: layout.sections.map((section) => {
      if (section.kind !== "library") return section;
      const patch = layoutForPreset(preset, section, libraryIndex);
      libraryIndex += 1;
      return updateLibrarySection(section, patch);
    })
  };
}
