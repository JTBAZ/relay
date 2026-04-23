/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextNavigationMock } from "../mocks/next-navigation";

// next/navigation is already aliased to tests/mocks/next-navigation.ts via vitest.config.ts;
// we just mutate `nextNavigationMock.pathname` per test.

// next/link is aliased to tests/mocks/next-link.tsx via vitest.config.ts -- same alias
// pattern as next/navigation. The stub renders a plain <a>.

const fetchPatronSessionIfPresent = vi.fn();
const getPatronNotificationUnreadCount = vi.fn();

vi.mock("@/lib/relay-api", () => ({
  fetchPatronSessionIfPresent: (...args: unknown[]) =>
    fetchPatronSessionIfPresent(...args),
  getPatronNotificationUnreadCount: (...args: unknown[]) =>
    getPatronNotificationUnreadCount(...args)
}));

// RoleSwitcher pulls in the relay-api fetch helpers we don't care about here. Stubbed via
// a file mock for hoist reliability; the stub renders <div data-testid="role-switcher-stub" />.
vi.mock("@/app/components/RoleSwitcher", async () => {
  return await import("../mocks/role-switcher-stub");
});

import { PatronTopNav } from "../../web/app/patron/PatronTopNav";

describe("<PatronTopNav />", () => {
  beforeEach(() => {
    fetchPatronSessionIfPresent.mockReset();
    getPatronNotificationUnreadCount.mockReset();
    nextNavigationMock.pathname = "/patron/feed";
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns nothing when there's no session (no nav chrome on signed-out shell)", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue(null);
    const { container } = render(<PatronTopNav />);
    // Initial render is the loading skeleton (aria-hidden); after the async resolve the
    // component should unmount the skeleton and render null.
    await waitFor(() => {
      expect(container.querySelector("nav")).toBeNull();
    });
    expect(getPatronNotificationUnreadCount).not.toHaveBeenCalled();
  });

  it("renders all six canonical nav items when signed in", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: "alice@example.com",
      creator_id: "c1",
      auth_provider: "patreon",
      patreon_user_id: "p1",
      expires_at: "2026-04-30T00:00:00.000Z"
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    for (const label of ["Feed", "Library", "Discover", "Inbox", "Settings", "Profile"]) {
      await waitFor(() => {
        expect(screen.getByText(label)).toBeTruthy();
      });
    }
  });

  it("marks the active link with aria-current='page' based on pathname", async () => {
    nextNavigationMock.pathname = "/patron/library";
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z"
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      const libraryLink = screen.getByRole("link", { name: /library/i });
      expect(libraryLink.getAttribute("aria-current")).toBe("page");
    });
    // Other tabs should NOT be marked active.
    const feedLink = screen.getByRole("link", { name: /feed/i });
    expect(feedLink.getAttribute("aria-current")).toBeNull();
  });

  it("treats /patron/notifications/preferences as still the Inbox tab", async () => {
    nextNavigationMock.pathname = "/patron/notifications/preferences";
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z"
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
      expires_at: "2026-04-30T00:00:00.000Z"
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
      expires_at: "2026-04-30T00:00:00.000Z"
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
      expires_at: "2026-04-30T00:00:00.000Z"
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /inbox/i })).toBeTruthy();
    });
    // The badge is the only element with aria-label matching `\d+ unread`.
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it("mounts the RoleSwitcher in the right-side controls", async () => {
    fetchPatronSessionIfPresent.mockResolvedValue({
      user_id: "u1",
      email: null,
      creator_id: "c1",
      auth_provider: null,
      patreon_user_id: null,
      expires_at: "2026-04-30T00:00:00.000Z"
    });
    getPatronNotificationUnreadCount.mockResolvedValue({ unread_count: 0 });
    render(<PatronTopNav />);
    await waitFor(() => {
      expect(screen.getByTestId("role-switcher-stub")).toBeTruthy();
    });
  });
});
