import { describe, expect, it } from "vitest";
import {
  defaultPublicSlugFromEmail,
  normalizePublicSlugCandidate,
  validatePublicSlugFormat
} from "../src/creator/public-slug.js";

describe("public-slug", () => {
  it("normalizes email local parts", () => {
    expect(normalizePublicSlugCandidate("Hello World")).toBe("hello-world");
    expect(normalizePublicSlugCandidate("user+tag@example.com")).toBe("user");
    expect(defaultPublicSlugFromEmail("Artist.Name@x.com")).toBe("artist-name");
  });

  it("validates slug format and reserved words", () => {
    expect(validatePublicSlugFormat("ab")).toMatchObject({ ok: false });
    expect(validatePublicSlugFormat("good-slug-1")).toMatchObject({ ok: true });
    expect(validatePublicSlugFormat("login")).toMatchObject({ ok: false });
    expect(validatePublicSlugFormat("no_underscore")).toMatchObject({ ok: false });
  });
});
