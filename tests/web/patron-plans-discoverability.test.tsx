/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextNavigationMock } from "../mocks/next-navigation";

const fetchPatronSessionIfPresent = vi.fn();
const getPatronNotificationUnreadCount = vi.fn();
const fetchPatronProfileMe = vi.fn();
const fetchTipsWallet = vi.fn();

vi.mock("@/lib/relay-api", () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  }
  return {
    fetchPatronSessionIfPresent: (...args: unknown[]) =>
      fetchPatronSessionIfPresent(...args),
    getPatronNotificationUnreadCount: (...args: unknown[]) =>
      getPatronNotificationUnreadCount(...args),
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    RelayApiError: StubRelayApiError
  };
});

vi.mock("@/lib/patron-profile-api", () => ({
  fetchPatronProfileMe: (...args: unknown[]) => fetchPatronProfileMe(...args)
}));

import { PatronTopNav } from "../../web/app/(consumer)/PatronTopNav";

describe("patron plans discoverability (MB-15B)", () => {
  beforeEach(() => {
    fetchPatronSessionIfPresent.mockReset();
    getPatronNotificationUnreadCount.mockReset();
    fetchPatronProfileMe.mockReset();
    fetchTipsWallet.mockReset();
    nextNavigationMock.pathname = "/feed";
    fetchPatronProfileMe.mockResolvedValue({ avatar_url: null });
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: "alice@example.com",
      creator_id: "c1",
      auth_provider: "patreon",
      patreon_user_id: "p1",
      expires_at: "2026-04-30T00:00:00.000Z"
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes Tips & plans in the account menu without displacing primary nav", async () => {
    fetchTipsWallet.mockRejectedValue({ status: 404, name: "RelayApiError" });
    render(<PatronTopNav />);
    for (const label of ["Feed", "Library", "Inbox", "Profile"]) {
      await waitFor(() => {
        expect(screen.getByText(label)).toBeTruthy();
      });
    }
    fireEvent.click(screen.getByLabelText("Account menu"));
    await waitFor(() => {
      expect(screen.getByTestId("patron-nav-plans")).toBeTruthy();
    });
    const plans = screen.getByTestId("patron-nav-plans") as HTMLAnchorElement;
    expect(plans.getAttribute("href")).toBe("/plans");
    expect(plans.textContent).toMatch(/Tips/i);
  });

  it("shows wallet chip linking to /plans when Tips are enabled", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 3,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: true,
      plan: "free"
    });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByTestId("tip-wallet-chip")).toBeTruthy();
    });
    expect((screen.getByTestId("tip-wallet-chip") as HTMLAnchorElement).href).toMatch(/\/plans$/);
  });
});
