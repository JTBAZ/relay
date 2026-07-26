"use client";



import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowUpRight, Loader2, Plus } from "lucide-react";

import { GatedTile } from "@/components/patron/GatedTile";

import {

  createPatronCollection,

  listAllPatronCollectionsEnriched,

  RELAY_API_BASE,

  type PatronCollectionWithEnrichedEntries

} from "@/lib/relay-api";

import { fetchPatronProfileMe } from "@/lib/patron-profile-api";

import { PATRON_PROFILE_DRAFT_COLLECTIONS } from "./patron-profile-draft-fixtures";



type CollectionCard = {

  id: string;

  title: string;

  count: number;

  year: string;

  coverUrl: string;

  creatorId?: string;

  entries?: PatronCollectionWithEnrichedEntries["entries"];

  isLive?: boolean;

};



type CollectionsSource = "loading" | "live" | "empty-live" | "fallback";



function fallbackCollectionCards(): CollectionCard[] {

  return PATRON_PROFILE_DRAFT_COLLECTIONS.map((collection) => ({

    id: collection.id,

    title: collection.title,

    count: collection.count,

    year: collection.year,

    coverUrl: collection.coverUrl,

    isLive: false

  }));

}



function shortId(id: string): string {

  if (id.length <= 12) return id;

  return `${id.slice(0, 6)}…${id.slice(-4)}`;

}



