/**
 * Launch readiness + complete gate (EH-074).
 * Aggregates deploy, callbacks, email, backup — still productionSafe false.
 */

import { assessBackupReadiness, type BackupReadiness } from "../backup/readiness";
import { assessEmailReadiness, type EmailReadiness } from "../email/readiness";
import { assessPathBRecipe, type PathBRecipeReport } from "./path-b-recipe";
import {
  assessVercelDeployReadiness,
  type DeployReadiness
} from "./vercel-path";
import { loadDeployState } from "./state";
import {
  LAUNCH_STEPS,
  loadLaunchWizardState,
  saveLaunchWizardState,
  type LaunchPath,
  type LaunchStepDef,
  type LaunchStepId,
  type LaunchWizardStateDocument
} from "./launch-wizard-state";

export type LaunchGateItem = {
  id: string;
  title: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
  next_action: string;
};

export type LaunchReadiness = {
  ok: boolean;
  can_complete: boolean;
  detail: string;
  path: LaunchPath | null;
  steps: Array<
    LaunchStepDef & {
      status: "pending" | "verified" | "blocked";
      auto_ok: boolean | null;
    }
  >;
  gates: LaunchGateItem[];
  blockers: string[];
  advisories: string[];
  wizard: LaunchWizardStateDocument;
  deploy: DeployReadiness;
  backup: BackupReadiness;
  email: EmailReadiness;
  path_b: PathBRecipeReport | null;
  production_safe: false;
};

export type AssessLaunchOpts = {
  siteId: string;
  siteUrl?: string | null;
  kitDir?: string;
  env?: {
    ESCAPE_HATCH_EMAIL_PROVIDER?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    NEXT_PUBLIC_SITE_URL?: string;
  };
  now?: Date;
};

function stepAutoOk(
  id: LaunchStepId,
  opts: {
    wizard: LaunchWizardStateDocument;
    deploy: DeployReadiness;
    backup: BackupReadiness;
    deployState: ReturnType<typeof loadDeployState>;
    pathB: PathBRecipeReport | null;
  }
): boolean | null {
  switch (id) {
    case "choose_path":
      return opts.wizard.path !== null;
    case "origin_callbacks":
      return opts.deploy.callbacks.ok;
    case "preview_deploy":
      return opts.deployState.deployments.some((d) =>
        opts.wizard.path
          ? d.provider === opts.wizard.path ||
            (opts.wizard.path === "vercel" && d.provider !== "docker")
          : true
      );
    case "smoke_approve":
      return null; // operator mark only
    case "backup_restore":
      return opts.backup.schedule_ok && opts.backup.restore_ok;
    case "promote":
      return Boolean(opts.deployState.active_deployment_id);
    case "post_deploy_health":
      return (
        opts.deploy.ok &&
        opts.deploy.callbacks.ok &&
        opts.backup.schedule_ok
      );
    case "rollback_pointer":
      return Boolean(opts.deployState.previous_stable_deployment_id);
    case "launch_complete":
      return Boolean(opts.wizard.launch_completed_at);
    default:
      return null;
  }
}

