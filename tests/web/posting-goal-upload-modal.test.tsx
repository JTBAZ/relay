/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadFilesToRelayStaging = vi.fn();

vi.mock("@/lib/relay-native-staging-upload", () => ({
  uploadFilesToRelayStaging: (...args: unknown[]) => uploadFilesToRelayStaging(...args),
}));

import PostingGoalUploadModal from "../../web/app/components/studio/PostingGoalUploadModal";

describe("<PostingGoalUploadModal />", () => {
  beforeEach(() => {
    uploadFilesToRelayStaging.mockReset();
    uploadFilesToRelayStaging.mockResolvedValue({
      uploaded: [{ media_id: "m1", content_type: "image/png", filename: "wip.png", byte_size: 10 }],
      errors: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the shared library upload drop zone", () => {
    render(
      <PostingGoalUploadModal open creatorId="cr1" onClose={() => undefined} />
    );
    expect(screen.getByRole("dialog", { name: /upload media to your bin/i })).toBeTruthy();
    expect(screen.getByText(/drop files here or/i)).toBeTruthy();
    expect(screen.getByText(/browse/i)).toBeTruthy();
  });

  it("offers Start Autopost after a successful upload", async () => {
    const onUploaded = vi.fn();
    render(
      <PostingGoalUploadModal
        open
        creatorId="cr1"
        onClose={() => undefined}
        onUploaded={onUploaded}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abc"], "wip.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadFilesToRelayStaging).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledWith(1);
    expect(screen.getByRole("link", { name: /start autopost/i })).toBeTruthy();
    expect(screen.getByText(/1 file staged in your bin/i)).toBeTruthy();
  });
});
