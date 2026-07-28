"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ExternalLink,
  Info,
  Layers,
  Link2,
  MoreVertical,
  RefreshCw,
  X
} from "lucide-react";
import {
  fetchPerformanceWorkBundle,
  fetchPerformanceWorkInstances,
  requestPlatformInstanceRefresh,
  splitCreativeWorkMember,
  type PerformanceWorkBundleData,
  type PerformanceWorkInstancesData
} from "@/lib/relay-api";
import {
  sendRelayExternalMetricsRefreshToExtension,
  type CrossPostDestination
} from "@/lib/relay-extension-messaging";
import { postCarouselMainVisual } from "@/app/components/PostAssetCarouselStrip";
import type { LinkedSetMemberCard } from "@/lib/active-post-linked-sets";
import {
  buildDrilldownAggregate,
  buildDrilldownMembers,
  fmtCompact,
  type DrilldownLeaf,
  type DrilldownMemberView
} from "@/lib/linked-set-drilldown-data";
import { HERO_PLATFORM_CONFIG } from "@/app/components/studio/HeroPlatformRow";
import {
  CHIP_META,
  isPresenceDestination
} from "@/app/components/distribution/platform-presence-chips";

const THREAD_W = 600;
const COVER_EXPANDED_H = 230;
const COVER_COLLAPSED_H = 66;
const MINT = "#9bf0c4";

type ThreadGeo = {
  w: number;
  h: number;
  trunk: string;
  branches: { id: string; d: string }[];
  leaves: { id: string; d: string }[];
};

type Props = {
  open: boolean;
  creativeWorkId: string;
  title: string;
  coverPostId: string;
  members: LinkedSetMemberCard[];
  onClose: () => void;
  onChanged: () => void;
  onOpenHero: (postId: string) => void;
  onGapFill: (postId: string, destination: string) => void;
  /** Leave tree and select current members so the creator can Link additional posts. */
  onAddPosts: () => void;
};

type SetBarSegment = "structure" | "more";

function TrayButton({
  children,
  onClick,
  muted,
  danger
}: {
  children: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  danger?: boolean;
}) {
  const idle = muted ? "#555" : danger ? "#888" : "#aaa";
  const hover = danger ? "#ef4444" : MINT;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors disabled:cursor-default disabled:opacity-40"
      style={{ color: idle }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.color = hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = idle;
      }}
    >
      {children}
    </button>
  );
}

function platformMeta(destination: string): { label: string; color: string } {
  if (HERO_PLATFORM_CONFIG[destination]) return HERO_PLATFORM_CONFIG[destination]!;
  if (isPresenceDestination(destination)) {
    return { label: CHIP_META[destination].label, color: CHIP_META[destination].color };
  }
  return { label: destination, color: "#888" };
}

function sideFor(idx: number, total: number): "left" | "center" | "right" {
  if (total === 1) return "center";
  return (["left", "right", "center"] as const)[idx % 3]!;
}