function mediaContentUrl(creatorId: string, mediaId: string): string {

  return `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;

}



function collectionYearLabel(createdAt: string, entryCount: number): string {

  if (entryCount === 0) return "Empty";

  const year = new Date(createdAt).getFullYear();

  return String(year);

}



function liveCollectionCards(

  collections: PatronCollectionWithEnrichedEntries[]

): CollectionCard[] {

  return collections.map((c) => {

    const first = c.entries[0];

    const coverUrl = first

      ? mediaContentUrl(first.creator_id, first.media_id)

      : "/placeholder.svg?height=768&width=768&text=Collection";

    return {

      id: c.collection_id,

      title: c.title,

      count: c.entries.length,

      year: collectionYearLabel(c.created_at, c.entries.length),

      coverUrl,

      creatorId: c.creator_id,

      entries: c.entries,

      isLive: true

    };

  });

}



async function loadCollectionsState(): Promise<{

  signedIn: boolean;

  collections: CollectionCard[];

  source: CollectionsSource;

}> {

  const profileResult = await fetchPatronProfileMe({ suppressAuthRedirect: true })

    .then(() => ({ signedIn: true as const }))

    .catch(() => ({ signedIn: false as const }));



  const rows = await listAllPatronCollectionsEnriched({ suppressAuthRedirect: true }).catch(

    () => [] as PatronCollectionWithEnrichedEntries[]

  );



  if (rows.length > 0) {

    return {

      signedIn: profileResult.signedIn,

      collections: liveCollectionCards(rows),

      source: "live"

    };

  }



  if (profileResult.signedIn) {

    return { signedIn: true, collections: [], source: "empty-live" };

  }



  return {

    signedIn: false,

    collections: fallbackCollectionCards(),

    source: "fallback"

  };

}



export function PatronProfileDraftCollections() {

  const [collections, setCollections] = useState<CollectionCard[]>([]);

  const [source, setSource] = useState<CollectionsSource>("loading");

  const [signedIn, setSignedIn] = useState(false);

  const [creating, setCreating] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);



  const refreshCollections = useCallback(async () => {

    setSource("loading");

    const next = await loadCollectionsState();

    setSignedIn(next.signedIn);

    setCollections(next.collections);

    setSource(next.source);

  }, []);



  useEffect(() => {

    let cancelled = false;

    void loadCollectionsState().then((next) => {

      if (cancelled) return;

      setSignedIn(next.signedIn);

      setCollections(next.collections);

      setSource(next.source);

    });

    return () => {

      cancelled = true;

    };

  }, []);



  useEffect(() => {

    const onFocus = () => {

      void refreshCollections();

    };

    window.addEventListener("focus", onFocus);

    return () => window.removeEventListener("focus", onFocus);

  }, [refreshCollections]);



  const defaultCreatorId = useMemo(() => {

    const live = collections.find((c) => c.isLive && c.creatorId)?.creatorId;

    return live ?? "rcx_pilot_dev_milo";

  }, [collections]);



  async function handleNewCollection() {

    if (creating || !signedIn) return;

    setCreating(true);

    setCreateError(null);

    const title = `Collection ${new Date().getFullYear()}`;

    try {

      await createPatronCollection({ creatorId: defaultCreatorId, title });

      await refreshCollections();

    } catch (err) {

      setCreateError(

        err instanceof Error ? err.message : "Could not create collection."

      );

    } finally {

      setCreating(false);

    }

  }



  const statusLabel =

    source === "live"

      ? "Live DB"

      : source === "empty-live"

        ? "Live DB · empty"

        : source === "loading"

          ? "…"

          : "Dev fallback";



  const subtitle =

    source === "live"

      ? "Live patron snip collections with viewer-aware gates on each entry."

      : source === "empty-live"

        ? "No snip collections yet — save pieces from the feed with the snip button."

        : source === "loading"

          ? "Loading this patron’s saved collections…"

          : "Showing dev fallback cards until a signed-in patron session has collections.";



  return (

    <section className="mx-auto max-w-6xl px-6 py-12">

      <div className="mb-8 flex items-end justify-between gap-4">

        <div>

          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">

            Collections

          </h2>

          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>

        </div>

        <div className="flex flex-col items-end gap-2">

          <span className="text-xs text-muted-foreground">{statusLabel}</span>

          <button

            type="button"

            disabled={creating || source === "loading" || !signedIn}

            onClick={() => void handleNewCollection()}

            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary disabled:opacity-60"

          >

            {creating ? (

              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />

            ) : (

              <Plus className="h-3.5 w-3.5" aria-hidden="true" />

            )}

            New collection

          </button>

          {createError ? (

            <p className="max-w-xs text-right text-[10px] text-destructive">{createError}</p>

          ) : null}

        </div>

      </div>



      {source === "empty-live" ? (

        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">

          <p className="text-sm text-muted-foreground">No collections yet</p>

          <p className="mt-2 text-xs text-muted-foreground">

            Snip a piece from the patron feed, or create a collection here to get started.

          </p>

        </div>

      ) : (

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">

          {collections.map((collection) => {

            const cardClassName =

              "group relative overflow-hidden rounded-lg bg-card transition-all duration-700 [transition-timing-function:var(--ease-elegant)] hover:shadow-[var(--shadow-elevated)]";

            const cardBody = (

              <>

              {collection.isLive && collection.entries && collection.entries.length > 0 ? (

                <div className="relative aspect-[4/5] overflow-hidden">

                  {/* eslint-disable-next-line @next/next/no-img-element -- Relay export media URL */}

                  <img

                    src={collection.coverUrl}

                    alt={collection.title}

                    width={768}

                    height={960}

                    loading="lazy"

                    className="h-full w-full object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-elegant)] group-hover:scale-105"

                    style={{

                      filter:

                        collection.entries[0]?.viewer_entitlement.state === "visible"

                          ? undefined

                          : collection.entries[0]?.viewer_entitlement.state === "preview"

                            ? "blur(6px)"

                            : "blur(14px)",

                      opacity:

                        collection.entries[0]?.viewer_entitlement.state === "visible" ? 1 : 0.55

                    }}

                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent opacity-90" />

                  {collection.entries.length > 1 ? (

                    <div className="absolute left-2 top-2 grid grid-cols-2 gap-1 rounded-md bg-background/80 p-1.5 backdrop-blur-sm">

                      {collection.entries.slice(0, 4).map((entry) => (

                        <GatedTile

                          key={entry.entry_id}

                          creatorId={entry.creator_id}

                          label={`snip · ${shortId(entry.media_id)}`}

                          state={entry.viewer_entitlement.state}

                          requiredTierIds={entry.viewer_entitlement.required_tier_ids}

                          source={entry.viewer_entitlement.source}

                        />

                      ))}

                    </div>

                  ) : null}

                  <div className="absolute bottom-0 left-0 right-0 p-5">

                    <div className="flex items-start justify-between gap-3">

                      <div>

                        <h3 className="text-base font-medium text-foreground">{collection.title}</h3>

                        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">

                          {collection.count} piece{collection.count === 1 ? "" : "s"} ·{" "}

                          {collection.year}

                        </p>

                      </div>

                      <ArrowUpRight

                        className="h-4 w-4 text-muted-foreground transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"

                        aria-hidden="true"

                      />

                    </div>

                  </div>

                </div>

              ) : (

                <>

                  <div className="aspect-[4/5] overflow-hidden">

                    {/* eslint-disable-next-line @next/next/no-img-element -- draft fixture or export media URL */}

                    <img

                      src={collection.coverUrl}

                      alt={collection.title}

                      width={768}

                      height={768}

                      loading="lazy"

                      className="h-full w-full object-cover transition-transform duration-[1200ms] [transition-timing-function:var(--ease-elegant)] group-hover:scale-105"

                    />

                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent opacity-90" />

                  <div className="absolute bottom-0 left-0 right-0 p-5">

                    <div className="flex items-start justify-between gap-3">

                      <div>

                        <h3 className="text-base font-medium text-foreground">{collection.title}</h3>

                        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">

                          {collection.count} pieces · {collection.year}

                        </p>

                      </div>

                      <ArrowUpRight

                        className="h-4 w-4 text-muted-foreground transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"

                        aria-hidden="true"

                      />

                    </div>

                  </div>

                </>

              )}

              {collection.isLive && collection.entries?.length === 0 ? (

                <div className="border-t border-border px-4 py-3">

                  <h3 className="text-sm font-medium text-foreground">{collection.title}</h3>

                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">

                    Empty collection

                  </p>

                </div>

              ) : null}

              </>

            );

            if (collection.isLive) {

              return (

                <Link

                  key={collection.id}

                  href={`/collections/${encodeURIComponent(collection.id)}`}

                  className={cardClassName}

                >

                  {cardBody}

                </Link>

              );

            }

            return (

              <article key={collection.id} className={cardClassName}>

                {cardBody}

              </article>

            );

          })}

        </div>

      )}

    </section>

  );

}

