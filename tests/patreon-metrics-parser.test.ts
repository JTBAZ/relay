import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  parsePatreonPostMetricsFromDocument,
  parsePatreonPostPerformanceMetrics,
  patreonMetricsHaveNumericCounters
} from "../extension/src/lib/patreon-metrics-parser.js";

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Relay test post" />
    <meta property="article:published_time" content="2026-06-30T12:00:00.000Z" />
  </head>
  <body>
    <h1 data-tag="post-title">Relay test post</h1>
    <time datetime="2026-06-30T12:00:00.000Z">June 30, 2026</time>
    <button aria-label="Like this post">12</button>
    <a href="#comments">3 Comments</a>
    <div><span>Impressions</span><strong>1,205</strong></div>
    <div aria-label="Seen by patrons">340 Seen</div>
  </body>
</html>`;

describe("parsePatreonPostMetricsFromDocument", () => {
  it("extracts title, publish text, likes, and comments from fixture HTML", () => {
    const window = new Window({
      url: "https://www.patreon.com/RelayTEST/posts/test-162544992"
    });
    window.document.write(FIXTURE_HTML);

    const result = parsePatreonPostMetricsFromDocument(window.document as unknown as Document);

    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric_type: "title",
          raw: expect.objectContaining({ text: "Relay test post" })
        }),
        expect.objectContaining({
          metric_type: "published_at_text",
          raw: expect.objectContaining({ text: "2026-06-30T12:00:00.000Z" })
        }),
        expect.objectContaining({ metric_type: "likes", value: 12 }),
        expect.objectContaining({ metric_type: "comments", value: 3 }),
        expect.objectContaining({ metric_type: "impressions", value: 1205 }),
        expect.objectContaining({ metric_type: "seen", value: 340 })
      ])
    );
    expect(patreonMetricsHaveNumericCounters(result.metrics)).toBe(true);
  });

  it("returns metadata-only metrics when counters are absent", () => {
    const window = new Window({
      url: "https://www.patreon.com/posts/test-1"
    });
    window.document.write("<html><body><h1>Title only</h1></body></html>");

    const result = parsePatreonPostMetricsFromDocument(window.document as unknown as Document);

    expect(result.metrics).toEqual([
      expect.objectContaining({ metric_type: "title", raw: expect.objectContaining({ text: "Title only" }) })
    ]);
    expect(result.diagnostics.likes_miss).toBeTruthy();
    expect(result.diagnostics.comments_miss).toBeTruthy();
  });
});

const POST_PERFORMANCE_PANEL_HTML = `<!doctype html>
<html>
  <body>
    <div role="dialog">
      <h2>Post performance</h2>
      <section>
        <h3>Total reach</h3>
        <div><span>Impressions</span><span>1</span></div>
        <div><span>Seen</span><span>1</span></div>
      </section>
      <section>
        <h3>Activity</h3>
        <div><span>Likes</span><span>0</span></div>
        <div><span>Comments</span><span>0</span></div>
      </section>
    </div>
  </body>
</html>`;

describe("parsePatreonPostPerformanceMetrics", () => {
  it("extracts reach and activity metrics from the creator Post performance panel", () => {
    const window = new Window({
      url: "https://www.patreon.com/RelayTEST/posts/test-162544992"
    });
    window.document.write(POST_PERFORMANCE_PANEL_HTML);

    const result = parsePatreonPostPerformanceMetrics(window.document as unknown as Document);

    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric_type: "impressions", value: 1 }),
        expect.objectContaining({ metric_type: "seen", value: 1 }),
        expect.objectContaining({ metric_type: "likes", value: 0 }),
        expect.objectContaining({ metric_type: "comments", value: 0 })
      ])
    );
    expect(patreonMetricsHaveNumericCounters(result.metrics)).toBe(true);
  });
});