function SetActionBar({
  dissolving,
  onDissolve,
  onAddPosts
}: {
  dissolving: boolean;
  onDissolve: () => void;
  onAddPosts: () => void;
}) {
  const [activeSegment, setActiveSegment] = useState<SetBarSegment | null>(null);
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveSegment(null);
        setConfirmDissolve(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const segments: { id: SetBarSegment; icon: ReactNode; label: string }[] = [
    { id: "structure", icon: <Layers size={16} />, label: "Structure" },
    { id: "more", icon: <MoreVertical size={16} />, label: "More" }
  ];

  return (
    <div ref={barRef} className="relative flex w-12 flex-shrink-0 flex-col items-center" style={{ zIndex: 30 }}>
      <div
        className="flex w-12 flex-col items-center gap-1 rounded-2xl border py-2"
        style={{ background: "#0a0a0a", borderColor: "#1f1f1f" }}
      >
        {segments.map((seg, idx) => (
          <div key={seg.id}>
            {idx === 1 ? <div className="my-1 h-px w-6" style={{ background: "#1f1f1f" }} /> : null}
            <button
              type="button"
              title={seg.label}
              onClick={() => {
                setActiveSegment((prev) => (prev === seg.id ? null : seg.id));
                setConfirmDissolve(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
              style={{
                color: activeSegment === seg.id ? MINT : "#555",
                background:
                  activeSegment === seg.id ? "rgba(155,240,196,0.08)" : "transparent"
              }}
              onMouseEnter={(e) => {
                if (activeSegment !== seg.id) e.currentTarget.style.color = MINT;
              }}
              onMouseLeave={(e) => {
                if (activeSegment !== seg.id) e.currentTarget.style.color = "#555";
              }}
            >
              {seg.icon}
            </button>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {activeSegment ? (
          <motion.div
            initial={{ opacity: 0, x: -8, scaleX: 0.92 }}
            animate={{ opacity: 1, x: 0, scaleX: 1 }}
            exit={{ opacity: 0, x: -6, scaleX: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-[52px] top-2 z-50 min-w-[220px] rounded-xl border shadow-xl"
            style={{
              background: "#0e0e0e",
              borderColor: "#242424",
              transformOrigin: "left center"
            }}
          >
            <div className="border-b px-2 py-1.5" style={{ borderColor: "#1a1a1a" }}>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#444" }}>
                {segments.find((s) => s.id === activeSegment)?.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {activeSegment === "structure" ? (
                <>
                  <TrayButton
                    onClick={() => {
                      setActiveSegment(null);
                      onAddPosts();
                    }}
                  >
                    Add posts to set
                  </TrayButton>
                  <p className="px-2 pb-1 pt-1 text-[10px] leading-relaxed" style={{ color: "#555" }}>
                    Cover and member roles stay in Link / future Structure tools. Audience access is
                    per post (open a member).
                  </p>
                </>
              ) : null}
              {activeSegment === "more" ? (
                <TrayButton
                  danger
                  onClick={
                    dissolving
                      ? undefined
                      : () => {
                          if (!confirmDissolve) {
                            setConfirmDissolve(true);
                            return;
                          }
                          onDissolve();
                          setActiveSegment(null);
                          setConfirmDissolve(false);
                        }
                  }
                >
                  {dissolving
                    ? "Breaking apart…"
                    : confirmDissolve
                      ? "Confirm break apart"
                      : "Break apart set"}
                </TrayButton>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AggregateNode({
  aggregate,
  loading
}: {
  aggregate: ReturnType<typeof buildDrilldownAggregate>;
  loading: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hasTeasers = aggregate.teaser_rows.length > 0;

  const row = (label: ReactNode, value: string, valueColor: string, last?: boolean) => (
    <div
      className={`flex items-center justify-between py-1.5 ${last ? "" : "border-b"}`}
      style={{ borderColor: "#1a2a20" }}
    >
      <span className="text-[12px]" style={{ color: "#788" }}>
        {label}
      </span>
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.34, 1.06, 0.64, 1] }}
      className="rounded-2xl border p-3"
      style={{ background: "#080a09", borderColor: "#233" }}
    >
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "#4a9a6a" }}>
          Set totals{loading ? " · loading" : ""}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px]"
          style={{
            color: MINT,
            border: "1px solid rgba(155,240,196,0.2)",
            background: "rgba(155,240,196,0.05)"
          }}
        >
          {aggregate.member_count} members
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div
          className="rounded-xl border p-3"
          style={{ background: "#0f1a14", borderColor: "#2a7a4a70" }}
        >
          <p className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: "#4a9a6a" }}>
            All Platforms
          </p>
          <div className="flex items-center justify-between border-b py-1.5" style={{ borderColor: "#1a2a20" }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: "#788" }}>
                Reach
              </span>
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="flex items-center justify-center"
                  style={{ color: "#555" }}
                  aria-label="Reach definition"
                >
                  <Info size={11} />
                </button>
                <AnimatePresence>
                  {showTooltip ? (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      className="absolute left-5 top-0 z-50 w-[210px] rounded-lg border px-2.5 py-1.5 text-[10px] leading-relaxed"
                      style={{ background: "#111", borderColor: "#2a2a2a", color: "#888" }}
                    >
                      Reach = impressions + seen + views (normalized across platforms).
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
            <span className="text-[15px] font-semibold tabular-nums" style={{ color: MINT }}>
              {fmtCompact(aggregate.total_reach)}
            </span>
          </div>
          {row("Impressions", fmtCompact(aggregate.impressions), MINT)}
          {row("Likes", fmtCompact(aggregate.likes), MINT)}
          {row("Comments", fmtCompact(aggregate.comments), MINT, true)}
        </div>
        <div className="rounded-xl border p-3" style={{ background: "#0d0d0d", borderColor: "#1f1f1f" }}>
          <p className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: "#666" }}>
            Ads + Teasers
          </p>
          {hasTeasers ? (
            <>
              <div
                className="flex items-center justify-between border-b py-1.5"
                style={{ borderColor: "#1a1a1a" }}
              >
                <span className="text-[12px]" style={{ color: "#788" }}>
                  Reach
                </span>
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: "#bbb" }}>
                  {fmtCompact(aggregate.teaser_rows.reduce((s, r) => s + r.total_reach, 0))}
                </span>
              </div>
              {aggregate.teaser_rows.map((m) => (
                <div
                  key={m.post_id}
                  className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: "1px solid #1a1a1a" }}
                >
                  <span className="mr-2 max-w-[120px] truncate text-[11px]" style={{ color: "#666" }}>
                    {m.label}
                  </span>
                  <span className="text-[12px] font-medium tabular-nums" style={{ color: "#999" }}>
                    {fmtCompact(m.total_reach)}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-[12px] leading-relaxed" style={{ color: "#444" }}>
              No ad or teaser variants in this set yet.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function LeafCard({
  leaf,
  delay,
  registerAnchor,
  onGapFill
}: {
  leaf: DrilldownLeaf;
  delay: number;
  registerAnchor: (el: HTMLDivElement | null) => void;
  onGapFill: (destination: string) => void;
}) {
  const config = platformMeta(leaf.destination);

  if (leaf.kind === "gap") {
    return (
      <motion.div
        ref={registerAnchor}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ duration: 0.2, delay, ease: [0.34, 1.06, 0.64, 1] }}
        className="flex w-[168px] flex-shrink-0 flex-col overflow-hidden rounded-xl border border-dashed"
        style={{ background: "#0b0b0b", borderColor: `${config.color}55` }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ borderBottom: "1px solid #191919" }}>
          <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: config.color }} />
          <span className="truncate text-[10px] font-semibold" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-start gap-2 px-2.5 py-2">
          <p className="text-[10px]" style={{ color: "#555" }}>
            Not on {config.label} yet
          </p>
          <button
            type="button"
            onClick={() => onGapFill(leaf.destination)}
            className="rounded-md border px-2 py-1 text-[9px] font-medium"
            style={{
              color: MINT,
              borderColor: "rgba(155,240,196,0.25)",
              background: "rgba(155,240,196,0.06)"
            }}
          >
            Cross-post
          </button>
        </div>
      </motion.div>
    );
  }

  const impressions = leaf.stats.impressions ?? leaf.stats.reach;

  return (
    <motion.div
      ref={registerAnchor}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.2, delay, ease: [0.34, 1.06, 0.64, 1] }}
      className="w-[168px] flex-shrink-0 overflow-hidden rounded-xl border"
      style={{
        background: "#0b0b0b",
        borderColor: leaf.stale ? "#92400e50" : "#222"
      }}
    >
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ borderBottom: "1px solid #191919" }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: config.color }} />
          <span className="truncate text-[10px] font-semibold" style={{ color: config.color }}>
            {config.label}
          </span>
          {leaf.stale ? (
            <span
              className="flex-shrink-0 rounded-full px-1 py-0.5 text-[8px]"
              style={{ color: "#d97706", border: "1px solid #92400e40" }}
            >
              stale
            </span>
          ) : null}
        </div>
        {leaf.external_url ? (
          <a
            href={leaf.external_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
            style={{ border: "1px solid #262626", background: "#0a0a0a", color: "#555" }}
            title="Open on platform"
          >
            <ExternalLink size={10} />
          </a>
        ) : null}
      </div>
      <div className="flex items-center justify-between px-2.5 py-2">
        {[
          { label: "Impr", value: fmtCompact(impressions) },
          { label: "Likes", value: fmtCompact(leaf.stats.likes) },
          { label: "Comm", value: fmtCompact(leaf.stats.comments) }
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold tabular-nums leading-none" style={{ color: "#ccc" }}>
              {s.value}
            </span>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: "#444" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ThreadMemberNode({
  member,
  checked,
  expanded,
  side,
  onCheck,
  onOpen,
  onToggleExpand,
  registerNode
}: {
  member: DrilldownMemberView;
  checked: boolean;
  expanded: boolean;
  side: "left" | "center" | "right";
  onCheck: (e: ReactMouseEvent) => void;
  onOpen: () => void;
  onToggleExpand: () => void;
  registerNode: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const justify = side === "left" ? "flex-start" : side === "right" ? "flex-end" : "center";

  return (
    <div className="flex w-full" style={{ justifyContent: justify }}>
      <div
        ref={(el) => registerNode(member.post_id, el)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex gap-2.5 rounded-2xl border p-2.5 transition-all duration-200"
        style={{
          width: 244,
          background: "#0c0c0c",
          borderColor: checked
            ? "rgba(155,240,196,0.6)"
            : member.is_cover
              ? "rgba(155,240,196,0.3)"
              : hovered
                ? "#3a3a3a"
                : "#222",
          boxShadow: hovered ? "0 8px 26px rgba(0,0,0,0.55)" : "none"
        }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="group relative flex-shrink-0 overflow-hidden rounded-lg"
          style={{ width: 62, height: 82 }}
          title="Open post"
        >
          {member.thumb_src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.thumb_src} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[9px]" style={{ background: "#151515", color: "#444" }}>
              No preview
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: "rgba(5,7,6,0.45)" }}
          >
            <div
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full"
              style={{
                background: "rgba(155,240,196,0.18)",
                border: "1px solid rgba(155,240,196,0.4)"
              }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={MINT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
          <div
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            onClick={onCheck}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCheck(e as unknown as ReactMouseEvent);
              }
            }}
            className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded-full transition-all duration-150"
            style={{
              width: 17,
              height: 17,
              background: checked ? MINT : hovered ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.35)",
              border: checked ? "none" : `1px solid ${hovered ? "#666" : "#333"}`
            }}
          >
            {checked ? <Check size={9} color="#050706" /> : null}
          </div>
        </button>

        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12px] font-medium" style={{ color: "#ddd" }}>
              {member.member_label}
            </p>
            {member.is_cover ? (
              <span
                className="flex-shrink-0 rounded-full px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider"
                style={{
                  background: "rgba(155,240,196,0.16)",
                  border: "1px solid rgba(155,240,196,0.4)",
                  color: MINT
                }}
              >
                Cover
              </span>
            ) : member.variant_role !== "full" && member.variant_role !== "standalone" ? (
              <span
                className="flex-shrink-0 rounded-full px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid #333", color: "#888" }}
              >
                {member.variant_role}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] tabular-nums" style={{ color: MINT }}>
            {fmtCompact(member.total_reach)} reach
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {member.present_short.map((p) => (
              <span
                key={p}
                className="rounded-full px-1 py-0.5 text-[8px]"
                style={{ background: "#141414", color: "#666", border: "1px solid #242424" }}
              >
                {p}
              </span>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-1 pt-1.5">
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all duration-150"
              style={{
                color: expanded ? MINT : "#666",
                background: expanded ? "rgba(155,240,196,0.08)" : "transparent",
                border: `1px solid ${expanded ? "rgba(155,240,196,0.25)" : "#242424"}`
              }}
              title={expanded ? "Collapse platforms" : "Expand platforms"}
            >
              <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.18 }} className="flex">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.span>
              {member.platform_slot_count} platform{member.platform_slot_count === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LinkedSetDrilldown({
  open,
  creativeWorkId,
  title: titleProp,
  coverPostId,
  members: galleryMembers,
  onClose,
  onChanged,
  onOpenHero,
  onGapFill,
  onAddPosts
}: Props) {
  const [bundle, setBundle] = useState<PerformanceWorkBundleData | null>(null);
  const [instances, setInstances] = useState<PerformanceWorkInstancesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [geo, setGeo] = useState<ThreadGeo>({ w: 0, h: 0, trunk: "", branches: [], leaves: [] });

  const scrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const aggregateRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const leafEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const genRef = useRef(0);

  const memberInputs = useMemo(
    () =>
      galleryMembers.map((m) => {
        const primary = m.group.items.find((it) => !it.shadow_cover) ?? m.group.items[0];
        const visual = primary ? postCarouselMainVisual(primary) : null;
        return {
          post_id: m.post_id,
          member_label: m.member_label,
          variant_role: m.variant_role,
          sort_order: m.sort_order,
          title_fallback: primary?.title ?? null,
          thumb_src: visual?.src ?? null,
          present: m.present,
          missing: m.missing
        };
      }),
    [galleryMembers]
  );

  const views = useMemo(
    () =>
      buildDrilldownMembers({
        members: memberInputs,
        coverPostId,
        bundle,
        instances
      }),
    [memberInputs, coverPostId, bundle, instances]
  );

  const aggregate = useMemo(
    () => buildDrilldownAggregate({ members: views, bundle }),
    [views, bundle]
  );

  const displayTitle = bundle?.title?.trim() || titleProp;

  const staleCount = useMemo(() => {
    let n = 0;
    for (const post of instances?.posts ?? []) {
      for (const row of post.platform_instances) {
        if (row.stale) n += 1;
      }
    }
    return n;
  }, [instances]);

  const loadPackaging = useCallback(
    async (opts?: { soft?: boolean; keepBusy?: boolean }) => {
      if (!creativeWorkId) return;
      const gen = ++genRef.current;
      if (opts?.soft) {
        if (!opts.keepBusy) setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const [b, inst] = await Promise.all([
          fetchPerformanceWorkBundle(creativeWorkId, { group_by: "variant_role" }),
          fetchPerformanceWorkInstances(creativeWorkId)
        ]);
        if (gen !== genRef.current) return;
        setBundle(b);
        setInstances(inst);
      } catch (err) {
        if (gen !== genRef.current) return;
        if (!opts?.soft) {
          setBundle(null);
          setInstances(null);
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (gen === genRef.current) {
          setLoading(false);
          if (!opts?.keepBusy) setRefreshing(false);
        }
      }
    },
    [creativeWorkId]
  );

  const asCrossPostDestination = (destination: string): CrossPostDestination | null => {
    if (destination === "patreon" || destination === "x" || destination === "deviantart") {
      return destination;
    }
    return null;
  };

  /** Refresh stale platform metrics (extension handoff when needed), then reload packaging. */
  const handleRefreshClick = useCallback(async () => {
    if (loading || refreshing) return;
    setRefreshing(true);
    setRefreshMessage(null);
    setError(null);

    const staleRows = (instances?.posts ?? []).flatMap((post) =>
      post.platform_instances.filter((row) => row.stale)
    );
    const eligible = staleRows.filter(
      (row) => row.refresh_eligible && Boolean(row.platform_instance_id)
    );

    try {
      if (eligible.length === 0) {
        await loadPackaging({ soft: true, keepBusy: true });
        setRefreshMessage(
          staleRows.length > 0
            ? `${staleRows.length} stale link${staleRows.length === 1 ? "" : "s"} can’t refresh yet (cooldown or missing URL). Orange count stays until metrics update.`
            : "Packaging data reloaded."
        );
        return;
      }

      let completed = 0;
      let handoffOk = 0;
      let handoffFail = 0;
      let cooldown = 0;
      let other = 0;

      for (const row of eligible.slice(0, 8)) {
        try {
          const result = await requestPlatformInstanceRefresh(row.platform_instance_id);
          if (result.status === "completed") {
            completed += 1;
            continue;
          }
          if (result.status === "cooldown") {
            cooldown += 1;
            continue;
          }
          if (result.status === "handoff_required" && result.handoff) {
            const destination = asCrossPostDestination(result.handoff.destination);
            if (!destination) {
              other += 1;
              continue;
            }
            const handoff = await sendRelayExternalMetricsRefreshToExtension({
              postId: result.handoff.post_id,
              attemptId: result.handoff.attempt_id,
              platformInstanceId: result.handoff.platform_instance_id,
              destination,
              externalUrl: result.handoff.external_url
            });
            if (handoff.ok) handoffOk += 1;
            else handoffFail += 1;
            continue;
          }
          other += 1;
        } catch {
          other += 1;
        }
      }

      await loadPackaging({ soft: true, keepBusy: true });

      const parts: string[] = [];
      if (completed > 0) parts.push(`${completed} updated on server`);
      if (handoffOk > 0) {
        parts.push(
          `${handoffOk} sent to the Relay extension — finish in the opened tab, then refresh again`
        );
      }
      if (handoffFail > 0) {
        parts.push(
          `${handoffFail} need the Relay extension (install/enable it, then try again)`
        );
      }
      if (cooldown > 0) parts.push(`${cooldown} on cooldown`);
      if (other > 0) parts.push(`${other} skipped`);
      setRefreshMessage(
        parts.length > 0
          ? parts.join(". ") + "."
          : "No metrics changed. Stale means stats are old — not that the post link is broken."
      );
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [loading, refreshing, instances, loadPackaging]);

  useEffect(() => {
    if (!open || !creativeWorkId) return;
    setExpandedId(null);
    setCheckedIds(new Set());
    setCollapsed(false);
    void loadPackaging();
    return () => {
      genRef.current += 1;
    };
  }, [open, creativeWorkId, loadPackaging]);

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);

  const registerLeaf = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) leafEls.current.set(id, el);
    else leafEls.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const cont = threadRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    const W = cr.width;
    const H = cont.offsetHeight;
    const topC = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top };
    };
    const botC = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - cr.left + r.width / 2, y: r.bottom - cr.top };
    };

    let trunk = "";
    let fork = { x: W / 2, y: 40 };
    if (aggregateRef.current) {
      const aTop = topC(aggregateRef.current);
      const aBot = botC(aggregateRef.current);
      trunk = `M ${W / 2} 0 L ${aTop.x} ${aTop.y}`;
      fork = aBot;
    }

    const branches = views
      .map((m) => {
        const el = nodeEls.current.get(m.post_id);
        if (!el) return null;
        const p = topC(el);
        const midY = fork.y + (p.y - fork.y) * 0.5;
        return {
          id: m.post_id,
          d: `M ${fork.x} ${fork.y} C ${fork.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`
        };
      })
      .filter(Boolean) as { id: string; d: string }[];

    const leaves: { id: string; d: string }[] = [];
    if (expandedId) {
      const node = nodeEls.current.get(expandedId);
      if (node) {
        const src = botC(node);
        leafEls.current.forEach((el, id) => {
          if (!id.startsWith(`${expandedId}::`)) return;
          const p = topC(el);
          const midY = src.y + (p.y - src.y) * 0.5;
          leaves.push({
            id,
            d: `M ${src.x} ${src.y} C ${src.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`
          });
        });
      }
    }

    setGeo({ w: W, h: H, trunk, branches, leaves });
  }, [views, expandedId]);

  useLayoutEffect(() => {
    measure();
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 320);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [measure, collapsed, checkedIds, loading]);

  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (threadRef.current) ro.observe(threadRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const scrollToMember = useCallback((postId: string) => {
    const el = nodeEls.current.get(postId);
    const scroll = scrollRef.current;
    if (!el || !scroll) return;
    const containerTop = scroll.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    scroll.scrollTop += elTop - containerTop - 120;
  }, []);

  const toggleCheck = (id: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDissolve = async () => {
    setDissolving(true);
    setError(null);
    try {
      for (const m of views) {
        await splitCreativeWorkMember(m.post_id);
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDissolving(false);
    }
  };

  const handleRemoveSelected = async () => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    setRemoving(true);
    setError(null);
    try {
      for (const postId of ids) {
        await splitCreativeWorkMember(postId);
      }
      onChanged();
      if (ids.length >= views.length) onClose();
      else setCheckedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  };

  if (!open) return null;

  const body = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ zIndex: 90, background: "rgba(5,7,6,0.92)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={`Linked Set ${displayTitle}`}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.26, ease: [0.34, 1.06, 0.64, 1] }}
        className="relative flex items-start gap-4"
        style={{ height: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <SetActionBar
          dissolving={dissolving}
          onDissolve={() => void handleDissolve()}
          onAddPosts={onAddPosts}
        />

        <div className="relative" style={{ height: "100%" }}>
          <div className="absolute right-0 top-0 z-40 flex -translate-y-1 translate-x-1 flex-col items-end gap-1.5">
            <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={loading || refreshing}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:opacity-50"
              style={{ background: "#0a0a0a", borderColor: "#1f1f1f", color: refreshing ? MINT : "#666" }}
              title={
                staleCount > 0
                  ? `${staleCount} stale platform link${staleCount === 1 ? "" : "s"} — stats older than freshness window. Refresh tries to update them (extension may be required).`
                  : "Reload packaging data"
              }
              onMouseEnter={(e) => {
                if (!refreshing) e.currentTarget.style.color = MINT;
              }}
              onMouseLeave={(e) => {
                if (!refreshing) e.currentTarget.style.color = "#666";
              }}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
              {staleCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold"
                  style={{ background: "#92400e", color: "#fbbf24" }}
                >
                  {staleCount > 9 ? "9+" : staleCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors"
              style={{ background: "#0a0a0a", borderColor: "#1f1f1f", color: "#666" }}
              title="Close"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = MINT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#666";
              }}
            >
              <X size={14} />
            </button>
            </div>
            {refreshMessage ? (
              <p
                className="max-w-[280px] rounded-lg border px-2.5 py-1.5 text-right text-[10px] leading-snug"
                style={{ background: "#0a0a0a", borderColor: "#2a2a2a", color: "#c4b5a0" }}
                role="status"
              >
                {refreshMessage}
              </p>
            ) : null}
          </div>

        <div
          ref={scrollRef}
          onScroll={(e) => setCollapsed((e.currentTarget as HTMLDivElement).scrollTop > 44)}
          className="relative overflow-y-auto rounded-2xl"
          style={{
            width: THREAD_W,
            maxWidth: "calc(100vw - 160px)",
            height: "100%",
            scrollbarWidth: "none",
            background: "#050706",
            border: "1px solid #141414"
          }}
        >
          <div
            className="sticky top-0 z-30 px-4 pb-2 pt-4"
            style={{ background: "linear-gradient(to bottom, #050706 72%, transparent)" }}
          >
            <motion.div
              className="relative overflow-hidden rounded-2xl border"
              animate={{ height: collapsed ? COVER_COLLAPSED_H : COVER_EXPANDED_H }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
            >
              <div
                className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1 rounded-full border px-2 py-1"
                style={{ background: "rgba(5,7,6,0.82)", borderColor: "rgba(155,240,196,0.35)" }}
              >
                <Link2 size={9} color={MINT} />
                <span className="text-[9px] font-semibold" style={{ color: MINT }}>
                  Linked · {views.length}
                </span>
              </div>

              {collapsed ? (
                <div className="relative flex h-full items-center gap-3 px-3">
                  <div
                    className="flex flex-shrink-0 gap-0.5 overflow-hidden rounded-md"
                    style={{ width: 44, height: 40 }}
                  >
                    {views.slice(0, 3).map((m) => (
                      <div key={m.post_id} className="flex-1 overflow-hidden">
                        {m.thumb_src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.thumb_src} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full" style={{ background: "#1a1a1a" }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] uppercase tracking-widest" style={{ color: "#666" }}>
                      Linked Set
                    </p>
                    <p
                      className="truncate text-[15px] font-light"
                      style={{ fontFamily: "var(--font-display), Fraunces, Georgia, serif", color: "#e8e8e0" }}
                    >
                      {displayTitle}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col">
                  <div
                    className="grid min-h-0 flex-1 gap-px"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(Math.max(views.length, 1), 6)}, 1fr)`
                    }}
                  >
                    {views.slice(0, 6).map((m) => (
                      <button
                        key={m.post_id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          scrollToMember(m.post_id);
                        }}
                        className="group relative overflow-hidden"
                        title={`Jump to ${m.member_label}`}
                      >
                        {m.thumb_src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.thumb_src}
                            alt={m.member_label}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-full w-full" style={{ background: "#151515" }} />
                        )}
                        <div
                          className="absolute inset-0 flex items-end p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          style={{
                            background: "linear-gradient(to top, rgba(5,7,6,0.82) 0%, transparent 60%)"
                          }}
                        >
                          <span className="w-full truncate text-[8px] font-medium leading-tight text-white">
                            {m.member_label}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex-shrink-0 px-3.5 pb-3 pt-2" style={{ background: "#050706" }}>
                    <p className="mb-1 text-[9px] uppercase tracking-widest" style={{ color: "#6a8a76" }}>
                      Linked Set · The Thread
                    </p>
                    <p
                      className="text-[18px] font-light leading-tight"
                      style={{ fontFamily: "var(--font-display), Fraunces, Georgia, serif", color: "#e8e8e0" }}
                    >
                      {displayTitle}
                    </p>
                    {error ? (
                      <p className="mt-1 text-[10px]" style={{ color: "#d97706" }}>
                        {error}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <div ref={threadRef} className="relative px-4 pb-28 pt-2">
            <svg
              className="pointer-events-none absolute"
              width={geo.w}
              height={geo.h}
              style={{ left: 16, top: 8, zIndex: 1, overflow: "visible" }}
            >
              <defs>
                <linearGradient id="linked-set-thread-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MINT} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={MINT} stopOpacity="0.12" />
                </linearGradient>
              </defs>
              {geo.trunk ? (
                <motion.path
                  d={geo.trunk}
                  fill="none"
                  stroke="url(#linked-set-thread-grad)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              ) : null}
              {geo.branches.map((b, i) => (
                <motion.path
                  key={b.id}
                  d={b.d}
                  fill="none"
                  stroke="url(#linked-set-thread-grad)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease: "easeOut" }}
                />
              ))}
              {geo.leaves.map((l, i) => (
                <motion.path
                  key={l.id}
                  d={l.d}
                  fill="none"
                  stroke="rgba(155,240,196,0.4)"
                  strokeWidth={1.2}
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
                />
              ))}
            </svg>

            <div ref={aggregateRef} className="relative z-10 mb-1 mt-6">
              <AggregateNode aggregate={aggregate} loading={loading} />
            </div>

            <p
              className="relative z-10 my-4 text-center text-[9px] uppercase tracking-[0.2em]"
              style={{ color: "#2f3a33" }}
            >
              splits into {views.length} {views.length === 1 ? "branch" : "branches"}
            </p>

            <div
              className="relative z-10 flex flex-col"
              style={{ gap: views.length > 5 ? 14 : 24 }}
            >
              {views.map((m, idx) => {
                const isExp = expandedId === m.post_id;
                return (
                  <div key={m.post_id} className="flex flex-col">
                    <ThreadMemberNode
                      member={m}
                      checked={checkedIds.has(m.post_id)}
                      expanded={isExp}
                      side={sideFor(idx, views.length)}
                      onCheck={(e) => toggleCheck(m.post_id, e)}
                      onOpen={() => onOpenHero(m.post_id)}
                      onToggleExpand={() =>
                        setExpandedId((prev) => (prev === m.post_id ? null : m.post_id))
                      }
                      registerNode={registerNode}
                    />
                    <AnimatePresence>
                      {isExp ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          style={{ overflow: "visible" }}
                        >
                          <div className="flex flex-wrap justify-center gap-2.5 pb-1 pt-7">
                            {m.leaves.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "#555" }}>
                                No linked platforms yet
                              </p>
                            ) : (
                              m.leaves.map((leaf, li) => (
                                <LeafCard
                                  key={`${leaf.kind}-${leaf.destination}`}
                                  leaf={leaf}
                                  delay={0.12 + li * 0.06}
                                  registerAnchor={(el) =>
                                    registerLeaf(
                                      `${m.post_id}::${leaf.kind}-${leaf.destination}`,
                                      el
                                    )
                                  }
                                  onGapFill={(destination) => onGapFill(m.post_id, destination)}
                                />
                              ))
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          <AnimatePresence>
            {checkedIds.size > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="sticky bottom-3 z-40 mx-auto flex w-fit items-center gap-2 rounded-xl border px-3 py-2 shadow-xl"
                style={{ background: "#0e0e0e", borderColor: "#2a2a2a" }}
              >
                <span className="text-[11px]" style={{ color: "#666" }}>
                  <span className="font-semibold" style={{ color: "#ccc" }}>
                    {checkedIds.size}
                  </span>{" "}
                  selected
                </span>
                <div className="mx-0.5 h-3 w-px" style={{ background: "#2a2a2a" }} />
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => void handleRemoveSelected()}
                  className="rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50"
                  style={{ borderColor: "#2a2a2a", color: "#888", background: "transparent" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#888";
                  }}
                >
                  {removing ? "Removing…" : "Remove from set"}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
