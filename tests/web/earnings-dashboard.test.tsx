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

describe("EarningsDashboardClient", () => {
  beforeEach(() => {
    fetchCreatorEarnings.mockReset();
    fetchCreatorPayouts.mockReset();
    fetchCreatorPayouts.mockResolvedValue({ payouts: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows $0 bill-covered placeholder and balances", async () => {
    fetchCreatorEarnings.mockResolvedValue({
      available_cents: 66,
      lifetime_cents: 99,
      this_month: { tips: 2, earned_cents: 66 },
      bill_credits: [],
      entries: [
        {
          id: "e1",
          entry_kind: "tip_earned",
          amount_cents: 33,
          reveal_id: "r1",
          created_at: "2026-07-16T00:00:00.000Z"
        }
      ],
      payout_threshold_cents: 2000,
      payouts_enabled: false,
      onboarding_status: null
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => {
      expect(screen.getByTestId("earnings-dashboard")).toBeTruthy();
    });
    expect(screen.getByTestId("earnings-bill-covered").textContent).toMatch(
      /Fans covered \$0\.00/
    );
    expect(screen.getByTestId("earnings-available").textContent).toMatch(/\$0\.66/);
    expect(screen.getByTestId("earnings-lifetime").textContent).toMatch(/\$0\.99/);
    expect(screen.getByTestId("earnings-this-month").textContent).toMatch(/2 Tips/);
    expect(screen.getByTestId("earnings-ledger")).toBeTruthy();
    expect(screen.getByTestId("earnings-payouts")).toBeTruthy();
    expect(screen.getByTestId("earnings-connect-onboard")).toBeTruthy();
  });

  it("shows empty ledger copy when no entries", async () => {
    fetchCreatorEarnings.mockResolvedValue({
      available_cents: 0,
      lifetime_cents: 0,
      this_month: { tips: 0, earned_cents: 0 },
      bill_credits: [],
      entries: [],
      payout_threshold_cents: 2000
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => {
      expect(screen.getByTestId("earnings-ledger-empty")).toBeTruthy();
    });
  });
});
