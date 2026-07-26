/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorEarnings = vi.fn();
const fetchCreatorPayouts = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));

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
    fetchCreatorEarnings: (...args: unknown[]) => fetchCreatorEarnings(...args),
    fetchCreatorPayouts: (...args: unknown[]) => fetchCreatorPayouts(...args),
    startCreatorPayoutOnboarding: vi.fn(),
    requestCreatorPayout: vi.fn(),
    RelayApiError: StubRelayApiError
  };
});

import EarningsDashboardClient from "../../web/app/studio/earnings/EarningsDashboardClient";

describe("earnings-payout-history", () => {
  beforeEach(() => {
    fetchCreatorEarnings.mockReset();
    fetchCreatorPayouts.mockReset();
    fetchCreatorEarnings.mockResolvedValue({
      available_cents: 0,
      lifetime_cents: 5000,
      this_month: { tips: 10, earned_cents: 330 },
      bill_credits: [
        {
          id: "bc1",
          amount_cents: -990,
          stripe_ref: "in_1",
          created_at: "2026-07-01T00:00:00.000Z"
        }
      ],
      entries: [],
      payout_threshold_cents: 2000,
      payouts_enabled: true,
      onboarding_status: "complete"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders every payout status and keeps bill credit separate", async () => {
    fetchCreatorPayouts.mockResolvedValue({
      payouts: [
        {
          payout_id: "p_req",
          amount_cents: 2000,
          status: "requested",
          requested_at: "2026-07-10T00:00:00.000Z",
          settled_at: null,
          failure_reason: null
        },
        {
          payout_id: "p_transit",
          amount_cents: 2100,
          status: "in_transit",
          requested_at: "2026-07-11T00:00:00.000Z",
          settled_at: null,
          failure_reason: null
        },
        {
          payout_id: "p_ok",
          amount_cents: 2200,
          status: "settled",
          requested_at: "2026-07-12T00:00:00.000Z",
          settled_at: "2026-07-13T00:00:00.000Z",
          failure_reason: null
        },
        {
          payout_id: "p_fail",
          amount_cents: 2300,
          status: "failed",
          requested_at: "2026-07-14T00:00:00.000Z",
          settled_at: null,
          failure_reason: "Transfer reversed by bank"
        }
      ]
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-payout-history"));
    expect(screen.getByTestId("earnings-payout-p_req").getAttribute("data-status")).toBe(
      "requested"
    );
    expect(screen.getByTestId("earnings-payout-p_transit").getAttribute("data-status")).toBe(
      "in_transit"
    );
    expect(screen.getByTestId("earnings-payout-p_ok").getAttribute("data-status")).toBe(
      "settled"
    );
    expect(screen.getByTestId("earnings-payout-p_fail").getAttribute("data-status")).toBe(
      "failed"
    );
    expect(screen.getByText(/Transfer reversed by bank/i)).toBeTruthy();
    expect(screen.getByTestId("earnings-bill-credit-list")).toBeTruthy();
    expect(screen.getByText(/No payout account required/i)).toBeTruthy();
  });

  it("shows empty history without conflating bill credit", async () => {
    fetchCreatorPayouts.mockResolvedValue({ payouts: [] });
    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-payout-history-empty"));
    expect(screen.getByTestId("earnings-bill-credit")).toBeTruthy();
  });
});
