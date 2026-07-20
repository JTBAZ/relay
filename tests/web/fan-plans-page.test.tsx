/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchTipsWallet = vi.fn();
const createFanBillingCheckout = vi.fn();
const createReloadPackCheckout = vi.fn();
const fetchPatronSupportSummary = vi.fn();
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
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    createFanBillingCheckout: (...args: unknown[]) => createFanBillingCheckout(...args),
    createReloadPackCheckout: (...args: unknown[]) => createReloadPackCheckout(...args),
    fetchPatronSupportSummary: (...args: unknown[]) => fetchPatronSupportSummary(...args),
    RelayApiError: StubRelayApiError
  };
});

import FanPlansClient from "../../web/app/(consumer)/plans/FanPlansClient";

describe("FanPlansClient", () => {
  beforeEach(() => {
    mockSearch = "";
    fetchTipsWallet.mockReset();
    createFanBillingCheckout.mockReset();
    createReloadPackCheckout.mockReset();
    fetchPatronSupportSummary.mockReset();
    fetchPatronSupportSummary.mockRejectedValue(
      Object.assign(new Error("not enabled"), { name: "RelayApiError", status: 404, code: "NOT_FOUND" })
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("shows free plan as current and patronage pitch", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 2,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "free",
      monthly_allowance: 0,
      rollover_cap: null
    });
    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plans")).toBeTruthy();
    });
    expect(screen.getByTestId("fan-plans-pitch").textContent).toMatch(
      /Your gallery is always free/i
    );
    expect(screen.getByTestId("fan-plan-free-current")).toBeTruthy();
    expect(screen.getByTestId("fan-plans-upgrade-supporter")).toBeTruthy();
    expect(screen.queryByTestId("fan-plans-reload")).toBeNull();
  });

  it("shows supporter current and reload CTA", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 5,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "supporter",
      monthly_allowance: 5,
      rollover_cap: 10
    });
    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plan-supporter-current")).toBeTruthy();
    });
    expect(screen.getByTestId("fan-plans-current").textContent).toMatch(/Supporter/);
    expect(screen.getByTestId("fan-plans-reload-cta")).toBeTruthy();
  });

  it("shows curator current state", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 15,
      purchased_balance: 10,
      next_grant_period: "2026-08",
      beta: false,
      plan: "curator",
      monthly_allowance: 15,
      rollover_cap: 30
    });
    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plan-curator-current")).toBeTruthy();
    });
    expect(screen.getByTestId("fan-plans-reload")).toBeTruthy();
  });

  it("upgrade click calls fan checkout", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "free"
    });
    createFanBillingCheckout.mockResolvedValue({
      checkout_url: "https://checkout.stripe.test/fan"
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plans-upgrade-curator")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("fan-plans-upgrade-curator"));
    await waitFor(() => {
      expect(createFanBillingCheckout).toHaveBeenCalledWith("curator");
    });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/fan");
    vi.unstubAllGlobals();
  });

  it("shows tip_reveal context banner for free fans", async () => {
    mockSearch = "from=tip_reveal";
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "free"
    });
    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plans-from-tip-reveal")).toBeTruthy();
    });
    expect(screen.getByTestId("fan-plans-from-tip-reveal").textContent).toMatch(/compare plans/i);
    expect(screen.getByTestId("fan-plan-supporter").getAttribute("data-highlighted")).toBe("true");
    expect(screen.queryByTestId("fan-plans-reload")).toBeNull();
  });

  it("highlights reload section for paid fans arriving from tip_reveal", async () => {
    mockSearch = "from=tip_reveal";
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: false,
      plan: "supporter",
      monthly_allowance: 5
    });
    render(<FanPlansClient />);
    await waitFor(() => {
      expect(screen.getByTestId("fan-plans-reload")).toBeTruthy();
    });
    expect(screen.getByTestId("fan-plans-from-tip-reveal").textContent).toMatch(/Reload/i);
    expect(screen.getByTestId("fan-plans-reload").getAttribute("data-highlighted")).toBe("true");
  });
});
