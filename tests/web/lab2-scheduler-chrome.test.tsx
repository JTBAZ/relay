/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleRail } from "@/app/components/schedule-rail/ScheduleRail";
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

describe("ScheduleRail ritual (lab2) chrome", () => {
  it("renders v0 compact header below intake band", () => {
    render(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        dropPresentation="ritual"
        allowAddScheduledPost
      />
    );

    const rail = screen.getByLabelText("Scheduler");
    expect(rail.getAttribute("data-drop-presentation")).toBe("ritual");
    expect(document.querySelector("[data-lab2-intake-band]")).toBeTruthy();
    expect(screen.getByText("Scheduler")).toBeTruthy();
    expect(screen.getByText("July 2026")).toBeTruthy();
    expect(screen.getByText("Drop media here")).toBeTruthy();
    expect(document.querySelector("[data-lab2-drop-invite]")).toBeTruthy();
    expect(screen.queryByText("Monthly Goal")).toBeNull();
    expect(screen.queryByText(/timeline$/i)).toBeNull();
    expect(screen.getByText("Publish character drop")).toBeTruthy();
  });

  it("keeps classic serif header for default presentation", () => {
    render(
      <ScheduleRail
        data={SAMPLE}
        onDataChange={vi.fn()}
        remindersGlobal
        onRemindersToggle={vi.fn()}
        dropPresentation="default"
      />
    );

    const rail = screen.getByLabelText("Scheduler");
    expect(rail.getAttribute("data-drop-presentation")).toBe("default");
    expect(screen.getByText("Monthly Goal")).toBeTruthy();
    expect(screen.getByText(/July timeline/i)).toBeTruthy();
    expect(document.querySelector("[data-lab2-drop-invite]")).toBeNull();
  });
});
