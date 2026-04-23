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
    RelayApiError: StubRelayApiError
  };
});

import CreatorProfileClient from "../../web/app/designer/profile/CreatorProfileClient";

const baseIdentity = {
  public_slug: "my-studio",
  slug_source: "user_chosen" as const,
  patreon_campaign_id: null,
  username: "studio_handle",
  username_norm: "studio_handle",
  display_name: "Studio Display",
  avatar_url: "https://cdn.example/avatar.jpg",
  banner_url: null,
  bio: "Pixel artist.",
  discipline: "Illustration",
  needs_setup: false
};

describe("<CreatorProfileClient />", () => {
  beforeEach(() => {
    getCreatorProfile.mockReset();
    patchCreatorProfile.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads identity and pre-fills the form", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));
    expect((await screen.findByLabelText(/display name/i) as HTMLInputElement).value).toBe(
      "Studio Display"
    );
    expect((screen.getByLabelText(/^username$/i) as HTMLInputElement).value).toBe(
      "studio_handle"
    );
    expect((screen.getByLabelText(/avatar url/i) as HTMLInputElement).value).toBe(
      "https://cdn.example/avatar.jpg"
    );
    expect((screen.getByLabelText(/^bio$/i) as HTMLTextAreaElement).value).toBe(
      "Pixel artist."
    );
    expect((screen.getByLabelText(/discipline/i) as HTMLInputElement).value).toBe(
      "Illustration"
    );
    expect(screen.getByRole("link", { name: /view public page/i })).toBeTruthy();
  });

  it("links to Action Center when public slug differs from @username URL form", async () => {
    getCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      public_slug: "my-studio",
      username_norm: "other_handle"
    });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));
    const ac = await screen.findByRole("link", { name: /edit public url in action center/i });
    expect(ac.getAttribute("href")).toBe("/action-center");
  });

  it("Save is disabled when nothing changed; PATCH only sends dirty fields", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    patchCreatorProfile.mockResolvedValue({
      ...baseIdentity,
      display_name: "New Name"
    });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    const save = await screen.findByRole("button", { name: /save changes/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "New Name" }
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);
    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).toHaveBeenCalledWith({ display_name: "New Name" });
  });

  it("clearing a field sends explicit null in the PATCH", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    patchCreatorProfile.mockResolvedValue({ ...baseIdentity, bio: null });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/^bio$/i), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    expect(patchCreatorProfile).toHaveBeenCalledWith({ bio: null });
  });

  it("blocks save when bio exceeds 280 chars", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity, bio: "" });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/^bio$/i), {
      target: { value: "x".repeat(281) }
    });
    const save = screen.getByRole("button", { name: /save changes/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(patchCreatorProfile).not.toHaveBeenCalled();
  });

  it("Discard changes restores the baseline values", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    const displayNameInput = (await screen.findByLabelText(
      /display name/i
    )) as HTMLInputElement;
    fireEvent.change(displayNameInput, { target: { value: "Different" } });
    expect(displayNameInput.value).toBe("Different");

    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(displayNameInput.value).toBe("Studio Display");
  });

  it("surfaces server error from PATCH and does not lose form state", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity });
    patchCreatorProfile.mockRejectedValue(new Error("That username is already taken."));
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/^username$/i), {
      target: { value: "popular" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patchCreatorProfile).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/already taken/i);
    expect((screen.getByLabelText(/^username$/i) as HTMLInputElement).value).toBe(
      "popular"
    );
  });

  it("shows username sanitization preview when input has invalid chars", async () => {
    getCreatorProfile.mockResolvedValue({ ...baseIdentity, username: null });
    render(<CreatorProfileClient />);
    await waitFor(() => expect(getCreatorProfile).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/^username$/i), {
      target: { value: "Cool-Artist!42" }
    });
    // The sanitized preview span renders the normalized form alongside the @ prefix.
    const previewSpan = screen.getByText("@coolartist42");
    expect(previewSpan).toBeTruthy();
  });
});
