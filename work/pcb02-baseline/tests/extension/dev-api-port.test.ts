import { describe, expect, it } from "vitest";
import { extensionDevApiPort } from "../../extension/dev-api-port.mjs";

describe("development extension API port", () => {
  it("keeps 8787 as the default and accepts a bounded local port override", () => {
    expect(extensionDevApiPort({})).toBe(8787);
    expect(extensionDevApiPort({ RELAY_EXTENSION_DEV_API_PORT: "8788" })).toBe(8788);
    expect(extensionDevApiPort({ RELAY_EXTENSION_DEV_API_PORT: "65535" })).toBe(65535);
  });

  it.each(["0", "65536", "8788.1", "https://localhost:8788", "abc"]) ("rejects invalid port override %s", value => {
    expect(() => extensionDevApiPort({ RELAY_EXTENSION_DEV_API_PORT: value })).toThrow(/integer from 1 to 65535/);
  });
});
