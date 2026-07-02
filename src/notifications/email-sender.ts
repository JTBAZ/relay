/**
 * Transactional email transport — log (dev) or Resend HTTP API (production).
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; provider: string; messageId: string | null }
  | { ok: false; provider: string; error: string };

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

function digestEmailFrom(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.RELAY_DIGEST_EMAIL_FROM?.trim() ||
    env.RELAY_EMAIL_FROM?.trim() ||
    "Relay <notifications@relay.app>"
  );
}

async function sendViaResend(
  input: SendEmailInput,
  apiKey: string
): Promise<SendEmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, provider: "resend", error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, provider: "resend", messageId: json.id ?? null };
}

/** Factory for digest / notification email sends. */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const provider = (env.RELAY_DIGEST_EMAIL_PROVIDER ?? env.RELAY_EMAIL_PROVIDER ?? "log")
    .trim()
    .toLowerCase();
  const from = digestEmailFrom(env);

  if (provider === "none" || provider === "off") {
    return async () => ({ ok: false, provider: "none", error: "email disabled" });
  }

  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return async () => ({
        ok: false,
        provider: "resend",
        error: "RESEND_API_KEY not configured",
      });
    }
    return async (input) =>
      sendViaResend({ ...input, from: input.from ?? from }, apiKey);
  }

  return async (input) => {
    // eslint-disable-next-line no-console -- intentional dev/no-op transport
    console.info("[relay-email:log]", {
      to: input.to,
      subject: input.subject,
      from: input.from ?? from,
      textPreview: input.text.slice(0, 240),
    });
    return { ok: true, provider: "log", messageId: null };
  };
}
