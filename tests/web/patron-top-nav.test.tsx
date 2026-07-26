/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  fetchPatronProfileMe: (...args: unknown[]) => fetchPatronProfileMe(...args),
}));

import { PatronTopNav } from "../../web/app/(consumer)/PatronTopNav";
import { isPatronPrimaryNavItemActive } from "../../web/components/patron/PatronPrimaryTopNav";

describe("<PatronTopNav />", () => {
  beforeEach(() => {
    fetchPatronSessionIfPresent.mockReset();
    getPatronNotificationUnreadCount.mockReset();
    fetchPatronProfileMe.mockReset();
    fetchTipsWallet.mockReset();
    fetchTipsWallet.mockRejectedValue({ status: 404, name: "RelayApiError" });
    nextNavigationMock.pathname = "/feed";
    fetchPatronProfileMe.mockResolvedValue({ avatar_url: null });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns nothing when there's no session (no nav chrome on signed-out shell)", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue(null);
    const { container } = render(<PatronTopNav />);
    await waitFor(() => {
      expect(container.querySelector("nav")).toBeNull();
    });
    expect(getPatronNotificationUnreadCount).not.toHaveBeenCalled();
  });

  it("renders the four primary nav items when signed in", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: "alice@example.com",
      creator_id: "c1",
      auth_provider: "patreon",
      patreon_user_id: "p1",
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    for (const label of ["Feed", "Library", "Inbox", "Profile"]) {
      await waitFor(() => {
        expect(screen.getByText(label)).toBeTruthy();
      });
    }
    expect(screen.queryByText("Discover")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("marks the active link with aria-current='page' based on pathname", async () => {
    nextNavigationMock.pathname = "/library";
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      const libraryLink = screen.getByRole("link", { name: /library/i });
      expect(libraryLink.getAttribute("aria-current")).toBe("page");
    });
    const feedLink = screen.getByRole("link", { name: /feed/i });
    expect(feedLink.getAttribute("aria-current")).toBeNull();
  });

  it("treats /notifications/preferences as still the Inbox tab", async () => {
    expect(
      isPatronPrimaryNavItemActive("/notifications/preferences", "/notifications")
    ).toBe(true);
    nextNavigationMock.pathname = "/notifications/preferences";
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      const inboxLink = screen.getByRole("link", { name: /inbox/i });
      expect(inboxLink.getAttribute("aria-current")).toBe("page");
    });
  });

  it("renders the unread badge when the count is > 0", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 7 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByLabelText("7 unread")).toBeTruthy();
    });
  });

  it("clamps very large unread counts to '99+' for display", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 247 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByText("99+")).toBeTruthy();
    });
  });

  it("does not show a badge when unread count is zero", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /inbox/i })).toBeTruthy();
    });
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it("mounts the account menu instead of inline email or role switcher", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: "alice@example.com",
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z",
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /account menu/i })).toBeTruthy();
    });
    expect(screen.queryByText("alice@example.com")).toBeNull();
  });
});
