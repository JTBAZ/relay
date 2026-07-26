/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleRail } from "@/app/components/schedule-rail/ScheduleRail";
import { Lab2IntakeBand } from "@/app/components/studio-lab2/Lab2IntakeBand";
import { RELAY_STAGED_MEDIA_MIME } from "@/lib/staged-media-dnd";
import type { ScheduleData } from "@/lib/schedule-rail-data";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/studio/lab2",
  useSearchParams: () => new URLSearchParams()
}));

const SAMPLE: ScheduleData = {
  month: "2026-07",
  timezone: "America/New_York",
  remind_me_global: true,
  cadence: { posted: 1, target: 4 },
  postbot: { done: 0, total: 0 },
  ready: [],
  events: [
    {
      id: "ev_1",
      action: "post",
      title: "Publish character drop",
      destination: "x",
      at: "2026-07-22T15:00:00.000Z",
      notify: true,
      status: "pending"
    }
  ]
};

afterEach(() => {
  cleanup();
});

describe("Lab2 Bay→Rail corridor", () => {
  it("arms intake band from corridorArmed before pointer enters", () => {
    const { rerender } = render(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        dropPresentation="ritual"
        corridorArmed={false}
        allowAddScheduledPost
      />
    );

    expect(document.querySelector("[data-lab2-intake-band]")).toBeTruthy();
    expect(screen.getByText("Drop media here")).toBeTruthy();
    expect(screen.getByText("drag from the bay →")).toBeTruthy();
    expect(screen.queryByText("Release to schedule")).toBeNull();

    rerender(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        dropPresentation="ritual"
        corridorArmed
        allowAddScheduledPost
      />
    );

    expect(screen.getByText("Release to schedule")).toBeTruthy();
    expect(
      document.querySelector("[data-lab2-intake-band]")?.getAttribute("data-armed")
    ).toBe("true");
    expect(screen.getByLabelText("Scheduler").getAttribute("data-corridor-armed")).toBe(
      "true"
    );
  });

  it("accepts staged media drop on the intake band", () => {
    const onAccept = vi.fn();
    render(<Lab2IntakeBand armed={false} onAccept={onAccept} />);

    const band = document.querySelector("[data-lab2-intake-band]")!;
    const payload = JSON.stringify({
      media_ids: ["media_1"],
      items: [
        {
          id: "media_1",
          src: null,
          filename: "character_final.png",
          mimeType: "image/png"
        }
      ]
    });

    fireEvent.drop(band, {
      dataTransfer: {
        types: [RELAY_STAGED_MEDIA_MIME],
        getData: (type: string) =>
          type === RELAY_STAGED_MEDIA_MIME || type === "text/plain" ? payload : "",
        dropEffect: "copy"
      }
    });

    expect(onAccept).toHaveBeenCalledWith([
      expect.objectContaining({ id: "media_1", filename: "character_final.png" })
    ]);
  });

  it("keeps intake above Scheduler identity (corridor row)", () => {
    render(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        dropPresentation="ritual"
      />
    );

    const rail = screen.getByLabelText("Scheduler");
    const intake = rail.querySelector("[data-lab2-intake-band]");
    const label = screen.getByText("Scheduler");
    expect(intake).toBeTruthy();
    expect(
      intake!.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
