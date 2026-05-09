/**
 * Helpers for validating `ImportBinItem` rows before Library → `POST /relay/posts`.
 * Keeps Discord / server-staged uploads / modal data-URL uploads distinct from URL-only previews.
 */

export type LibraryPublishMediaRow = {
  id: string;
  source: "discord" | "upload" | "url";
  src: string | null;
  serverStaged?: boolean;
};

export function isImportBinServerMedia(m: LibraryPublishMediaRow): boolean {
  if (m.source === "discord") return true;
  if (m.source === "upload" && m.serverStaged === true) return true;
  if (m.source === "upload" && m.id.startsWith("relay_m_")) return true;
  return false;
}

/** URL previews and malformed upload rows — not publishable from the Library composer yet. */
export function isLibraryPublishBlockedRow(m: LibraryPublishMediaRow): boolean {
  if (m.source === "url") return true;
  if (m.source === "upload" && isImportBinServerMedia(m)) return false;
  if (m.source === "upload" && typeof m.src === "string" && m.src.startsWith("data:")) return false;
  if (m.source === "upload") return true;
  return false;
}

/** Modal-only uploads still using inline data URLs — committed at publish time. */
export function libraryPublishDataUrlUploads<T extends LibraryPublishMediaRow>(media: T[]): T[] {
  return media.filter(
    (m) => m.source === "upload" && typeof m.src === "string" && m.src.startsWith("data:")
  );
}
