/**
 * Email readiness + Resend golden-path recipe (EH-072).
 * Env names only — productionSafe remains false.
 */

import { isPlaceholderSecret } from "../env";
import { buildDeliveryChecklist, type DeliveryChecklist } from "./delivery-checklist";
import {
  createMemoryEmailTransport,
  createResendEmailTransport,
  type EmailTransport
} from "./transport";
import type {
  EmailMessageType,
  EmailSendResult,
  TransactionalEmailPayload
} from "./types";
import { EMAIL_MESSAGE_LABELS, EMAIL_MESSAGE_TYPES } from "./types";

export const EMAIL_GOLDEN_PATH_RECIPE = {
  id: "resend_http",
  title: "Resend HTTP API",
  env_names: [
    "ESCAPE_HATCH_EMAIL_PROVIDER",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO"
  ] as const,
  notes:
    "Creator-owned Resend account. Set ESCAPE_HATCH_EMAIL_PROVIDER=resend with non-placeholder RESEND_API_KEY and EMAIL_FROM. Alternate SMTP shape is documented but not the golden path."
} as const;

export type EmailReadiness = {
  provider: "stub" | "memory" | "resend";
  ok: boolean;
  detail: string;
  recipe: typeof EMAIL_GOLDEN_PATH_RECIPE;
  message_types: typeof EMAIL_MESSAGE_TYPES;
  checklist: DeliveryChecklist;
  production_safe: false;
};

export function isResendEmailConfigured(env: {
  ESCAPE_HATCH_EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}): boolean {
  const mode = (env.ESCAPE_HATCH_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (mode !== "resend") return false;
  const key = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.EMAIL_FROM?.trim() ?? "";
  if (!key || !from) return false;
  if (isPlaceholderSecret(key)) return false;
  return true;
}

export function assessEmailReadiness(opts: {
  env: {
    ESCAPE_HATCH_EMAIL_PROVIDER?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    NEXT_PUBLIC_SITE_URL?: string;
  };
  /** Injected fixture transport forces memory path. */
  injectedTransport?: EmailTransport | null;
  attested?: Parameters<typeof buildDeliveryChecklist>[0]["attested"];
}): EmailReadiness {
  const checklist = buildDeliveryChecklist({
    fromAddress: opts.env.EMAIL_FROM,
    siteUrl: opts.env.NEXT_PUBLIC_SITE_URL,
    attested: opts.attested
  });

  if (opts.injectedTransport?.id === "memory") {
    return {
      provider: "memory",
      ok: true,
      detail:
        "Fixture memory transport active — preview rehearsal only; productionSafe remains false.",
      recipe: EMAIL_GOLDEN_PATH_RECIPE,
      message_types: EMAIL_MESSAGE_TYPES,
      checklist,
      production_safe: false
    };
  }

  const mode = (opts.env.ESCAPE_HATCH_EMAIL_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (mode === "memory") {
    return {
      provider: "memory",
      ok: true,
      detail:
        "ESCAPE_HATCH_EMAIL_PROVIDER=memory — kit-local outbox rehearsal; productionSafe remains false.",
      recipe: EMAIL_GOLDEN_PATH_RECIPE,
      message_types: EMAIL_MESSAGE_TYPES,
      checklist,
      production_safe: false
    };
  }

  if (isResendEmailConfigured(opts.env)) {
    return {
      provider: "resend",
      ok: true,
      detail:
        "Resend recipe env present (non-placeholder) — still preview; live send needs injectable fetch or runtime network outside CI. productionSafe remains false.",
      recipe: EMAIL_GOLDEN_PATH_RECIPE,
      message_types: EMAIL_MESSAGE_TYPES,
      checklist,
      production_safe: false
    };
  }

  return {
    provider: "stub",
    ok: false,
    detail:
      "Transactional email stub — set ESCAPE_HATCH_EMAIL_PROVIDER=resend with RESEND_API_KEY + EMAIL_FROM, or inject a memory transport for fixture rehearsal.",
    recipe: EMAIL_GOLDEN_PATH_RECIPE,
    message_types: EMAIL_MESSAGE_TYPES,
    checklist,
    production_safe: false
  };
}

export function resolveEmailTransport(opts: {
  env: {
    ESCAPE_HATCH_EMAIL_PROVIDER?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
  siteId?: string;
  kitDir?: string;
  injectedTransport?: EmailTransport | null;
  fetchImpl?: typeof fetch;
}): EmailTransport | null {
  if (opts.injectedTransport) return opts.injectedTransport;
  const mode = (opts.env.ESCAPE_HATCH_EMAIL_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (mode === "memory") {
    return createMemoryEmailTransport({
      siteId: opts.siteId,
      kitDir: opts.kitDir
    });
  }
  if (isResendEmailConfigured(opts.env)) {
    return createResendEmailTransport({
      apiKey: opts.env.RESEND_API_KEY!.trim(),
      from: opts.env.EMAIL_FROM!.trim(),
      fetchImpl: opts.fetchImpl
    });
  }
  return null;
}

export async function sendTransactionalEmail(
  transport: EmailTransport,
  payload: TransactionalEmailPayload
): Promise<EmailSendResult> {
  return transport.send(payload);
}

export function describeMessageTypes(): Array<{
  id: EmailMessageType;
  label: string;
}> {
  return EMAIL_MESSAGE_TYPES.map((id) => ({
    id,
    label: EMAIL_MESSAGE_LABELS[id]
  }));
}

export { createMemoryEmailTransport, EMAIL_MESSAGE_TYPES, EMAIL_MESSAGE_LABELS };
