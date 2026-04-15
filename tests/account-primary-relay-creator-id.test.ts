import { describe, expectTypeOf, it } from "vitest";
import type { Account } from "@prisma/client";

/** Compile-time guard for MT-031 schema — `npm run build` + Prisma generate must stay in sync. */
describe("MT-031 Account.primaryRelayCreatorId", () => {
  it("Account exposes optional primaryRelayCreatorId", () => {
    expectTypeOf<Account["primaryRelayCreatorId"]>().toEqualTypeOf<string | null>();
  });
});
