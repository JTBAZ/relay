/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatronConnectClient } from "../../web/app/patreon/patron/connect/PatronConnectClient";

vi.mock("@/lib/relay-api", () => ({
  fetchPatronSessionIfPresent: vi.fn().mockResolvedValue({
    email: "patron@example.com",
    email_verified: true,
    patreon_user_id: null
  })
}));

vi.mock("@/lib/patron-patron-redirect-uri", () => ({
  patronPatronOAuthRedirectUri: () => "http://localhost:3000/patreon/patron/callback"
}));

describe("PatronConnectClient PILOT-008", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders modern connect shell with Patreon CTA", async () => {
    render(<PatronConnectClient initialClientId="test-client-id" />);
    expect(await screen.findByRole("heading", { name: /connect your patreon/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /continue with patreon/i })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Relay" })).toBeNull();
  });
});
