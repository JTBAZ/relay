import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
      // web/lib imports resolve next from web/node_modules; vi.mock("next/navigation") does not apply.
      "next/navigation": path.resolve(root, "tests/mocks/next-navigation.ts")
    }
  },
  esbuild: {
    jsx: "automatic"
  },
  test: {
    environment: "node",
    /** `web/__tests__/*` imports `next/server`; root `npm test` must resolve `next` (see web/package.json). */
    server: {
      deps: {
        inline: ["next"]
      }
    },
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "web/lib/**/*.test.ts",
      "web/__tests__/**/*.test.ts"
    ],
    setupFiles: ["tests/vitest.setup.ts"]
  }
});
