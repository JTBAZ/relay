/**
 * Deployment launch wizard state (EH-074).
 * Fixture / operator checklist only — productionSafe remains false.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

export const LAUNCH_WIZARD_CONTRACT =
  "escape-hatch-launch-wizard/1.0.0" as const;

export type LaunchPath = "vercel" | "docker";

export type LaunchStepId =
  | "choose_path"
  | "origin_callbacks"
  | "preview_deploy"
  | "smoke_approve"
  | "backup_restore"
  | "promote"
  | "post_deploy_health"
  | "rollback_pointer"
  | "launch_complete";

export type LaunchStepStatus = "pending" | "verified" | "blocked";

export type LaunchStepDef = {
  id: LaunchStepId;
  title: string;
  detail: string;
  blocking: boolean;
  recovery: string;
};

export const LAUNCH_STEPS: readonly LaunchStepDef[] = [
  {
    id: "choose_path",
    title: "Choose deploy path",
    detail:
      "Path A (Vercel) or Path B (Docker). MojoHost is a policy candidate only — not wizard-supported.",
    blocking: true,
    recovery: "Switch path anytime before launch complete; re-run preview after switch."
  },
  {
    id: "origin_callbacks",
    title: "Origin / callback checklist",
    detail:
      "Set a non-placeholder NEXT_PUBLIC_SITE_URL so Patreon/Stripe/auth callbacks resolve absolutely.",
    blocking: true,
    recovery: "Fix site URL, refresh Health callbacks, then mark verified."
  },
  {
    id: "preview_deploy",
    title: "Preview deploy",
    detail: "Create a fixture preview via the deploy panel (not a live provider API).",
    blocking: true,
    recovery: "Use Create preview on this page; if stuck, switch path or rollback."
  },
  {
    id: "smoke_approve",
    title: "Smoke / operator approval",
    detail: "Operator confirms preview looks sane before promote.",
    blocking: true,
    recovery: "Re-open preview URL; fix content; then mark approved."
  },
  {
    id: "backup_restore",
    title: "Backup + restore rehearsal",
    detail:
      "EH-073: fresh backup within RPO and isolated restore must pass before launch can complete.",
    blocking: true,
    recovery: "POST /api/admin/backup run_backup then restore_rehearsal; open Site health."
  },
  {
    id: "promote",
    title: "Promote to production pointer",
    detail: "Promote the approved fixture preview (retains prior stable when present).",
    blocking: true,
    recovery: "Promote from Deploy panel; if promote fails, roll back and re-preview."
  },
  {
    id: "post_deploy_health",
    title: "Post-deploy health rollup",
    detail: "Confirm deploy, callbacks, email checklist, and backup items on Site health.",
    blocking: false,
    recovery: "Open /admin/health and clear actionable items."
  },
  {
    id: "rollback_pointer",
    title: "Rollback pointer",
    detail: "Prior stable retained (promote twice) or document first-promote recovery.",
    blocking: false,
    recovery: "Promote a second fixture deployment to retain previous_stable."
  },
  {
    id: "launch_complete",
    title: "Launch / complete",
    detail:
      "Handoff complete only when blocking steps pass — still preview_only; not productionSafe.",
    blocking: true,
    recovery: "Clear blockers listed in launch readiness; never force-complete."
  }
] as const;

export type LaunchWizardStateDocument = {
  contract_version: typeof LAUNCH_WIZARD_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  path: LaunchPath | null;
  step_status: Partial<Record<LaunchStepId, LaunchStepStatus>>;
  diagnostics_acknowledged: boolean;
  launch_completed_at: string | null;
  stuck_note: string | null;
  last_error: string | null;
};

function statePath(kitDir: string): string {
  return join(kitDir, "data", "launch-wizard-state.json");
}

export function emptyLaunchWizardState(
  siteId: string
): LaunchWizardStateDocument {
  return {
    contract_version: LAUNCH_WIZARD_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    path: null,
    step_status: {},
    diagnostics_acknowledged: false,
    launch_completed_at: null,
    stuck_note: null,
    last_error: null
  };
}

export function loadLaunchWizardState(
  siteId: string,
  kitDir = process.cwd()
): LaunchWizardStateDocument {
  const path = statePath(kitDir);
  if (!existsSync(path)) return emptyLaunchWizardState(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<LaunchWizardStateDocument>;
    if (raw.contract_version !== LAUNCH_WIZARD_CONTRACT) {
      return emptyLaunchWizardState(siteId);
    }
    return {
      contract_version: LAUNCH_WIZARD_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      path: raw.path === "docker" || raw.path === "vercel" ? raw.path : null,
      step_status:
        raw.step_status && typeof raw.step_status === "object"
          ? { ...raw.step_status }
          : {},
      diagnostics_acknowledged: Boolean(raw.diagnostics_acknowledged),
      launch_completed_at:
        typeof raw.launch_completed_at === "string"
          ? raw.launch_completed_at
          : null,
      stuck_note: typeof raw.stuck_note === "string" ? raw.stuck_note : null,
      last_error: typeof raw.last_error === "string" ? raw.last_error : null
    };
  } catch {
    return emptyLaunchWizardState(siteId);
  }
}

export function saveLaunchWizardState(
  doc: LaunchWizardStateDocument,
  kitDir = process.cwd()
): void {
  const normalized: LaunchWizardStateDocument = {
    ...doc,
    contract_version: LAUNCH_WIZARD_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString()
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    statePath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export function selectLaunchPath(
  siteId: string,
  path: LaunchPath,
  kitDir = process.cwd()
): LaunchWizardStateDocument {
  const state = loadLaunchWizardState(siteId, kitDir);
  const next: LaunchWizardStateDocument = {
    ...state,
    path,
    launch_completed_at: null,
    step_status: {
      ...state.step_status,
      choose_path: "verified",
      // Reset path-dependent steps when switching.
      preview_deploy: "pending",
      smoke_approve: "pending",
      promote: "pending"
    },
    last_error: null
  };
  saveLaunchWizardState(next, kitDir);
  return next;
}

export function markLaunchStep(
  siteId: string,
  stepId: LaunchStepId,
  status: LaunchStepStatus,
  kitDir = process.cwd()
): LaunchWizardStateDocument {
  const state = loadLaunchWizardState(siteId, kitDir);
  if (stepId === "launch_complete") {
    // Completion goes through completeLaunchWizard only.
    return state;
  }
  const next: LaunchWizardStateDocument = {
    ...state,
    step_status: { ...state.step_status, [stepId]: status },
    last_error: null
  };
  saveLaunchWizardState(next, kitDir);
  return next;
}

export function setLaunchStuckNote(
  siteId: string,
  note: string | null,
  kitDir = process.cwd()
): LaunchWizardStateDocument {
  const state = loadLaunchWizardState(siteId, kitDir);
  const next: LaunchWizardStateDocument = {
    ...state,
    stuck_note: note && note.trim() ? note.trim().slice(0, 500) : null
  };
  saveLaunchWizardState(next, kitDir);
  return next;
}

export function acknowledgeDiagnostics(
  siteId: string,
  kitDir = process.cwd()
): LaunchWizardStateDocument {
  const state = loadLaunchWizardState(siteId, kitDir);
  const next: LaunchWizardStateDocument = {
    ...state,
    diagnostics_acknowledged: true,
    step_status: {
      ...state.step_status,
      post_deploy_health:
        state.step_status.post_deploy_health === "verified"
          ? "verified"
          : state.step_status.post_deploy_health
    }
  };
  saveLaunchWizardState(next, kitDir);
  return next;
}
