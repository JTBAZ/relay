import { spawn } from "node:child_process";
import { resolve } from "node:path";

export function runTokenProcess(input: { key: string; path?: string; url?: string; creatorId: string; log: string }): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/vite-node/vite-node.mjs"), resolve("tests/helpers/patreon-token-process.ts")], {
      windowsHide: true, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, RELAY_TOKEN_TEST_INPUT: JSON.stringify(input) }
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Token test child timed out")); }, 30_000);
    child.on("error", () => { clearTimeout(timeout); reject(new Error("Unable to start token test child")); });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("close", (code) => { clearTimeout(timeout); if (code === 0 && output.includes("done")) accept(); else reject(new Error("Token test child failed")); });
  });
}
