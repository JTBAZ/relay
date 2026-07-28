import { describe, expect, it } from "vitest";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";
import {
  decodeHtmlEscapedUrl,
  normalizePatreonMediaUrl,
  patreonPostMediaStableKey
} from "../src/patreon/media-url-normalize.js";
import { mergeIngestMediaByNormalizedUrl } from "../src/patreon/merge-ingest-media.js";
import type { IngestMediaItem } from "../src/ingest/types.js";

describe("patreonPostMediaStableKey", () => {
  it("matches attachment vs cover URLs that share post id and content hash", () => {
    const attachment =
      "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJhIjoxLCJwIjoxfQ%3D%3D/1.jpg?token-hash=a";
    const cover =
      "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJ3IjoxMDgwfQ%3D%3D/1.jpg?token-hash=b";
    const ka = patreonPostMediaStableKey(attachment);
    const kb = patreonPostMediaStableKey(cover);
    expect(ka).toBe("154428469:8df316d8ed50446e8fcb14e907b363e1");
    expect(kb).toBe(ka);
  });
});

describe("decodeHtmlEscapedUrl", () => {
  it("turns HTML-escaped ampersands into query separators", () => {
    const escaped =
      "https://c10.patreonusercontent.com/x.jpg?token-hash=abc&amp;token-time=1786492800";
    expect(decodeHtmlEscapedUrl(escaped)).toBe(
      "https://c10.patreonusercontent.com/x.jpg?token-hash=abc&token-time=1786492800"
    );
  });
});

describe("normalizePatreonMediaUrl", () => {
  it("lowercases host and strips sizing params on patreon CDN", () => {
    const a =
      "https://C10.Patreonusercontent.com/foo/bar.png?w=800&h=600&token=keep";
    const b = "https://c10.patreonusercontent.com/foo/bar.png?token=keep";
    expect(normalizePatreonMediaUrl(a)).toBe(normalizePatreonMediaUrl(b));
  });

  it("strips hash fragment", () => {
    const u = "https://example.com/x.jpg#frag";
    expect(normalizePatreonMediaUrl(u)).not.toContain("#");
  });

  it("leaves non-patreon URLs mostly intact aside from hash", () => {
    const u = "https://Example.COM/path?w=1&h=2";
    expect(normalizePatreonMediaUrl(u)).toContain("w=1");
  });

  it("decodes HTML-escaped ampersands before normalizing", () => {
    const escaped =
      "https://c10.patreonusercontent.com/foo.png?token-hash=a&amp;token-time=1&amp;w=400";
    const plain =
      "https://c10.patreonusercontent.com/foo.png?token-hash=a&token-time=1";
    expect(normalizePatreonMediaUrl(escaped)).toBe(normalizePatreonMediaUrl(plain));
  });
});

describe("mapPatreonPostToIngest URL dedupe", () => {
  it("collapses two content image URLs that differ only by sizing params", () => {
    const base = "https://c10.patreonusercontent.com/u/xyz/file.png";
    const html = `<p><img src="${base}?w=400" /><img src="${base}?w=800" /></p>`;
    const post = mapPatreonPostToIngest({
      type: "post",
      id: "99",
      attributes: {
        title: "T",
        content: html,
        published_at: "2024-01-01T00:00:00.000Z",
        is_public: true
      }
    });
    expect(post.media.filter((m) => m.upstream_url?.includes("patreonusercontent"))).toHaveLength(1);
  });

  it("stores fetchable URLs when content HTML escapes ampersands", () => {
    const html =
      `<img src="https://c10.patreonusercontent.com/u/x.jpg?token-hash=abc&amp;token-time=1" />`;
    const post = mapPatreonPostToIngest({
      type: "post",
      id: "165070564",
      attributes: {
        title: "TEST",
        content: html,
        published_at: "2024-01-01T00:00:00.000Z",
        is_public: true
      }
    });
    const url = post.media.find((m) => m.upstream_url?.includes("patreonusercontent"))?.upstream_url;
    expect(url).toBe(
      "https://c10.patreonusercontent.com/u/x.jpg?token-hash=abc&token-time=1"
    );
    expect(url).not.toContain("&amp;");
  });
});

describe("mergeIngestMediaByNormalizedUrl", () => {
  it("prefers cover role when URLs normalize equal", () => {
    const u = "https://c10.patreonusercontent.com/same.png?w=100";
    const items: IngestMediaItem[] = [
      {
        media_id: "patreon_media_1",
        mime_type: "image/png",
        upstream_url: "https://c10.patreonusercontent.com/same.png?w=200",
        upstream_revision: "r1"
      },
      {
        media_id: "patreon_9_cover",
        mime_type: "image/png",
        upstream_url: u,
        upstream_revision: "r2",
        role: "cover"
      }
    ];
    const out = mergeIngestMediaByNormalizedUrl(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe("cover");
  });
});
