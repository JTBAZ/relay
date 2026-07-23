/**
 * In-memory site registry + assertion replay store (EH-041).
 * Tenant isolation by siteId; revocation is per-site.
 */

import { randomBytes } from "node:crypto";
import type { ManagedVerifySiteRecord } from "./types.js";

export type ManagedVerifyReplayStore = {
  /** Returns false if jti already seen (replay). */
  consume(jti: string, expiresAtMs: number): boolean;
  size(): number;
};

export function createMemoryReplayStore(): ManagedVerifyReplayStore {
  const seen = new Map<string, number>();
  return {
    consume(jti, expiresAtMs) {
      const now = Date.now();
      for (const [k, exp] of seen) {
        if (exp < now) seen.delete(k);
      }
      if (seen.has(jti)) return false;
      seen.set(jti, expiresAtMs);
      return true;
    },
    size() {
      return seen.size;
    }
  };
}

export type ManagedVerifySiteRegistry = {
  register(args: {
    siteId: string;
    callbackOrigins: string[];
    audience: string;
    nowMs?: number;
  }): ManagedVerifySiteRecord;
  get(siteId: string): ManagedVerifySiteRecord | null;
  revoke(siteId: string, nowMs?: number): boolean;
  isRevoked(siteId: string): boolean;
  /**
   * True when returnUrl origin is allowlisted for the site.
   * Rejects open redirects (unknown origins, credentials, etc.).
   */
  isReturnUrlAllowed(siteId: string, returnUrl: string): boolean;
  recordLink(args: {
    siteId: string;
    patreonUserId: string;
    siteAccountId: string;
    linkedAtIso?: string;
  }): boolean;
  exportMigrationMetadata(siteId: string): {
    siteId: string;
    audience: string;
    revoked: boolean;
    links: Array<{
      patreonUserId: string;
      siteAccountId: string;
      linkedAtIso: string;
    }>;
  } | null;
};

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return null;
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function createMemorySiteRegistry(): ManagedVerifySiteRegistry {
  const sites = new Map<string, ManagedVerifySiteRecord>();

  return {
    register(args) {
      const origins: string[] = [];
      for (const o of args.callbackOrigins) {
        const n = normalizeOrigin(o);
        if (n) origins.push(n);
      }
      if (origins.length === 0) {
        throw new Error("managed_verify_no_callback_origins");
      }
      const rec: ManagedVerifySiteRecord = {
        siteId: args.siteId.trim(),
        callbackOrigins: [...new Set(origins)],
        audience: args.audience.trim(),
        revoked: false,
        linkSubjects: [],
        createdAtMs: args.nowMs ?? Date.now()
      };
      sites.set(rec.siteId, rec);
      return { ...rec, callbackOrigins: [...rec.callbackOrigins] };
    },
    get(siteId) {
      const r = sites.get(siteId);
      return r
        ? {
            ...r,
            callbackOrigins: [...r.callbackOrigins],
            linkSubjects: r.linkSubjects.map((l) => ({ ...l }))
          }
        : null;
    },
    revoke(siteId, nowMs = Date.now()) {
      const r = sites.get(siteId);
      if (!r) return false;
      r.revoked = true;
      r.revokedAtMs = nowMs;
      return true;
    },
    isRevoked(siteId) {
      return sites.get(siteId)?.revoked === true;
    },
    isReturnUrlAllowed(siteId, returnUrl) {
      const r = sites.get(siteId);
      if (!r || r.revoked) return false;
      let parsed: URL;
      try {
        parsed = new URL(returnUrl);
      } catch {
        return false;
      }
      if (parsed.username || parsed.password) return false;
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }
      return r.callbackOrigins.includes(parsed.origin);
    },
    recordLink(args) {
      const r = sites.get(args.siteId);
      if (!r || r.revoked) return false;
      const existing = r.linkSubjects.find(
        (l) =>
          l.patreonUserId === args.patreonUserId &&
          l.siteAccountId === args.siteAccountId
      );
      if (existing) return true;
      r.linkSubjects.push({
        patreonUserId: args.patreonUserId,
        siteAccountId: args.siteAccountId,
        linkedAtIso: args.linkedAtIso ?? new Date().toISOString()
      });
      return true;
    },
    exportMigrationMetadata(siteId) {
      const r = sites.get(siteId);
      if (!r) return null;
      return {
        siteId: r.siteId,
        audience: r.audience,
        revoked: r.revoked,
        links: r.linkSubjects.map((l) => ({
          patreonUserId: l.patreonUserId,
          siteAccountId: l.siteAccountId,
          linkedAtIso: l.linkedAtIso
        }))
      };
    }
  };
}

export function mintAssertionJti(): string {
  return randomBytes(16).toString("base64url");
}
