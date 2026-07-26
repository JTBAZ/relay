import type { DistributionDestination } from "@/lib/relay-api";

export type Step2DevFixture = {
  title: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  /** Meta chips under source title (e.g. Image · 1920×1080 · 1.2 MB). */
  mediaMeta?: string[];
  destinations: DistributionDestination[];
  /** Per-destination copy; falls back to title/description when omitted. */
  variants: Array<{
    destination: DistributionDestination;
    title: string;
    body: string;
  }>;
};

/** Static Korra-like fixture for offline /dev mocking. */
export const STEP2_DEV_FIXTURE: Step2DevFixture = {
  title: "Korra and Tenzin",
  description: "Rail UI verify: save authored details only.",
  tags: ["korra", "avatar"],
  imageUrl: "https://picsum.photos/seed/relay-step2-korra/1404/888",
  mediaMeta: ["Image", "1920×1080", "1.2 MB"],
  destinations: ["patreon", "deviantart", "x"],
  variants: [
    {
      destination: "patreon",
      title: "Korra and Tenzin",
      body: "Rail UI verify: save authored details only."
    },
    {
      destination: "deviantart",
      title: "Korra and Tenzin",
      body: "Rail UI verify: save authored details only."
    },
    {
      destination: "x",
      title: "Korra and Tenzin",
      body: "Rail UI verify: save authored details only."
    }
  ]
};
