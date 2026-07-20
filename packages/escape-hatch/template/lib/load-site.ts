import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteBundle } from "./access";

export function loadSite(): SiteBundle {
  const path = join(process.cwd(), "data", "site.json");
  return JSON.parse(readFileSync(path, "utf8")) as SiteBundle;
}
