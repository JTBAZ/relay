import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  CreatorMembershipEventSource,
  CreatorMembershipEventType
} from "@prisma/client";
import { prisma } from "../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
/** Opt-in: set with DATABASE_URL after `prisma migrate deploy` includes P5a migrations (avoids failing CI/local when DB is behind). */
const runP5aDedupeIntegration =
  hasDatabaseUrl && process.env.P5A_DB_INTEGRATION === "1";

const TEST_CREATOR = "p5a_dedupe_test_creator";
const TEST_MEMBER = "p5a_dedupe_test_member";

describe.skipIf(!runP5aDedupeIntegration)(
  "P5a-db-003 — CreatorMembershipEvent composite unique (P5A_DB_INTEGRATION=1 + migrate deploy)",
  () => {
    it("rejects duplicate (creator, member, type, occurred_at)", async () => {
      const occurredAt = new Date("2026-05-09T20:00:00.000Z");
      const base = {
        creatorId: TEST_CREATOR,
        patreonMemberId: TEST_MEMBER,
        eventType: CreatorMembershipEventType.join,
        occurredAt,
        source: CreatorMembershipEventSource.sync
      };

      await prisma.creatorMembershipEvent.deleteMany({
        where: { creatorId: TEST_CREATOR }
      });

      await prisma.creatorMembershipEvent.create({ data: base });

      await expect(
        prisma.creatorMembershipEvent.create({ data: base })
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
      );

      await prisma.creatorMembershipEvent.deleteMany({
        where: { creatorId: TEST_CREATOR }
      });
    });

    it("allows same member and type at a different occurred_at", async () => {
      const base = {
        creatorId: TEST_CREATOR,
        patreonMemberId: TEST_MEMBER,
        eventType: CreatorMembershipEventType.upgrade,
        source: CreatorMembershipEventSource.sync
      };

      await prisma.creatorMembershipEvent.deleteMany({
        where: { creatorId: TEST_CREATOR }
      });

      await prisma.creatorMembershipEvent.create({
        data: {
          ...base,
          occurredAt: new Date("2026-05-09T21:00:00.000Z")
        }
      });
      await prisma.creatorMembershipEvent.create({
        data: {
          ...base,
          occurredAt: new Date("2026-05-09T22:00:00.000Z")
        }
      });

      const count = await prisma.creatorMembershipEvent.count({
        where: { creatorId: TEST_CREATOR }
      });
      expect(count).toBe(2);

      await prisma.creatorMembershipEvent.deleteMany({
        where: { creatorId: TEST_CREATOR }
      });
    });
  }
);
