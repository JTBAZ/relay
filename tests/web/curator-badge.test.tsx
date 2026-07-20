/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CuratorBadge } from "../../web/components/patron/CuratorBadge";
import { CommentPin } from "../../web/components/patron/relay/comment-pin";

describe("curator-badge", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Curator label", () => {
    render(<CuratorBadge />);
    expect(screen.getByTestId("curator-badge").textContent).toMatch(/Curator/i);
  });

  it("appears next to author name on comment pin when isCurator", () => {
    render(
      <div style={{ position: "relative", height: 200, width: 200 }}>
        <CommentPin
          index={0}
          comment={{
            id: "c1",
            author: {
              id: "m1",
              displayName: "Patron · abc123",
              handle: "m1",
              avatarUrl: "/placeholder.svg",
              isCurator: true
            },
            text: "Nice work",
            position: { x: 40, y: 40 },
            createdAt: "Just now"
          }}
        />
      </div>
    );
    // Badge is in the tooltip DOM even before hover
    expect(screen.getByTestId("curator-badge")).toBeTruthy();
  });

  it("omits badge when author is not curator", () => {
    render(
      <div style={{ position: "relative", height: 200, width: 200 }}>
        <CommentPin
          index={0}
          comment={{
            id: "c2",
            author: {
              id: "m2",
              displayName: "Patron · def456",
              handle: "m2",
              avatarUrl: "/placeholder.svg",
              isCurator: false
            },
            text: "Hello",
            position: { x: 40, y: 40 },
            createdAt: "1m ago"
          }}
        />
      </div>
    );
    expect(screen.queryByTestId("curator-badge")).toBeNull();
  });
});
