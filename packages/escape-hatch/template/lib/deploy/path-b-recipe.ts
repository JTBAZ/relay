/**
 * Portable Docker Path B recipe inventory (EH-071).
 * Documents Compose / reverse-proxy / TLS / MojoHost candidate — no live daemon.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export type PathBRecipeItem = {
  id: string;
  title: string;
  path: string;
  present: boolean;
  required: boolean;
};

export type PathBHostCandidate = {
  id: "mojohost";
  title: string;
  status: "policy_candidate";
  wizard_supported: false;
  notes: string;
  policy_doc: string;
};

export type PathBRecipeReport = {
  ok: boolean;
  detail: string;
  items: PathBRecipeItem[];
  host_candidate: PathBHostCandidate;
  production_safe: false;
};

const RECIPE_FILES: Array<{
  id: string;
  title: string;
  relative: string;
  required: boolean;
}> = [
  {
    id: "dockerfile",
    title: "Multi-stage Dockerfile",
    relative: "Dockerfile",
    required: true
  },
  {
    id: "compose_db",
    title: "Loopback Postgres compose profile",
    relative: "docker-compose.yml",
    required: true
  },
  {
    id: "compose_path_b",
    title: "Path B app compose overlay",
    relative: "deploy/docker/compose.path-b.yml",
    required: true
  },
  {
    id: "caddy",
    title: "Caddy reverse-proxy / TLS sample",
    relative: "deploy/docker/Caddyfile.sample",
    required: true
  },
  {
    id: "path_b_readme",
    title: "Path B operator README",
    relative: "deploy/docker/README.md",
    required: true
  }
];

export function assessPathBRecipe(kitDir = process.cwd()): PathBRecipeReport {
  const items: PathBRecipeItem[] = RECIPE_FILES.map((f) => ({
    id: f.id,
    title: f.title,
    path: f.relative,
    present: existsSync(join(kitDir, f.relative)),
    required: f.required
  }));
  const missing = items.filter((i) => i.required && !i.present);
  const host_candidate: PathBHostCandidate = {
    id: "mojohost",
    title: "MojoHost",
    status: "policy_candidate",
    wizard_supported: false,
    notes:
      "Official creator guidance welcomes legal adult content on VM/infrastructure. Not a supported wizard option until Docker/TLS/backup/SLA/security + human gates in 13-PROVIDER-POLICY-EVIDENCE pass.",
    policy_doc:
      "docs/studio/escape-hatch-build-plans/13-PROVIDER-POLICY-EVIDENCE.md"
  };

  return {
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? "Path B recipe files present — kit-local only; not a live Docker or MojoHost certification."
        : `Missing Path B recipe files: ${missing.map((m) => m.path).join(", ")}`,
    items,
    host_candidate,
    production_safe: false
  };
}
