/**
 * P5a-ins-004 — Cohort retention (join month × months-since-join → retained %), aggregates only.
 */
import {
  CreatorMembershipEventType,
  type PrismaClient
} from "@prisma/client";

export type CohortRetentionRow = {
  months_since_join: number;
  /** Members still "paid" at end of that month (per ledger replay). */
  retained_count: number;
  cohort_size: number;
  /** 0–1; 0 if cohort_size is 0. */
  retained_pct: number;
};

export type MembershipCohortBlock = {
  cohort_month: string;
  cohort_size: number;
  /** Only includes offsets whose month end is not after `as_of`. */
  retention: CohortRetentionRow[];
};

export type CreatorMembershipCohortReport = {
  as_of: string;
  max_months_since_join: number;
  cohort_months_included: number;
  cohorts: MembershipCohortBlock[];
  note: string;
};

type LedgerEvent = {
  type: CreatorMembershipEventType;
  at: Date;
};

function utcEndOfMonthAfterOffset(
  cohortYear: number,
  cohortMonth0: number,
  k: number
): Date {
  return new Date(
    Date.UTC(cohortYear, cohortMonth0 + k + 1, 0, 23, 59, 59, 999)
  );
}

function cohortKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseCohortKey(key: string): { y: number; m0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m0: mo - 1 };
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Paid after applying join/rejoin/cancel in time order up to and including `end`. */
export function paidAtLedgerEnd(
  events: LedgerEvent[],
  end: Date
): boolean {
  let paid = false;
  for (const e of events) {
    if (e.at > end) {
      break;
    }
    if (
      e.type === CreatorMembershipEventType.join ||
      e.type === CreatorMembershipEventType.rejoin
    ) {
      paid = true;
    } else if (e.type === CreatorMembershipEventType.cancel) {
      paid = false;
    }
  }
  return paid;
}

function firstJoinOrRejoin(events: LedgerEvent[]): Date | null {
  for (const e of events) {
    if (
      e.type === CreatorMembershipEventType.join ||
      e.type === CreatorMembershipEventType.rejoin
    ) {
      return e.at;
    }
  }
  return null;
}

/**
 * @param relayCreatorId — studio scope (`Tenant.relayCreatorId`).
 * @param maxCohortMonths — only cohorts with anchor on/after `as_of` minus this many whole months.
 * @param maxOffset — max `months_since_join` column (pilot default 12).
 * @returns `null` if tenant missing (caller may 404).
 */
export async function getCreatorMembershipCohortRetention(
  prisma: PrismaClient,
  relayCreatorId: string,
  maxCohortMonths: number,
  maxOffset: number,
  options?: { asOf?: Date }
): Promise<CreatorMembershipCohortReport | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return null;
  }

  const cohortCap = Math.min(Math.max(Math.floor(maxCohortMonths), 1), 36);
  const offsetCap = Math.min(Math.max(Math.floor(maxOffset), 1), 24);

  const rows = await prisma.creatorMembershipEvent.findMany({
    where: {
      creatorId: relayCreatorId,
      eventType: {
        in: [
          CreatorMembershipEventType.join,
          CreatorMembershipEventType.rejoin,
          CreatorMembershipEventType.cancel
        ]
      }
    },
    select: {
      patreonMemberId: true,
      eventType: true,
      occurredAt: true
    },
    orderBy: [{ patreonMemberId: "asc" }, { occurredAt: "asc" }]
  });

  const asOf = options?.asOf ?? new Date();
  const horizonStart = startOfUtcMonth(asOf);
  horizonStart.setUTCMonth(horizonStart.getUTCMonth() - cohortCap);

  const byMember = new Map<string, LedgerEvent[]>();
  for (const r of rows) {
    const list = byMember.get(r.patreonMemberId) ?? [];
    list.push({ type: r.eventType, at: r.occurredAt });
    byMember.set(r.patreonMemberId, list);
  }
  for (const evs of byMember.values()) {
    evs.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** Cohort size = distinct members, not raw event count. */
  const cohortMemberLists = new Map<string, Map<string, LedgerEvent[]>>();
  for (const [memberId, evs] of byMember) {
    const anchor = firstJoinOrRejoin(evs);
    if (!anchor || anchor < horizonStart) {
      continue;
    }
    const key = cohortKeyFromDate(anchor);
    if (!cohortMemberLists.has(key)) {
      cohortMemberLists.set(key, new Map());
    }
    cohortMemberLists.get(key)!.set(memberId, evs);
  }

  const cohortKeys = [...cohortMemberLists.keys()].sort().reverse();

  const cohorts: MembershipCohortBlock[] = [];
  for (const cohort_month of cohortKeys) {
    const parsed = parseCohortKey(cohort_month);
    if (!parsed) {
      continue;
    }
    const members = cohortMemberLists.get(cohort_month)!;
    const cohort_size = members.size;
    const retention: CohortRetentionRow[] = [];

    for (let k = 0; k <= offsetCap; k += 1) {
      const periodEnd = utcEndOfMonthAfterOffset(parsed.y, parsed.m0, k);
      if (periodEnd > asOf) {
        break;
      }
      let retained = 0;
      for (const [, evs] of members) {
        if (paidAtLedgerEnd(evs, periodEnd)) {
          retained += 1;
        }
      }
      retention.push({
        months_since_join: k,
        retained_count: retained,
        cohort_size,
        retained_pct: cohort_size > 0 ? retained / cohort_size : 0
      });
    }

    cohorts.push({ cohort_month, cohort_size, retention });
  }

  return {
    as_of: asOf.toISOString(),
    max_months_since_join: offsetCap,
    cohort_months_included: cohortCap,
    cohorts,
    note:
      "Retention uses join/rejoin/cancel events only; tier changes are ignored. Month boundaries are UTC. Cohort month is the calendar month of the member's first join or rejoin in the ledger."
  };
}
