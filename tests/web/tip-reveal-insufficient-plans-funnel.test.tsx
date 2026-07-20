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

import { TipRevealModal } from "../../web/components/patron/TipRevealModal";
import { RelayApiError } from "@/lib/relay-api";

const sampleItem = {
  post_id: "post_1",
  creator_id: "cr_1",
  blur_thumb_url: "/api/v1/export/media/cr_1/m1/thumb",
  tip_cost: 1 as const
};

describe("tip reveal insufficient → plans funnel (MB-15B)", () => {
  beforeEach(() => {
    createTipReveal.mockReset();
    fetchTipsWallet.mockReset();
    createTipReveal.mockRejectedValue(new RelayApiError("nope", 402, "insufficient_tips"));
  });

  afterEach(() => {
    cleanup();
  });

  it("free fan gets Compare plans CTA to /plans?from=tip_reveal", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: true,
      plan: "free"
    });
    render(<TipRevealModal open item={sampleItem} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("tip-reveal-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("tip-reveal-compare-plans-cta")).toBeTruthy();
    });
    const cta = screen.getByTestId("tip-reveal-compare-plans-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/plans?from=tip_reveal");
    expect(cta.textContent).toMatch(/Compare plans/i);
    expect(screen.queryByTestId("tip-reveal-reload-cta")).toBeNull();
    // Modal stays open on the same tile context
    expect(screen.getByTestId("tip-reveal-modal")).toBeTruthy();
  });

  it("paid fan gets Get more Tips CTA to reload hash", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "supporter",
      monthly_allowance: 5
    });
    render(<TipRevealModal open item={sampleItem} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("tip-reveal-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("tip-reveal-reload-cta")).toBeTruthy();
    });
    const cta = screen.getByTestId("tip-reveal-reload-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/plans?from=tip_reveal#reload");
    expect(cta.textContent).toMatch(/Get more Tips/i);
  });
});