export function assessLaunchReadiness(opts: AssessLaunchOpts): LaunchReadiness {
  const kitDir = opts.kitDir ?? process.cwd();
  const env = opts.env ?? {};
  const siteUrl = opts.siteUrl ?? env.NEXT_PUBLIC_SITE_URL ?? null;

  const wizard = loadLaunchWizardState(opts.siteId, kitDir);
  const deploy = assessVercelDeployReadiness({
    siteId: opts.siteId,
    siteUrl,
    kitDir
  });
  const deployState = loadDeployState(opts.siteId, kitDir);
  const backup = assessBackupReadiness({
    siteId: opts.siteId,
    kitDir,
    now: opts.now
  });
  const email = assessEmailReadiness({
    env: { ...env, NEXT_PUBLIC_SITE_URL: siteUrl ?? undefined }
  });
  const path_b =
    wizard.path === "docker" ? assessPathBRecipe(kitDir) : null;

  const gates: LaunchGateItem[] = [
    {
      id: "path_chosen",
      title: "Deploy path chosen",
      ok: wizard.path !== null,
      blocking: true,
      detail: wizard.path
        ? `Path ${wizard.path === "vercel" ? "A (Vercel)" : "B (Docker)"} selected.`
        : "No path selected.",
      next_action: "Select Path A or Path B in the launch wizard."
    },
    {
      id: "callbacks",
      title: "Callback / origin checklist",
      ok: deploy.callbacks.ok,
      blocking: true,
      detail: deploy.callbacks.detail,
      next_action: deploy.callbacks.ok
        ? "Copy absolute URLs into provider dashboards."
        : "Set a non-placeholder NEXT_PUBLIC_SITE_URL."
    },
    {
      id: "backup_gate",
      title: "Backup + restore rehearsal",
      ok: backup.schedule_ok && backup.restore_ok,
      blocking: true,
      detail: backup.detail,
      next_action:
        "Run fixture backup and isolated restore before launch can complete."
    },
    {
      id: "active_deploy",
      title: "Active production pointer",
      ok: Boolean(deployState.active_deployment_id),
      blocking: true,
      detail: deployState.active_deployment_id
        ? `Active: ${deployState.active_deployment_id}`
        : "No active deployment — promote a preview first.",
      next_action: "Create preview then promote from the Deploy panel."
    },
    {
      id: "email_advisory",
      title: "Transactional email checklist",
      ok: email.ok && email.checklist.ok,
      blocking: false,
      detail: email.detail,
      next_action: email.ok
        ? "Complete SPF/DKIM/DMARC attestations outside CI."
        : "Configure Resend/memory email recipe (advisory for launch)."
    },
    {
      id: "rollback_advisory",
      title: "Rollback pointer",
      ok: Boolean(deployState.previous_stable_deployment_id),
      blocking: false,
      detail: deployState.previous_stable_deployment_id
        ? `Prior stable: ${deployState.previous_stable_deployment_id}`
        : "No prior stable yet (first promote).",
      next_action: "Promote twice in fixture rehearsal to retain rollback."
    }
  ];

  if (wizard.path === "docker" && path_b) {
    gates.push({
      id: "path_b_recipe",
      title: "Docker Path B recipe",
      ok: path_b.ok,
      blocking: true,
      detail: path_b.detail,
      next_action: path_b.ok
        ? "Recipe present — live compose/TLS still deferred."
        : "Restore deploy/docker recipe files."
    });
  }

  const blockers = gates.filter((g) => g.blocking && !g.ok).map((g) => g.title);
  const advisories = gates
    .filter((g) => !g.blocking && !g.ok)
    .map((g) => g.title);

  const steps = LAUNCH_STEPS.map((def) => {
    const auto = stepAutoOk(def.id, {
      wizard,
      deploy,
      backup,
      deployState,
      pathB: path_b
    });
    const marked = wizard.step_status[def.id];
    let status: "pending" | "verified" | "blocked" = marked ?? "pending";
    if (auto === false && def.blocking) status = "blocked";
    else if (auto === true && (!marked || marked === "pending")) {
      status = "verified";
    } else if (marked === "verified") {
      status = "verified";
    }
    return { ...def, status, auto_ok: auto };
  });

  // Operator smoke approval must be explicitly marked.
  const smoke = wizard.step_status.smoke_approve === "verified";
  if (!smoke) {
    blockers.push("Smoke / operator approval");
  }

  const can_complete =
    blockers.length === 0 &&
    wizard.path !== null &&
    Boolean(deployState.active_deployment_id) &&
    backup.schedule_ok &&
    backup.restore_ok &&
    deploy.callbacks.ok &&
    smoke &&
    !wizard.launch_completed_at;

  const already = Boolean(wizard.launch_completed_at);

  return {
    ok: blockers.length === 0 && smoke,
    can_complete: already ? false : can_complete,
    detail: already
      ? `Launch marked complete at ${wizard.launch_completed_at} (preview_only; productionSafe false).`
      : can_complete
        ? "Blocking gates clear — you may complete the launch wizard (still not productionSafe)."
        : `Launch blocked: ${[...new Set(blockers)].join("; ") || "pending steps"}.`,
    path: wizard.path,
    steps,
    gates,
    blockers: [...new Set(blockers)],
    advisories,
    wizard,
    deploy,
    backup,
    email,
    path_b,
    production_safe: false
  };
}

export type CompleteLaunchResult = {
  ok: boolean;
  error: string | null;
  readiness: LaunchReadiness;
  production_safe: false;
};

/**
 * Fail-closed complete: requires backup+restore + other blocking gates.
 */
export function completeLaunchWizard(
  opts: AssessLaunchOpts
): CompleteLaunchResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const readiness = assessLaunchReadiness(opts);
  if (readiness.wizard.launch_completed_at) {
    return {
      ok: false,
      error: "already_completed",
      readiness,
      production_safe: false
    };
  }
  if (!readiness.can_complete) {
    return {
      ok: false,
      error: "launch_blockers_present",
      readiness,
      production_safe: false
    };
  }

  const now = opts.now ?? new Date();
  const next: LaunchWizardStateDocument = {
    ...readiness.wizard,
    launch_completed_at: now.toISOString(),
    step_status: {
      ...readiness.wizard.step_status,
      launch_complete: "verified",
      smoke_approve: "verified",
      backup_restore: "verified",
      promote: "verified",
      choose_path: "verified",
      origin_callbacks: "verified"
    },
    last_error: null
  };
  saveLaunchWizardState(next, kitDir);

  return {
    ok: true,
    error: null,
    readiness: assessLaunchReadiness({ ...opts, kitDir }),
    production_safe: false
  };
}

export {
  LAUNCH_STEPS,
  loadLaunchWizardState,
  selectLaunchPath,
  markLaunchStep,
  setLaunchStuckNote,
  acknowledgeDiagnostics
} from "./launch-wizard-state";
export type {
  LaunchPath,
  LaunchStepId,
  LaunchWizardStateDocument
} from "./launch-wizard-state";
