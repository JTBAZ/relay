/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), exchange: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("ext_id=fixture&installation_id=fixture")
}));
vi.mock("@/lib/relay-extension-ids", () => ({
  parseRelayExtensionIds: () => new Set(["fixture"]),
  isRecognizedRelayExtensionId: () => true
}));
vi.mock("@/lib/relay-api", () => ({ relayFetch: mocks.fetch }));
vi.mock("@/lib/relay-extension-messaging", () => ({ sendConsentCodeToExtension: mocks.exchange }));

import { AuthorizeClient } from "../../web/app/extension/authorize/AuthorizeClient";

describe("extension authorization announcements", () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue({ consent_code: "fixture-code" });
    mocks.exchange.mockReset().mockResolvedValue({ ok: true, credentialCapture: "stored" });
  });
  afterEach(cleanup);

  it("announces a failed exchange after replacing the authorization button", async () => {
    mocks.exchange.mockResolvedValue({ ok: false, error: "The connection changed. Authorize again." });
    render(<AuthorizeClient />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The connection changed.");
    expect(screen.queryByRole("button", { name: "Authorize" })).toBeNull();
  });

  it("announces a request failure while preserving its retry button", async () => {
    mocks.fetch.mockRejectedValue(new Error("Relay is unavailable. Try again."));
    render(<AuthorizeClient />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Relay is unavailable.");
    expect((screen.getByRole("button", { name: "Authorize" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables repeated authorization while pending and announces the capture outcome", async () => {
    let finish!: (value: { consent_code: string }) => void;
    mocks.fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mocks.exchange.mockResolvedValue({ ok: true, credentialCapture: "missing_browser_session" });
    render(<AuthorizeClient />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
    const pending = screen.getByRole("button", { name: "Authorizing…" }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    fireEvent.click(pending);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    finish({ consent_code: "fixture-code" });
    await waitFor(() => expect(screen.getAllByRole("status")[0]?.textContent).toContain("Log into Patreon"));
    expect(screen.getAllByRole("status")[0]?.getAttribute("aria-live")).toBe("polite");
  });
});
