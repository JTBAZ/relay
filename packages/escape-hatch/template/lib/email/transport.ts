/**
 * Provider-neutral email transport (EH-072).
 * Injectable — default memory outbox; Resend recipe is names-only until wired live.
 */

import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import type {
  EmailSendResult,
  TransactionalEmailPayload
} from "./types";
import { EMAIL_MESSAGE_TYPES } from "./types";

export type EmailTransport = {
  readonly id: "memory" | "resend";
  send(payload: TransactionalEmailPayload): Promise<EmailSendResult>;
};

export type OutboxEntry = {
  message_id: string;
  message_type: string;
  to: string;
  subject: string;
  text_body: string;
  created_at: string;
  provider: "memory";
};

export type EmailOutboxDocument = {
  contract_version: "escape-hatch-email-outbox/1.0.0";
  site_id: string;
  production_safe: false;
  updated_at: string;
  entries: OutboxEntry[];
};

function outboxPath(kitDir: string): string {
  return join(kitDir, "data", "email-outbox.json");
}

export function loadEmailOutbox(
  siteId: string,
  kitDir = process.cwd()
): EmailOutboxDocument {
  const path = outboxPath(kitDir);
  if (!existsSync(path)) {
    return {
      contract_version: "escape-hatch-email-outbox/1.0.0",
      site_id: siteId,
      production_safe: false,
      updated_at: new Date().toISOString(),
      entries: []
    };
  }
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<EmailOutboxDocument>;
    if (
      raw.contract_version !== "escape-hatch-email-outbox/1.0.0" ||
      !Array.isArray(raw.entries)
    ) {
      return {
        contract_version: "escape-hatch-email-outbox/1.0.0",
        site_id: siteId,
        production_safe: false,
        updated_at: new Date().toISOString(),
        entries: []
      };
    }
    return {
      contract_version: "escape-hatch-email-outbox/1.0.0",
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      entries: raw.entries as OutboxEntry[]
    };
  } catch {
    return {
      contract_version: "escape-hatch-email-outbox/1.0.0",
      site_id: siteId,
      production_safe: false,
      updated_at: new Date().toISOString(),
      entries: []
    };
  }
}

function saveOutbox(doc: EmailOutboxDocument, kitDir: string): void {
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    outboxPath(kitDir),
    `${JSON.stringify(
      {
        ...doc,
        production_safe: false,
        updated_at: new Date().toISOString(),
        entries: doc.entries.slice(0, 200)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export function redactEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function sanitizeHtmlBody(html: string | null | undefined): string | null {
  if (html == null) return null;
  const stripped = html
    .replace(/<(script|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
  return stripped.length ? stripped.slice(0, 50_000) : null;
}

function validatePayload(
  payload: TransactionalEmailPayload
): string | null {
  if (
    !(EMAIL_MESSAGE_TYPES as readonly string[]).includes(payload.message_type)
  ) {
    return "invalid_message_type";
  }
  const to = payload.to?.trim() ?? "";
  if (!to || !to.includes("@")) return "invalid_to";
  if (!payload.subject?.trim()) return "subject_required";
  if (!payload.text_body?.trim()) return "text_body_required";
  return null;
}

/** In-memory / kit-local outbox — default for tests and preview rehearsal. */
export function createMemoryEmailTransport(opts?: {
  siteId?: string;
  kitDir?: string;
}): EmailTransport {
  const siteId = opts?.siteId ?? "kit_local";
  const kitDir = opts?.kitDir ?? process.cwd();
  return {
    id: "memory",
    async send(payload) {
      const err = validatePayload(payload);
      if (err) {
        return { ok: false, reason: err, production_safe: false };
      }
      const message_id = `mem_${randomBytes(8).toString("hex")}`;
      const doc = loadEmailOutbox(siteId, kitDir);
      doc.entries.unshift({
        message_id,
        message_type: payload.message_type,
        to: payload.to.trim(),
        subject: payload.subject.trim(),
        text_body: payload.text_body.trim().slice(0, 20_000),
        created_at: new Date().toISOString(),
        provider: "memory"
      });
      saveOutbox(doc, kitDir);
      return {
        ok: true,
        message_id,
        provider: "memory",
        production_safe: false
      };
    }
  };
}

/**
 * Resend recipe transport — fails closed without injectable fetch + real key.
 * Package tests must inject fetch; no live network by default.
 */
export function createResendEmailTransport(opts: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailTransport {
  return {
    id: "resend",
    async send(payload) {
      const err = validatePayload(payload);
      if (err) {
        return { ok: false, reason: err, production_safe: false };
      }
      if (!opts.apiKey || !opts.from) {
        return {
          ok: false,
          reason: "resend_not_configured",
          production_safe: false
        };
      }
      const fetchFn = opts.fetchImpl;
      if (!fetchFn) {
        return {
          ok: false,
          reason: "resend_fetch_required",
          production_safe: false
        };
      }
      try {
        const res = await fetchFn("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            from: opts.from,
            to: [payload.to.trim()],
            subject: payload.subject.trim(),
            text: payload.text_body.trim(),
            html: sanitizeHtmlBody(payload.html_body) ?? undefined
          })
        });
        if (!res.ok) {
          return {
            ok: false,
            reason: `resend_http_${res.status}`,
            production_safe: false
          };
        }
        const body = (await res.json()) as { id?: string };
        return {
          ok: true,
          message_id: body.id ?? `resend_${Date.now().toString(36)}`,
          provider: "resend",
          production_safe: false
        };
      } catch {
        return {
          ok: false,
          reason: "resend_transport_error",
          production_safe: false
        };
      }
    }
  };
}
