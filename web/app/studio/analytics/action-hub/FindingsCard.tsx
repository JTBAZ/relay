"use client";

import { motion } from "framer-motion";
import { TrendingUp, Users, Clock, Hash, type LucideIcon } from "lucide-react";
import type { FindingChip, IconType } from "./action-hub-types";
import { IAH } from "./action-hub-tokens";

const ICONS: Record<IconType, LucideIcon> = {
  trend: TrendingUp,
  people: Users,
  clock: Clock,
  tag: Hash
};

function renderLabel(chip: FindingChip) {
  if (!chip.highlight) return chip.label;
  const parts = chip.label.split(chip.highlight.text);
  return (
    <>
      {parts[0]}
      <span className="font-semibold" style={{ color: IAH.accent }}>
        {chip.highlight.value}
      </span>
      {parts[1]}
    </>
  );
}

type FindingsCardProps = {
  chip: FindingChip;
  index: number;
  isActive?: boolean;
};

export function FindingsCard({ chip, index, isActive = true }: FindingsCardProps) {
  const Icon = ICONS[chip.icon];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: isActive ? 1 : 0.45, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="group relative flex cursor-default select-none items-center gap-4 rounded-xl border px-5 py-4"
      style={{
        borderColor: IAH.border,
        background: IAH.surface,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${IAH.accentBorder}` }}
      />

      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: IAH.accentSoft, border: `1px solid ${IAH.accentBorder}` }}
        aria-hidden="true"
      >
        <Icon size={18} style={{ color: IAH.accent }} strokeWidth={1.8} />
      </span>

      <p className="text-sm leading-snug" style={{ color: IAH.fg }}>
        {renderLabel(chip)}
      </p>
    </motion.div>
  );
}
