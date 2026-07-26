"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCreatorDiscountCode,
  listCreatorDiscountCodes,
  patchCreatorDiscountCode,
  type CreatorDiscountCodeRecord
} from "@/lib/relay-api";

export type DiscountCodeUsageCounts = {
  discount_code_id: string;
  tier_rule_active_count: number;
  tier_rule_inactive_count: number;
  post_offer_active_count: number;
  post_offer_inactive_count: number;
};

type Props = {
  creatorId: string;
  studioWriteBlocked: boolean;
  /**
   * Controlled mode: hub owns the list. When provided, the panel does not self-load.
   * Omit for Hero Audience & Promotion self-loading mode.
   */
  codes?: CreatorDiscountCodeRecord[];
  usageSummaries?: readonly DiscountCodeUsageCounts[];
  loading?: boolean;
  error?: string | null;
  onCodesChanged?: (codes: CreatorDiscountCodeRecord[]) => void;
  /** Fired with the created/updated record so hub state can update immediately. */
  onCodeCreated?: (code: CreatorDiscountCodeRecord) => void;
  onCodeUpdated?: (code: CreatorDiscountCodeRecord) => void;
  onError?: (message: string | null) => void;
};

/**
 * Inline creator-supplied Patreon code library.
 * Relay never creates Patreon coupons — creators paste codes from Patreon Discounts.
 */
