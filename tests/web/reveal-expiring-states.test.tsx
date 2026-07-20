/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/relay-api", async () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    RELAY_API_BASE: "http://relay.test",
    createTipReveal: vi.fn(),
    RelayApiError: StubRelayApiError
  };
});

import { TipBlurredTile } from "../../web/components/patron/TipRevealModal";

describe("reveal-expiring-states (tip-again tile)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Tip again to re-open when tip_again is set", () => {
    const onSelect = vi.fn();
    render(
      <TipBlurredTile
        item={{
          post_id: "post_expired",
          creator_id: "cr_1",
          creator_display_name: "Mira",
          blur_thumb_url: null,
          tip_cost: 1,
          tip_again: true
        }}
        onSelect={onSelect}
      />
    );
    const tile = screen.getByTestId("tip-blurred-tile-post_expired");
    expect(tile.getAttribute("data-tip-again")).toBe("1");
    expect(tile.textContent).toMatch(/Tip again to re-open/i);
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalled();
  });

  it("shows default Tip CTA when tip_again is false", () => {
    render(
      <TipBlurredTile
        item={{
          post_id: "post_new",
          creator_id: "cr_1",
          blur_thumb_url: null,
          tip_cost: 1,
          tip_again: false
        }}
        onSelect={() => {}}
      />
    );
    const tile = screen.getByTestId("tip-blurred-tile-post_new");
    expect(tile.getAttribute("data-tip-again")).toBe("0");
    expect(tile.textContent).toMatch(/1 Tip/);
    expect(tile.textContent).not.toMatch(/Tip again to re-open/);
  });
});
