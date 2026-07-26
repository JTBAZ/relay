"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/app/lib/cn";
import {
  postPatreonScrape,
  postPilotUxSimulateMediaImport,
  RELAY_CREATOR_ID_STORAGE_KEY,
} from "@/lib/relay-api";
import {
  getExtensionStoreLinks,
} from "@/lib/extension-store-urls";
import {
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
  pilotUxDevLoginEnabled,
} from "@/lib/pilot-ux-dev-accounts";
import { CreatorLibraryReviewModal } from "./CreatorLibraryReviewModal";
import { ImportSignalRow } from "./ImportSignalRow";
import {
  useCreatorImportReadiness,
  type ImportCtaState,
} from "./use-creator-import-readiness";

// ---------------------------------------------------------------------------
// CTA configuration
// ---------------------------------------------------------------------------

type CtaConfig = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
};

function buildCtaConfig(
  ctaState: ImportCtaState,
  storeConfigured: boolean,
  extensionStoreHref: string | null,
  onImport: () => void,
  onReview: () => void
): CtaConfig {
  switch (ctaState) {
    case "install_extension":
      return {
        label: storeConfigured ? "Get my Art" : "Connect extension",
        href: storeConfigured ? extensionStoreHref ?? undefined : "/extension/authorize",
        onClick: storeConfigured ? undefined : undefined,
      };
    case "connect_extension":
      return {
        label: "Connect Extension →",
        href: "/extension/authorize",
      };
    case "sync_session":
      return {
        label: "Open Patreon to sync session",
        href: "https://www.patreon.com",
      };
    case "import_media":
      return {
        label: "Import Media",
        onClick: onImport,
      };
    case "importing":
      return {
        label: "Importing…",
        loading: true,
        disabled: true,
      };
    case "review_library":
      return {
        label: "Review your Library →",
        onClick: onReview,
      };
  }
}

