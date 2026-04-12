import { describe, expect, it, vi } from "vitest";
import { createExclusivePerKeyRunner } from "../src/lib/run-exclusive-per-key.js";

describe("createExclusivePerKeyRunner", () => {
  it("runs jobs for the same key strictly one after another", async () => {
    const run = createExclusivePerKeyRunner();
    let depth = 0;
    let maxDepth = 0;
    const fn = async (label: string) => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      await new Promise((r) => setTimeout(r, 5));
      depth -= 1;
      return label;
    };
    const [a, b] = await Promise.all([
      run("x", () => fn("a")),
      run("x", () => fn("b"))
    ]);
    expect(maxDepth).toBe(1);
    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("allows parallel work for different keys", async () => {
    const run = createExclusivePerKeyRunner();
    const spy = vi.fn();
    await Promise.all([
      run("a", async () => {
        spy("a");
        await new Promise((r) => setTimeout(r, 15));
      }),
      run("b", async () => {
        spy("b");
        await new Promise((r) => setTimeout(r, 15));
      })
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
