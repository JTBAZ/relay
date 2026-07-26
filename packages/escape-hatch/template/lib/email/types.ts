/**
 * Transactional email message types (EH-072).
 */

export const EMAIL_MESSAGE_TYPES = [
  "account_verification",
  "password_recovery",
  "security_alert",
  "subscription_notice",
  "connector_failure"
] as const;

export type EmailMessageType = (typeof EMAIL_MESSAGE_TYPES)[number];

export const EMAIL_MESSAGE_LABELS: Record<EmailMessageType, string> = {
  account_verification: "Account verification / sign-in",
  password_recovery: "Password / admin recovery",
  security_alert: "Email change / security alert",
  subscription_notice:
    "Subscription / access notice (when billing provider does not send)",
  connector_failure: "Managed connector / integration failure"
};

export type TransactionalEmailPayload = {
  message_type: EmailMessageType;
  to: string;
  subject: string;
  text_body: string;
  /** Optional HTML — stripped of scripts before send. */
  html_body?: string | null;
  /** Must align with NEXT_PUBLIC_SITE_URL origin when absolute. */
  link_origin?: string | null;
};

export type EmailSendResult =
  | {
      ok: true;
      message_id: string;
      provider: "memory" | "resend";
      production_safe: false;
    }
  | { ok: false; reason: string; production_safe: false };
