/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";

const fixture = vi.hoisted(() => ({ cookie: true, state: "consent_required", sync: vi.fn() }));
vi.mock("../../extension/src/lib/browser", () => ({ default: {
  cookies: { get: async () => fixture.cookie ? { value: "fixture-only" } : null },
  runtime: { sendMessage: async (message: { type: string }) => message.type === "SYNC_NOW" ? fixture.sync() : ({
    hasGrant: true, relayCreatorId: "workspace", accountId: "account", consentError: null,
    lastSyncAt: null, lastSyncStatus: fixture.state, credentialState: { status: fixture.state }
  }) },
  tabs: { create: vi.fn() }
} }));
vi.mock("../../extension/src/popup-post-link", () => ({ renderPostLinkFallbackSections: async () => {} }));

beforeEach(() => {
  vi.resetModules();
  fixture.cookie = true;
  fixture.state = "consent_required";
  fixture.sync.mockReset();
  document.body.innerHTML = '<section id="relay-region" aria-live="polite"></section>';
});

describe("popup credential recovery", () => {
  it.each(["consent_required", "capture_unavailable"])("shows browser login before %s recovery when logged out", async (state) => {
    fixture.state = state; fixture.cookie = false;
    await import("../../extension/src/popup");
    await waitFor(() => expect(document.body.textContent).toContain("Open Patreon login"));
    expect(document.body.textContent).toContain("not logged into Patreon in this browser");
    expect(document.body.textContent).not.toContain("Authorize again");
  });

  it("offers fresh consent once the browser session is present", async () => {
    await import("../../extension/src/popup");
    await waitFor(() => expect(document.body.textContent).toContain("Authorize again"));
  });

  it("renders current state after a superseded check without a sticky old failure", async () => {
    fixture.state = "stored";
    let finish!: (value: unknown) => void;
    fixture.sync.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await import("../../extension/src/popup");
    await waitFor(() => expect(document.body.textContent).toContain("Check connection"));
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "Check connection")!;
    button.click(); button.click();
    expect(fixture.sync).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    finish({ ok: false, reason: "superseded" });
    await waitFor(() => expect(document.body.textContent).toContain("Check connection"));
    expect(document.body.textContent).not.toContain("connection changed");
    expect(document.activeElement?.textContent).toBe("Check connection");
    expect(document.getElementById("relay-region")?.getAttribute("aria-busy")).toBe("false");
  });
});
