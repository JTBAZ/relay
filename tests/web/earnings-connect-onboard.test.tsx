/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorEarnings = vi.fn();
const fetchCreatorPayouts = vi.fn();
const startCreatorPayoutOnboarding = vi.fn();
const requestCreatorPayout = vi.fn();
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch)
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

const baseEarnings = {
  available_cents: 500,
  lifetime_cents: 500,
  this_month: { tips: 1, earned_cents: 33 },
  bill_credits: [],
  entries: [],
  payout_threshold_cents: 2000,
  payouts_enabled: false,
  onboarding_status: null as string | null
};

describe("earnings-connect-onboard", () => {
  beforeEach(() => {
    mockSearch = "";
    fetchCreatorEarnings.mockReset();
    fetchCreatorPayouts.mockReset();
    startCreatorPayoutOnboarding.mockReset();
    requestCreatorPayout.mockReset();
    fetchCreatorPayouts.mockResolvedValue({ payouts: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows optional onboard CTA and bill credit without Connect", async () => {
    fetchCreatorEarnings.mockResolvedValue({ ...baseEarnings });
    render(<EarningsDashboardClient />);
    await waitFor(() => {
      expect(screen.getByTestId("earnings-connect-onboard")).toBeTruthy();
    });
    expect(screen.getByTestId("earnings-bill-credit")).toBeTruthy();
    expect(screen.getByText(/Cash payouts are optional/i)).toBeTruthy();
    expect(screen.queryByTestId("earnings-request-payout")).toBeNull();
  });

  it("shows resume CTA for pending Connect, not request", async () => {
    fetchCreatorEarnings.mockResolvedValue({
      ...baseEarnings,
      onboarding_status: "pending"
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => {
      expect(screen.getByTestId("earnings-connect-resume")).toBeTruthy();
    });
    expect(screen.queryByTestId("earnings-connect-onboard")).toBeNull();
    expect(screen.queryByTestId("earnings-request-payout")).toBeNull();
  });

  it("starts onboarding and redirects to Stripe URL", async () => {
    fetchCreatorEarnings.mockResolvedValue({ ...baseEarnings });
    startCreatorPayoutOnboarding.mockResolvedValue({
      onboarding_url: "https://connect.stripe.test/setup"
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    render(<EarningsDashboardClient />);
    await waitFor(() => screen.getByTestId("earnings-connect-onboard"));
    fireEvent.click(screen.getByTestId("earnings-connect-onboard"));
    await waitFor(() => {
      expect(startCreatorPayoutOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(assign).toHaveBeenCalledWith("https://connect.stripe.test/setup");
  });

  it("refetches on connect=return without treating URL as success", async () => {
    mockSearch = "connect=return";
    fetchCreatorEarnings.mockResolvedValue({
      ...baseEarnings,
      onboarding_status: "pending"
    });
    render(<EarningsDashboardClient />);
    await waitFor(() => {
      expect(screen.getByTestId("earnings-connect-return-notice")).toBeTruthy();
    });
    expect(fetchCreatorEarnings.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("earnings-connect-status").textContent).toMatch(/Pending/i);
  });
});
