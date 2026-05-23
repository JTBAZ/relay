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
const patchCreatorPublicSlug = vi.fn();

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
    patchCreatorPublicSlug: (...args: unknown[]) => patchCreatorPublicSlug(...args),
    RELAY_API_BASE: "http://localhost:8787",
    RelayApiError: StubRelayApiError,
    RELAY_CREATOR_ID_STORAGE_KEY: "relay_creator_id",
    RELAY_PUBLIC_SLUG_STORAGE_KEY: "relay_public_slug",
    putRelayNativeUpload: vi.fn(),
    relayNativeUploadCommit: vi.fn(),
    relayNativeUploadInit: vi.fn(),
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
    patchCreatorPublicSlug.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("pre-fills creator name from display_name and other profile fields", async () => {
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
      (await screen.findByLabelText(/creator name/i)) as HTMLInputElement
    ).toHaveProperty("value", "Studio Display");
    expect((screen.getByLabelText(/avatar image/i) as HTMLInputElement).value).toBe(
      "https://cdn.example/avatar.jpg"
    );
    expect(
      (screen.getByLabelText(/short bio/i) as HTMLTextAreaElement).value
    ).toBe("Pixel artist.");
  });

  it("PATCHes display name, derived username, and advances", async () => {
    getCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "Old Name",
      username: "old_handle"
    });
    patchCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "New Name",
      username: "newname"
    });
    patchCreatorPublicSlug.mockResolvedValue({
      public_slug: "newname",
      slug_source: "user_chosen"
    });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/creator name/i), {
      target: { value: "New Name" }
    });

    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).toHaveBeenCalledWith({
      display_name: "New Name",
      username: "newname"
    });
    expect(patchCreatorPublicSlug).toHaveBeenCalledWith("newname");
    await waitFor(() => expect(onAdvance).toHaveBeenCalledTimes(1));
  });

  it("requires creator name", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: /skip for now/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    expect(patchCreatorProfile).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("claims URL from derived handle when profile is already uniform", async () => {
    getCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "Studio",
      username: "studio",
      username_norm: "studio"
    });
    patchCreatorPublicSlug.mockResolvedValue({
      public_slug: "studio",
      slug_source: "user_chosen"
    });
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).not.toHaveBeenCalled();
    expect(patchCreatorPublicSlug).toHaveBeenCalledWith("studio");
  });

  it("Surfaces server error message and does not advance", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    patchCreatorProfile.mockRejectedValue(new Error("That username is reserved."));
    const onAdvance = vi.fn();
    render(<StepCreatorProfileBasics onAdvance={onAdvance} />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/creator name/i), {
      target: { value: "admin" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/reserved/i);
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
