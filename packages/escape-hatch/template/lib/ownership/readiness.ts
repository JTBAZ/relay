/**
 * Ownership packet readiness for Health (EH-080).
 */

import {
  generateOwnershipPacket,
  launchCompleteHint,
  loadOwnershipState
} from "./packet";
import type { OwnershipPacketStateDocument } from "./types";

export type OwnershipReadiness = {
  ok: boolean;
  detail: string;
  packet_generated: boolean;
  launch_complete_hint: boolean;
  packet_path: string | null;
  last_generated_at: string | null;
  production_safe: false;
};

export function assessOwnershipReadiness(opts: {
  siteId: string;
  kitDir?: string;
}): OwnershipReadiness {
  const kitDir = opts.kitDir ?? process.cwd();
  const state = loadOwnershipState(opts.siteId, kitDir);
  const launch_complete_hint = launchCompleteHint(opts.siteId, kitDir);
  const packet_generated = Boolean(state.last_generated_at && state.packet_path);

  const parts: string[] = [];
  if (packet_generated) {
    parts.push(`Packet generated at ${state.last_generated_at} (${state.packet_path}).`);
  } else {
    parts.push("No ownership packet generated yet.");
  }
  if (launch_complete_hint) {
    parts.push("EH-074 launch marked complete (preview) — packet handoff recommended.");
  } else {
    parts.push("Launch wizard not marked complete — packet may still be generated anytime.");
  }
  parts.push("Env names only; productionSafe false; local native QC passed; live provider independence open.");

  return {
    ok: packet_generated,
    detail: parts.join(" "),
    packet_generated,
    launch_complete_hint,
    packet_path: state.packet_path,
    last_generated_at: state.last_generated_at,
    production_safe: false
  };
}

export function ensureOwnershipPacket(opts: {
  siteId: string;
  kitDir?: string;
  now?: Date;
}): {
  readiness: OwnershipReadiness;
  state: OwnershipPacketStateDocument;
  generated: boolean;
  error: string | null;
} {
  const result = generateOwnershipPacket(opts);
  return {
    readiness: assessOwnershipReadiness(opts),
    state: result.state,
    generated: result.ok,
    error: result.error
  };
}
