"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type {
  AudiencePersonaKey,
  AudiencePromotionPanelProps,
  AudiencePromotionTab
} from "@/lib/audience-promotion-contracts";
import { PILOT_PERMISSION_HEADLINE } from "@/lib/pilot-permission-copy";
import { accessTiersFromGalleryItem } from "@/app/components/audience-access-tier-select";
import RelayVisibilityChecklist from "@/app/components/studio/RelayVisibilityChecklist";
import MinimumTierAccessEditor from "@/app/components/studio/MinimumTierAccessEditor";
import AudienceSimulatorSection from "@/app/components/studio/AudienceSimulatorSection";
import DiscountCodeLibraryPanel from "@/app/components/studio/DiscountCodeLibraryPanel";
import PostOfferAssignmentPanel from "@/app/components/studio/PostOfferAssignmentPanel";
import { listCreatorDiscountCodes } from "@/lib/relay-api";

const TABS: Array<{ id: AudiencePromotionTab; label: string }> = [
  { id: "access", label: "Access" },
  { id: "simulator", label: "Simulator" },
  { id: "promotion", label: "Promotion" }
];

function TabSubhead({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555]">
      {children}
    </p>
  );
}

function ExpandableEditor({
  title,
  summary,
  open,
  onToggle,
  children
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-transparent">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#555]">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[#aab3ae]">{summary}</span>
        </span>
        <span className="shrink-0 text-[10px] text-[#68706c]">{open ? "Hide" : "Edit"}</span>
      </button>
      {open ? <div className="border-t border-[#1a1a1a] px-1 pb-2 pt-1">{children}</div> : null}
    </div>
  );
}

type TabMotionProps = {
  active: boolean;
  reduceMotion: boolean | null;
  enterX: number;
  exitX: number;
  enterDuration: number;
  exitDuration: number;
  children: ReactNode;
  body: AudiencePromotionTab;
};

/** Persistent tab body: stays mounted; animates in when becoming active. */
function PersistentTabBody({
  active,
  reduceMotion,
  enterX,
  exitX,
  enterDuration,
  exitDuration,
  children,
  body
}: TabMotionProps) {
  return (
    <motion.div
      data-audience-tab-body={body}
      initial={false}
      animate={
        active
          ? { opacity: 1, x: 0 }
          : { opacity: 0, x: reduceMotion ? 0 : exitX }
      }
      transition={
        active
          ? { duration: enterDuration, ease: "easeOut" }
          : { duration: exitDuration, ease: "easeOut" }
      }
      className={active ? "block" : "hidden"}
      aria-hidden={!active}
      {...(!active ? ({ inert: "" } as Record<string, string>) : {})}
    >
      {children}
    </motion.div>
  );
}

/**
 * In-Hero Audience & Promotion workspace — height-capped tabbed rail.
 */
export default function AudiencePromotionPanel({
  creatorId,
  postId,
  postItems,
  selectedItem,
  tiers,
  studioWriteBlocked,
  onRefresh
}: AudiencePromotionPanelProps) {
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const tablistId = `${baseId}-tablist`;
  const [tab, setTab] = useState<AudiencePromotionTab>("access");
  const [personaKey, setPersonaKey] = useState<AudiencePersonaKey>("anonymous");
  const [personas, setPersonas] = useState<
    Array<{ persona_key: AudiencePersonaKey; label: string }>
  >([{ persona_key: "anonymous", label: "Public (logged out)" }]);
  const [offerRefreshToken, setOfferRefreshToken] = useState(0);
  const [codesExpanded, setCodesExpanded] = useState(false);
  const [offerExpanded, setOfferExpanded] = useState(false);
  const [codeCount, setCodeCount] = useState(0);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<AudiencePromotionTab, HTMLButtonElement | null>>>({});

  const tierTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tiers) {
      map[t.tier_id] = t.title;
      if (t.relay_tier_id) map[t.relay_tier_id] = t.title;
    }
    return map;
  }, [tiers]);

  const accessSource = selectedItem ?? postItems[0] ?? null;
  const accessTiers = useMemo(
    () => (accessSource ? accessTiersFromGalleryItem(accessSource, tierTitleById) : []),
    [accessSource, tierTitleById]
  );
  const postTitle = accessSource?.title?.trim() || "Post";

  const postTierIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of postItems) {
      for (const id of item.tier_ids ?? []) {
        if (id?.trim()) ids.add(id.trim());
      }
    }
    return [...ids];
  }, [postItems]);

  const catalogTiers = useMemo(
    () =>
      tiers.map((t) => ({
        relay_tier_id: (t.relay_tier_id ?? t.tier_id).trim(),
        amount_cents: t.amount_cents ?? null
      })),
    [tiers]
  );

  const panelLabel = `Audience & Promotion — ${
    TABS.find((t) => t.id === tab)?.label ?? "Access"
  }`;

  const enterX = reduceMotion ? 0 : 8;
  const exitX = reduceMotion ? 0 : -6;
  const enterDuration = reduceMotion ? 0.01 : 0.18;
  const exitDuration = reduceMotion ? 0.01 : 0.14;

  const updateScrollAffordances = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollMore(false);
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setCanScrollMore(remaining > 8);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCreatorDiscountCodes(creatorId);
        if (!cancelled) setCodeCount(Array.isArray(rows) ? rows.length : 0);
      } catch {
        if (!cancelled) setCodeCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, offerRefreshToken]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    updateScrollAffordances();
  }, [tab, updateScrollAffordances]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollAffordances();
    const onScroll = () => updateScrollAffordances();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [tab, updateScrollAffordances]);

  const selectTab = useCallback((next: AudiencePromotionTab, focus = false) => {
    setTab(next);
    if (focus) {
      requestAnimationFrame(() => tabRefs.current[next]?.focus());
    }
  }, []);

  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(TABS[(idx + 1) % TABS.length]!.id, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab(TABS[(idx - 1 + TABS.length) % TABS.length]!.id, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(TABS[0]!.id, true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(TABS[TABS.length - 1]!.id, true);
    }
  };

  const onPersonasLoaded = useCallback(
    (next: Array<{ persona_key: AudiencePersonaKey; label: string }>) => {
      setPersonas(next);
    },
    []
  );

  const personaLabel =
    personas.find((p) => p.persona_key === personaKey)?.label ?? personaKey;

  const motionShared = {
    reduceMotion,
    enterX,
    exitX,
    enterDuration,
    exitDuration
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border"
      style={{
        borderColor: "#242424",
        background: "#0a0a0a",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)"
      }}
      data-audience-promotion-panel
      data-audience-promotion-tab={tab}
      data-reduced-motion={reduceMotion ? "1" : "0"}
      data-post-id={postId}
      data-creator-id={creatorId}
      data-asset-count={postItems.length}
      data-studio-write-blocked={studioWriteBlocked ? "1" : "0"}
    >
      <header className="shrink-0 space-y-0.5 px-3 pb-2 pt-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#68706c]">
          Audience &amp; Promotion
        </p>
        <p className="text-[12px] font-medium leading-snug text-[#e8eee9]">
          {PILOT_PERMISSION_HEADLINE}
        </p>
      </header>

      <div
        id={tablistId}
        role="tablist"
        aria-label="Audience & Promotion sections"
        className="relative mx-3 grid shrink-0 grid-cols-3 gap-0.5 rounded-lg border border-[#1a1a1a] bg-[#0e0e0e] p-0.5"
        onKeyDown={onTabListKeyDown}
      >
        {TABS.map((t) => {
          const selected = tab === t.id;
          const tabId = `${baseId}-tab-${t.id}`;
          const panelId = `${baseId}-panel`;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(t.id)}
              className={
                selected
                  ? "relative z-0 min-h-9 rounded-md px-1 text-[11px] font-medium text-[#9bf0c4] outline-none focus-visible:ring-1 focus-visible:ring-[#9bf0c4]/80"
                  : "relative z-0 min-h-9 rounded-md px-1 text-[11px] font-medium text-[#68706c] outline-none transition-colors hover:text-[#aab3ae] focus-visible:ring-1 focus-visible:ring-[#9bf0c4]/80"
              }
            >
              {selected ? (
                <motion.span
                  layoutId="audience-promotion-tab-highlight"
                  className="absolute inset-0 -z-10 rounded-md border"
                  style={{
                    background: "rgba(155,240,196,0.10)",
                    borderColor: "rgba(155,240,196,0.28)"
                  }}
                  transition={
                    reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
                  }
                />
              ) : null}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-2 min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${tab}`}
          aria-label={panelLabel}
          data-audience-promotion-tabpanel
          data-overflow-y="auto"
          className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-1 [scrollbar-width:thin] [scrollbar-color:#2a2a2a_transparent]"
        >
          {/*
            AnimatePresence marks tab identity for tests/reduced-motion branches.
            Bodies stay mounted via PersistentTabBody so unsaved form state survives.
          */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={tab}
              data-audience-tab-motion={tab}
              initial={{ opacity: 0, x: enterX }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: exitX }}
              transition={{
                duration: enterDuration,
                ease: "easeOut",
                opacity: { duration: exitDuration }
              }}
              className="sr-only"
            >
              {panelLabel}
            </motion.span>
          </AnimatePresence>

          <PersistentTabBody active={tab === "access"} body="access" {...motionShared}>
            <div className="space-y-3">
              <p className="text-[10px] leading-relaxed text-[#6a726e]">
                Audit Relay presentation and Patreon access separately (ADR-004). Packaging stats
                stay on the Hero overview.
              </p>
              <div>
                <TabSubhead>Relay visibility</TabSubhead>
                <RelayVisibilityChecklist
                  creatorId={creatorId}
                  postItems={postItems}
                  studioWriteBlocked={studioWriteBlocked}
                  onRefresh={onRefresh}
                />
              </div>
              <div className="h-px bg-[#1a1a1a]" role="separator" />
              <div>
                <TabSubhead>Patreon minimum tier</TabSubhead>
                <MinimumTierAccessEditor
                  creatorId={creatorId}
                  postId={postId}
                  accessTiers={accessTiers}
                  studioWriteBlocked={studioWriteBlocked}
                  onRefresh={onRefresh}
                />
              </div>
            </div>
          </PersistentTabBody>

          <PersistentTabBody
            active={tab === "simulator"}
            body="simulator"
            {...motionShared}
          >
            <div data-audience-simulator-tab>
              <AudienceSimulatorSection
                creatorId={creatorId}
                postId={postId}
                selectedItem={selectedItem}
                postTitle={postTitle}
                studioWriteBlocked={studioWriteBlocked}
                onRefresh={onRefresh}
                personaKey={personaKey}
                onPersonaChange={setPersonaKey}
                onPersonasLoaded={onPersonasLoaded}
                offerRefreshToken={offerRefreshToken}
              />
            </div>
          </PersistentTabBody>

          <PersistentTabBody
            active={tab === "promotion"}
            body="promotion"
            {...motionShared}
          >
            <div className="space-y-3" data-promotion-studio>
              <ExpandableEditor
                title="Discount codes"
                summary={
                  codeCount > 0
                    ? `${codeCount} code${codeCount === 1 ? "" : "s"} in library`
                    : "No codes yet — paste from Patreon"
                }
                open={codesExpanded}
                onToggle={() => setCodesExpanded((v) => !v)}
              >
                <DiscountCodeLibraryPanel
                  creatorId={creatorId}
                  studioWriteBlocked={studioWriteBlocked}
                  onCodesChanged={(codes) => setCodeCount(codes.length)}
                />
              </ExpandableEditor>

              <ExpandableEditor
                title="Offer for selected persona"
                summary={`${personaLabel} · tracked link & CTA`}
                open={offerExpanded}
                onToggle={() => setOfferExpanded((v) => !v)}
              >
                <PostOfferAssignmentPanel
                  creatorId={creatorId}
                  postId={postId}
                  personas={personas}
                  selectedPersonaKey={personaKey}
                  postTierIds={postTierIds}
                  catalogTiers={catalogTiers}
                  studioWriteBlocked={studioWriteBlocked}
                  onOfferSaved={() => setOfferRefreshToken((n) => n + 1)}
                />
              </ExpandableEditor>
            </div>
          </PersistentTabBody>
        </div>

        {canScrollMore ? (
          <div
            aria-hidden
            data-scroll-fade
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
            style={{
              background: "linear-gradient(to top, #0a0a0a 10%, transparent)"
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
