"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryItem } from "@/lib/relay-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";
import {
  galleryArtworkMap,
  resolveMissingLab3Artwork
} from "@/lib/lab3-event-artwork";

export function useLab3EventArtwork(
  creatorId: string | undefined,
  items: GalleryItem[] | undefined,
  events: ScheduleEvent[],
  enabled: boolean
): Map<string, string | null> {
  const [extra, setExtra] = useState<Map<string, string | null>>(() => new Map());
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const eventKey = events.map((e) => `${e.id}:${e.post_id ?? ""}`).join("|");
  const itemKey = (items ?? []).map((it) => it.post_id).join("|");

  useEffect(() => {
    if (!enabled || !creatorId?.trim()) return;
    const fromGallery = galleryArtworkMap(items ?? []);
    const postIds = events
      .map((e) => e.post_id?.trim())
      .filter((id): id is string => Boolean(id));
    const known = new Map(fromGallery);
    for (const [id, src] of extraRef.current) {
      if (!known.has(id)) known.set(id, src);
    }
    let cancelled = false;
    void resolveMissingLab3Artwork({
      creatorId,
      postIds,
      known
    }).then((next) => {
      if (cancelled) return;
      const onlyFetched = new Map<string, string | null>();
      for (const [id, src] of next) {
        if (!fromGallery.has(id)) onlyFetched.set(id, src);
      }
      setExtra(onlyFetched);
    });
    return () => {
      cancelled = true;
    };
    // itemKey / eventKey stand in for items + events without identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, enabled, eventKey, itemKey]);

  return useMemo(() => {
    const merged = galleryArtworkMap(items ?? []);
    for (const [id, src] of extra) {
      if (!merged.has(id)) merged.set(id, src);
    }
    return merged;
  }, [extra, items]);
}
