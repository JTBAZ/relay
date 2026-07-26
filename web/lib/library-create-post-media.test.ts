import { describe, expect, it } from "vitest";
import {
  isImportBinServerMedia,
  isLibraryPublishBlockedRow,
  libraryPublishDataUrlUploads
} from "./library-create-post-media";

describe("library-create-post-media", () => {
  it("isImportBinServerMedia covers discord, serverStaged upload, and relay_m_ id", () => {
    expect(
      isImportBinServerMedia({
        id: "relay_m_a",
        source: "discord",
        src: "/x",
        serverStaged: true
      })
    ).toBe(true);
    expect(
      isImportBinServerMedia({
        id: "relay_m_b",
        source: "upload",
        src: "https://api/content",
        serverStaged: true
      })
    ).toBe(true);
    expect(
      isImportBinServerMedia({
        id: "relay_m_c",
        source: "upload",
        src: "https://api/content"
      })
    ).toBe(true);
    expect(
      isImportBinServerMedia({
        id: "local-1",
        source: "upload",
        src: "data:image/png;base64,AA",
        serverStaged: false
      })
    ).toBe(false);
    expect(
      isImportBinServerMedia({
        id: "u1",
        source: "url",
        src: "https://example.com/x.png"
      })
    ).toBe(false);
  });

  it("isLibraryPublishBlockedRow rejects url and bad uploads", () => {
    expect(
      isLibraryPublishBlockedRow({
        id: "x",
        source: "url",
        src: "https://x"
      })
    ).toBe(true);
    expect(
      isLibraryPublishBlockedRow({
        id: "relay_m_x",
        source: "upload",
        src: "https://cdn/content",
        serverStaged: true
      })
    ).toBe(false);
    expect(
      isLibraryPublishBlockedRow({
        id: "modal",
        source: "upload",
        src: "data:image/png;base64,AA"
      })
    ).toBe(false);
    expect(
      isLibraryPublishBlockedRow({
        id: "bad",
        source: "upload",
        src: "https://no-data-url"
      })
    ).toBe(true);
  });

  it("libraryPublishDataUrlUploads keeps only data-URL upload rows", () => {
    const rows = [
      { id: "relay_m_1", source: "upload" as const, src: "https://x", serverStaged: true },
      { id: "m2", source: "upload" as const, src: "data:image/png;base64,QQ==" },
      { id: "m3", source: "discord" as const, src: null }
    ];
    expect(libraryPublishDataUrlUploads(rows)).toEqual([rows[1]]);
  });
});
