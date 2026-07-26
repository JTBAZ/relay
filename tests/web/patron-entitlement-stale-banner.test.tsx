/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PatronEntitlementStaleBanner } from "../../web/components/patron/relay/patron-entitlement-stale-banner";

describe("PatronEntitlementStaleBanner P6-patron-004", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders reconnect CTA and optional stale date hint", () => {
    render(
      <PatronEntitlementStaleBanner staleSinceIso="2020-06-01T12:00:00.000Z" />
    );
    const banner = screen.getByTestId("patron-entitlement-stale-banner");
    expect(banner).toBeTruthy();
    expect(screen.getByRole("link", { name: /reconnect patreon/i })).toBeTruthy();
    expect(banner.textContent).toMatch(/2020/);
  });

  it("renders without a date line when staleSinceIso is null", () => {
    render(<PatronEntitlementStaleBanner staleSinceIso={null} />);
    const banner = screen.getByTestId("patron-entitlement-stale-banner");
    expect(banner).toBeTruthy();
    expect(screen.getByRole("link", { name: /reconnect patreon/i })).toBeTruthy();
    expect(banner.textContent).not.toMatch(/out of date since/i);
  });
});
