"use client";

import { ShieldCheck, Lock, Zap } from "lucide-react";

const marks = [
  { icon: ShieldCheck, label: "End-to-end encrypted" },
  { icon: Lock, label: "SOC 2 compliant" },
  { icon: Zap, label: "Real-time sync" }
];

export function TrustMarks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {marks.map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon size={13} className="shrink-0" style={{ color: "#40916C" }} aria-hidden />
          <span className="font-sans text-xs" style={{ color: "#9CA3AF" }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
