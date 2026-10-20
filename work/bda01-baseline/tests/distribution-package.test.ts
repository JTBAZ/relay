/**

 * Per-destination media resolution in buildCrossPostPackageFromAttempt.

 */

import { describe, expect, it } from "vitest";

import { buildCrossPostPackageFromAttempt } from "../src/distribution/distribution-package.js";

import {

  DISTRIBUTION_MEDIA_MAIN_MOCK_ID,

  DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID,

  DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON,

  DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X,

  DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID,

  distributionMediaPairBaseState,

  distributionMediaPairPrismaStub

} from "./helpers/distribution-media-pair.js";



describe("buildCrossPostPackageFromAttempt media resolution", () => {

  it("returns main media for Patreon full routing", async () => {

    const prisma = distributionMediaPairPrismaStub(distributionMediaPairBaseState());

    const result = await buildCrossPostPackageFromAttempt(

      prisma,

      DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID,

      DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON

    );

    expect(result.status).toBe("ok");

    if (result.status !== "ok") return;

    expect((result.package as { media: Array<{ media_id: string }> }).media.map((m) => m.media_id)).toEqual([

      DISTRIBUTION_MEDIA_MAIN_MOCK_ID

    ]);

  });



  it("returns preview media for X preview routing", async () => {

    const prisma = distributionMediaPairPrismaStub(distributionMediaPairBaseState());

    const result = await buildCrossPostPackageFromAttempt(

      prisma,

      DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID,

      DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X

    );

    expect(result.status).toBe("ok");

    if (result.status !== "ok") return;

    expect((result.package as { media: Array<{ media_id: string }> }).media.map((m) => m.media_id)).toEqual([

      DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID

    ]);

  });



  it("returns invalid_media_binding when preview id missing from plan", async () => {

    const state = distributionMediaPairBaseState();

    state.plans[0].assistantPlan = { needs_preview: true };

    const prisma = distributionMediaPairPrismaStub(state);

    const result = await buildCrossPostPackageFromAttempt(

      prisma,

      DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID,

      DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X

    );

    expect(result).toEqual({

      status: "invalid_media_binding",

      message: "Preview media is required for preview routing but preview_media_id is missing."

    });

  });

});


