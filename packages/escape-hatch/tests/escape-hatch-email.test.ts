/**
 * EH-072 — Transactional email (provider-neutral + Resend recipe + checklist).
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  assessEmailReadiness,
  buildDeliveryChecklist,
  createMemoryEmailTransport,
  createResendEmailTransport,
  EMAIL_GOLDEN_PATH_RECIPE,
  EMAIL_MESSAGE_TYPES,
  loadEmailOutbox,
  sendTransactionalEmail
} from "../template/lib/email/index.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";

describe("EH-072 status", () => {
  it("advances slice to EH-073 with next EH-074 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-073");
    expect(status.slice).toBe("EH-073");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-074");
    expect(status.nextSlice.title).toMatch(/deploy|wizard/i);
  });
});

describe("EH-072 transactional email", () => {
  it("documents Resend golden-path recipe env names only", () => {
    expect(EMAIL_GOLDEN_PATH_RECIPE.id).toBe("resend_http");
    expect(EMAIL_GOLDEN_PATH_RECIPE.env_names).toContain("RESEND_API_KEY");
    expect(EMAIL_MESSAGE_TYPES).toHaveLength(5);
  });

  it("fails closed when stub / incomplete env", () => {
    const r = assessEmailReadiness({ env: {} });
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("stub");
    expect(r.production_safe).toBe(false);
  });

  it("sends all five message types via memory outbox", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh072-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const transport = createMemoryEmailTransport({
        siteId: "site_eh_072",
        kitDir
      });
      for (const message_type of EMAIL_MESSAGE_TYPES) {
        const result = await sendTransactionalEmail(transport, {
          message_type,
          to: "patron@example.art",
          subject: `Test ${message_type}`,
          text_body: `Body for ${message_type}`
        });
        expect(result.ok).toBe(true);
      }
      const outbox = loadEmailOutbox("site_eh_072", kitDir);
      expect(outbox.entries.length).toBe(5);
      expect(outbox.production_safe).toBe(false);
      const types = new Set(outbox.entries.map((e) => e.message_type));
      expect(types.size).toBe(5);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("Resend transport uses injectable fetch and never claims productionSafe", async () => {
    const calls: string[] = [];
    const transport = createResendEmailTransport({
      apiKey: "re_test_not_a_placeholder_key_value",
      from: "Studio <noreply@example.art>",
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ id: "email_fixture_1" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });
    const result = await sendTransactionalEmail(transport, {
      message_type: "account_verification",
      to: "a@b.co",
      subject: "Verify",
      text_body: "Click"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("resend");
      expect(result.production_safe).toBe(false);
    }
    expect(calls[0]).toMatch(/resend\.com/);
  });

  it("delivery checklist is guidance-only without live DNS", () => {
    const empty = buildDeliveryChecklist({});
    expect(empty.ok).toBe(false);
    expect(empty.items.some((i) => i.id === "spf")).toBe(true);
    expect(empty.items.some((i) => i.id === "dmarc")).toBe(true);

    const full = buildDeliveryChecklist({
      fromAddress: "Studio <noreply@studio.example.art>",
      siteUrl: "https://studio.example.art",
      attested: {
        spf: true,
        dkim: true,
        dmarc: true,
        sender_verified: true,
        test_inbox: true
      }
    });
    expect(full.ok).toBe(true);
    expect(full.production_safe).toBe(false);
  });

  it("surfaces email health items", () => {
    const readiness = assessEmailReadiness({
      env: { ESCAPE_HATCH_EMAIL_PROVIDER: "memory", EMAIL_FROM: "a@b.co" }
    });
    const items = buildHealthItems({
      adapters: [],
      blockers: [],
      manifestSlice: "EH-072",
      publicMediaHonesty: "x",
      emailReadiness: readiness
    });
    expect(items.some((i) => i.id === "email_delivery" && i.ok)).toBe(true);
    expect(items.some((i) => i.id === "email_dns_checklist")).toBe(true);
  });
});
