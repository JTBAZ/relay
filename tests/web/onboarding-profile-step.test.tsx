/** @vitest-environment happy-dom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCreatorProfile = vi.fn();
const patchCreatorProfile = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  // Keep the named exports the step pulls in; everything else is unused here.
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
    getCreatorProfile: (...args: unknown[]) => getCreatorProfile(...args),
    patchCreatorProfile: (...args: unknown[]) => patchCreatorProfile(...args),
    RelayApiError: StubRelayApiError,
    RELAY_CREATOR_ID_STORAGE_KEY: "relay_creator_id",
    RELAY_PUBLIC_SLUG_STORAGE_KEY: "relay_public_slug",
    buildPatreonCreatorAuthorizeUrl: vi.fn(),
    fetchPatronSessionIfPresent: vi.fn(),
    hasRelaySignedInCookie: vi.fn(),
    postCreatorWorkspace: vi.fn(),
    postPatreonCreatorPrepare: vi.fn()
  };
});

// Heavy panels imported by step-panels but irrelevant here — stub to avoid
// pulling in supabase client setup, etc.
vi.mock("@/app/components/studio/StudioSupabaseSignInPanel", () => ({
  StudioSupabaseSignInPanel: () => null
}));
vi.mock("@/app/components/auth/SupporterSignInPanel", () => ({
  SupporterSignInPanel: () => null
}));
vi.mock("@/app/components/InstallExtensionPrompt", () => ({
  InstallExtensionPrompt: () => null
}));
vi.mock("@/app/components/relay-logo-animation", () => ({
  default: () => null
}));
vi.mock("@/lib/patreon-patron-scopes", () => ({
  PATREON_PATRON_OAUTH_SCOPES: "identity"
}));
vi.mock("@/lib/patron-patron-redirect-uri", () => ({
  patronPatronOAuthRedirectUri: () => ""
}));
vi.mock("@/lib/patron-oauth-state", () => ({
  encodePatronOAuthNonce: () => ""
}));

import { StepCreatorProfileBasics } from "../../web/app/components/onboarding/step-panels";

const baseIdentity = {
  public_slug: "my-studio",
  slug_source: "allocated" as const,
  patreon_campaign_id: null,
  username: null,
  username_norm: null,
  display_name: null,
  avatar_url: null,
  banner_url: null,
  bio: null,
  discipline: null,
  needs_setup: true
};

describe("<StepCreatorProfileBasics />", () => {
  beforeEach(() => {
    getCreatorProfile.mockReset();
    patchCreatorProfile.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("pre-fills inputs from CreatorProfile defaults", async () => {
    getCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "Studio Display",
      username: "studio_handle",
      avatar_url: "https://cdn.example/avatar.jpg",
      bio: "Pixel artist."
    });
    render(<StepCreatorProfileBasics />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));
    expect(
      (await screen.findByLabelText(/display name/i)) as HTMLInputElement
    ).toHaveProperty("value", "Studio Display");
    expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe(
      "studio_handle"
    );
    expect((screen.getByLabelText(/avatar url/i) as HTMLInputElement).value).toBe(
      "https://cdn.example/avatar.jpg"
    );
    expect(
      (screen.getByLabelText(/short bio/i) as HTMLTextAreaElement).value
    ).toBe("Pixel artist.");
  });

  it("PATCHes only changed fields and advances", async () => {
    getCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "Old Name",
      username: "old_handle"
    });
    patchCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "New Name",
      username: "old_handle"
    });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    const displayNameInput = await screen.findByLabelText(/display name/i);
    fireEvent.change(displayNameInput, { target: { value: "New Name" } });

    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).toHaveBeenCalledWith({
      display_name: "New Name"
    });
    await waitFor(() => expect(onAdvance).toHaveBeenCalledTimes(1));
  });

  it("Skip-for-now advances without calling PATCH", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    expect(patchCreatorProfile).not.toHaveBeenCalled();
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("Empty save (no edits) advances without calling PATCH", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).not.toHaveBeenCalled();
  });

  it("Surfaces server error message and does not advance", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    patchCreatorProfile.mockRejectedValue(new Error("That username is reserved."));
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/username/i), {
      target: { value: "admin" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/reserved/i);
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