const IMPORT_POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreatorImportReadinessPanel() {
  const router = useRouter();
  const readiness = useCreatorImportReadiness();
  const { loading, profileError, rows, ctaState, creatorId, refreshSyncData } = readiness;

  const [importError, setImportError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [simulatingMedia, setSimulatingMedia] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storeLinks = getExtensionStoreLinks();
  const storeConfigured = Boolean(storeLinks.chrome);
  const firstStoreHref = storeLinks.chrome;

  // Start polling when ctaState is "importing", stop otherwise
  useEffect(() => {
    if (ctaState === "importing") {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          void refreshSyncData();
        }, IMPORT_POLL_INTERVAL_MS);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [ctaState, refreshSyncData]);

  const handleImport = async () => {
    const cid =
      creatorId.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
        : "");

    if (!cid) {
      setImportError("Creator ID not found. Refresh and try again.");
      return;
    }
    setImportError(null);
    setIsTriggering(true);
    try {
      await postPatreonScrape({ creator_id: cid });
      // Immediately refresh so the hook sees the new syncing state
      await refreshSyncData();
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "Import failed. Please try again."
      );
    } finally {
      setIsTriggering(false);
    }
  };

  const effectiveCtaState: ImportCtaState =
    isTriggering ? "importing" : ctaState;

  const ctaConfig = buildCtaConfig(
    effectiveCtaState,
    storeConfigured,
    firstStoreHref,
    () => void handleImport(),
    () => setReviewModalOpen(true)
  );

  const effectiveCreatorId =
    creatorId.trim() ||
    (typeof window !== "undefined"
      ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
      : "");

  const walkthroughDev =
    pilotUxDevLoginEnabled() &&
    effectiveCreatorId === PILOT_UX_ONBOARDING_RELAY_CREATOR_ID;

  const handleSimulateMediaImport = async () => {
    setImportError(null);
    setSimulatingMedia(true);
    try {
      await postPilotUxSimulateMediaImport();
      await refreshSyncData();
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "Dev media import simulation failed."
      );
    } finally {
      setSimulatingMedia(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section
        className={cn(
          "rounded-[1.75rem] border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-3",
          loading && "opacity-75"
        )}
        aria-busy={loading}
      >
        {loading ? (
          <p className="flex items-center gap-2 px-1 py-1 text-sm text-[var(--relay-fg-muted)]">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Checking your creator signals…
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]">
                  Signal check
                </p>
                <p className="mt-1 text-xs text-[var(--relay-fg-muted)]">
                  Relay uses these to organize your archive and analytics.
                </p>
              </div>
            </div>
            {profileError ? (
              <p className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm leading-relaxed text-red-100">
                Your session may have expired, or the Relay API may be unreachable.
                Refresh, sign in again, then revisit step 5.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <ImportSignalRow {...rows.tiers} />
              <ImportSignalRow {...rows.patrons} />
              <ImportSignalRow {...rows.revenue} />
              <ImportSignalRow {...rows.media} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--relay-green-600)]/30 bg-gradient-to-br from-[var(--relay-green-950)]/70 via-[var(--relay-surface-1)] to-[var(--relay-bg)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]">
          {effectiveCtaState === "review_library" ? "Gallery ready" : "Import Media"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {effectiveCtaState === "review_library"
            ? "Your archive is inside Relay. Review the gallery and choose the pieces we should use for discovery."
            : "Instead of manually moving hundreds of files, let our browser extension instantly port your Patreon archive over for you. Once added, it unites your Patreon, X, and DeviantArt galleries — allowing you to manage and automate posting to all three from a single dashboard."}
        </p>

        <div className="mt-4">
          {ctaConfig.href ? (
            <a
              href={ctaConfig.href}
              {...(ctaConfig.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)]"
              aria-label={ctaConfig.label}
            >
              {ctaConfig.label}
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </a>
          ) : (
            <button
              type="button"
              onClick={ctaConfig.onClick}
              disabled={ctaConfig.disabled || isTriggering}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={ctaConfig.label}
            >
              {ctaConfig.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {ctaConfig.label}
              {!ctaConfig.loading ? <ArrowRight className="h-4 w-4" strokeWidth={2} /> : null}
            </button>
          )}
        </div>

        {effectiveCtaState === "sync_session" ? (
          <p className="mt-3 text-center text-xs text-[var(--relay-fg-muted)]">
            Log into Patreon in this browser, then click{" "}
            <strong className="text-[var(--relay-fg)]">Sync</strong> in the Relay extension popup.
            The page will update automatically.
          </p>
        ) : null}
      </section>

      {importError ? (
        <p className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200" role="alert">
          {importError}
        </p>
      ) : null}

      {walkthroughDev && effectiveCtaState !== "review_library" ? (
        <button
          type="button"
          onClick={() => void handleSimulateMediaImport()}
          disabled={simulatingMedia || isTriggering}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#52B788]/30 bg-[#52B788]/5 px-4 py-2 text-xs font-medium text-[#D1FAE5] transition-colors hover:border-[#52B788]/50 hover:bg-[#52B788]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {simulatingMedia ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Simulate media import (dev)
        </button>
      ) : null}

      <details className="rounded-2xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2.5 text-xs">
        <summary className="cursor-pointer list-none text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)]">
          Advanced: manual import options
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/connect/patreon/cookie"
            className="rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)]/40 px-3 py-2 text-[var(--relay-fg-muted)] transition-colors hover:border-[var(--relay-green-600)]/50 hover:text-[var(--relay-fg)]"
          >
            Paste Patreon cookie manually
          </Link>
          <Link
            href="/studio/import"
            className="rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)]/40 px-3 py-2 text-[var(--relay-fg-muted)] transition-colors hover:border-[var(--relay-green-600)]/50 hover:text-[var(--relay-fg)]"
          >
            Manual file upload
          </Link>
        </div>
      </details>

      {reviewModalOpen && effectiveCreatorId ? (
        <CreatorLibraryReviewModal
          open={reviewModalOpen}
          creatorId={effectiveCreatorId}
          onClose={() => setReviewModalOpen(false)}
          onComplete={() => {
            setReviewModalOpen(false);
            router.push("/studio");
          }}
        />
      ) : null}
    </div>
  );
}
