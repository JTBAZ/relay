/**
 * Renders and sends patron digest emails.
 */

import type { EmailSender } from "../notifications/email-sender.js";
import type { DigestContentPayload } from "./notification-digest-content.js";

export function renderDigestEmail(payload: DigestContentPayload): { subject: string; html: string; text: string } {
  const creatorCount = payload.creators.length;
  // [R-SEC-24 @security-review 2026-06] Strip CR/LF/control chars from the subject so a crafted display
  // name cannot inject extra email headers. See docs/security-review-2026-06.md.
  const subject = stripControlChars(
    creatorCount === 1
      ? `${payload.creators[0]!.display_name} posted — your Relay digest`
      : `${creatorCount} creators posted — your Relay digest`
  );

  const textLines: string[] = [
    "Your Relay digest",
    "",
    `Updates from ${creatorCount} creator${creatorCount === 1 ? "" : "s"} you follow:`,
    "",
  ];

  const htmlParts: string[] = [
    `<h1 style="font-family:sans-serif;font-size:20px;">Your Relay digest</h1>`,
    `<p style="font-family:sans-serif;color:#444;">Updates from <strong>${creatorCount}</strong> creator${
      creatorCount === 1 ? "" : "s"
    } you follow:</p>`,
  ];

  for (const group of payload.creators) {
    textLines.push(group.display_name);
    htmlParts.push(
      `<h2 style="font-family:sans-serif;font-size:16px;margin-top:24px;">${escapeHtml(group.display_name)}</h2>`,
      `<ul style="font-family:sans-serif;padding-left:20px;">`
    );
    for (const post of group.posts) {
      textLines.push(`  • ${post.title}`);
      textLines.push(`    ${post.href}`);
      htmlParts.push(
        `<li style="margin-bottom:8px;"><a href="${escapeAttr(post.href)}">${escapeHtml(post.title)}</a></li>`
      );
    }
    htmlParts.push(`</ul>`);
    textLines.push("");
  }

  textLines.push("— Relay");

  return {
    subject,
    html: htmlParts.join("\n"),
    text: textLines.join("\n"),
  };
}

function stripControlChars(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export async function sendDigestEmail(
  sendEmail: EmailSender,
  args: { to: string; payload: DigestContentPayload; from?: string }
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const rendered = renderDigestEmail(args.payload);
  const result = await sendEmail({
    to: args.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    from: args.from,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, messageId: result.messageId };
}
