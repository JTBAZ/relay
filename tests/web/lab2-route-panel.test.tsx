/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropAssetsCard } from "@/app/components/schedule-rail/DropAssetsCard";

afterEach(() => {
  cleanup();
});

describe("DropAssetsCard ritual route panel", () => {
  it("renders v0 routing graphic after media is filled", () => {
    const onAutopost = vi.fn();
    const onFilledChange = vi.fn();

    render(
      <DropAssetsCard
        filled={[
          {
            id: "media_1",
            src: null,
            filename: "wip_sketch.jpg",
            mimeType: "image/jpeg"
          }
        ]}
        onFilledChange={onFilledChange}
        onAutopost={onAutopost}
        scheduleTargets={[]}
        onScheduleAttach={vi.fn()}
        presentation="ritual"
      />
    );

    expect(document.querySelector("[data-lab2-route-panel]")).toBeTruthy();
    expect(screen.getByText("wip_sketch.jpg")).toBeTruthy();
    expect(screen.getByText("Ready to route")).toBeTruthy();
    expect(screen.getByText("IMG")).toBeTruthy();
    expect(screen.getByText("Route to")).toBeTruthy();
    expect(screen.getByText("AutoPost now")).toBeTruthy();
    expect(screen.getByText("Publish immediately")).toBeTruthy();
    expect(screen.getByText("Schedule post")).toBeTruthy();
    expect(screen.getByText("Choose a future event")).toBeTruthy();

    fireEvent.click(screen.getByTestId("drop-assets-autopost"));
    expect(onAutopost).toHaveBeenCalledWith(["media_1"]);
  });
});
