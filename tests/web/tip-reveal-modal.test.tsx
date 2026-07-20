/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTipReveal = vi.fn();
const fetchTipsWallet = vi.fn();

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
    createTipReveal: (...args: unknown[]) => createTipReveal(...args),
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    RelayApiError: StubRelayApiError
  };
});

import {
  TipBlurredTile,
  TipRevealModal
} from "../../web/components/patron/TipRevealModal";
import { RelayApiError } from "@/lib/relay-api";

const sampleItem = {
  post_id: "post_1",
  creator_id: "cr_1",
  blur_thumb_url: "/api/v1/export/media/cr_1/m1/thumb",
  tip_cost: 1 as const
};

describe("TipBlurredTile + TipRevealModal", () => {
  beforeEach(() => {
    createTipReveal.mockReset();
    fetchTipsWallet.mockReset();
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: true,
      plan: "free"
    });
  });
  afterEach(() => {
    cleanup();
  });

  it("renders blurred tile and invokes onSelect", () => {
    const onSelect = vi.fn();
    render(<TipBlurredTile item={sampleItem} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("tip-blurred-tile-post_1"));
    expect(onSelect).toHaveBeenCalledWith(sampleItem);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <TipRevealModal open={false} item={sampleItem} onClose={() => {}} />
    );
    expect(container.querySelector("[data-testid='tip-reveal-modal']")).toBeNull();
  });

  it("shows disclosure and confirms spend", async () => {
    createTipReveal.mockResolvedValue({
      reveal_id: "rev1",
      expires_at: "2026-08-01T00:00:00.000Z",
      media: { media_ids: ["m1"] }
    });
    const onRevealed = vi.fn();
    render(
      <TipRevealModal open item={sampleItem} onClose={() => {}} onRevealed={onRevealed} />
    );
    expect(screen.getByTestId("tip-reveal-disclosure").textContent).toMatch(
      /\$0\.33 goes to this artist/
    );
    fireEvent.click(screen.getByTestId("tip-reveal-confirm"));
    await waitFor(() => {
      expect(createTipReveal).toHaveBeenCalledWith({
        post_id: "post_1",
        surface: "discover"
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("tip-reveal-open-copy")).toBeTruthy();
    });
    expect(onRevealed).toHaveBeenCalled();
  });

  it("renders offer CTA when provided", () => {
    render(
      <TipRevealModal
        open
        item={sampleItem}
        offer={{ headline: "Join the club", cta_text: "Upgrade", slug: "offer-1" }}
        onClose={() => {}}
      />
    );
    const cta = screen.getByTestId("tip-reveal-offer-cta");
    expect(cta.getAttribute("href")).toBe("/go/offer-1");
    expect(cta.textContent).toMatch(/Join the club/);
  });

  it("maps 402 to insufficient Tips copy", async () => {
    createTipReveal.mockRejectedValue(new RelayApiError("nope", 402, "insufficient_tips"));
    render(<TipRevealModal open item={sampleItem} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("tip-reveal-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("tip-reveal-error").textContent).toMatch(/Not enough Tips/);
    });
  });
});
