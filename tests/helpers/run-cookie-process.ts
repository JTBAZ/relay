import { spawn } from "node:child_process";
import { resolve } from "node:path";

export async function runCookieProcess(input: { key: string; path?: string; url?: string; ids: string[] }): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/vite-node/vite-node.mjs"), resolve("tests/helpers/patreon-cookie-process.ts")], {
      windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, RELAY_COOKIE_TEST_INPUT: JSON.stringify(input) }
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Cookie test child timed out")); }, 30_000);
    child.on("error", () => { clearTimeout(timeout); reject(new Error("Unable to start cookie test child")); });
    let completed = false;
    child.stdout.on("data", (chunk: Buffer) => {
      const output = chunk.toString();
      if (output.includes("done")) completed = true;
    });
    child.on("close", (code) => { clearTimeout(timeout); if (code === 0 && completed) accept(); else reject(new Error("Cookie test child failed")); });
  });
}
