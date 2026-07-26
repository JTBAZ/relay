import { describe, expect, it } from "vitest";
import {
  patronProfileHandleSubtitle,
  patronProfileHandlesMatch,
  patronProfilePrimaryTitle,
} from "./patron-profile-identity";

describe("patronProfilePrimaryTitle", () => {
  it("prefers display name when set", () => {
    expect(
      patronProfilePrimaryTitle({ display_name: "Dev Riley", handle: "patron_dev_riley" })
    ).toBe("Dev Riley");
  });

  it("falls back to @handle when display name is absent", () => {
    expect(patronProfilePrimaryTitle({ display_name: null, handle: "patron_dev_riley" })).toBe(
      "@patron_dev_riley"
    );
  });
});

describe("patronProfileHandlesMatch", () => {
  it("matches handles case-insensitively with optional @", () => {
    expect(patronProfileHandlesMatch("@Dev_Riley", "dev_riley")).toBe(true);
    expect(patronProfileHandlesMatch("dev_riley", "DEV_RILEY")).toBe(true);
  });

  it("returns false when either handle is missing", () => {
    expect(patronProfileHandlesMatch(null, "dev_riley")).toBe(false);
    expect(patronProfileHandlesMatch("dev_riley", "")).toBe(false);
  });
});

describe("patronProfileHandleSubtitle", () => {
  it("shows @handle when display name differs", () => {
    expect(
      patronProfileHandleSubtitle({ display_name: "Dev Riley", handle: "patron_dev_riley" })
    ).toBe("@patron_dev_riley");
  });

  it("hides @handle when display name matches handle", () => {
    expect(
      patronProfileHandleSubtitle({ display_name: "patron_dev_riley", handle: "patron_dev_riley" })
    ).toBeNull();
    expect(
      patronProfileHandleSubtitle({ display_name: "Patron_Dev_Riley", handle: "patron_dev_riley" })
    ).toBeNull();
  });

  it("hides @handle when only handle is present (title already shows @handle)", () => {
    expect(patronProfileHandleSubtitle({ display_name: null, handle: "patron_dev_riley" })).toBeNull();
  });
});
