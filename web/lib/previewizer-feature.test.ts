import { describe, expect, it, afterEach } from "vitest";
import { isPreviewizerEnabled } from "./previewizer-feature";

describe("previewizer-feature", () => {
  const key = "NEXT_PUBLIC_RELAY_PREVIEWIZER_ENABLED";
  const previous = process.env[key];

  afterEach(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });

  it("defaults to enabled when unset", () => {
    delete process.env[key];
    expect(isPreviewizerEnabled()).toBe(true);
  });

  it("disables for 0/false/off/no", () => {
    for (const value of ["0", "false", "FALSE", "off", "no"]) {
      process.env[key] = value;
      expect(isPreviewizerEnabled()).toBe(false);
    }
  });

  it("enables for 1/true", () => {
    process.env[key] = "1";
    expect(isPreviewizerEnabled()).toBe(true);
    process.env[key] = "true";
    expect(isPreviewizerEnabled()).toBe(true);
  });
});
