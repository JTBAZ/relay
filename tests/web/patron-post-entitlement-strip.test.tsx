/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PatronPostEntitlementStrip } from "../../web/components/patron/relay/patron-post-entitlement-strip";

describe("PatronPostEntitlementStrip P6-patron-007", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows tier chips when tiers exist", () => {
    render(
      <PatronPostEntitlementStrip
        tiers={[
          { tier_id: "t1", title: "Studio", amount_cents: 500 },
          { tier_id: "t2", title: "VIP", amount_cents: 1000 },
        ]}
      />
    );
    expect(screen.getByTestId("patron-post-entitlement-strip")).toBeTruthy();
    expect(screen.getByText(/Studio/)).toBeTruthy();
    expect(screen.getByText(/VIP/)).toBeTruthy();
  });

  it("shows public copy when no tiers", () => {
    render(<PatronPostEntitlementStrip tiers={[]} />);
    expect(screen.getByText(/without a paid tier gate/i)).toBeTruthy();
  });
});
