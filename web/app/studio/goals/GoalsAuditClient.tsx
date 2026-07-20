"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveCreatorGoalCycle,
  fetchCreatorGoalCycle,
  listCreatorGoalCycles,
  RelayApiError
} from "@/lib/relay-api";
import type { GoalCycleAuditRecord } from "@/lib/goal-cycle-audit-fixtures";
import type { GoalCycleDetail, GoalCycleSummary } from "@/lib/goal-cycle-types";
import { GoalsAuditView } from "./GoalsAuditView";

function recordFromDetail(cycle: GoalCycleDetail): GoalCycleAuditRecord {
  return {
    cycle,
    reflection: cycle.reflection ?? null,
    learning: cycle.learning ?? null
  };
}

function recordFromSummary(summary: GoalCycleSummary): GoalCycleAuditRecord {
  return {
    cycle: {
      ...summary,
      time_zone: "UTC",
      context: {},
      plan: null,
      progress: [],
      credit: null,
      evidence: [],
      outcome: null,
      reflection: null,
      learning: null,
      materialization: null
    },
    reflection: null,
    learning: null
  };
}

export type GoalsAuditClientProps = {
  /** When set, skip network and render fixtures (tests / Storybook-style). */
  fixtureRecords?: GoalCycleAuditRecord[];
  fixtureActiveCycleId?: string | null;
  initialSelectedCycleId?: string | null;
};

export function GoalsAuditClient({
  fixtureRecords,
  fixtureActiveCycleId = null,
  initialSelectedCycleId = null
}: GoalsAuditClientProps) {
  const [records, setRecords] = useState<GoalCycleAuditRecord[]>(fixtureRecords ?? []);
  const [activeCycleId, setActiveCycleId] = useState<string | null>(fixtureActiveCycleId);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(
    initialSelectedCycleId ?? fixtureRecords?.[0]?.cycle.cycle_id ?? null
  );
  const [loading, setLoading] = useState(!fixtureRecords);
  const [error, setError] = useState<string | null>(null);

  const loadLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, listRes] = await Promise.all([
        fetchActiveCreatorGoalCycle(),
        listCreatorGoalCycles({ limit: 24 })
      ]);
      const activeId = activeRes.cycle?.cycle_id ?? null;
      setActiveCycleId(activeId);

      const summaries = listRes.items;
      const details = await Promise.all(
        summaries.map(async (item) => {
          try {
            const { cycle } = await fetchCreatorGoalCycle(item.cycle_id);
            return recordFromDetail(cycle);
          } catch {
            return recordFromSummary(item);
          }
        })
      );
      setRecords(details);
      setSelectedCycleId((prev) => {
        if (prev && details.some((d) => d.cycle.cycle_id === prev)) return prev;
        if (activeId && details.some((d) => d.cycle.cycle_id === activeId)) return activeId;
        return details[0]?.cycle.cycle_id ?? null;
      });
    } catch (err) {
      const message =
        err instanceof RelayApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not load Goal Cycles.";
      setError(message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fixtureRecords) return;
    void loadLive();
  }, [fixtureRecords, loadLive]);

  return (
    <GoalsAuditView
      records={records}
      activeCycleId={activeCycleId}
      selectedCycleId={selectedCycleId}
      onSelect={setSelectedCycleId}
      loading={loading}
      error={error}
    />
  );
}
