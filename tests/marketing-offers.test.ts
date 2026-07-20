/**
 * Slice 4 — discount code + offer validation (no DB).
 */
import { describe, expect, it } from "vitest";
import {
  normalizeDiscountCode,
  normalizePercentOff,
  DiscountCodeValidationError
} from "../src/marketing/discount-code-service.js";
import {
  normalizePatreonDestinationUrl,
  PostOfferValidationError
} from "../src/marketing/post-offer-service.js";
import { isAudiencePersonaKey } from "../src/gallery/tier-preview-settings.js";

describe("discount code normalization", () => {
  it("uppercases and accepts valid codes", () => {
    expect(normalizeDiscountCode(" launch10 ")).toBe("LAUNCH10");
  });

  it("rejects bad charset / percent", () => {
    expect(() => normalizeDiscountCode("a")).toThrow(DiscountCodeValidationError);
    expect(() => normalizeDiscountCode("BAD CODE")).toThrow(DiscountCodeValidationError);
    expect(() => normalizePercentOff(0)).toThrow(DiscountCodeValidationError);
    expect(normalizePercentOff(25)).toBe(25);
  });
});

describe("patreon destination allowlist", () => {
  it("allows https patreon hosts only", () => {
    expect(normalizePatreonDestinationUrl("https://www.patreon.com/checkout")).toContain(
      "patreon.com"
    );
    expect(() => normalizePatreonDestinationUrl("http://www.patreon.com/x")).toThrow(
      PostOfferValidationError
    );
    expect(() => normalizePatreonDestinationUrl("https://evil.com/patreon")).toThrow(
      PostOfferValidationError
    );
  });

  it("rejects hostile URL shapes (Slice 7)", () => {
    expect(() => normalizePatreonDestinationUrl("/patreon/me")).toThrow(PostOfferValidationError);
    expect(() =>
      normalizePatreonDestinationUrl("https://user:pass@www.patreon.com/x")
    ).toThrow(PostOfferValidationError);
    expect(() => normalizePatreonDestinationUrl("https://1.2.3.4/x")).toThrow(
      PostOfferValidationError
    );
    expect(() => normalizePatreonDestinationUrl("ftp://www.patreon.com/x")).toThrow(
      PostOfferValidationError
    );
  });
});

describe("persona keys for offers", () => {
  it("accepts anonymous and tier: keys only", () => {
    expect(isAudiencePersonaKey("anonymous")).toBe(true);
    expect(isAudiencePersonaKey("tier:patreon_tier_low")).toBe(true);
    expect(isAudiencePersonaKey("Basic")).toBe(false);
  });
});
