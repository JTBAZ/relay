/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorEarnings = vi.fn();
const fetchCreatorPayouts = vi.fn();
const startCreatorPayoutOnboarding = vi.fn();
const requestCreatorPayout = vi.fn();

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
    startCreatorPayoutOnboarding: (...args: unknown[]) =>
      startCreatorPayoutOnboarding(...args),
    requestCreatorPayout: (...args: unknown[]) => requestCreatorPayout(...args),
    RelayApiError: StubRelayApiError
  };
});

import EarningsDashboardClient from "../../web/app/studio/earnings/EarningsDashboardClient";
import { RelayApiError } from "@/lib/relay-api";

describe("earnings-request-payout", () => {
  beforeEach(() => {
    fetchCreatorEarnings.mockReset();
    fetchCreatorPayouts.mockReset();
    startCreatorPayoutOnboarding.mockReset();
    requestCreatorPayout.mockReset();
    fetchCreatorPayouts.mockResolvedValue({ payouts: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("disables request below threshold and shows remaining", async () => {
    fetchCreatorEarnings.mockResolvedValue({
      available_cents: 500,
      lifetime_cents: 500,
      this_month: { tips: 15, earned_cents: 495 },
      bill_credits: [],
      entries: [],
      payout_threshold_cents: 2000,
      payouts_enabled: true,
      onboarding_status: "complete"
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-request-payout"));
    const btn = screen.getByTestId("earnings-request-payout") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("earnings-payout-remaining").textContent).toMatch(/\$15\.00/);
  });

  it("requests once then soft-refreshes balances and history", async () => {
    fetchCreatorEarnings
      .mockResolvedValueOnce({
        available_cents: 2500,
        lifetime_cents: 2500,
        this_month: { tips: 76, earned_cents: 2508 },
        bill_credits: [],
        entries: [],
        payout_threshold_cents: 2000,
        payouts_enabled: true,
        onboarding_status: "complete"
      })
      .mockResolvedValueOnce({
        available_cents: 0,
        lifetime_cents: 2500,
        this_month: { tips: 76, earned_cents: 2508 },
        bill_credits: [],
        entries: [],
        payout_threshold_cents: 2000,
        payouts_enabled: true,
        onboarding_status: "complete"
      });
    fetchCreatorPayouts
      .mockResolvedValueOnce({ payouts: [] })
      .mockResolvedValueOnce({
        payouts: [
          {
            payout_id: "po_1",
            amount_cents: 2500,
            status: "in_transit",
            requested_at: "2026-07-16T12:00:00.000Z",
            settled_at: null,
            failure_reason: null
          }
        ]
      });
    requestCreatorPayout.mockResolvedValue({ payout_id: "po_1", amount_cents: 2500 });

    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-request-payout"));
    fireEvent.click(screen.getByTestId("earnings-request-payout"));
    await waitFor(() => {
      expect(requestCreatorPayout).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("earnings-available").textContent).toMatch(/\$0\.00/);
    });
    expect(screen.getByTestId("earnings-payout-po_1")).toBeTruthy();
  });

  it("maps below_threshold 409 to remaining copy without wiping earnings", async () => {
    fetchCreatorEarnings.mockResolvedValue({
      available_cents: 2500,
      lifetime_cents: 2500,
      this_month: { tips: 76, earned_cents: 2508 },
      bill_credits: [],
      entries: [],
      payout_threshold_cents: 2000,
      payouts_enabled: true,
      onboarding_status: "complete"
    });
    requestCreatorPayout.mockRejectedValue(
      new RelayApiError("below_threshold", 409, "PAYOUT_ERROR")
    );
    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-request-payout"));
    fireEvent.click(screen.getByTestId("earnings-request-payout"));
    await waitFor(() => {
      expect(screen.getByTestId("earnings-payout-error").textContent).toMatch(
        /Need \$0\.00 more|below/i
      );
    });
    expect(screen.getByTestId("earnings-dashboard")).toBeTruthy();
    expect(screen.getByTestId("earnings-bill-credit")).toBeTruthy();
  });
});
