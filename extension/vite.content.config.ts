import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const outDir = process.env.EXT_OUT_DIR ?? "dist/chrome-dev";
const extEnv = process.env.EXT_ENV === "prod" ? "prod" : "dev";
const contentEntry = process.env.EXT_CONTENT_ENTRY ?? "fill-patreon-editor";

const entries: Record<string, string> = {
  "fill-patreon-editor": resolve(__dirname, "src/content/fill-patreon-editor.ts"),
  "fill-x-compose": resolve(__dirname, "src/content/fill-x-compose.ts"),
  "fill-deviantart-submit": resolve(__dirname, "src/content/fill-deviantart-submit.ts"),
  "post-link-toast": resolve(__dirname, "src/content/post-link-toast.ts"),
  "post-link-x-observer": resolve(__dirname, "src/content/post-link-x-observer.ts"),
  "schedule-reminder-toast": resolve(__dirname, "src/content/schedule-reminder-toast.ts"),
  "scrape-patreon-metrics": resolve(__dirname, "src/content/scrape-patreon-metrics.ts")
};

const bundleConfig: Record<string, { fileName: string; globalName: string }> = {
  "fill-patreon-editor": { fileName: "fill-patreon-editor.js", globalName: "RelayCrossPostFill" },
  "fill-x-compose": { fileName: "fill-x-compose.js", globalName: "RelayXCrossPostFill" },
  "fill-deviantart-submit": {
    fileName: "fill-deviantart-submit.js",
    globalName: "RelayDeviantArtCrossPostFill"
  },
  "post-link-toast": {
    fileName: "post-link-toast.js",
    globalName: "RelayPostLinkToast"
  },
  "post-link-x-observer": {
    fileName: "post-link-x-observer.js",
    globalName: "RelayPostLinkXObserver"
  },
  "schedule-reminder-toast": {
    fileName: "schedule-reminder-toast.js",
    globalName: "RelayScheduleReminderToast"
  },
  "scrape-patreon-metrics": {
    fileName: "scrape-patreon-metrics.js",
    globalName: "RelayScrapePatreonMetrics"
  }
};

const entry = entries[contentEntry] ?? entries["fill-patreon-editor"];
const bundle = bundleConfig[contentEntry] ?? bundleConfig["fill-patreon-editor"];

/** Standalone injectable IIFE — must not share Rollup chunks with the service worker bundle. */
export default defineConfig({
  define: {
    __EXT_ENV__: JSON.stringify(extEnv)
  },
  build: {
    emptyOutDir: false,
    outDir,
    lib: {
      entry,
      formats: ["iife"],
      name: bundle.globalName,
      fileName: () => `assets/${bundle.fileName}`
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