export default function DiscountCodeLibraryPanel({
  creatorId,
  studioWriteBlocked,
  codes: codesProp,
  usageSummaries,
  loading: loadingProp,
  error: errorProp,
  onCodesChanged,
  onCodeCreated,
  onCodeUpdated,
  onError
}: Props) {
  const controlled = codesProp !== undefined;
  const [localCodes, setLocalCodes] = useState<CreatorDiscountCodeRecord[]>([]);
  const [localLoading, setLocalLoading] = useState(!controlled);
  const [localError, setLocalError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const codes = controlled ? codesProp : localCodes;
  const loading = controlled ? Boolean(loadingProp) : localLoading;
  const error = controlled ? (errorProp ?? localError) : localError;

  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const usageById = useMemo(() => {
    const map = new Map<string, DiscountCodeUsageCounts>();
    for (const row of usageSummaries ?? []) {
      map.set(row.discount_code_id, row);
    }
    return map;
  }, [usageSummaries]);

  const activeReferenceCount = (id: string): number => {
    const u = usageById.get(id);
    if (!u) return 0;
    return u.tier_rule_active_count + u.post_offer_active_count;
  };

  const setError = (message: string | null) => {
    setLocalError(message);
    onError?.(message);
  };

  const reload = useCallback(async () => {
    if (controlled) return;
    setLocalLoading(true);
    setLocalError(null);
    onError?.(null);
    try {
      const rows = await listCreatorDiscountCodes(creatorId);
      const list = Array.isArray(rows) ? rows : [];
      setLocalCodes(list);
      onCodesChanged?.(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLocalError(message);
      onError?.(message);
    } finally {
      setLocalLoading(false);
    }
  }, [controlled, creatorId, onCodesChanged, onError]);

  useEffect(() => {
    if (controlled) return;
    void reload();
  }, [controlled, reload]);

  const upsertLocal = (row: CreatorDiscountCodeRecord) => {
    setLocalCodes((prev) => {
      const next = [...prev.filter((c) => c.id !== row.id), row].sort((a, b) =>
        a.code.localeCompare(b.code)
      );
      onCodesChanged?.(next);
      return next;
    });
  };

  const applyHubList = (
    row: CreatorDiscountCodeRecord,
    mode: "create" | "update"
  ) => {
    if (controlled) {
      const base = codesProp ?? [];
      const next = [...base.filter((c) => c.id !== row.id), row].sort((a, b) =>
        a.code.localeCompare(b.code)
      );
      onCodesChanged?.(next);
      if (mode === "create") onCodeCreated?.(row);
      else onCodeUpdated?.(row);
      return;
    }
    upsertLocal(row);
    if (mode === "create") onCodeCreated?.(row);
    else onCodeUpdated?.(row);
  };

  const addCode = async () => {
    if (studioWriteBlocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createCreatorDiscountCode({
        creatorId,
        code,
        percent_off: Number(percent),
        label: label.trim() || null
      });
      setCode("");
      setLabel("");
      if (controlled) {
        applyHubList(row, "create");
      } else {
        await reload();
        onCodeCreated?.(row);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: CreatorDiscountCodeRecord) => {
    if (studioWriteBlocked || busy) return;
    if (c.active) {
      const refs = activeReferenceCount(c.id);
      if (refs > 0 && confirmDeactivateId !== c.id) {
        setConfirmDeactivateId(c.id);
        return;
      }
    }
    setConfirmDeactivateId(null);
    setBusy(true);
    setError(null);
    try {
      const row = await patchCreatorDiscountCode({
        creatorId,
        codeId: c.id,
        active: !c.active
      });
      if (controlled) {
        applyHubList(row, "update");
      } else {
        await reload();
        onCodeUpdated?.(row);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const usageLabel = (id: string): string | null => {
    const u = usageById.get(id);
    if (!u) return null;
    const parts: string[] = [];
    const tierTotal = u.tier_rule_active_count + u.tier_rule_inactive_count;
    const offerTotal = u.post_offer_active_count + u.post_offer_inactive_count;
    if (tierTotal > 0) {
      parts.push(
        `${u.tier_rule_active_count} tier rule${u.tier_rule_active_count === 1 ? "" : "s"}`
      );
    }
    if (offerTotal > 0) {
      parts.push(
        `${u.post_offer_active_count} post offer${u.post_offer_active_count === 1 ? "" : "s"}`
      );
    }
    if (parts.length === 0) return null;
    return parts.join(" · ");
  };

  return (
    <div className="space-y-2 px-3" data-discount-code-library data-controlled={controlled ? "1" : "0"}>
      <p className="text-[10px] leading-relaxed text-[var(--relay-fg-muted,#6a726e)]">
        Creator-supplied codes only. Create the coupon in{" "}
        <a
          href="https://www.patreon.com/promotions/discounts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--relay-green-400,#9bf0c4)] underline-offset-2 hover:underline"
        >
          Patreon Discounts
        </a>
        , then paste it here. Relay does not create Patreon coupons.
      </p>

      {loading ? (
        <p className="text-[11px] text-[var(--relay-fg-muted,#555)]">Loading codes…</p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
          {error}
        </p>
      ) : null}

      <ul className="space-y-1">
        {codes.map((c) => {
          const usage = usageLabel(c.id);
          const refs = activeReferenceCount(c.id);
          const confirming = confirmDeactivateId === c.id;
          return (
            <li
              key={c.id}
              className="rounded-lg border border-[var(--relay-border,#242424)] px-2 py-1.5 text-[11px]"
              data-code-id={c.id}
              data-code-active={c.active ? "1" : "0"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[var(--relay-fg,#e8eee9)]">
                  <span className={c.active ? "" : "line-through opacity-50"}>{c.code}</span>
                  <span className="ml-2 text-[var(--relay-fg-muted,#68706c)]">
                    {c.percent_off}% off
                  </span>
                  {c.label ? (
                    <span className="ml-2 text-[var(--relay-fg-muted,#555)]">{c.label}</span>
                  ) : null}
                  {!c.active ? (
                    <span className="ml-2 text-amber-200/80">inactive</span>
                  ) : null}
                  {usage ? (
                    <span className="ml-2 text-[var(--relay-fg-muted,#555)]">{usage}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={studioWriteBlocked || busy}
                  onClick={() => void toggleActive(c)}
                  className="shrink-0 text-[10px] text-[var(--relay-green-400,#9bf0c4)] disabled:opacity-40"
                >
                  {c.active ? (confirming ? "Confirm deactivate" : "Deactivate") : "Reactivate"}
                </button>
              </div>
              {confirming ? (
                <p className="mt-1 text-[10px] leading-relaxed text-amber-200/90">
                  Referenced by {refs} active assignment{refs === 1 ? "" : "s"}. Deactivation
                  removes this code from new assignments; existing rules stay visible and
                  recoverable.
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setConfirmDeactivateId(null)}
                  >
                    Cancel
                  </button>
                </p>
              ) : null}
              {!c.active ? (
                <p className="mt-1 text-[10px] text-[var(--relay-fg-muted,#555)]">
                  Unavailable for new assignments. Referenced rules remain readable.
                </p>
              ) : null}
            </li>
          );
        })}
        {!loading && codes.length === 0 ? (
          <li className="text-[10px] text-[var(--relay-fg-muted,#555)]">No codes yet.</li>
        ) : null}
      </ul>

      <div className="grid grid-cols-[1fr_4.5rem] gap-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CODE"
          disabled={studioWriteBlocked || busy}
          aria-label="Discount code"
          className="rounded-lg border border-[var(--relay-border,#2a2a2a)] bg-[var(--relay-bg,#141414)] px-2 py-1.5 text-[11px] uppercase text-[var(--relay-fg,#e8eee9)] disabled:opacity-40"
        />
        <input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder="%"
          inputMode="numeric"
          disabled={studioWriteBlocked || busy}
          aria-label="Percent off"
          className="rounded-lg border border-[var(--relay-border,#2a2a2a)] bg-[var(--relay-bg,#141414)] px-2 py-1.5 text-[11px] text-[var(--relay-fg,#e8eee9)] disabled:opacity-40"
        />
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Optional label"
        disabled={studioWriteBlocked || busy}
        aria-label="Optional label"
        className="w-full rounded-lg border border-[var(--relay-border,#2a2a2a)] bg-[var(--relay-bg,#141414)] px-2 py-1.5 text-[11px] text-[var(--relay-fg,#e8eee9)] disabled:opacity-40"
      />
      <button
        type="button"
        disabled={studioWriteBlocked || busy || !code.trim()}
        onClick={() => void addCode()}
        className="w-full rounded-lg border border-[var(--relay-green-400,#9bf0c4)]/25 bg-[var(--relay-green-400,#9bf0c4)]/10 py-1.5 text-[11px] text-[var(--relay-green-400,#9bf0c4)] disabled:opacity-40"
      >
        {busy ? "Saving…" : "Add code"}
      </button>
    </div>
  );
}
